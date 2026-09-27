<template>
  <div class="array-property-field">
    <div v-for="(item, index) in items" :key="index" class="array-property-field__item">
      <component
        :is="elementComponent"
        class="array-property-field__control"
        :definition="elementDefinition"
        :value="item"
        @update:value="updateItem(index, $event)"
      />
      <span class="array-property-field__actions">
        <OcButton
          icon-only
          size="sm"
          variant="ghost"
          icon="nav.arrow-up"
          :data-tooltip="moveUpText"
          :aria-label="moveUpText"
          :disabled="definition.isReadonly || index === 0"
          @click="moveItem(index, -1)"
        />
        <OcButton
          icon-only
          size="sm"
          variant="ghost"
          icon="nav.arrow-down"
          :data-tooltip="moveDownText"
          :aria-label="moveDownText"
          :disabled="definition.isReadonly || index === items.length - 1"
          @click="moveItem(index, 1)"
        />
        <OcButton
          icon-only
          size="sm"
          variant="ghost"
          icon="action.delete"
          :data-tooltip="deleteText"
          :aria-label="deleteText"
          :disabled="definition.isReadonly"
          @click="deleteItem(index)"
        />
      </span>
    </div>
    <OcButton
      class="array-property-field__add"
      size="sm"
      variant="ghost"
      icon="action.add"
      :disabled="definition.isReadonly"
      @click="addItem"
    >
      {{ addText }}
    </OcButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../../components/base/OcButton.vue'
import type {
  BasePropertyFieldType,
  PropertyEditorFieldDefinition,
} from '../propertyEditor.types'

type ElementDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: BasePropertyFieldType }>

const props = defineProps<{
  definition: PropertyEditorFieldDefinition
  elementComponent: Component
  elementDefinition: ElementDefinition
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: unknown[]): void
}>()

const { t, te } = useI18n()
const items = ref<unknown[]>(toArrayValue(props.value))
const addText = computed(() => te('propertyEditor.arrays.add') ? t('propertyEditor.arrays.add') : 'Add item')
const deleteText = computed(() => te('propertyEditor.arrays.delete') ? t('propertyEditor.arrays.delete') : 'Delete item')
const moveUpText = computed(() => te('propertyEditor.arrays.moveUp') ? t('propertyEditor.arrays.moveUp') : 'Move up')
const moveDownText = computed(() => te('propertyEditor.arrays.moveDown') ? t('propertyEditor.arrays.moveDown') : 'Move down')

function emitItems(next: unknown[]): void {
  items.value = next
  emit('update:value', next)
}

function toArrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : []
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
}

watch(() => props.value, (value) => {
  const next = toArrayValue(value)
  if (arraysEqual(items.value, next)) return

  const committedDraft = items.value.filter(item => item !== '' && item !== undefined && item !== null)
  const hasPendingItem = committedDraft.length !== items.value.length
  if (hasPendingItem && arraysEqual(committedDraft, next)) return
  items.value = next
})

function updateItem(index: number, value: unknown): void {
  const next = [...items.value]
  next[index] = value
  emitItems(next)
}

function addItem(): void {
  emitItems([...items.value, structuredClone(props.elementDefinition.defaultValue)])
}

function deleteItem(index: number): void {
  emitItems(items.value.filter((_, itemIndex) => itemIndex !== index))
}

function moveItem(index: number, offset: -1 | 1): void {
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= items.value.length) return
  const next = [...items.value]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  emitItems(next)
}
</script>

<style scoped>
.array-property-field {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: var(--oc-space-1);
}

.array-property-field__item {
  display: flex;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  gap: var(--oc-space-1);
}

.array-property-field__control {
  flex: 1 1 auto;
  min-width: 0;
}

.array-property-field__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

.array-property-field__add {
  align-self: flex-start;
}
</style>
