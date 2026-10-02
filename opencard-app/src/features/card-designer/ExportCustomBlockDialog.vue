<template>
  <OcDialog :open="open" :title="t('cardDesigner.customBlock.exportTitle')" as="form"
    size="md" close-on-backdrop @request-close="emit('close')" @submit="submit">
    <p class="custom-block-export-dialog__description">
      {{ t('cardDesigner.customBlock.exportDescription') }}
    </p>
    <div class="custom-block-export-dialog__toolbar">
      <OcButton type="button" variant="ghost" @click="selectAll">
        {{ t('cardDesigner.customBlock.selectAll') }}
      </OcButton>
      <OcButton type="button" variant="ghost" @click="clearAll">
        {{ t('cardDesigner.customBlock.clearAll') }}
      </OcButton>
    </div>
    <OcTree v-if="fields.length" class="custom-block-export-dialog__fields" fill selection-mode="none"
      action-visibility="always" tab-navigation="none" :data="treeData" @action="handleTreeAction" />
    <template #footer>
      <OcButton type="button" @click="emit('close')">{{ t('cardDesigner.customBlock.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" icon="entity.block-custom">
        {{ t('cardDesigner.customBlock.exportConfirm') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../components/base/OcButton.vue'
import OcDialog from '../../components/standard/OcDialog.vue'
import OcTree from '../../components/standard/OcTree.vue'
import type { EditorPropertyDefinition } from '../../entities/card/schema'
import type { OcNodeAction, OcNodeActionEvent, OcNodeCollection } from '../../shared/ui/node/node.types'

const props = defineProps<{
  open: boolean
  fields: Readonly<Record<string, EditorPropertyDefinition>>
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', fieldKeys: readonly string[]): void
}>()

const { t, te } = useI18n()
const selectedKeys = ref<string[]>([])
const fields = computed(() => Object.entries(props.fields).map(([key, definition]) => ({
  key,
  title: te(`propertyEditor.fields.${definition.displayFieldKey?.trim() || key}`)
    ? t(`propertyEditor.fields.${definition.displayFieldKey?.trim() || key}`)
    : definition.displayFieldKey?.trim() || key,
})))
const treeData = computed<OcNodeCollection>(() => ({
  rootKeys: fields.value.map(field => field.key),
  items: new Map(fields.value.map(field => {
    const checked = selectedKeys.value.includes(field.key)
    const action: OcNodeAction = checked
      ? { key: 'deselect', title: t('cardDesigner.customBlock.deselectField'), icon: 'action.checkbox-marked' }
      : { key: 'select', title: t('cardDesigner.customBlock.selectField'), icon: 'action.checkbox-blank' }
    return [field.key, {
      label: field.title,
      tail: [field.key, action],
      contextActions: [action],
      visual: { type: 'icon', icon: 'data.symbol-key', iconTone: checked ? 'active' : 'muted' },
    }]
  })),
  children: new Map(),
}))

watch(() => [props.open, props.fields], ([open]) => {
  if (!open) return
  selectedKeys.value = fields.value.map(field => field.key)
}, { immediate: true })

function selectAll(): void {
  selectedKeys.value = fields.value.map(field => field.key)
}

function clearAll(): void {
  selectedKeys.value = []
}

function submit(): void {
  emit('submit', selectedKeys.value)
}

function handleTreeAction(event: OcNodeActionEvent): void {
  const next = new Set(selectedKeys.value)
  if (event.actionKey === 'select') next.add(event.key)
  if (event.actionKey === 'deselect') next.delete(event.key)
  selectedKeys.value = [...next]
}
</script>

<style scoped>
.custom-block-export-dialog__description {
  margin: 0 0 var(--oc-space-3);
  color: var(--oc-fg-muted);
}

.custom-block-export-dialog__toolbar {
  display: flex;
  gap: var(--oc-space-2);
  margin-bottom: var(--oc-space-3);
}

.custom-block-export-dialog__fields {
  display: grid;
  gap: var(--oc-space-2);
  max-height: 20rem;
  overflow: auto;
  padding: var(--oc-space-2);
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-radius-md);
}

</style>
