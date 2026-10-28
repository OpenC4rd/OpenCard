<template>
  <OcDialog :open="open" :title="dialogTitle" as="form" size="md"
    close-on-backdrop @request-close="emit('close')" @submit="submit">
        <label class="additional-field-dialog__field">
          <span>{{ t('propertyEditor.customFields.type') }}</span>
          <OcSelect
            full-width
            :model-value="fieldType"
            :options="fieldTypeOptions"
            :readonly="isEditing"
            @update:model-value="emit('update-field-type', $event)"
          />
        </label>

        <label class="additional-field-dialog__field">
          <span>{{ t('propertyEditor.customFields.key') }}</span>
          <OcFieldInput
            full-width
            mono
            :autofocus="!isEditing"
            :readonly="isEditing"
            :value="fieldKey"
            @input="emitInputValue('update-field-key', $event)"
          />
        </label>

        <label class="additional-field-dialog__field">
          <span>{{ t('propertyEditor.customFields.title') }}</span>
          <OcFieldInput
            full-width
            :value="title"
            :placeholder="fieldKey"
            @input="emitInputValue('update-title', $event)"
          />
        </label>

        <OcButton class="additional-field-dialog__advanced-toggle" type="button" variant="ghost"
          :icon="advancedOpen ? 'mdiChevronUp' : 'mdiChevronDown'"
          :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">
          {{ t('propertyEditor.customFields.advanced') }}
        </OcButton>

        <section v-if="advancedOpen" class="additional-field-dialog__advanced"
          :aria-label="t('propertyEditor.customFields.advanced')">
          <PropertyEditor v-if="Object.keys(definitionFields).length" :inputs="definitionInputs"
            :categories="definitionCategories" sort-mode="category" delete-mode
            @update-property="updateDefinitionProperty" @add-property="addDefinitionProperty"
            @delete-property="deleteDefinitionProperty" />
          <p v-else class="additional-field-dialog__empty">
            {{ t('propertyEditor.customFields.noAdvanced') }}
          </p>
        </section>

        <section class="additional-field-dialog__preview"
          :aria-label="t('propertyEditor.customFields.preview')">
          <span>{{ t('propertyEditor.customFields.preview') }}</span>
          <div class="additional-field-dialog__preview-field">
            <span>{{ title.trim() || fieldKey || t('propertyEditor.customFields.previewFallback') }}</span>
            <PropertyFieldRenderer :definition="previewDefinition" :value="previewValue"
              :capabilities="capabilities" editor-id="field"
              @update:value="previewValue = $event" />
          </div>
        </section>

        <p v-if="displayErrorText" class="additional-field-dialog__error" role="alert">{{ displayErrorText }}</p>

    <template #footer>
      <OcButton v-if="isEditing && canRemove" class="additional-field-dialog__remove" type="button" variant="ghost"
        @click="requestRemove">
        {{ removePending ? t('propertyEditor.customFields.confirmRemove') : t('propertyEditor.customFields.remove') }}
      </OcButton>
      <OcButton type="button" @click="emit('close')">
        {{ t('propertyEditor.customFields.cancel') }}
      </OcButton>
      <OcButton type="submit" variant="solid" :disabled="invalid || Boolean(definitionError)">
        {{ isEditing ? t('propertyEditor.customFields.confirmEdit') : t('propertyEditor.customFields.confirmCreate') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getAdditionalFieldPropertyDefinition, type AdditionalFieldDefinition } from '../../../entities/card/model'
import { createPropertyDefaultValue } from '../../../entities/card/schema'
import type { PropertyEditorCategoryDefinition, PropertyEditorFieldDefinition,
  PropertyEditorInput, PropertyEditorMutation, PropertyEditorFieldIntent, PropertyFieldCapabilities } from './propertyEditor.types'
import OcButton from '../../../components/base/OcButton.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import PropertyEditor from './PropertyEditor.vue'
import PropertyFieldRenderer from './PropertyFieldRenderer.vue'
import { isPropertyRemovable } from './propertyRemovability'

const props = defineProps<{
  open: boolean
  mode?: 'create' | 'edit'
  fieldTypes: readonly string[]
  fieldType: string
  fieldKey: string
  title: string
  initialDefinition?: AdditionalFieldDefinition | null
  capabilities?: PropertyFieldCapabilities
  errorText?: string
  invalid?: boolean
}>()

const emit = defineEmits<{
  (e: 'update-field-type', value: string): void
  (e: 'update-field-key', value: string): void
  (e: 'update-title', value: string): void
  (e: 'close'): void
  (e: 'remove'): void
  (e: 'submit', definition: AdditionalFieldDefinition): void
}>()
const { t } = useI18n()
const advancedOpen = ref(false)
const definitionRecord = ref<Record<string, unknown>>({})
const previewValue = ref<unknown>('')
const removePending = ref(false)
const isEditing = computed(() => props.mode === 'edit')
const canRemove = computed(() => isPropertyRemovable(props.initialDefinition ?? {}))
const dialogTitle = computed(() => isEditing.value
  ? t('propertyEditor.customFields.edit')
  : t('propertyEditor.customFields.create'))
const STRING_CONSTRAINT_KEYS = ['minLength', 'maxLength', 'multiline', 'options', 'presentation'] as const
const NUMBER_CONSTRAINT_KEYS = ['min', 'max', 'step'] as const
const fieldTypeOptions = computed(() => props.fieldTypes.map(option => ({
  value: option,
  label: t(`propertyEditor.fieldTypes.${option}`),
})))
const definitionCategories = computed(() => new Map<string, PropertyEditorCategoryDefinition>([
  ['advanced', { title: t('propertyEditor.customFields.advanced'), icon: 'mdiCodeBraces' }],
]))
const definitionFields = computed<Record<string, PropertyEditorFieldDefinition>>(() => {
  const common = { category: 'advanced' } as const
  if (props.fieldType === 'string') return Object.fromEntries(Object.entries({
    minLength: { ...common, title: t('propertyEditor.customFields.constraints.minLength'), fieldType: 'number', min: 0, step: 1 },
    maxLength: { ...common, title: t('propertyEditor.customFields.constraints.maxLength'), fieldType: 'number', min: 0, step: 1 },
    multiline: { ...common, title: t('propertyEditor.customFields.constraints.multiline'), fieldType: 'boolean' },
    options: { ...common, title: t('propertyEditor.customFields.constraints.options'), fieldType: 'string[]' },
    presentation: { ...common, title: t('propertyEditor.customFields.constraints.presentation'), fieldType: 'string', options: ['select', 'stepper'] },
  }).filter(([, value]) => value !== undefined)) as Record<string, PropertyEditorFieldDefinition>
  if (props.fieldType === 'filePath') return Object.fromEntries(Object.entries({
    target: {
      ...common,
      title: t('propertyEditor.customFields.constraints.target'),
      fieldType: 'string',
      options: ['file', 'directory', 'both'],
      optionLabelKeys: {
        file: 'propertyEditor.customFields.constraints.targets.file',
        directory: 'propertyEditor.customFields.constraints.targets.directory',
        both: 'propertyEditor.customFields.constraints.targets.both',
      },
    },
    pattern: { ...common, title: t('propertyEditor.customFields.constraints.pattern'), fieldType: 'string' },
  }).filter(([, value]) => value !== undefined)) as Record<string, PropertyEditorFieldDefinition>
  if (props.fieldType === 'number') return Object.fromEntries(Object.entries({
    min: { ...common, title: t('propertyEditor.customFields.constraints.min'), fieldType: 'number' },
    max: { ...common, title: t('propertyEditor.customFields.constraints.max'), fieldType: 'number' },
    step: { ...common, title: t('propertyEditor.customFields.constraints.step'), fieldType: 'number' },
  }).filter(([, value]) => value !== undefined)) as Record<string, PropertyEditorFieldDefinition>
  return {}
})
const definitionInputs = computed<readonly PropertyEditorInput[]>(() => [{
  key: 'additional-field-definition',
  title: t('propertyEditor.customFields.advanced'),
  record: definitionRecord.value,
  fields: definitionFields.value,
}])
const definitionError = computed(() => validateDefinitionRecord(props.fieldType, definitionRecord.value))
const displayErrorText = computed(() => props.errorText || (definitionError.value
  ? t(`propertyEditor.customFields.errors.${definitionError.value}`)
  : ''))
const previewDefinition = computed<PropertyEditorFieldDefinition>(() => ({
  ...getAdditionalFieldPropertyDefinition(buildDefinition()),
  title: props.title.trim() || props.fieldKey || t('propertyEditor.customFields.previewFallback'),
}) as PropertyEditorFieldDefinition)

watch(() => props.open, open => {
  if (!open) {
    removePending.value = false
    return
  }
  advancedOpen.value = false
  definitionRecord.value = isEditing.value ? readDefinitionConstraints(props.initialDefinition) : {}
  resetPreviewValue()
}, { immediate: true })
watch(() => props.fieldType, () => {
  if (isEditing.value) return
  definitionRecord.value = {}
})
watch(() => [props.fieldType, JSON.stringify(definitionRecord.value)], resetPreviewValue, { immediate: true })

function updateDefinitionProperty(mutation: PropertyEditorMutation): void {
  definitionRecord.value = { ...definitionRecord.value, [mutation.fieldKey]: mutation.value }
}

function addDefinitionProperty(mutation: Omit<PropertyEditorMutation, 'value'> & { value?: unknown }): void {
  const definition = definitionFields.value[mutation.fieldKey]
  if (!definition) return
  definitionRecord.value = {
    ...definitionRecord.value,
    [mutation.fieldKey]: mutation.value ?? createPropertyDefaultValue(
      definition as Parameters<typeof createPropertyDefaultValue>[0],
    ),
  }
}

function deleteDefinitionProperty(intent: PropertyEditorFieldIntent): void {
  const next = { ...definitionRecord.value }
  delete next[intent.fieldKey]
  definitionRecord.value = next
}

function readDefinitionConstraints(
  definition: AdditionalFieldDefinition | null | undefined,
): Record<string, unknown> {
  if (!definition) return {}
  if (definition.fieldType === 'filePath') {
    const filter = definition.filter
    return {
      ...(filter?.target ? { target: filter.target } : {}),
      ...(filter?.pattern ? { pattern: filter.pattern } : {}),
    }
  }
  const source = definition as unknown as Record<string, unknown>
  const keys = definition.fieldType === 'string'
    ? STRING_CONSTRAINT_KEYS
    : definition.fieldType === 'number' ? NUMBER_CONSTRAINT_KEYS : []
  return Object.fromEntries(keys
    .filter(key => source[key] !== undefined)
    .map(key => [key, typeof source[key] === 'number' ? String(source[key]) : source[key]]))
}

function requestRemove(): void {
  if (!removePending.value) {
    removePending.value = true
    return
  }
  emit('remove')
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function validateDefinitionRecord(fieldType: string, record: Record<string, unknown>): string | null {
  if (fieldType === 'string') {
    const minLength = parseNumber(record.minLength)
    const maxLength = parseNumber(record.maxLength)
    if ((record.minLength !== undefined && (!Number.isInteger(minLength) || minLength! < 0))
      || (record.maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength! < 0))) return 'invalidLength'
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) return 'lengthRange'
    const options = Array.isArray(record.options) ? record.options : []
    const normalized = options.map(value => typeof value === 'string' ? value.trim() : '')
    if (normalized.some(value => !value)) return 'invalidOption'
    if (new Set(normalized.map(value => value.toLocaleLowerCase())).size !== normalized.length) return 'duplicateOption'
    if (record.presentation !== undefined && normalized.length === 0) return 'presentationWithoutOptions'
  }
  if (fieldType === 'number') {
    const min = parseNumber(record.min)
    const max = parseNumber(record.max)
    const step = parseNumber(record.step)
    if ((record.min !== undefined && min === undefined) || (record.max !== undefined && max === undefined)) return 'invalidNumber'
    if (min !== undefined && max !== undefined && min > max) return 'numberRange'
    if (record.step !== undefined && (step === undefined || step <= 0)) return 'invalidStep'
  }
  return null
}

