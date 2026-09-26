import {
  acceptsCardFieldBinding,
  acceptsCardFieldBindingScope,
  cloneAdditionalFieldDefinitions,
  exposesCardFieldReference,
  getCardFieldKeys,
  getCardFieldValue,
  getBlockProperty,
  getCardFieldValueKind,
  hasCardField,
  setCardFieldValue,
  type CardBlock,
  type CardDocument,
  type CardFace,
  type CardFaceKey,
  type CardInstanceRecord,
  type FlowContainerLocationInfo,
  type SimpleContainerLocationInfo,
} from '../../entities/card/model'
import {
  buildParentLookup,
  isBlockContainer,
  type ParentLookup,
} from '../../entities/card/tree'
import type { BindingValueKind } from '../editor-runtime/model/binding'
import {
  isBindingStartEscaped,
  parseFieldReference,
  type FieldReferenceDescriptor,
} from '../editor-runtime/model/bindingExpression'
import {
  exposesProjectFieldReference,
  getProjectFieldValueKind,
  type ProjectInformation,
} from '../workspace/model/projectMetadata'
import {
  createCardPipelineIssue,
  type CardBindingIssueType,
  type CardPipelineIssue,
} from './cardPipelineIssue'
import { joinBlockPath } from './renderBlockPath'

const templateTokenPatternSource = String.raw`\{\{\s*([^{}]+?)\s*\}\}`
const singleTemplateTokenPattern = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/
const maxReferenceDepth = 24

function toCharacterOffset(value: string, codeUnitOffset: number): number {
  return Array.from(value.slice(0, Math.max(0, codeUnitOffset))).length
}

export function resolveParentFieldReferenceKey(
  blockId: string,
  reference: string,
  parentLookup: ParentLookup,
): { ownerId: string, fieldKey: string } | null {
  const descriptor = parseFieldReference(reference)
  if (!descriptor) {
    return null
  }

  if (descriptor.kind === 'current-card'
    || descriptor.kind === 'current-face'
    || descriptor.kind === 'opposite-face'
    || descriptor.kind === 'document'
    || descriptor.kind === 'project') {
    return null
  }

  if (descriptor.kind === 'current-block') {
    return { ownerId: blockId, fieldKey: descriptor.fieldKey }
  }

  if (descriptor.kind !== 'parent') return null
  let currentBlockId = blockId
  for (let depth = 0; depth < descriptor.parentDepth; depth += 1) {
    const parent = parentLookup.get(currentBlockId)
    if (!parent || parent.type === 'card-face') {
      return null
    }

    currentBlockId = parent.id
  }

  return { ownerId: currentBlockId, fieldKey: descriptor.fieldKey }
}

export type ResolveReferencesResult = {
  document: CardDocument
  issues: CardPipelineIssue[]
}

export type ResolveReferencesOptions = {
  currentCard?: CardInstanceRecord | null
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>> | null
  preserveReference?: (context: PreserveReferenceContext) => boolean
  shouldResolveOwner?: (owner: ResolveReferenceOwner) => boolean
}

export type ResolveReferenceOwner = {
  kind: ReferenceOwnerKind
  id: string
  anchorBlockId: string | null
}

export type PreserveReferenceContext = {
  owner: ResolveReferenceOwner
  fieldKey: string
  reference: FieldReferenceDescriptor
}

type ReferenceOwnerKind = 'document' | 'face' | 'block' | 'location' | 'current-card'
type ReferenceOwner = {
  kind: ReferenceOwnerKind
  key: string
  id: string
  typeName: string
  source: Record<string, unknown>
  target: Record<string, unknown>
  anchorBlockId: string | null
  faceKey: CardFaceKey | null
  blockPath?: string
}

type ResolveFieldResult =
  | { ok: true, value: unknown }
  | { ok: false, value: unknown }

type ResolveTokenResult =
  | { ok: true, value: unknown, valueKind: BindingValueKind }
  | { ok: true, preserved: true }
  | { ok: false, value: unknown }

type ResolveMemoState = 'resolving' | 'done' | 'failed'

export function resolveReferences(
  document: CardDocument,
  options: ResolveReferencesOptions = {},
): ResolveReferencesResult {
  const resolved = resolveReferenceGraph(document, options)
  return { document: resolved.document!, issues: resolved.issues }
}

