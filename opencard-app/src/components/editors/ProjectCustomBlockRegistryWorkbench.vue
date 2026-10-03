<template>
  <div class="custom-block-registry-workbench">
    <section class="custom-block-registry-workbench__list">
      <OcTree fill role="listbox" selection-mode="single" :data="treeData"
        :selected-keys="selectedKey ? [selectedKey] : []"
        :action-overflow-title="t('customBlockRegistry.actions')"
        @selection-change="selectEntry" @action="handleAction" />
    </section>
    <section class="custom-block-registry-workbench__editor">
      <PropertyEditor v-if="selectedEntry" :inputs="propertyInputs" :categories="categories"
        sort-mode="category" @update-property="updateProperty" />
      <div v-else class="custom-block-registry-workbench__empty">
        <OcIcon name="entity.block-custom" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">{{ t('customBlockRegistry.empty') }}</OcEmpty>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PropertyCompletionProvider, PropertyEditorCategoryDefinition, PropertyEditorInput, PropertyEditorMutation } from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import type { OcNode, OcNodeActionEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcIcon from '../base/OcIcon.vue'
import OcTree from '../standard/OcTree.vue'
import type { CustomBlockRegistryEntry } from '../../features/workspace/model/customBlockRegistry'

const props = defineProps<{
  blocks: readonly CustomBlockRegistryEntry[]
  sourceCompletion?: PropertyCompletionProvider
}>()
const emit = defineEmits<{
  'update:blocks': [blocks: CustomBlockRegistryEntry[]]
  add: []
  configure: [key: string]
  remove: [key: string]
}>()
const { t } = useI18n()
const selectedKey = ref<string | null>(null)
const selectedEntry = computed(() => props.blocks.find(entry => entry.key === selectedKey.value) ?? null)

watch(() => props.blocks, blocks => {
  if (!selectedKey.value || !blocks.some(entry => entry.key === selectedKey.value)) selectedKey.value = blocks[0]?.key ?? null
}, { immediate: true })

const categories = computed<ReadonlyMap<string, PropertyEditorCategoryDefinition>>(() => new Map([
  ['identity', { title: t('customBlockRegistry.identity'), icon: 'data.symbol-class' }],
  ['source', { title: t('customBlockRegistry.sourceCategory'), icon: 'entity.block-custom' }],
]))
const propertyInputs = computed<PropertyEditorInput[]>(() => {
  const entry = selectedEntry.value
  if (!entry) return []
  return [{
    key: entry.key,
    title: entry.name,
    record: entry,
    fields: {
      name: { title: t('customBlockRegistry.name'), fieldType: 'string', category: 'identity', order: 1, required: true, commitMode: 'blur' },
      key: { title: t('customBlockRegistry.key'), fieldType: 'string', category: 'identity', order: 2, required: true, commitMode: 'blur' },
      source: { title: t('customBlockRegistry.source'), fieldType: 'string', category: 'source', order: 1, required: true, commitMode: 'blur', completion: { provider: props.sourceCompletion } },
    },
  }]
})
const treeData = computed<OcNodeCollection>(() => {
  const root = 'custom-blocks'
  const items = new Map<string, OcNode>([[root, {
    label: t('customBlockRegistry.title'), visual: { type: 'icon', icon: 'entity.block-custom' },
    tail: [{ key: 'add', title: t('customBlockRegistry.add'), icon: 'action.add' }],
  }]])
  for (const entry of props.blocks) items.set(entry.key, {
    label: entry.name,
    visual: { type: 'icon', icon: 'entity.block-custom' },
    tail: [entry.key, { key: 'configure', title: t('customBlockRegistry.configure'), icon: 'tool.settings' }, { key: 'remove', title: t('customBlockRegistry.remove'), icon: 'action.delete', iconTone: 'danger' }],
  })
  return { rootKeys: [root], items, children: new Map([[root, props.blocks.map(entry => entry.key)]]) }
})

function selectEntry(event: OcNodeSelectionEvent): void { selectedKey.value = event.selectedKeys.find(key => key !== 'custom-blocks') ?? null }
function handleAction(event: OcNodeActionEvent): void {
  if (event.key !== 'custom-blocks') selectedKey.value = event.key
  if (event.key === 'custom-blocks' && event.actionKey === 'add') emit('add')
  else if (event.actionKey === 'configure') emit('configure', event.key)
  else if (event.actionKey === 'remove') emit('remove', event.key)
}
function updateProperty(mutation: PropertyEditorMutation): void {
  const entry = selectedEntry.value
  if (!entry || !['name', 'key', 'source'].includes(mutation.fieldKey)) return
  const blocks = props.blocks.map(candidate => candidate.key === entry.key
    ? { ...candidate, [mutation.fieldKey]: String(mutation.value) }
    : candidate)
  if (mutation.fieldKey === 'key') selectedKey.value = String(mutation.value)
  emit('update:blocks', blocks)
}
</script>

<style scoped>
.custom-block-registry-workbench { display: grid; grid-template-columns: minmax(14rem, 0.8fr) minmax(0, 1.6fr); width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--oc-bg-base); }
.custom-block-registry-workbench__list { min-width: 0; min-height: 0; overflow: hidden; padding: var(--oc-space-2) var(--oc-space-3); border-right: var(--oc-border-width) solid var(--oc-border-muted); }
.custom-block-registry-workbench__editor { min-width: 0; min-height: 0; overflow: auto; padding: var(--oc-space-3); }
.custom-block-registry-workbench__empty { display: grid; place-content: center; justify-items: center; gap: var(--oc-space-3); height: 100%; padding: var(--oc-space-6); text-align: center; }
</style>
