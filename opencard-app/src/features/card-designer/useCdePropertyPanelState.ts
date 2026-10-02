import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  getBlockProperty,
  type CardBlock,
  type CardDocument,
  type CardFace,
  type CardInstanceRecord,
  type FlowContainerLocationInfo,
  SimpleContainerLocationInfo,
} from '../../entities/card/model'
import type {
  PropertyEditorCategoryDefinition,
  PropertyEditorSortMode,
} from '../../shared/ui/property-editor/propertyEditor.types'
import {
  isCardStoredValue,
  validateAdditionalFieldKey,
  type AdditionalFieldKeyError,
  type AdditionalFieldDefinition,
} from '../../entities/card/model'
import {
  additionalFieldTypes,
  createPropertyDefaultValue,
  getDefault,
  getTypePropertyEditorSchema,
  propertyEditorCategoryDefinitions,
  resolveNulls,
  type EditorPropertyDefinition,
} from '../../entities/card/schema'
import type { CdeDocumentChangeMode } from './useCdeDocumentState'
import { findCdeBlock, useCdeBlockFieldCommands } from './useCdeBlockFieldCommands'
import { isInstanceBlockFieldOverridable } from '../../entities/card/instance'
import {
  resolveCardPropertyFields,
  type CardPropertyEditorInput,
  type CardPropertyFieldDefinition,
} from '../card-properties/cardPropertyFieldDefinitions'
import { resolveCustomBlockPublicFields, type CustomBlockSourceCatalog } from '../card-rendering/customBlockRuntime'

export type { CardPropertyEditorInput, CardPropertyFieldDefinition } from '../card-properties/cardPropertyFieldDefinitions'

type CardLocationInfo = SimpleContainerLocationInfo | FlowContainerLocationInfo

export type CdePropertySortMode = PropertyEditorSortMode

export type CdePropertyMutation = {
  key: string
  fieldKey: string
  value: unknown
}

export type CdePropertyAddMutation = Omit<CdePropertyMutation, 'value'>

export type CdePropertyResetMutation = {
  key: string
  fieldKey: string
}

export type CdeAdditionalFieldCreateMutation = {
  key: string
  fieldKey: string
  definition: AdditionalFieldDefinition
}

export type CdePropertyDeleteMutation = {
  key: string
  fieldKey: string
}

export type CdeAdditionalFieldType = (typeof additionalFieldTypes)[number]

export type CdeAdditionalFieldCreateDraft = {
  fieldKey: string
  fieldType: CdeAdditionalFieldType
  title: string
}

type UseCdePropertyPanelStateOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  activeFace: Readonly<Ref<CardFace | null>>
  selectedLocation: Readonly<ComputedRef<CardLocationInfo | null>>
  selectedBlock: Readonly<ComputedRef<CardBlock | null>>
  selectedCard: Readonly<ComputedRef<CardInstanceRecord | null>>
  selectedCardId: Readonly<Ref<string | null>>
  documentRevision: Readonly<Ref<number>>
  blueprintCardId: string
  refreshDocumentState: () => void
  markDocumentChanged: (mode?: CdeDocumentChangeMode, target?: string, structural?: boolean) => void
  translate: (messageKey: string) => string
  hasMessage: (messageKey: string) => boolean
  customBlockCatalog?: CustomBlockSourceCatalog
}

