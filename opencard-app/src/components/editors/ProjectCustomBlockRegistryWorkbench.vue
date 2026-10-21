<template>
  <div class="custom-block-registry-workbench">
    <section class="custom-block-registry-workbench__collections">
      <OcTree fill role="listbox" selection-mode="single"
        :data="collectionTree" :selected-keys="selectedCollectionKey ? [selectedCollectionKey] : []"
        :action-overflow-title="t('customBlockRegistry.collectionActions')"
        @selection-change="selectCollection" @action="handleCollectionAction" />
      <OcEmpty v-if="!collections.length" tone="muted">{{ t('customBlockRegistry.emptyCollections') }}</OcEmpty>
    </section>
    <section class="custom-block-registry-workbench__blocks">
      <OcTree v-if="selectedCollection" fill role="listbox" selection-mode="single"
        :data="blockTree" :selected-keys="selectedBlockKey ? [selectedBlockKey] : []"
        :action-overflow-title="t('customBlockRegistry.blockActions')"
        @selection-change="selectBlock" @action="handleBlockAction" />
      <div v-else class="custom-block-registry-workbench__empty">
        <OcIcon name="mdiToyBrickOutline" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">{{ t('customBlockRegistry.selectCollection') }}</OcEmpty>
      </div>
    </section>
    <section class="custom-block-registry-workbench__inspector">
      <template v-if="selectedEntry">
        <div class="custom-block-registry-workbench__preview">
          <div class="custom-block-registry-workbench__viewport">
            <CardViewport v-if="preview" ref="previewViewport" :key="selectedEntry.source" :face="preview.document.faces.front"
              :resource-context="preview.resources" readonly :show-info="false" />
            <OcIcon v-else name="mdiToyBrickOutline" size="lg" tone="muted" />
          </div>
          <OcText as="strong">{{ selectedBlockName }}</OcText>
          <OcText size="sm" tone="muted">{{ selectedEntry.source }}</OcText>
          <OcButton v-if="preview" size="sm" @click="previewViewport?.fitView()">{{ t('cardDesigner.shortcuts.fitViewport') }}</OcButton>
        </div>
        <PropertyEditor :inputs="propertyInputs" :categories="categories"
          sort-mode="category" @update-property="updateProperty" />
      </template>
      <div v-else class="custom-block-registry-workbench__empty">
        <OcIcon name="mdiToyBrickOutline" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">{{ t('customBlockRegistry.noBlockSelected') }}</OcEmpty>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PropertyEditorCategoryDefinition, PropertyEditorInput, PropertyEditorMutation } from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeCollection, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcButton from '../base/OcButton.vue'
import OcTree from '../standard/OcTree.vue'
import type { CustomBlockCollection, CustomBlockRegistryEntry } from '../../features/workspace/model/customBlockRegistry'
import { createCardFace, getBlockProperty, type CardDocument } from '../../entities/card/model'
import { prepareCardRender } from '../../features/card-rendering/renderPipeline'
import CardViewport from '../../features/card-rendering/components/CardViewport.vue'
import type { ResourceEnvironment } from '../../features/workspace/services/projectResourceEnvironment'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../features/workspace/services/projectIconCatalog'

const props = defineProps<{ collections: readonly CustomBlockCollection[]; resourceEnvironment?: ResourceEnvironment | null }>()
const emit = defineEmits<{
  'update:collections': [collections: CustomBlockCollection[]]
  'add-collection': []
  'configure-collection': [key: string]
  'remove-collection': [key: string]
  'add-block': [collectionKey: string]
  'remove-block': [collectionKey: string, blockKey: string]
}>()
const { t } = useI18n()
const environment = computed(() => props.resourceEnvironment?.state.value)
const selectedCollectionKey = ref<string | null>(null)
const selectedBlockKey = ref<string | null>(null)
const previewViewport = ref<InstanceType<typeof CardViewport> | null>(null)
const selectedCollection = computed(() => props.collections.find(item => item.key === selectedCollectionKey.value) ?? null)
const selectedEntry = computed(() => selectedCollection.value?.blocks.find(item => item.key === selectedBlockKey.value) ?? null)
const selectedBlockName = computed(() => {
  const source = selectedEntry.value
    ? environment.value?.customBlockSources?.get(selectedEntry.value.source)
    : null
  return getBlockProperty<string>(source?.block, 'name') ?? selectedEntry.value?.key ?? ''
})
const preview = computed(() => {
  const entry = selectedEntry.value
  if (!entry) return null
  const source = environment.value?.customBlockSources?.get(entry.source)
  if (!source) return null
  const face = createCardFace({
    id: `custom-block-preview-${entry.key}`,
    children: [{ block: source.block, location: { id: `${entry.key}-location`, type: 'simple-container-location', anchor: 'cc', x: '0px', y: '0px' } }],
  })
  const document: CardDocument = {
    type: 'card-document', id: `custom-block-preview-${entry.key}`, version: '1', width: '480px', height: '320px',
    faces: { front: face, back: createCardFace({ id: `${entry.key}-back` }) }, instances: [],
  }
  return prepareCardRender({
    document,
    instance: null,
    resourceRootPath: environment.value?.rootPath ?? null,
    sourceFilePath: entry.source,
    environment: props.resourceEnvironment?.renderEnvironment.value ?? { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG },
  })
})

watch(preview, async () => {
  await nextTick()
  previewViewport.value?.fitView()
})