function buildDefinition(): AdditionalFieldDefinition {
  const title = props.title.trim()
  const base = { fieldType: props.fieldType, ...(title ? { title } : {}) }
  if (props.fieldType === 'string') {
    const minLength = parseNumber(definitionRecord.value.minLength)
    const maxLength = parseNumber(definitionRecord.value.maxLength)
    const options = Array.isArray(definitionRecord.value.options)
      ? definitionRecord.value.options.map(value => String(value).trim()).filter(Boolean) : []
    return {
      ...base, fieldType: 'string',
      ...(minLength !== undefined ? { minLength } : {}),
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(typeof definitionRecord.value.multiline === 'boolean' ? { multiline: definitionRecord.value.multiline } : {}),
      ...(options.length ? { options } : {}),
      ...(options.length && (definitionRecord.value.presentation === 'select' || definitionRecord.value.presentation === 'stepper')
        ? { presentation: definitionRecord.value.presentation } : {}),
    }
  }
  if (props.fieldType === 'filePath') {
    const rawTarget = definitionRecord.value.target
    const target = rawTarget === 'file' || rawTarget === 'directory' || rawTarget === 'both'
      ? rawTarget
      : undefined
    const pattern = typeof definitionRecord.value.pattern === 'string' && definitionRecord.value.pattern.trim()
      ? definitionRecord.value.pattern.trim()
      : undefined
    return {
      ...base,
      fieldType: 'filePath',
      ...(target || pattern ? { filter: { ...(target ? { target } : {}), ...(pattern ? { pattern } : {}) } } : {}),
    }
  }
  if (props.fieldType === 'number') {
    const min = parseNumber(definitionRecord.value.min)
    const max = parseNumber(definitionRecord.value.max)
    const step = parseNumber(definitionRecord.value.step)
    return { ...base, fieldType: 'number', ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}), ...(step !== undefined ? { step } : {}) }
  }
  return base as AdditionalFieldDefinition
}