export function useCdePropertyPanelState(options: UseCdePropertyPanelStateOptions) {
  const blockFieldCommands = useCdeBlockFieldCommands(options)
  const additionalFieldCreateDialogOpen = ref(false)
  const additionalFieldTargetBlockId = ref<string | null>(null)
  const additionalFieldCreateDraft = ref<CdeAdditionalFieldCreateDraft>({
    fieldKey: '',
    fieldType: additionalFieldTypes[0] ?? 'string',
    title: '',
  })
  const canCreateAdditionalField = computed(() => Boolean(
    options.selectedBlock.value
    && options.selectedCardId.value === options.blueprintCardId,
  ))
  const additionalFieldCreateError = computed<AdditionalFieldKeyError | 'invalid-target' | null>(() => {
    const document = options.cardDoc.value
    const block = document && additionalFieldTargetBlockId.value
      ? findCdeBlock(document, additionalFieldTargetBlockId.value)
      : null
    if (!block) return 'invalid-target'
    if (!additionalFieldTypes.includes(additionalFieldCreateDraft.value.fieldType)) {
      return 'unsupported-field-type'
    }
    return validateAdditionalFieldKey(block, additionalFieldCreateDraft.value.fieldKey)
  })
  const selectedDocumentEditorRecord = computed<Record<string, unknown> & { type?: string } | null>(() => {
    options.documentRevision.value
    if (!options.cardDoc.value) {
      return null
    }

    return resolveNulls(
      'card-document',
      options.cardDoc.value as unknown as Record<string, unknown>,
    ) as Record<string, unknown> & { type?: string }
  })

  const selectedInstanceEditorRecord = computed<Record<string, unknown> & { type?: string } | null>(() => {
    options.documentRevision.value
    if (options.selectedCardId.value === options.blueprintCardId || !options.selectedCard.value) {
      return null
    }

    return resolveNulls(
      'card-instance',
      options.selectedCard.value as unknown as Record<string, unknown>,
    ) as Record<string, unknown> & { type?: string }
  })

  const selectedFaceEditorRecord = computed<Record<string, unknown> & { type?: string } | null>(() => {
    options.documentRevision.value
    if (!options.activeFace.value) return null
    return resolveNulls(
      'card-face',
      options.activeFace.value as unknown as Record<string, unknown>,
    ) as Record<string, unknown> & { type?: string }
  })

  const selectedLayout = computed<CardLocationInfo | null>(() => {
    options.documentRevision.value
    return options.selectedLocation.value
  })

  const selectedBlockEditorRecord = computed<Record<string, unknown> & { type?: string } | null>(() => {
    options.documentRevision.value
    const block = options.selectedBlock.value
    if (!block) return null
    const blockOverrides = options.selectedCardId.value === options.blueprintCardId || !options.selectedCard.value
      ? {}
      : Object.fromEntries(Object.entries(options.selectedCard.value.data[block.id] ?? {})
        .filter(([fieldKey]) => isInstanceBlockFieldOverridable(fieldKey)))
    const record = { ...block, ...blockOverrides } as Record<string, unknown>
    if (block.type === 'custom-block') {
      const publicFields = resolveCustomBlockPublicFields(block, options.customBlockCatalog)
      const source = options.customBlockCatalog?.resolve(block.source, 'project')
      const templateRecord = source?.document.block as unknown as Record<string, unknown> | undefined
      for (const fieldKey of Object.keys(publicFields)) {
        if (!Object.prototype.hasOwnProperty.call(record, fieldKey)) {
          const templateValue = templateRecord?.[fieldKey]
          if (templateValue !== undefined) record[fieldKey] = structuredClone(templateValue)
        }
      }
    }
    return resolveNulls(block.type, record) as Record<string, unknown> & { type?: string }
  })
  const blockInputOverride = computed<Record<string, Partial<EditorPropertyDefinition>> | undefined>(() => {
    options.documentRevision.value
    const block = options.selectedBlock.value
    if (!block) return undefined
    const instanceBlockData = options.selectedCardId.value !== options.blueprintCardId
      ? options.selectedCard.value?.data[block.id]
      : undefined
    // Every key in the instance data is an override — a native field or an additional field
    // alike — and each one can be reset back to the blueprint value.
    const overrideEntries = Object.keys(instanceBlockData ?? {})
      .map(fieldKey => [fieldKey, { resettable: true }] as const)
    return overrideEntries.length > 0 ? Object.fromEntries(overrideEntries) : undefined
  })

  const propertyCategories = computed<ReadonlyMap<string, PropertyEditorCategoryDefinition>>(() =>
    new Map(Object.entries(propertyEditorCategoryDefinitions).map(([key, definition]) => [
      key,
      {
        title: resolveLocalizedText(`propertyEditor.categories.${key}`, key),
        icon: definition.icon,
      },
    ])),
  )

  function resolveLocalizedText(messageKey: string, fallback: string): string {
    return options.hasMessage(messageKey) ? options.translate(messageKey) : fallback
  }

  function resolveFields(
    record: Readonly<Record<string, unknown>>,
    override?: Readonly<Record<string, Partial<EditorPropertyDefinition>>>,
    labels?: Readonly<Record<string, string>>,
    customKeys: ReadonlySet<string> = new Set(),
    excludedKeys: ReadonlySet<string> = new Set(),
  ): Record<string, CardPropertyFieldDefinition> {
    const fields = resolveCardPropertyFields(record, {
      allowDelete: options.selectedCardId.value === options.blueprintCardId,
      translate: options.translate,
      hasMessage: options.hasMessage,
      override,
      labels,
      customKeys,
    })
    return Object.fromEntries(Object.entries(fields).filter(([fieldKey]) => !excludedKeys.has(fieldKey)))
  }

  const propertyInputs = computed<CardPropertyEditorInput[]>(() => {
    const inputs: CardPropertyEditorInput[] = []
    const selectedBlock = options.selectedBlock.value
    const layout = selectedLayout.value
    const cardDoc = options.cardDoc.value
    const selectedCard = options.selectedCard.value
    if (selectedBlockEditorRecord.value && selectedBlock) {
      const blockRecord = selectedBlockEditorRecord.value
      const resolvedBlockFields = resolveFields(
        blockRecord,
        blockInputOverride.value,
        undefined,
        options.selectedCardId.value === options.blueprintCardId
          ? new Set(Object.keys(selectedBlock.type === 'custom-block'
            ? resolveCustomBlockPublicFields(selectedBlock, options.customBlockCatalog)
            : {}))
          : new Set(['name']),
      )
      const customFields = selectedBlock.type === 'custom-block'
        ? resolveCustomBlockPublicFields(selectedBlock, options.customBlockCatalog)
        : {}
      const resolvedWithCustomFields = selectedBlock.type === 'custom-block'
        ? resolveCardPropertyFields(blockRecord, {
            allowDelete: options.selectedCardId.value === options.blueprintCardId,
            translate: options.translate,
            hasMessage: options.hasMessage,
            override: { ...customFields, ...blockInputOverride.value },
            customKeys: new Set(Object.keys(customFields)),
          })
        : resolvedBlockFields
      inputs.push({
        key: selectedBlock.id,
        title: getBlockProperty<string>(selectedBlock, 'name')?.trim() || selectedBlock.id,
        record: blockRecord,
        fields: resolvedWithCustomFields,
      })
      if (layout) {
        inputs.push({
          key: layout.id,
          title: 'Layout',
          record: layout as Record<string, unknown> & { type?: string },
          fields: resolveFields(layout as Record<string, unknown>),
        })
      }
      return inputs
    }
    if (selectedDocumentEditorRecord.value && cardDoc) {
      inputs.push({ key: cardDoc.id, title: options.translate('propertyEditor.sources.document'), record: selectedDocumentEditorRecord.value, fields: resolveFields(selectedDocumentEditorRecord.value) })
    }
    const activeFace = options.activeFace.value
    if (selectedFaceEditorRecord.value && activeFace) {
      inputs.push({ key: activeFace.id, title: options.translate('propertyEditor.sources.face'), record: selectedFaceEditorRecord.value, fields: resolveFields(selectedFaceEditorRecord.value) })
    }
    if (selectedInstanceEditorRecord.value && selectedCard) {
      inputs.push({ key: selectedCard.id, title: options.translate('propertyEditor.sources.instance'), record: selectedInstanceEditorRecord.value, fields: resolveFields(selectedInstanceEditorRecord.value) })
    }
    return inputs
  })

  function isSelectedLayoutKey(key: string): boolean {
    const layout = selectedLayout.value
    return Boolean(layout && layout.id === key)
  }

  function isSelectedDocumentKey(key: string): boolean {
    const cardDoc = options.cardDoc.value
    return Boolean(cardDoc && cardDoc.id === key)
  }

  function isSelectedInstanceKey(key: string): boolean {
    const selectedCard = options.selectedCard.value
    if (!selectedCard || options.selectedCardId.value === options.blueprintCardId) {
      return false
    }
    return selectedCard.id === key
  }

  function isSelectedFaceKey(key: string): boolean {
    return options.activeFace.value?.id === key
  }

  function isSelectedBlockKey(key: string): boolean {
    const block = options.selectedBlock.value
    return Boolean(block && block.id === key)
  }

  function updateLayoutField(fieldKey: string, value: unknown, mode: CdeDocumentChangeMode): boolean {
    const layout = selectedLayout.value
    if (!layout || !isCardStoredValue(value)) {
      return false
    }

    ; (layout as Record<string, unknown>)[fieldKey] = value
    options.refreshDocumentState()
    options.markDocumentChanged(mode, `layout:${layout.id}:${fieldKey}`)
    return true
  }

  function updateDocumentField(fieldKey: string, value: unknown, mode: CdeDocumentChangeMode): boolean {
    const cardDoc = options.cardDoc.value
    if (!cardDoc || !isCardStoredValue(value)) {
      return false
    }

    ; (cardDoc as Record<string, unknown>)[fieldKey] = value
    options.refreshDocumentState()
    options.markDocumentChanged(mode, `document:${cardDoc.id}:${fieldKey}`)
    return true
  }

  function updateInstanceField(fieldKey: string, value: unknown, mode: CdeDocumentChangeMode): boolean {
    const selectedCard = options.selectedCard.value
    if (!selectedCard || options.selectedCardId.value === options.blueprintCardId || !isCardStoredValue(value)) {
      return false
    }

    ; (selectedCard as Record<string, unknown>)[fieldKey] = value
    options.refreshDocumentState()
    options.markDocumentChanged(mode, `instance:${selectedCard.id}:${fieldKey}`)
    return true
  }

  function updateFaceField(fieldKey: string, value: unknown, mode: CdeDocumentChangeMode): boolean {
    const face = options.activeFace.value
    if (!face || !isCardStoredValue(value)) return false
    ;(face as unknown as Record<string, unknown>)[fieldKey] = value
    options.refreshDocumentState()
    options.markDocumentChanged(mode, `face:${face.id}:${fieldKey}`)
    return true
  }

  function updateProperty({
    key,
    fieldKey,
    value,
  }: CdePropertyMutation) {
    if (isSelectedLayoutKey(key)) {
      updateLayoutField(fieldKey, value, 'typing')
      return
    }
    if (isSelectedDocumentKey(key)) {
      updateDocumentField(fieldKey, value, 'typing')
      return
    }
    if (isSelectedFaceKey(key)) {
      updateFaceField(fieldKey, value, 'typing')
      return
    }
    if (isSelectedInstanceKey(key)) {
      updateInstanceField(fieldKey, value, 'typing')
      return
    }
    if (!isSelectedBlockKey(key)) return
    blockFieldCommands.updateField({
      cardId: options.selectedCardId.value ?? options.blueprintCardId,
      blockId: key,
      fieldKey,
    }, value, 'typing')
  }

  function addProperty({
    key,
    fieldKey,
  }: CdePropertyAddMutation) {
    const input = propertyInputs.value.find(candidate => candidate.key === key)
    const definition = input?.fields[fieldKey]
    const value = definition
      ? createPropertyDefaultValue(definition as Parameters<typeof createPropertyDefaultValue>[0])
      : undefined
    if (value === undefined) return
    if (isSelectedLayoutKey(key)) {
      updateLayoutField(fieldKey, value, 'action')
      return
    }
    if (isSelectedDocumentKey(key)) {
      updateDocumentField(fieldKey, value, 'action')
      return
    }
    if (isSelectedFaceKey(key)) {
      updateFaceField(fieldKey, value, 'action')
      return
    }
    if (isSelectedInstanceKey(key)) {
      updateInstanceField(fieldKey, value, 'action')
      return
    }
    if (!isSelectedBlockKey(key)) return
    blockFieldCommands.updateField({
      cardId: options.selectedCardId.value ?? options.blueprintCardId,
      blockId: key,
      fieldKey,
    }, value, 'action')
  }

  function resetLayoutField(fieldKey: string): boolean {
    const layout = selectedLayout.value
    if (!layout) {
      return false
    }

    const layoutType = typeof layout.type === 'string' ? layout.type : undefined
    const defaultValue = getDefault(layoutType, fieldKey)
    if (defaultValue === undefined) {
      delete (layout as Record<string, unknown>)[fieldKey]
    } else {
      ; (layout as Record<string, unknown>)[fieldKey] = defaultValue
    }

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetDocumentField(fieldKey: string): boolean {
    const cardDoc = options.cardDoc.value
    if (!cardDoc) {
      return false
    }

    const defaultValue = getDefault('card-document', fieldKey)
    if (defaultValue === undefined) {
      delete (cardDoc as Record<string, unknown>)[fieldKey]
    } else {
      ; (cardDoc as Record<string, unknown>)[fieldKey] = defaultValue
    }

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetInstanceField(fieldKey: string): boolean {
    const selectedCard = options.selectedCard.value
    if (!selectedCard || options.selectedCardId.value === options.blueprintCardId) {
      return false
    }

    const defaultValue = getDefault('card-instance', fieldKey)
    if (defaultValue === undefined) {
      delete (selectedCard as Record<string, unknown>)[fieldKey]
    } else {
      ; (selectedCard as Record<string, unknown>)[fieldKey] = defaultValue
    }

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetFaceField(fieldKey: string): boolean {
    const face = options.activeFace.value
    if (!face) return false
    const defaultValue = getDefault('card-face', fieldKey)
    if (defaultValue === undefined) {
      delete (face as unknown as Record<string, unknown>)[fieldKey]
    } else {
      ;(face as unknown as Record<string, unknown>)[fieldKey] = defaultValue
    }
    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function resetProperty({
    key,
    fieldKey,
  }: CdePropertyResetMutation) {
    if (isSelectedLayoutKey(key)) {
      resetLayoutField(fieldKey)
      return
    }
    if (isSelectedDocumentKey(key)) {
      resetDocumentField(fieldKey)
      return
    }
    if (isSelectedFaceKey(key)) {
      resetFaceField(fieldKey)
      return
    }
    if (isSelectedInstanceKey(key)) {
      resetInstanceField(fieldKey)
      return
    }
    if (!isSelectedBlockKey(key)) return
    blockFieldCommands.resetField({
      cardId: options.selectedCardId.value ?? options.blueprintCardId,
      blockId: key,
      fieldKey,
    })
  }

  function createAdditionalField({ key, fieldKey, definition }: CdeAdditionalFieldCreateMutation) {
    return blockFieldCommands.createField({
      cardId: options.blueprintCardId,
      blockId: key,
      fieldKey,
      definition,
    })
  }

  function openAdditionalFieldCreateDialog(
    blockId: string | null = options.selectedBlock.value?.id ?? null,
    cardId: string | null = options.selectedCardId.value,
  ): boolean {
    if (!blockId || cardId !== options.blueprintCardId || !options.cardDoc.value
      || !findCdeBlock(options.cardDoc.value, blockId)) return false
    additionalFieldTargetBlockId.value = blockId
    additionalFieldCreateDraft.value = {
      fieldKey: '',
      fieldType: additionalFieldTypes[0] ?? 'string',
      title: '',
    }
    additionalFieldCreateDialogOpen.value = true
    return true
  }

  function closeAdditionalFieldCreateDialog(): void {
    additionalFieldCreateDialogOpen.value = false
    additionalFieldTargetBlockId.value = null
  }

  function submitAdditionalFieldCreate(definition: AdditionalFieldDefinition): AdditionalFieldKeyError | 'invalid-target' | null {
    const document = options.cardDoc.value
    const block = document && additionalFieldTargetBlockId.value
      ? findCdeBlock(document, additionalFieldTargetBlockId.value)
      : null
    const error = additionalFieldCreateError.value
    if (!block || error) return error ?? 'invalid-target'
    const result = createAdditionalField({
      key: block.id,
      fieldKey: additionalFieldCreateDraft.value.fieldKey,
      definition,
    })
    if (!result) closeAdditionalFieldCreateDialog()
    return result
  }

  function deleteProperty({ key, fieldKey }: CdePropertyDeleteMutation): boolean {
    const document = options.cardDoc.value
    const block = options.selectedBlock.value
    if (!document || options.selectedCardId.value !== options.blueprintCardId) {
      return false
    }

    if (block?.id === key) {
      return blockFieldCommands.deleteField({
        cardId: options.blueprintCardId,
        blockId: key,
        fieldKey,
      })
    } else if (isSelectedLayoutKey(key)) {
      const layout = selectedLayout.value
      if (!layout || !deleteOptionalSchemaField(layout as unknown as Record<string, unknown>, fieldKey)) {
        return false
      }
    } else if (isSelectedDocumentKey(key)) {
      if (!deleteOptionalSchemaField(document as unknown as Record<string, unknown>, fieldKey)) {
        return false
      }
    } else if (isSelectedFaceKey(key)) {
      const face = options.activeFace.value
      if (!face || !deleteOptionalSchemaField(face as unknown as Record<string, unknown>, fieldKey)) {
        return false
      }
    } else {
      return false
    }

    options.refreshDocumentState()
    options.markDocumentChanged('action')
    return true
  }

  function deleteOptionalSchemaField(record: Record<string, unknown>, fieldKey: string): boolean {
    const typeName = typeof record.type === 'string' ? record.type : undefined
    const definition = getTypePropertyEditorSchema(typeName)[fieldKey]
    if (!definition || definition.required === true || definition.isReadonly === true
      || !Object.prototype.hasOwnProperty.call(record, fieldKey)) {
      return false
    }
    delete record[fieldKey]
    return true
  }

  return {
    selectedLayout,
    propertyInputs,
    propertyCategories,
    canCreateAdditionalField,
    additionalFieldCreateDialogOpen,
    additionalFieldCreateDraft,
    additionalFieldCreateError,
    additionalFieldTypeOptions: additionalFieldTypes,
    updateProperty,
    addProperty,
    resetProperty,
    createAdditionalField,
    openAdditionalFieldCreateDialog,
    closeAdditionalFieldCreateDialog,
    submitAdditionalFieldCreate,
    deleteProperty,
  }
}
