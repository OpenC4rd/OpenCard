export type BindingScopeKind =
  | 'current-block'
  | 'current-card'
  | 'current-face'
  | 'opposite-face'
  | 'document'
  | 'project'
  | 'dictionary'
  | 'parent'

export type BindingScopeDescriptor =
  | { kind: 'current-block' }
  | { kind: 'current-card' }
  | { kind: 'current-face' }
  | { kind: 'opposite-face' }
  | { kind: 'document' }
  | { kind: 'project' }
  | { kind: 'dictionary' }
  | { kind: 'parent'; parentDepth: number }

export type FieldReferenceDescriptor = BindingScopeDescriptor & {
  fieldKey: string
}

type ActiveBindingToken = {
  body: string
  bodyStart: number
  cursor: number
}

const parentScopePattern = /^(?:parent)(?:\.parent)*$/i

export function parseBindingScopeToken(token: string): BindingScopeDescriptor | null {
  const normalized = token.trim().toLocaleLowerCase()
  if (normalized === 'self') return { kind: 'current-block' }
  if (normalized === 'card') return { kind: 'current-card' }
  if (normalized === 'face') return { kind: 'current-face' }
  if (normalized === 'opposite') return { kind: 'opposite-face' }
  if (normalized === 'document') return { kind: 'document' }
  if (normalized === 'project') return { kind: 'project' }
  if (normalized === 'dictionary') return { kind: 'dictionary' }
  if (!parentScopePattern.test(normalized)) return null
  return { kind: 'parent', parentDepth: normalized.split('.').length }
}

export function parseFieldReference(reference: string): FieldReferenceDescriptor | null {
  const normalized = reference.trim()
  const colonIndex = normalized.indexOf(':')
  if (colonIndex < 0) {
    return normalized ? { kind: 'current-block', fieldKey: normalized } : null
  }
  if (colonIndex < 1 || normalized.indexOf(':', colonIndex + 1) >= 0) return null
  const scopeToken = normalized.slice(0, colonIndex)
  const scope = parseBindingScopeToken(scopeToken)
  const fieldKey = normalized.slice(colonIndex + 1).trim()
  return scope && fieldKey ? { ...scope, fieldKey } : null
}

export function isBindingStartEscaped(value: string, tokenStart: number): boolean {
  let backslashCount = 0
  for (let index = tokenStart - 1; index >= 0 && value[index] === '\\'; index -= 1) {
    backslashCount += 1
  }
  return backslashCount % 2 === 1
}

export function findActiveBindingToken(value: string, cursor: number): ActiveBindingToken | null {
  if (cursor < 2) return null
  const tokenStart = value.lastIndexOf('{{', cursor - 1)
  if (tokenStart < 0 || isBindingStartEscaped(value, tokenStart)) return null
  const bodyStart = tokenStart + 2
  const body = value.slice(bodyStart, cursor)
  if (body.includes('{') || body.includes('}')) return null
  return { body, bodyStart, cursor }
}

export function formatBindingScopeToken(scope: BindingScopeDescriptor): string {
  if (scope.kind === 'current-block') return 'self'
  if (scope.kind === 'current-card') return 'card'
  if (scope.kind === 'current-face') return 'face'
  if (scope.kind === 'opposite-face') return 'opposite'
  if (scope.kind === 'document') return 'document'
  if (scope.kind === 'project') return 'project'
  if (scope.kind === 'dictionary') return 'dictionary'
  return Array.from({ length: scope.parentDepth }, () => 'parent').join('.')
}
