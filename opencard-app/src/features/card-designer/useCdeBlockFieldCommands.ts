import type { Ref } from 'vue'
import {
  clearBlockFieldValue,
  createBlockAdditionalField,
  isCardStoredValue,
  removeBlockAdditionalFieldDefinition,
  setCardFieldValue,
  updateBlockAdditionalFieldDefinition,
  type AdditionalFieldKeyError,
  type AdditionalFieldDefinition,
  type CardBlock,
  type CardDocument,
} from '../../entities/card/model'
import { getDefault, getTypePropertyEditorSchema } from '../../entities/card/schema'
import { isBlockContainer } from '../../entities/card/tree'
import { isInstanceBlockFieldOverridable } from '../../entities/card/instance'
import { isPropertyRemovable } from '../../shared/ui/property-editor/propertyRemovability'
import { resetInstanceOverrideField } from './cdeInstanceOverride'
import type { CdeDocumentChangeMode } from './useCdeDocumentState'

export type CdeBlockFieldTarget = {
  cardId: string
  blockId: string
  fieldKey: string
}

type CdeBlockFieldCreateTarget = CdeBlockFieldTarget & {
  definition: AdditionalFieldDefinition
}

type UseCdeBlockFieldCommandsOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  blueprintCardId: string
  refreshDocumentState: () => void
  markDocumentChanged: (mode?: CdeDocumentChangeMode, target?: string, structural?: boolean) => void
}

export function findCdeBlock(document: CardDocument, blockId: string): CardBlock | null {
  function visit(block: CardBlock): CardBlock | null {
    if (block.id === blockId) return block
    if (!isBlockContainer(block)) return null
    for (const child of block.children) {
      const match = visit(child.block)
      if (match) return match
    }
    return null
  }

  for (const face of Object.values(document.faces)) {
    for (const child of face.children) {
      const match = visit(child.block)
      if (match) return match
    }
  }
  return null
}

export function useCdeBlockFieldCommands(options: UseCdeBlockFieldCommandsOptions) {
  function resolveTarget(target: CdeBlockFieldTarget) {
    const document = options.cardDoc.value
    const block = document ? findCdeBlock(document, target.blockId) : null
    const instance = target.cardId === options.blueprintCardId
      ? null
      : document?.instances?.find(candidate => candidate.id === target.cardId) ?? null
    return { document, block, instance }
  }

  function updateField(
    target: CdeBlockFieldTarget,
    value: unknown,
    mode: CdeDocumentChangeMode = 'typing',
  ): boolean {
    const { block, instance } = resolveTarget(target)
    if (!block || !isCardStoredValue(value)) return false

    if (target.cardId === options.blueprintCardId) {
      const record = block as unknown as Record<string, unknown>
      if (!setCardFieldValue(record, target.fieldKey, value)) record[target.fieldKey] = value
    } else {
      if (!instance || !isInstanceBlockFieldOverridable(target.fieldKey)) return false
      const overrides = instance.data[block.id] ?? (instance.data[block.id] = {})
      overrides[target.fieldKey] = value
    }

    options.refreshDocumentState()
    options.markDocumentChanged(mode, `block-field:${target.cardId}:${target.blockId}:${target.fieldKey}`)
    return true
  }

  function resetField(target: CdeBlockFieldTarget): boolean {
    const { block, instance } = resolveTarget(target)
    if (!block) return false

    if (target.cardId === options.blueprintCardId) {
      const record = block as unknown as Record<string, unknown>
      const defaultValue = getDefault(block.type, target.fieldKey)
      if (defaultValue === undefined) delete record[target.fieldKey]
      else record[target.fieldKey] = defaultValue
    } else {
      if (!instance || !resetInstanceOverrideField(instance.data, block.id, target.fieldKey)) return false
    }

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function createField(target: CdeBlockFieldCreateTarget): AdditionalFieldKeyError | 'invalid-target' | null {
    if (target.cardId !== options.blueprintCardId) return 'invalid-target'
    const { block } = resolveTarget(target)
    if (!block) return 'invalid-target'
    const error = createBlockAdditionalField(block, target.fieldKey, target.definition)
    if (error) return error
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return null
  }

  function updateFieldDefinition(target: CdeBlockFieldTarget, definition: AdditionalFieldDefinition): boolean {
    if (target.cardId !== options.blueprintCardId) return false
    const { block } = resolveTarget(target)
    if (!block || !updateBlockAdditionalFieldDefinition(block, target.fieldKey, definition)) return false
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function removeFieldDefinition(target: CdeBlockFieldTarget): boolean {
    if (target.cardId !== options.blueprintCardId) return false
    const { document, block } = resolveTarget(target)
    if (!document || !block || !removeBlockAdditionalFieldDefinition(document, block, target.fieldKey)) return false
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetBlueprintField(target: CdeBlockFieldTarget): boolean {
    if (target.cardId !== options.blueprintCardId) return false
    const { document, block } = resolveTarget(target)
    if (!document || !block) return false

    // 重置只清掉这块自己的值，定义保留：面板按值渲染，所以该行会消失，
    // 属性回到分类标题的“+”里等待重新添加；实例的覆写数据不受影响。
    const definition = block.additionalFieldDefinition?.[target.fieldKey]
      ?? getTypePropertyEditorSchema(block.type)[target.fieldKey]
    if (!definition || !isPropertyRemovable(definition)) return false
    if (!Object.prototype.hasOwnProperty.call(block, target.fieldKey)) return false
    clearBlockFieldValue(block, target.fieldKey)

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  return { updateField, resetField, createField, updateFieldDefinition, removeFieldDefinition, resetBlueprintField }
}
