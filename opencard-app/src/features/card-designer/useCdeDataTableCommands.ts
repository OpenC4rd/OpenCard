/**
 * Coordinates Data Table field-selection configuration with injected Block field commands.
 * Owns document-write transactions only; projection, UI, selection, and Cell caches stay outside.
 */
import { computed, type Ref } from 'vue'
import {
  setCardFieldValue,
  getBlockProperty,
  setBlockProperty,
  deleteBlockProperty,
  type AdditionalFieldKeyError,
  type AdditionalFieldDefinition,
  type CardBlock,
  type CardDocument,
} from '../../entities/card/model'
import { isInstanceBlockFieldOverridable } from '../../entities/card/instance'
import { isBlockContainer } from '../../entities/card/tree'
import type { CardDataWorkbookImportResult, CardDataWorkbookUpdate } from './cardDataWorkbook'

type CdeDataTableChangeMode = 'typing' | 'action'

type BlockFieldTarget = {
  cardId: string
  blockId: string
  fieldKey: string
}

type BlockFieldCreateTarget = BlockFieldTarget & {
  definition: AdditionalFieldDefinition
}

export type CdeDataTableFieldCreatePayload = {
  blockId: string
  fieldKey: string
  definition: AdditionalFieldDefinition
}

type UseCdeDataTableCommandsOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  documentRevision: Readonly<Ref<number>>
  blueprintCardId: string
  refreshDocumentState: () => void
  markDocumentChanged: (mode?: CdeDataTableChangeMode, target?: string, structural?: boolean) => void
  updateBlockField: (
    target: BlockFieldTarget,
    value: unknown,
    mode: CdeDataTableChangeMode,
  ) => boolean
  resetBlockField: (target: BlockFieldTarget) => boolean
  createBlockField: (
    target: BlockFieldCreateTarget,
  ) => AdditionalFieldKeyError | 'invalid-target' | null
  resetBlueprintField: (target: BlockFieldTarget) => boolean
}