function resolveReferenceGraph(
  document: CardDocument,
  options: ResolveReferencesOptions,
): { document: CardDocument; issues: CardPipelineIssue[] } {
  const cloneBlockTree = (block: CardBlock): CardBlock => {
    if (block.type === 'simple-container-block') {
      return {
        ...block,
        additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
        children: block.children.map((child) => ({
          block: cloneBlockTree(child.block),
          location: { ...child.location },
        })),
      }
    }

    if (block.type === 'flow-container-block') {
      return {
        ...block,
        additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
        children: block.children.map((child) => ({
          block: cloneBlockTree(child.block),
          location: { ...child.location },
        })),
      }
    }

    return {
      ...block,
      additionalFieldDefinition: cloneAdditionalFieldDefinitions(block.additionalFieldDefinition),
    }
  }

  const sourceDocument = document
  const documentId = sourceDocument.id
  const targetDocument: CardDocument = {
    ...sourceDocument,
    faces: Object.fromEntries(Object.entries(sourceDocument.faces).map(([faceKey, face]) => [faceKey, {
      ...face,
      children: face.children.map((child) => ({
        block: cloneBlockTree(child.block),
        location: { ...child.location },
      })),
    }])) as Record<CardFaceKey, CardFace>,
    instances: sourceDocument.instances?.map((instance) => ({
      ...instance,
      data: { ...instance.data },
    })),
  }
  const parentLookup = buildParentLookup(sourceDocument)
  const issues: CardPipelineIssue[] = []
  const valueMemo = new Map<string, unknown>()
  const stateMemo = new Map<string, ResolveMemoState>()
  const dictionaryResolutionStack = new Set<string>()
  const owners: ReferenceOwner[] = []
  const targetOwnersById = new Map<string, ReferenceOwner>()
  const documentOwner: ReferenceOwner = {
    kind: 'document',
    key: `doc:${documentId}`,
    id: documentId,
    typeName: 'card-document',
    source: sourceDocument as unknown as Record<string, unknown>,
    target: targetDocument as unknown as Record<string, unknown>,
    anchorBlockId: null,
    faceKey: null,
  }
  owners.push(documentOwner)
  targetOwnersById.set(documentOwner.id, documentOwner)

  const sourceCurrentCard = options.currentCard
    ? {
        ...options.currentCard,
        data: Object.fromEntries(
          Object.entries(options.currentCard.data ?? {}).map(([blockId, fieldMap]) => [blockId, { ...fieldMap }]),
        ),
      } satisfies CardInstanceRecord
    : null

  const targetCurrentCard = sourceCurrentCard
    ? {
        ...sourceCurrentCard,
        data: Object.fromEntries(
          Object.entries(sourceCurrentCard.data ?? {}).map(([blockId, fieldMap]) => [blockId, { ...fieldMap }]),
        ),
      } satisfies CardInstanceRecord
    : null

  const currentCardOwner: ReferenceOwner | null = sourceCurrentCard && targetCurrentCard
    ? {
        kind: 'current-card',
        key: `card:${sourceCurrentCard.id || '__current-card__'}`,
        id: sourceCurrentCard.id || '__current-card__',
        typeName: 'card-instance',
        source: sourceCurrentCard as unknown as Record<string, unknown>,
        target: targetCurrentCard as unknown as Record<string, unknown>,
        anchorBlockId: null,
        faceKey: null,
      }
    : null

  const visitChildren = (
    sourceChildren: Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
    targetChildren: Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
    parentBlockPath: string,
    faceKey: CardFaceKey,
  ): void => {
    for (let index = 0; index < sourceChildren.length; index += 1) {
      const sourceChild = sourceChildren[index]
      const targetChild = targetChildren[index]
      if (!sourceChild || !targetChild) {
        continue
      }

      const sourceBlock = sourceChild.block
      const targetBlock = targetChild.block
      const blockPath = joinBlockPath(parentBlockPath, getBlockProperty<string>(sourceBlock, 'name') ?? '')

      const blockOwner: ReferenceOwner = {
        kind: 'block',
        key: `block:${sourceBlock.id}`,
        id: sourceBlock.id,
        typeName: sourceBlock.type,
        source: sourceBlock as unknown as Record<string, unknown>,
        target: targetBlock as unknown as Record<string, unknown>,
        anchorBlockId: sourceBlock.id,
        faceKey,
        blockPath,
      }
      owners.push(blockOwner)
      targetOwnersById.set(blockOwner.id, blockOwner)

      const sourceLocation = sourceChild.location as unknown as Record<string, unknown>
      const targetLocation = targetChild.location as unknown as Record<string, unknown>
      const locationType = typeof sourceLocation.type === 'string'
        ? sourceLocation.type
        : sourceChild.location.type
      owners.push({
        kind: 'location',
        key: `layout:${sourceBlock.id}`,
        id: sourceChild.location.id,
        typeName: locationType,
        source: sourceLocation,
        target: targetLocation,
        anchorBlockId: sourceBlock.id,
        faceKey,
        blockPath,
      })

      if (isBlockContainer(sourceBlock) && isBlockContainer(targetBlock)) {
        visitChildren(
          sourceBlock.children as Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
          targetBlock.children as Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
          blockPath,
          faceKey,
        )
      }
    }
  }

  const faceOwners = {} as Record<CardFaceKey, ReferenceOwner>
  for (const faceKey of Object.keys(sourceDocument.faces) as CardFaceKey[]) {
    const sourceFace = sourceDocument.faces[faceKey]
    const targetFace = targetDocument.faces[faceKey]
    const faceOwner: ReferenceOwner = {
      kind: 'face',
      key: `face:${faceKey}:${sourceFace.id}`,
      id: sourceFace.id,
      typeName: sourceFace.type,
      source: sourceFace as unknown as Record<string, unknown>,
      target: targetFace as unknown as Record<string, unknown>,
      anchorBlockId: null,
      faceKey,
    }
    faceOwners[faceKey] = faceOwner
    owners.push(faceOwner)
    targetOwnersById.set(faceOwner.id, faceOwner)
    visitChildren(
      sourceFace.children as Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
      targetFace.children as Array<{ block: CardBlock, location: SimpleContainerLocationInfo | FlowContainerLocationInfo }>,
      '',
      faceKey,
    )
  }
  function buildMemoKey(owner: ReferenceOwner, fieldKey: string): string {
    return `${owner.key}:${fieldKey}`
  }

  function pushIssue(
    owner: ReferenceOwner,
    fieldKey: string,
    token: string,
    type: CardBindingIssueType,
    parameters?: Readonly<Record<string, string | number>>,
    characterOffset?: number,
  ): void {
    const ownerKind = owner.kind === 'current-card' ? 'instance' : owner.kind
    issues.push(createCardPipelineIssue({
      type,
      location: {
        documentId,
        instanceId: options.currentCard?.id ?? null,
        faceKey: owner.faceKey,
        owner: { kind: ownerKind, id: owner.id },
        ...(owner.anchorBlockId ? { blockId: owner.anchorBlockId } : {}),
        ...(owner.blockPath ? { blockPath: owner.blockPath } : {}),
        fieldKey,
        ...(characterOffset !== undefined ? { characterOffset } : {}),
      },
      ...(parameters ? { parameters } : {}),
      token,
    }))
  }

  function resolveTokenValue(
    owner: ReferenceOwner,
    tokenBody: string,
    fieldKey: string,
    recursionDepth: number,
    rawToken: string,
    characterOffset: number,
  ): ResolveTokenResult {
    if (recursionDepth > maxReferenceDepth) {
      pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.max-depth', {
        maxDepth: maxReferenceDepth,
      }, characterOffset)
      return { ok: false, value: null }
    }

    const tokenDescriptor = parseFieldReference(tokenBody)
    if (!tokenDescriptor) {
      pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.invalid-token', undefined, characterOffset)
      return { ok: false, value: null }
    }
    if (!acceptsCardFieldBindingScope(owner.source, fieldKey, tokenDescriptor.kind)) {
      pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-allowed', {
        referencedScope: tokenDescriptor.kind,
      }, characterOffset)
      return { ok: false, value: null }
    }
    if (options.preserveReference?.({
      owner: { kind: owner.kind, id: owner.id, anchorBlockId: owner.anchorBlockId },
      fieldKey,
      reference: tokenDescriptor,
    })) {
      return { ok: true, preserved: true }
    }

    function resolveTargetField(targetOwner: ReferenceOwner, targetFieldKey: string): ResolveTokenResult {
      if (!exposesCardFieldReference(targetOwner.source, targetFieldKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-allowed', {
          ownerType: targetOwner.typeName,
          referencedFieldKey: targetFieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }
      if (!hasCardField(targetOwner.source, targetFieldKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-found', {
          ownerType: targetOwner.typeName,
          referencedFieldKey: targetFieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }
      if (stateMemo.get(buildMemoKey(targetOwner, targetFieldKey)) === 'resolving') {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.cycle', {
          referencedOwnerId: targetOwner.id,
          referencedFieldKey: targetFieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }

      const resolved = resolveOwnerField(targetOwner, targetFieldKey, recursionDepth + 1)
      return resolved.ok
        ? { ...resolved, valueKind: getCardFieldValueKind(targetOwner.source, targetFieldKey) }
        : resolved
    }

    if (tokenDescriptor.kind === 'current-card') {
      return resolveTargetField(currentCardOwner ?? documentOwner, tokenDescriptor.fieldKey)
    }

    if (tokenDescriptor.kind === 'project') {
      const project = options.project
      if (!project) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', {
          ownerType: 'project',
        }, characterOffset)
        return { ok: false, value: null }
      }
      if (!Object.prototype.hasOwnProperty.call(project, tokenDescriptor.fieldKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-found', {
          ownerType: 'project',
          referencedFieldKey: tokenDescriptor.fieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }
      if (!exposesProjectFieldReference(project, tokenDescriptor.fieldKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-allowed', {
          ownerType: 'project',
          referencedFieldKey: tokenDescriptor.fieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }
      return {
        ok: true,
        value: project[tokenDescriptor.fieldKey as keyof ProjectInformation],
        valueKind: getProjectFieldValueKind(project, tokenDescriptor.fieldKey),
      }
    }

    if (tokenDescriptor.kind === 'dictionary') {
      const dictionary = options.dictionary
      if (!dictionary) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', {
          ownerType: 'dictionary',
        }, characterOffset)
        return { ok: false, value: null }
      }
      if (!Object.prototype.hasOwnProperty.call(dictionary, tokenDescriptor.fieldKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.field-not-found', {
          ownerType: 'dictionary',
          referencedFieldKey: tokenDescriptor.fieldKey,
        }, characterOffset)
        return { ok: false, value: null }
      }
      const dictionaryKey = tokenDescriptor.fieldKey
      if (dictionaryResolutionStack.has(dictionaryKey)) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.cycle', {
          ownerType: 'dictionary',
          referencedFieldKey: dictionaryKey,
        }, characterOffset)
        return { ok: false, value: null }
      }

      dictionaryResolutionStack.add(dictionaryKey)
      try {
        const resolved = resolveTemplateString(
          owner,
          fieldKey,
          dictionary[dictionaryKey],
          recursionDepth + 1,
        )
        return resolved.ok
          ? { ok: true, value: resolved.value, valueKind: 'string' }
          : { ok: false, value: null }
      } finally {
        dictionaryResolutionStack.delete(dictionaryKey)
      }
    }

    if (tokenDescriptor.kind === 'current-face' || tokenDescriptor.kind === 'opposite-face') {
      if (!owner.faceKey) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', undefined, characterOffset)
        return { ok: false, value: null }
      }
      const targetFaceKey = tokenDescriptor.kind === 'current-face'
        ? owner.faceKey
        : owner.faceKey === 'front' ? 'back' : 'front'
      return resolveTargetField(faceOwners[targetFaceKey], tokenDescriptor.fieldKey)
    }

    if (tokenDescriptor.kind === 'document') {
      return resolveTargetField(documentOwner, tokenDescriptor.fieldKey)
    }

    let targetReference: { ownerId: string, fieldKey: string } | null = null
    if (owner.anchorBlockId) {
      targetReference = resolveParentFieldReferenceKey(owner.anchorBlockId, tokenBody, parentLookup)
      if (!targetReference) {
        pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', undefined, characterOffset)
        return { ok: false, value: null }
      }
    } else {
      pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', undefined, characterOffset)
      return { ok: false, value: null }
    }

    const targetOwner = targetOwnersById.get(targetReference.ownerId)
    if (!targetOwner) {
      pushIssue(owner, fieldKey, rawToken, 'card-designer.binding.source-not-found', {
        referencedOwnerId: targetReference.ownerId,
      }, characterOffset)
      return { ok: false, value: null }
    }

    return resolveTargetField(targetOwner, targetReference.fieldKey)
  }

  function resolveTemplateString(
    owner: ReferenceOwner,
    fieldKey: string,
    sourceValue: string,
    recursionDepth: number,
    locateToken?: (rawToken: string) => number,
  ): ResolveFieldResult {
    if (!sourceValue.includes('{{')) {
      return { ok: true, value: sourceValue }
    }
    if (!acceptsCardFieldBinding(owner.source, fieldKey)) {
      const characterOffset = sourceValue.indexOf('{{')
      pushIssue(owner, fieldKey, sourceValue, 'card-designer.binding.field-not-allowed', {
        ownerType: owner.typeName,
        referencedFieldKey: fieldKey,
      }, characterOffset >= 0 ? toCharacterOffset(sourceValue, characterOffset) : undefined)
      return { ok: false, value: sourceValue }
    }

    const singleTokenMatch = singleTemplateTokenPattern.exec(sourceValue)
    if (singleTokenMatch) {
      const tokenBody = singleTokenMatch[1].trim()
      const characterOffset = sourceValue.indexOf('{{')
      const tokenEnd = sourceValue.indexOf('}}', characterOffset + 2)
      const rawToken = characterOffset >= 0 && tokenEnd >= characterOffset
        ? sourceValue.slice(characterOffset, tokenEnd + 2)
        : sourceValue
      const issueOffset = locateToken?.(rawToken) ?? toCharacterOffset(sourceValue, characterOffset)
      const tokenResult = resolveTokenValue(
        owner,
        tokenBody,
        fieldKey,
        recursionDepth + 1,
        rawToken,
        issueOffset,
      )
      if (!tokenResult.ok) {
        return { ok: false, value: sourceValue }
      }
      if ('preserved' in tokenResult) {
        return { ok: true, value: sourceValue }
      }
      return { ok: true, value: tokenResult.value }
    }

    let hasToken = false
    let resolvedValue = ''
    let cursor = 0
    const templateTokenPattern = new RegExp(templateTokenPatternSource, 'g')

    while (true) {
      const matched = templateTokenPattern.exec(sourceValue)
      if (!matched) {
        break
      }
      hasToken = true
      resolvedValue += sourceValue.slice(cursor, matched.index)
      const issueOffset = locateToken?.(matched[0]) ?? toCharacterOffset(sourceValue, matched.index)

      if (isBindingStartEscaped(sourceValue, matched.index)) {
        resolvedValue = `${resolvedValue.slice(0, -1)}${matched[0]}`
        cursor = matched.index + matched[0].length
        continue
      }

      const tokenBody = matched[1].trim()
      const tokenResult = resolveTokenValue(
        owner,
        tokenBody,
        fieldKey,
        recursionDepth + 1,
        matched[0],
        issueOffset,
      )
      if (!tokenResult.ok) {
        return { ok: false, value: sourceValue }
      }
      if ('preserved' in tokenResult) {
        resolvedValue += matched[0]
        cursor = matched.index + matched[0].length
        continue
      }

      resolvedValue += String(tokenResult.value)
      cursor = matched.index + matched[0].length
    }

    if (!hasToken) {
      return { ok: true, value: sourceValue }
    }

    resolvedValue += sourceValue.slice(cursor)
    return { ok: true, value: resolvedValue }
  }

  function resolveStringField(
    owner: ReferenceOwner,
    fieldKey: string,
    sourceValue: string,
    recursionDepth: number,
  ): ResolveFieldResult {
    return resolveTemplateString(owner, fieldKey, sourceValue, recursionDepth)
  }

  function resolveOwnerField(
    owner: ReferenceOwner,
    fieldKey: string,
    recursionDepth: number,
  ): ResolveFieldResult {
    const memoKey = buildMemoKey(owner, fieldKey)
    if (valueMemo.has(memoKey)) {
      return { ok: true, value: valueMemo.get(memoKey) }
    }

    if (stateMemo.get(memoKey) === 'failed') {
      return { ok: false, value: getCardFieldValue(owner.source, fieldKey) }
    }

    if (recursionDepth > maxReferenceDepth) {
      pushIssue(
        owner,
        fieldKey,
        `${owner.id}:${fieldKey}`,
        'card-designer.binding.max-depth',
        { maxDepth: maxReferenceDepth },
      )
      stateMemo.set(memoKey, 'failed')
      return { ok: false, value: getCardFieldValue(owner.source, fieldKey) }
    }

    const sourceValue = getCardFieldValue(owner.source, fieldKey)
    if (typeof sourceValue !== 'string') {
      const stableValue = getCardFieldValue(owner.target, fieldKey)
      valueMemo.set(memoKey, stableValue)
      stateMemo.set(memoKey, 'done')
      return { ok: true, value: stableValue }
    }

    stateMemo.set(memoKey, 'resolving')
    const resolved = resolveStringField(owner, fieldKey, sourceValue, recursionDepth + 1)
    if (!resolved.ok) {
      stateMemo.set(memoKey, 'failed')
      return resolved
    }

    valueMemo.set(memoKey, resolved.value)
    stateMemo.set(memoKey, 'done')
    return resolved
  }

  for (const owner of owners) {
    if (options.shouldResolveOwner && !options.shouldResolveOwner({
      kind: owner.kind,
      id: owner.id,
      anchorBlockId: owner.anchorBlockId,
    })) continue
    const fieldKeys = getCardFieldKeys(owner.source)
    for (const fieldKey of fieldKeys) {
      const resolved = resolveOwnerField(owner, fieldKey, 0)
      setCardFieldValue(owner.target, fieldKey, resolved.value)
    }
  }

  return { document: targetDocument, issues }
}