function resetPreviewValue(): void {
  previewValue.value = createPropertyDefaultValue(getAdditionalFieldPropertyDefinition(buildDefinition()))
}

function submit(): void {
  if (props.invalid || definitionError.value) return
  emit('submit', buildDefinition())
}

function emitInputValue(
  eventName: 'update-field-key' | 'update-title',
  event: Event,
): void {
  const value = (event.target as HTMLInputElement).value
  if (eventName === 'update-field-key') emit('update-field-key', value)
  else emit('update-title', value)
}
</script>

<style scoped>
.additional-field-dialog__field {
  display: grid;
  gap: var(--oc-space-xs);
  min-width: 0;
  font-size: var(--oc-text-sm);
  color: var(--oc-fg-muted);
}
.additional-field-dialog__advanced-toggle { justify-self: start; }
.additional-field-dialog__remove { margin-inline-end: auto; color: var(--oc-fg-danger); }
.additional-field-dialog__advanced { min-width: 0; }
.additional-field-dialog__empty { margin: 0; color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.additional-field-dialog__preview { display: grid; gap: var(--oc-space-xs); color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.additional-field-dialog__preview-field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--oc-space-sm); }
.additional-field-dialog__preview-field > span { overflow: hidden; color: var(--oc-fg-default); text-overflow: ellipsis; white-space: nowrap; }

.additional-field-dialog__error {
  margin: 0;
  font-size: var(--oc-text-sm);
  color: var(--oc-fg-danger);
}

</style>
