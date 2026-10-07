import { isBindingCompatible, type BindingValueKind } from '../model/binding'
import {
  findActiveBindingToken,
  formatBindingScopeToken,
  parseBindingScopeToken,
  type BindingScopeDescriptor,
} from '../model/bindingExpression'

export type ReferenceCompletionField = {
  key: string
  label?: string
  valueKind: BindingValueKind
}

export type ReferenceCompletionScope = {
  label: string
  fields: readonly ReferenceCompletionField[]
}

export type ReferenceCompletionContext = {
  targetKind: BindingValueKind
  currentBlock?: ReferenceCompletionScope
  currentCard?: ReferenceCompletionScope
  currentFace?: ReferenceCompletionScope
  oppositeFace?: ReferenceCompletionScope
  document?: ReferenceCompletionScope
  project?: ReferenceCompletionScope
  dictionary?: ReferenceCompletionScope
  allowedScopes?: readonly BindingScopeDescriptor['kind'][]
  getAncestor: (depth: number) => ReferenceCompletionScope | undefined
}

export type ReferenceCompletionSuggestion = {
  key: string
  label: string
  detail: string
  insertText: string
  kind: 'scope' | 'field'
  valueKind?: BindingValueKind
}

export type ReferenceCompletionState = {
  replaceStart: number
  replaceEnd: number
  suggestions: ReferenceCompletionSuggestion[]
}


export function resolveReferenceCompletion(
  value: string,
  cursor: number,
  context: ReferenceCompletionContext | null | undefined,
): ReferenceCompletionState | null {
  if (!context) return null
  const active = findActiveBindingToken(value, cursor)
  if (!active) return null

  const colonIndex = active.body.indexOf(':')
  if (colonIndex >= 0) {
    return resolveFieldSuggestions(active, colonIndex, context)
  }

  const fragment = active.body.trim()
  return {
    replaceStart: active.bodyStart,
    replaceEnd: cursor,
    suggestions: [
      ...resolveScopeSuggestions(fragment, context),
      ...resolveImplicitSelfSuggestions(fragment, context),
    ],
  }
}

function resolveImplicitSelfSuggestions(
  fragmentInput: string,
  context: ReferenceCompletionContext,
): ReferenceCompletionSuggestion[] {
  if (!fragmentInput || !context.currentBlock || !isScopeAllowed('current-block', context)) return []
  const fragment = fragmentInput.toLocaleLowerCase()
  return context.currentBlock.fields
    .filter(field => isBindingCompatible(context.targetKind, field.valueKind))
    .filter(field => field.key.toLocaleLowerCase().includes(fragment)
      || field.label?.toLocaleLowerCase().includes(fragment))
    .sort((left, right) => {
      const leftStarts = left.key.toLocaleLowerCase().startsWith(fragment)
      const rightStarts = right.key.toLocaleLowerCase().startsWith(fragment)
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
      return left.key.localeCompare(right.key, undefined, { sensitivity: 'base' })
    })
    .map(field => ({
      key: `field:self-short:${field.key}`,
      label: field.label ?? field.key,
      detail: `self:${field.key}`,
      insertText: field.key,
      kind: 'field' as const,
      valueKind: field.valueKind,
    }))
}

function resolveScopeSuggestions(
  fragmentInput: string,
  context: ReferenceCompletionContext,
): ReferenceCompletionSuggestion[] {
  const fragment = fragmentInput.toLocaleLowerCase()

  const fixedScopes: Array<readonly [string, ReferenceCompletionScope | undefined]> = [
    ['self', context.currentBlock],
    ['card', context.currentCard],
    ['face', context.currentFace],
    ['opposite', context.oppositeFace],
    ['document', context.document],
    ['project', context.project],
    ['dictionary', context.dictionary],
  ]
  const suggestions = fixedScopes
    .filter(([token]) => isScopeAllowed(parseBindingScopeToken(token)?.kind, context))
    .filter(([token, scope]) => scope && token.startsWith(fragment) && hasCompatibleField(scope, context.targetKind))
    .map(([token, scope]) => scopeSuggestion(`${token}:`, scope!.label))

  if (!fragment || fragment.startsWith('p')) {
    suggestions.push(...resolveParentScopeSuggestions(fragment, context))
  }
  return suggestions
}

