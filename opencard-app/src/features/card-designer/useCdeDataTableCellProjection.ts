/**
 * Lazily projects Data Table cell field definitions for each blueprint/instance column.
 * Owns only the derived-definition cache; Cell mounting and document writes stay outside.
 */
import type { Ref } from 'vue'
import {
  type CardBlock,
  type CardDocument,
  type CardFaceKey,
} from '../../entities/card/model'
import { isInstanceBlockFieldOverridable } from '../../entities/card/instance'
import { isBlockContainer, type ParentLookup } from '../../entities/card/tree'
import type { PropertyEditorFieldDefinition } from '../../shared/ui/property-editor/propertyEditor.types'
import type {
  ReferenceCompletionContext,
  ReferenceCompletionScope,
} from '../editor-runtime/services/referenceCompletion'
import type { CardPropertyFieldDefinition } from '../card-properties/cardPropertyFieldDefinitions'
import {
  createCdeCardReferenceScope,
  createCdeDictionaryReferenceScope,
  createCdeProjectReferenceScope,
  enrichCardPropertyFieldDefinition,
  type CdePropertyProjectContext,
} from './cdePropertyFieldEnrichment'

type CellFieldInput = {
  key: string
  definition: CardPropertyFieldDefinition
}

type CellIdentityInput = {
  cardId: string
  identity: string
}

type UseCdeDataTableCellProjectionOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  documentRevision: Readonly<Ref<number>>
  parentLookup: Readonly<Ref<ParentLookup>>
  projectContext: Readonly<Ref<CdePropertyProjectContext>>
  locale: Readonly<Ref<string>>
  blueprintCardId: string
  translate: (messageKey: string, parameters?: Record<string, unknown>) => string
  hasMessage: (messageKey: string) => boolean
}

type CacheContext = {
  document: CardDocument | null
  revision: number
  locale: string
  project: CdePropertyProjectContext
}

export function useCdeDataTableCellProjection(options: UseCdeDataTableCellProjectionOptions) {
  const definitionCache = new Map<string, PropertyEditorFieldDefinition>()
  let cacheContext: CacheContext | null = null

  function getDataTableCellDefinition(
    blockId: string,
    field: CellFieldInput,
    cell: CellIdentityInput,
  ): PropertyEditorFieldDefinition {
    syncCacheContext()
    const cached = definitionCache.get(cell.identity)
    if (cached) return cached

    const document = options.cardDoc.value
    const target = document ? findBlockWithFace(document, blockId) : null
    if (!document || !target) return field.definition

    const instance = cell.cardId === options.blueprintCardId
      ? null
      : document.instances?.find(candidate => candidate.id === cell.cardId) ?? null
    const canOverride = cell.cardId === options.blueprintCardId
      || isInstanceBlockFieldOverridable(field.key)
    const record = {
      ...target.block,
      ...Object.fromEntries(Object.entries(instance?.data[target.block.id] ?? {}).filter(
        ([fieldKey]) => isInstanceBlockFieldOverridable(fieldKey),
      )),
    } as Record<string, unknown>
    const definition = enrichCardPropertyFieldDefinition({
      definition: canOverride
        ? field.definition
        : { ...field.definition, isReadonly: true, resettable: false },
      record,
      referenceContext: createCellReferenceContext(
        document,
        target.block,
        target.faceKey,
        cell.cardId,
        field,
      ),
      resourceEnvironment: options.projectContext.value.resourceEnvironment,
    })
    definitionCache.set(cell.identity, definition)
    return definition
  }

  function createCellReferenceContext(
    document: CardDocument,
    block: CardBlock,
    faceKey: CardFaceKey,
    cardId: string,
    field: CellFieldInput,
  ): ReferenceCompletionContext | null {
    const instance = cardId === options.blueprintCardId
      ? null
      : document.instances?.find(candidate => candidate.id === cardId) ?? null
    if (cardId !== options.blueprintCardId && !instance) return null
    const currentBlockRecord = {
      ...block,
      ...(instance?.data[block.id] ?? {}),
    } as Record<string, unknown>
    const ancestorScopes: ReferenceCompletionScope[] = []
    let currentBlockId = block.id
    let depth = 1
    while (true) {
      const parent = options.parentLookup.value.get(currentBlockId)
      if (!parent || parent.type === 'card-face') break
      ancestorScopes.push(cardScope(
        depth === 1
          ? options.translate('propertyEditor.references.parent')
          : options.translate('propertyEditor.references.ancestor', { depth }),
        {
          ...parent,
          ...(instance?.data[parent.id] ?? {}),
        } as Record<string, unknown>,
      ))
      currentBlockId = parent.id
      depth += 1
    }

    const project = options.projectContext.value
    return {
      currentBlock: cardScope(options.translate('propertyEditor.references.self'), currentBlockRecord),
      currentCard: cardScope(
        instance
          ? options.translate('propertyEditor.references.currentCard')
          : options.translate('propertyEditor.references.currentCardBlueprint'),
        (instance ?? document) as unknown as Record<string, unknown>,
      ),
      currentFace: cardScope(
        options.translate('propertyEditor.references.currentFace'),
        document.faces[faceKey] as unknown as Record<string, unknown>,
      ),
      oppositeFace: cardScope(
        options.translate('propertyEditor.references.oppositeFace'),
        document.faces[faceKey === 'front' ? 'back' : 'front'] as unknown as Record<string, unknown>,
      ),
      document: cardScope(
        options.translate('propertyEditor.references.document'),
        document as unknown as Record<string, unknown>,
      ),
      project: project.information
        ? createCdeProjectReferenceScope({
            label: options.translate('propertyEditor.references.project'),
            project: project.information,
            translate: options.translate,
            hasMessage: options.hasMessage,
          })
        : undefined,
      dictionary: project.dictionary
        ? createCdeDictionaryReferenceScope(
            options.translate('propertyEditor.references.dictionary'),
            project.dictionary,
          )
        : undefined,
      allowedScopes: field.definition.bindingScopes,
      getAncestor: ancestorDepth => ancestorScopes[ancestorDepth - 1],
      targetKind: field.definition.fieldType === 'number' ? 'number'
        : field.definition.fieldType === 'boolean' ? 'boolean'
          : field.definition.fieldType === 'object' ? 'object' : 'string',
    }
  }

  function cardScope(
    label: string,
    record: Readonly<Record<string, unknown>>,
  ): ReferenceCompletionScope {
    return createCdeCardReferenceScope({
      label,
      record,
      translate: options.translate,
      hasMessage: options.hasMessage,
    })
  }

  function syncCacheContext(): void {
    const next: CacheContext = {
      document: options.cardDoc.value,
      revision: options.documentRevision.value,
      locale: options.locale.value,
      project: options.projectContext.value,
    }
    if (!cacheContext
      || next.document !== cacheContext.document
      || next.revision !== cacheContext.revision
      || next.locale !== cacheContext.locale
      || next.project !== cacheContext.project) {
      definitionCache.clear()
      cacheContext = next
    }
  }

  return { getDataTableCellDefinition }
}

function findBlockWithFace(
  document: CardDocument,
  blockId: string,
): { block: CardBlock; faceKey: CardFaceKey } | null {
  for (const faceKey of ['front', 'back'] as const) {
    const stack = document.faces[faceKey].children.map(child => child.block)
    while (stack.length > 0) {
      const block = stack.pop()!
      if (block.id === blockId) return { block, faceKey }
      if (isBlockContainer(block)) {
        for (const child of block.children) stack.push(child.block)
      }
    }
  }
  return null
}