export function useCdeDataTableCommands(options: UseCdeDataTableCommandsOptions) {
  const fieldSelection = computed(() => {
    options.documentRevision.value
    return normalizeFieldSelection(options.cardDoc.value?.dataTable?.blocks)
  })

  const exportInstanceIds = computed(() => {
    options.documentRevision.value
    const document = options.cardDoc.value
    if (!document) return []
    const configured = document.dataTable?.exportInstanceIds
    const selected = new Set(configured ?? document.instances.map(instance => instance.id))
    return document.instances.flatMap(instance => selected.has(instance.id) ? [instance.id] : [])
  })

  function includeBlock(blockId: string): boolean {
    if (!blockId || hasOwn(fieldSelection.value, blockId)) return false
    return commitFieldSelection({ ...fieldSelection.value, [blockId]: [] })
  }

  function removeBlock(blockId: string): boolean {
    if (!hasOwn(fieldSelection.value, blockId)) return false
    const next = { ...fieldSelection.value }
    delete next[blockId]
    return commitFieldSelection(next)
  }

  function includeField(blockId: string, fieldKey: string): boolean {
    if (!blockId || !fieldKey) return false
    const current = fieldSelection.value[blockId] ?? []
    if (current.includes(fieldKey)) return false
    return commitFieldSelection({
      ...fieldSelection.value,
      [blockId]: [...current, fieldKey],
    })
  }

  function excludeField(blockId: string, fieldKey: string): boolean {
    const current = fieldSelection.value[blockId]
    if (!current?.includes(fieldKey)) return false
    return commitFieldSelection({
      ...fieldSelection.value,
      [blockId]: current.filter(candidate => candidate !== fieldKey),
    })
  }

  function updateCell(payload: BlockFieldTarget & { value: unknown }): boolean {
    return options.updateBlockField(payload, payload.value, 'typing')
  }

  function setInstanceExported(instanceId: string, exported: boolean): boolean {
    const document = options.cardDoc.value
    if (!document?.instances.some(instance => instance.id === instanceId)) return false
    const current = new Set(exportInstanceIds.value)
    if (current.has(instanceId) === exported) return false
    if (exported) current.add(instanceId)
    else current.delete(instanceId)
    const orderedIds = document.instances.flatMap(instance => current.has(instance.id) ? [instance.id] : [])
    document.dataTable = {
      blocks: normalizeFieldSelection(document.dataTable?.blocks),
      exportInstanceIds: orderedIds,
    }
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetCell(payload: BlockFieldTarget): boolean {
    return options.resetBlockField(payload)
  }

  function applyWorkbookUpdates(updates: readonly CardDataWorkbookUpdate[]): boolean {
    const document = options.cardDoc.value
    if (!document || updates.length === 0) return false
    const changed = applyWorkbookUpdatesWithoutCommit(updates, document)
    if (!changed) return false
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function applyWorkbookImport(result: CardDataWorkbookImportResult): boolean {
    const document = options.cardDoc.value
    if (!document) return false
    const blockLookup = createBlockLookup(document)
    let changed = false

    if (result.newInstances.length > 0) {
      document.instances = [
        ...document.instances,
        ...result.newInstances.map(instance => structuredClone(instance)),
      ]
      const exported = new Set(document.dataTable?.exportInstanceIds ?? document.instances.map(instance => instance.id))
      for (const instance of result.newInstances) exported.add(instance.id)
      document.dataTable = {
        blocks: normalizeFieldSelection(document.dataTable?.blocks),
        exportInstanceIds: document.instances.flatMap(instance => exported.has(instance.id) ? [instance.id] : []),
      }
      changed = true
    }

    for (const rename of result.blockRenames) {
      const block = blockLookup.get(rename.blockId)
      if (!block) continue
      const currentName = getBlockProperty<string>(block, 'name')?.trim() || block.id
      if (currentName === rename.nextName) continue
      if (rename.nextName) setBlockProperty(block, 'name', rename.nextName)
      else deleteBlockProperty(block, 'name')
      changed = true
    }

    const updatesChanged = applyWorkbookUpdatesWithoutCommit(result.updates, document, blockLookup)
    changed = updatesChanged || changed
    if (!changed) return false
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function applyWorkbookUpdatesWithoutCommit(
    updates: readonly CardDataWorkbookUpdate[],
    document: CardDocument,
    blockLookup = createBlockLookup(document),
  ): boolean {
    const instanceLookup = new Map(document.instances.map(instance => [instance.id, instance]))
    let changed = false
    for (const update of updates) {
      const block = blockLookup.get(update.blockId)
      if (!block) continue
      if (update.cardId === options.blueprintCardId) {
        if (update.reset || update.value === undefined) continue
        const record = block as unknown as Record<string, unknown>
        if (storedValuesEqual(record[update.fieldKey], update.value)) continue
        changed = setCardFieldValue(record, update.fieldKey, structuredClone(update.value)) || changed
        continue
      }

      const instance = instanceLookup.get(update.cardId)
      if (!instance || !isInstanceBlockFieldOverridable(update.fieldKey)) continue
      const blockData = instance.data[update.blockId]
      if (update.reset) {
        if (!blockData || !Object.prototype.hasOwnProperty.call(blockData, update.fieldKey)) continue
        delete blockData[update.fieldKey]
        if (Object.keys(blockData).length === 0) delete instance.data[update.blockId]
        changed = true
        continue
      }
      if (update.value === undefined || storedValuesEqual(blockData?.[update.fieldKey], update.value)) continue
      const target = blockData ?? (instance.data[update.blockId] = {})
      target[update.fieldKey] = structuredClone(update.value)
      changed = true
    }
    return changed
  }

  function createField(
    payload: CdeDataTableFieldCreatePayload,
  ): AdditionalFieldKeyError | 'invalid-target' | null {
    const previous = fieldSelection.value
    if (payload.blockId && payload.fieldKey) {
      const current = previous[payload.blockId] ?? []
      writeFieldSelection({
        ...previous,
        [payload.blockId]: current.includes(payload.fieldKey)
          ? current
          : [...current, payload.fieldKey],
      })
    }
    const result = options.createBlockField({
      cardId: options.blueprintCardId,
      ...payload,
    })
    if (result) {
      writeFieldSelection(previous)
      options.refreshDocumentState()
    }
    return result
  }

  function resetBlueprintField(blockId: string, fieldKey: string): boolean {
    return options.resetBlueprintField({
      cardId: options.blueprintCardId,
      blockId,
      fieldKey,
    })
  }

  function commitFieldSelection(value: Readonly<Record<string, readonly string[]>>): boolean {
    if (!writeFieldSelection(value)) return false
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function writeFieldSelection(value: Readonly<Record<string, readonly string[]>>): boolean {
    const document = options.cardDoc.value
    if (!document) return false
    const blocks = normalizeFieldSelection(value)
    const exportInstanceIds = document.dataTable?.exportInstanceIds
    if (Object.keys(blocks).length === 0 && exportInstanceIds === undefined) delete document.dataTable
    else document.dataTable = {
      blocks,
      ...(exportInstanceIds === undefined ? {} : { exportInstanceIds: [...exportInstanceIds] }),
    }
    return true
  }

  return {
    createField,
    excludeField,
    exportInstanceIds,
    applyWorkbookImport,
    applyWorkbookUpdates,
    fieldSelection,
    includeBlock,
    includeField,
    removeBlock,
    resetBlueprintField,
    resetCell,
    setInstanceExported,
    updateCell,
  }
}

function createBlockLookup(document: CardDocument): Map<string, CardBlock> {
  const lookup = new Map<string, CardBlock>()
  function visit(block: CardBlock): void {
    lookup.set(block.id, block)
    if (isBlockContainer(block)) {
      for (const child of block.children) visit(child.block)
    }
  }
  for (const face of Object.values(document.faces)) {
    for (const child of face.children) visit(child.block)
  }
  return lookup
}

function storedValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizeFieldSelection(
  value: Readonly<Record<string, readonly string[]>> | null | undefined,
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(value ?? {}).flatMap(([blockId, fieldKeys]) => {
    if (!blockId || !Array.isArray(fieldKeys)) return []
    return [[blockId, Array.from(new Set(fieldKeys.filter(fieldKey => Boolean(fieldKey))))]]
  }))
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}
