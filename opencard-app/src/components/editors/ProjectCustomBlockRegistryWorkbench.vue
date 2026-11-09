<template>
  <ProjectResourceWorkbench full-bleed :leading-title="t('customBlockRegistry.panelTitle')" :leading-actions="leadingCardActions"
    :inspector-title="t('cardDesigner.panels.properties')" @action="handleCardAction">
    <template #leading>
      <OcTree v-if="collections.length" fill role="listbox" selection-mode="single" scroll-to-selection
        :data="blockTree" :selected-keys="selectedTreeKeys" :expanded-keys="expandedKeys"
        :action-overflow-title="t('customBlockRegistry.collectionActions')"
        @selection-change="handleSelection" @expansion-change="handleExpansion" @action="handleAction" />
      <OcEmpty v-else icon="mdiToyBrickOutline" tone="muted" fill>{{ t('customBlockRegistry.emptyCollections') }}</OcEmpty>
    </template>

    <template #default="{ insets }">
      <CardViewport v-if="preview && selectedEntry" ref="previewViewport" :key="selectedEntry.source"
        :face="preview.document.faces.front" :resource-context="preview.resources" readonly :show-info="false"
        :viewport-insets="insets" @viewport-transform-change="previewScale = $event.scale" />
      <OcEmpty v-else-if="selectedEntry" icon="mdiToyBrickOutline" tone="muted" fill>
        {{ t('customBlockRegistry.previewUnavailable') }}
      </OcEmpty>
      <OcEmpty v-else icon="mdiToyBrickOutline" tone="muted" fill>
        {{ t(selectedCollection ? 'customBlockRegistry.noBlockSelected' : 'customBlockRegistry.selectCollection') }}
      </OcEmpty>
    </template>

    <template v-if="preview && selectedEntry" #append>
      <OcActionBar overflow="none" :aria-label="t('customBlockRegistry.previewControls')" :items="toolbarItems"
        @select="handleToolbarSelect" />
    </template>

    <template v-if="selectedEntry" #inspector>
      <div class="custom-block-registry-workbench__properties">
        <PropertyEditor :inputs="propertyInputs" :categories="categories" :capabilities="propertyCapabilities"
          sort-mode="category" @update-property="updateProperty" />
      </div>
    </template>
  </ProjectResourceWorkbench>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PropertyEditorCategoryDefinition, PropertyEditorInput, PropertyEditorMutation } from '../../shared/ui/property-editor/propertyEditor.types'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeCollection, OcNodeExpansionEvent, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcActionBar from '../standard/OcActionBar.vue'
import OcTree from '../standard/OcTree.vue'
import { createViewportToolbarItems } from '../standard/overlayToolbarItems'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'
import type { CustomBlockCollection, CustomBlockRegistryEntry } from '../../features/workspace/model/customBlockRegistry'
import { createCardFace, getBlockProperty, type CardDocument } from '../../entities/card/model'
import { prepareCardRender } from '../../features/card-rendering/renderPipeline'
import CardViewport from '../../features/card-rendering/components/CardViewport.vue'
import type { ResourceEnvironment } from '../../features/workspace/services/projectResourceEnvironment'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../features/workspace/services/projectIconCatalog'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { createResourcePropertyCapabilities } from '../../features/workspace/services/propertyResourceCapabilities'

/** 与卡牌视口的 100% 同一基准：1mm = 96/25.4px。 */
const VIEWPORT_BASE_SCALE = 96 / 25.4
const ZOOM_STEP = 1.25
/** 文档尺寸按毫米数值解析；带单位的字符串读不出来，会静默退回默认的竖版卡面。 */
const PREVIEW_FACE_WIDTH_MM = '127'
const PREVIEW_FACE_HEIGHT_MM = '85'