watch(() => props.collections, collections => {
  if (!selectedCollectionKey.value || !collections.some(item => item.key === selectedCollectionKey.value)) {
    selectedCollectionKey.value = collections[0]?.key ?? null
  }
  if (!selectedCollection.value?.blocks.some(item => item.key === selectedBlockKey.value)) {
    selectedBlockKey.value = selectedCollection.value?.blocks[0]?.key ?? null
  }
}, { immediate: true })
watch(selectedCollectionKey, () => {
  selectedBlockKey.value = selectedCollection.value?.blocks[0]?.key ?? null
})

const categories = computed<ReadonlyMap<string, PropertyEditorCategoryDefinition>>(() => new Map([
  ['identity', { title: t('customBlockRegistry.identity'), icon: 'mdiCodeBraces' }],
  ['source', { title: t('customBlockRegistry.sourceCategory'), icon: 'mdiToyBrickOutline' }],
]))
const propertyInputs = computed<PropertyEditorInput[]>(() => {
  const entry = selectedEntry.value
  if (!entry) return []
  return [{
    key: entry.key,
    title: entry.key,
    record: entry,
    fields: {
      key: { title: t('customBlockRegistry.key'), fieldType: 'string', category: 'identity', order: 1, unremovable: true, commitMode: 'blur' },
      source: { title: t('customBlockRegistry.source'), fieldType: 'string', category: 'source', order: 1, unremovable: true, commitMode: 'blur' },
    },
  }]
})
const collectionTree = computed<OcNodeCollection>(() => ({
  rootKeys: props.collections.map(item => item.key),
  items: new Map(props.collections.map((item): [string, OcNode] => [item.key, {
    label: item.name,
    visual: { type: 'icon', icon: 'mdiToyBrickOutline' },
    tail: [t('customBlockRegistry.blockCount', { count: item.blocks.length }), ...collectionActions()],
  }])),
  children: new Map(),
}))
const blockTree = computed<OcNodeCollection>(() => ({
  rootKeys: selectedCollection.value?.blocks.map(item => item.key) ?? [],
  items: new Map((selectedCollection.value?.blocks ?? []).map((item): [string, OcNode] => [item.key, {
    label: item.key,
    visual: { type: 'icon', icon: 'mdiToyBrickOutline' },
    tail: [{ key: 'remove', title: t('customBlockRegistry.remove'), icon: 'mdiTrashCanOutline', iconTone: 'danger' }],
  }])),
  children: new Map(),
}))

function collectionActions(): OcNodeAction[] {
  return [
    { key: 'add-block', title: t('customBlockRegistry.add'), icon: 'mdiPlus' },
    { key: 'configure', title: t('customBlockRegistry.configure'), icon: 'mdiCogOutline' },
    { key: 'remove', title: t('customBlockRegistry.removeCollection'), icon: 'mdiTrashCanOutline', iconTone: 'danger' },
  ]
}
function selectCollection(event: OcNodeSelectionEvent): void {
  selectedCollectionKey.value = event.selectedKeys.find(key => key !== 'custom-block-collections') ?? null
}
function selectBlock(event: OcNodeSelectionEvent): void {
  selectedBlockKey.value = event.selectedKeys[0] ?? null
}
function handleCollectionAction(event: OcNodeActionEvent): void {
  if (event.actionKey === 'add-block') emit('add-block', event.key)
  else if (event.actionKey === 'configure') emit('configure-collection', event.key)
  else if (event.actionKey === 'remove') emit('remove-collection', event.key)
}
function handleBlockAction(event: OcNodeActionEvent): void {
  if (event.actionKey === 'remove' && selectedCollectionKey.value) emit('remove-block', selectedCollectionKey.value, event.key)
}
function updateProperty(mutation: PropertyEditorMutation): void {
  const collection = selectedCollection.value
  const entry = selectedEntry.value
  if (!collection || !entry || !['key', 'source'].includes(mutation.fieldKey)) return
  const blocks = collection.blocks.map(candidate => candidate.key === entry.key
    ? { ...candidate, [mutation.fieldKey]: String(mutation.value) } as CustomBlockRegistryEntry
    : candidate)
  selectedBlockKey.value = mutation.fieldKey === 'key' ? String(mutation.value) : entry.key
  emit('update:collections', props.collections.map(candidate => candidate.key === collection.key ? { ...candidate, blocks } : candidate))
}
</script>

<style scoped>
.custom-block-registry-workbench { display: grid; grid-template-columns: minmax(12rem, .8fr) minmax(14rem, 1fr) minmax(16rem, 1.4fr); width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--oc-bg-base); }
.custom-block-registry-workbench__collections, .custom-block-registry-workbench__blocks { min-width: 0; min-height: 0; overflow: hidden; padding: var(--oc-space-xs) var(--oc-space-sm); border-right: var(--oc-border-width) solid var(--oc-border-muted); }
.custom-block-registry-workbench__inspector { min-width: 0; min-height: 0; overflow: auto; padding: var(--oc-space-sm); }
.custom-block-registry-workbench__preview { display: grid; justify-items: center; gap: var(--oc-space-xs); padding: var(--oc-space-lg); margin-bottom: var(--oc-space-sm); border: var(--oc-border-width) solid var(--oc-border-muted); border-radius: var(--oc-radius-control); background: var(--oc-bg-inset); text-align: center; min-width: 0; overflow: hidden; }
.custom-block-registry-workbench__preview > * { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.custom-block-registry-workbench__viewport { width: 100%; height: 20rem; overflow: hidden; }
.custom-block-registry-workbench__empty { display: grid; place-content: center; justify-items: center; gap: var(--oc-space-sm); height: 100%; padding: var(--oc-space-lg); text-align: center; }
</style>