function resolveParentScopeSuggestions(
  fragment: string,
  context: ReferenceCompletionContext,
): ReferenceCompletionSuggestion[] {
  if (!isScopeAllowed('parent', context)) return []
  const segments = fragment.split('.')
  const completedSegments = segments.slice(0, -1)
  const partialSegment = fragment.endsWith('.') ? '' : segments[segments.length - 1] ?? ''
  if (completedSegments.some(segment => segment !== 'parent')
    || (partialSegment && !'parent'.startsWith(partialSegment))) return []

  const targetDepth = completedSegments.length + 1
  const scope = context.getAncestor(targetDepth)
  if (!scope || !hasCompatibleField(scope, context.targetKind)) return []

  const token = Array.from({ length: targetDepth }, () => 'parent').join('.')
  const suggestions = [scopeSuggestion(`${token}:`, scope.label)]
  const completesCurrentSegment = fragment.endsWith('.') || partialSegment === 'parent'
  if (completesCurrentSegment && context.getAncestor(targetDepth + 1)) {
    suggestions.push(scopeSuggestion(`${token}.`, scope.label))
  }
  return suggestions
}

function resolveFieldSuggestions(
  active: NonNullable<ReturnType<typeof findActiveBindingToken>>,
  colonIndex: number,
  context: ReferenceCompletionContext,
): ReferenceCompletionState | null {
  const scopeDescriptor = parseBindingScopeToken(active.body.slice(0, colonIndex))
  if (!isScopeAllowed(scopeDescriptor?.kind, context)) return null
  const scope = scopeDescriptor ? resolveScope(scopeDescriptor, context) : undefined
  if (!scope) return null

  const scopeToken = formatBindingScopeToken(scopeDescriptor!)
  const fragment = active.body.slice(colonIndex + 1).trim().toLocaleLowerCase()
  const suggestions = scope.fields
    .filter((field) => isBindingCompatible(context.targetKind, field.valueKind))
    .filter((field) => field.key.toLocaleLowerCase().includes(fragment)
      || field.label?.toLocaleLowerCase().includes(fragment))
    .sort((left, right) => {
      const leftStarts = left.key.toLocaleLowerCase().startsWith(fragment)
      const rightStarts = right.key.toLocaleLowerCase().startsWith(fragment)
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
      return left.key.localeCompare(right.key, undefined, { sensitivity: 'base' })
    })
    .map((field) => ({
      key: `field:${scopeToken}:${field.key}`,
      label: field.label ?? field.key,
      detail: field.key,
      insertText: `${scopeToken}:${field.key}`,
      kind: 'field' as const,
      valueKind: field.valueKind,
    }))

  return {
    replaceStart: active.bodyStart,
    replaceEnd: active.cursor,
    suggestions,
  }
}

function isScopeAllowed(
  scope: BindingScopeDescriptor['kind'] | null | undefined,
  context: ReferenceCompletionContext,
): boolean {
  return Boolean(scope && (!context.allowedScopes || context.allowedScopes.includes(scope)))
}

function resolveScope(
  descriptor: BindingScopeDescriptor,
  context: ReferenceCompletionContext,
): ReferenceCompletionScope | undefined {
  if (descriptor.kind === 'current-block') return context.currentBlock
  if (descriptor.kind === 'current-card') return context.currentCard
  if (descriptor.kind === 'current-face') return context.currentFace
  if (descriptor.kind === 'opposite-face') return context.oppositeFace
  if (descriptor.kind === 'document') return context.document
  if (descriptor.kind === 'project') return context.project
  if (descriptor.kind === 'dictionary') return context.dictionary
  return descriptor.kind === 'parent' ? context.getAncestor(descriptor.parentDepth) : undefined
}

function hasCompatibleField(scope: ReferenceCompletionScope, targetKind: BindingValueKind): boolean {
  return scope.fields.some((field) => isBindingCompatible(targetKind, field.valueKind))
}

function scopeSuggestion(insertText: string, detail: string): ReferenceCompletionSuggestion {
  return {
    key: `scope:${insertText}`,
    label: insertText,
    detail,
    insertText,
    kind: 'scope',
  }
}