const props = defineProps<{
  collections: readonly CustomBlockCollection[]
  resourceEnvironment?: ResourceEnvironment | null
  /** 左卡头部由所有者提供的命令，排在「添加自定义块」之前。 */
  leadingActions?: OcActionDefinition[]
}>()
const emit = defineEmits<{
  'update:collections': [collections: CustomBlockCollection[]]
  'add-collection': []
  'configure-collection': [key: string]
  'remove-collection': [key: string]
  'add-block': [collectionKey: string]
  /** A card command the owner supplied through `leadingActions`. */
  'leading-action': [actionKey: string]
  'remove-block': [collectionKey: string, blockKey: string]
}>()
const { t } = useI18n()
const environment = computed(() => props.resourceEnvironment?.state.value)
const selectedCollectionKey = ref<string | null>(null)
const selectedBlockKey = ref<string | null>(null)
const collapsedKeys = ref<ReadonlySet<string>>(new Set())
const previewViewport = ref<InstanceType<typeof CardViewport> | null>(null)
const previewScale = ref(VIEWPORT_BASE_SCALE)
const selectedCollection = computed(() => props.collections.find(item => item.key === selectedCollectionKey.value) ?? null)
const selectedEntry = computed(() => selectedCollection.value?.blocks.find(item => item.key === selectedBlockKey.value) ?? null)
const toolbarItems = computed(() => createViewportToolbarItems(
  `${Math.round(previewScale.value / VIEWPORT_BASE_SCALE * 100)}%`,
  {
    zoomOut: t('cardDesigner.shortcuts.zoomOut'),
    fit: t('cardDesigner.shortcuts.fitViewport'),
    zoomIn: t('cardDesigner.shortcuts.zoomIn'),
  },
))
const preview = computed(() => {
  const entry = selectedEntry.value
  if (!entry) return null
  const source = environment.value?.customBlockSources?.get(entry.source)
  if (!source) return null
  const face = createCardFace({
    id: `custom-block-preview-${entry.key}`,
    background: 'transparent',
    children: [{ block: source.block, location: { id: `${entry.key}-location`, type: 'simple-container-location', anchor: 'cc', x: '0px', y: '0px' } }],
  })
  const document: CardDocument = {
    type: 'card-document', id: `custom-block-preview-${entry.key}`, version: '1', width: PREVIEW_FACE_WIDTH_MM, height: PREVIEW_FACE_HEIGHT_MM,
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

const categories = computed<ReadonlyMap<string, PropertyEditorCategoryDefinition>>(() => new Map([
  ['block', { title: t('customBlockRegistry.title'), icon: 'mdiToyBrickOutline' }],
]))
const propertyCapabilities = computed(() => createResourcePropertyCapabilities({
  projectLabel: t('propertyEditor.references.project'),
  rootPath: environment.value?.rootPath ?? null,
  fs: fileSystemService,
  resourceEnvironment: environment.value,
}))
const propertyInputs = computed<PropertyEditorInput[]>(() => {
  const entry = selectedEntry.value
  if (!entry) return []
  return [{
    key: entry.key,
    title: entry.key,
    record: entry,
    fields: {
      key: { title: t('customBlockRegistry.key'), fieldType: 'string', category: 'block', order: 1, unremovable: true, commitMode: 'blur' },
      source: { title: t('customBlockRegistry.sourceCategory'), fieldType: 'filePath', filter: { target: 'file', pattern: '*.ocblock' }, category: 'block', order: 2, unremovable: true },
    },
  }]
})
const expandedKeys = computed(() => props.collections.map(item => collectionTreeKey(item.key))
  .filter(key => !collapsedKeys.value.has(key)))
const selectedTreeKeys = computed(() => {
  const collection = selectedCollectionKey.value
  if (collection === null) return []
  return [selectedBlockKey.value === null ? collectionTreeKey(collection) : blockTreeKey(collection, selectedBlockKey.value)]
})
const blockTree = computed<OcNodeCollection>(() => {
  const items = new Map<string, OcNode>()
  const children = new Map<string, string[]>()
  for (const collection of props.collections) {
    const key = collectionTreeKey(collection.key)
    items.set(key, {
      label: collection.name,
      visual: { type: 'icon', icon: 'mdiLayersOutline' },
      tail: [t('customBlockRegistry.blockCount', { count: collection.blocks.length }), ...collectionActions()],
    })
    children.set(key, collection.blocks.length
      ? collection.blocks.map(block => blockTreeKey(collection.key, block.key))
      : [`empty:${collection.key}`])
    for (const block of collection.blocks) {
      items.set(blockTreeKey(collection.key, block.key), {
        label: blockName(block),
        visual: { type: 'icon', icon: 'mdiToyBrickOutline' },
        tail: [{ key: 'remove-block', title: t('customBlockRegistry.remove'), icon: 'mdiTrashCanOutline', iconTone: 'danger' }],
      })
    }
    // 空集合也要有子项：标题看着能展开，点开却什么都没有，比一句话更让人以为界面坏了。
    if (!collection.blocks.length) {
      items.set(`empty:${collection.key}`, {
        label: t('customBlockRegistry.noBlocksInCollection'),
        visual: { type: 'icon', icon: 'mdiFileOutline' },
        disabled: true,
      })
    }
  }
  return { rootKeys: props.collections.map(item => collectionTreeKey(item.key)), items, children }
})

/** 树键只在这一页内用：集合 Key 不含 `/`，所以第一个 `/` 之后都是块 Key。 */
function collectionTreeKey(collectionKey: string): string { return `collection:${collectionKey}` }
function blockTreeKey(collectionKey: string, blockKey: string): string { return `block:${collectionKey}/${blockKey}` }
function parseTreeKey(key: string): { collectionKey: string; blockKey: string | null } | null {
  if (key.startsWith('collection:')) return { collectionKey: key.slice('collection:'.length), blockKey: null }
  if (!key.startsWith('block:')) return null
  const path = key.slice('block:'.length)
  const separator = path.indexOf('/')
  return { collectionKey: path.slice(0, separator), blockKey: path.slice(separator + 1) }
}
function blockName(entry: CustomBlockRegistryEntry): string {
  return getBlockProperty<string>(environment.value?.customBlockSources?.get(entry.source)?.block, 'name') ?? entry.key
}

const leadingCardActions = computed<OcActionDefinition[]>(() => [
  ...(props.leadingActions ?? []),
  { key: 'add-block', icon: 'mdiPlus', title: t('customBlockRegistry.add'), disabled: !selectedCollection.value },
])
function handleCardAction({ key }: { key: string }): void {
  if (key !== 'add-block') emit('leading-action', key)
  else if (selectedCollection.value) emit('add-block', selectedCollection.value.key)
}
function collectionActions(): OcNodeAction[] {
  return [
    { key: 'configure', title: t('customBlockRegistry.configure'), icon: 'mdiCogOutline' },
    { key: 'remove', title: t('customBlockRegistry.removeCollection'), icon: 'mdiTrashCanOutline', iconTone: 'danger' },
  ]
}
function handleSelection(event: OcNodeSelectionEvent): void {
  const target = parseTreeKey(event.selectedKeys[0] ?? event.triggerKey)
  if (!target) return
  const switching = target.collectionKey !== selectedCollectionKey.value
  selectedCollectionKey.value = target.collectionKey
  // 点集合：换了集合就落到它的首块；点的是当前集合，块选择不动。
  if (target.blockKey !== null) selectedBlockKey.value = target.blockKey
  else if (switching) selectedBlockKey.value = selectedCollection.value?.blocks[0]?.key ?? null
}
function handleExpansion(event: OcNodeExpansionEvent): void {
  const next = new Set(collapsedKeys.value)
  if (event.expanded) next.delete(event.key)
  else next.add(event.key)
  collapsedKeys.value = next
}
function handleAction(event: OcNodeActionEvent): void {
  const target = parseTreeKey(event.key)
  if (!target) return
  if (event.actionKey === 'add-block') emit('add-block', target.collectionKey)
  else if (event.actionKey === 'configure') emit('configure-collection', target.collectionKey)
  else if (event.actionKey === 'remove') emit('remove-collection', target.collectionKey)
  else if (event.actionKey === 'remove-block' && target.blockKey !== null) emit('remove-block', target.collectionKey, target.blockKey)
}
function handleToolbarSelect({ key }: { key: string }): void {
  if (key === 'viewport.zoom-out') previewViewport.value?.zoomBy(1 / ZOOM_STEP)
  else if (key === 'viewport.fit') previewViewport.value?.fitView()
  else if (key === 'viewport.zoom-in') previewViewport.value?.zoomBy(ZOOM_STEP)
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
.custom-block-registry-workbench__properties { min-width: 0; }
</style>
