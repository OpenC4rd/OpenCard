<!-- 自定义块来源属性字段：浮层内可在“已注册自定义块（block:...）”与“项目/包内 .ocblock 文件”之间切换并选取。 -->
<template>
  <div ref="rootRef" class="custom-block-source-field">
    <OcFieldFrame full-width :readonly="definition.isReadonly">
      <button ref="triggerRef" type="button" class="custom-block-source-field__trigger" :disabled="definition.isReadonly"
        :aria-label="definition.title" :aria-expanded="open" aria-haspopup="dialog"
        @click="togglePopover" @keydown="handleTriggerKeydown">
        <OcIcon :name="leadingIcon" size="sm" tone="muted" />
        <span class="custom-block-source-field__value" :class="{ 'is-placeholder': !stringValue }" :data-tooltip="displayLabel" data-tooltip-overflow>
          {{ displayLabel }}
        </span>
        <OcIcon class="custom-block-source-field__chevron" :class="{ 'is-open': open }" name="mdiChevronDown" size="sm" tone="muted" />
      </button>
      <template v-if="stringValue && !definition.isReadonly" #suffix>
        <OcButton icon-only size="sm" variant="ghost" icon="mdiClose" :aria-label="clearLabel" :data-tooltip="clearLabel" @click.stop="clearValue" />
      </template>
    </OcFieldFrame>

    <OcOverlayMarker ref="layer" :group="pickerId" :anchor="triggerRef" :owner="rootRef" placement="bottom-start"
      :max-height="360" :open="open" @update:open="open = $event" @close="open = false">
      <div class="custom-block-source-field__popover" role="dialog" :aria-label="definition.title" @keydown.esc.stop.prevent="closePopover(true)">
        <OcOptionGroup :model-value="activeTab" :options="tabOptions" appearance="sliding-outline" size="sm" fill @update:model-value="setActiveTab" />

        <div v-if="activeTab === 'registry'" class="custom-block-source-field__registry-picker">
          <OcFieldFrame full-width>
            <OcFieldInput variant="plain" full-width :value="registryQuery"
              :placeholder="tr('propertyEditor.customBlockSource.searchRegistry', '搜索已注册自定义块...')"
              :aria-label="tr('propertyEditor.customBlockSource.searchRegistry', '搜索已注册自定义块...')"
              autocomplete="off" spellcheck="false" @input="handleRegistrySearch" />
            <template v-if="registryQuery" #suffix>
              <OcButton icon-only size="sm" variant="ghost" icon="mdiClose"
                :aria-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')" @click="registryQuery = ''" />
            </template>
          </OcFieldFrame>

          <div class="custom-block-source-field__registry-tree">
            <OcTree v-if="registryTreeData.rootKeys.length > 0" fill role="tree" selection-mode="single" activation-mode="single-click"
              :data="registryTreeData" :selected-keys="selectedRegistryKeys" :expanded-keys="effectiveRegistryExpandedKeys"
              @node-activate="handleRegistryNodeActivate" @expansion-change="handleRegistryExpansionChange" />
            <OcEmpty v-else tone="muted" inset="none">
              {{ tr('propertyEditor.customBlockSource.emptyRegistry', '没有已注册的自定义块') }}
            </OcEmpty>
          </div>
        </div>

        <OcFilePicker v-else class="custom-block-source-field__file-picker"
          :model-value="isBlockReference ? '' : stringValue" :scopes="capabilities?.files ?? []"
          :root="definition.root" :filter="effectiveFileFilter"
          :search-placeholder="tr('propertyEditor.customBlockSource.searchFiles', '搜索 .ocblock 文件...')"
          :clear-search-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')"
          :empty-text="tr('propertyEditor.customBlockSource.emptyFiles', '没有匹配的 .ocblock 文件')"
          @update:model-value="handleSelect" />
      </div>
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcEmpty from '../../../../components/base/OcEmpty.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../../components/base/OcIcon.vue'
import OcFilePicker from '../../../../components/standard/OcFilePicker.vue'
import OcOptionGroup, { type OcOption } from '../../../../components/standard/OcOptionGroup.vue'
import OcOverlayMarker from '../../../../components/standard/OcOverlayMarker.vue'
import OcTree from '../../../../components/standard/OcTree.vue'
import type { FilePathFilter } from '../../../model/filePath'
import type {
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
} from '../../node/node.types'
import { buildGroupedScopeTree, useFieldPopover } from './useFieldPopover'
import type {
  PropertyCustomBlockEntry,
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
} from '../propertyEditor.types'

type CustomBlockSourceDefinition = Extract<
  PropertyEditorFieldDefinition,
  { fieldType: 'customBlockSource' }
>
type PickerTab = 'registry' | 'file'

const DEFAULT_CUSTOM_BLOCK_FILTER: FilePathFilter = {
  target: 'file',
  pattern: '*.ocblock',
}

const props = defineProps<{
  /** 字段 schema 定义。决定标题、占位文案、起始目录与文件过滤规则。 */
  definition: CustomBlockSourceDefinition
  /** 当前自定义块来源引用值（`block:...` 或 `.ocblock` 文件路径）。 */
  value: unknown
  /** 环境资源能力（已注册自定义块作用域与文件作用域）。 */
  capabilities?: PropertyFieldCapabilities
}>()

const emit = defineEmits<{
  /** 选中已注册自定义块、.ocblock 文件或清空时触发。 */
  (e: 'update:value', value: string): void
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).replace(/\\/g, '/'))
const isBlockReference = computed(() => /(?:^|#)block:/i.test(stringValue.value))
const activeTab = ref<PickerTab>('registry')

const {
  rootRef,
  triggerRef,
  layer,
  pickerId,
  open,
  togglePopover,
  closePopover,
  handleTriggerKeydown,
  openPopover,
} = useFieldPopover('custom-block-source-picker', {
  isReadonly: () => props.definition.isReadonly,
  onOpen: () => {
    activeTab.value = stringValue.value && !isBlockReference.value ? 'file' : 'registry'
  },
})

const registryQuery = ref('')
const registryExpandedKeys = ref<string[]>([])

const effectiveFileFilter = computed<FilePathFilter>(
  () => props.definition.filter ?? DEFAULT_CUSTOM_BLOCK_FILTER,
)
const leadingIcon = computed(() =>
  !stringValue.value || isBlockReference.value
    ? ('mdiToyBrickOutline' as const)
    : ('mdiFileOutline' as const),
)
const placeholderText = computed(
  () => props.definition.placeholder ?? tr('propertyEditor.customBlockSource.placeholder', '选择自定义块...'),
)
const clearLabel = computed(() => tr('propertyEditor.customBlockSource.clearSelection', '清除已选自定义块'))

const tabOptions = computed<readonly OcOption[]>(() => [
  {
    value: 'registry',
    label: tr('propertyEditor.customBlockSource.modeRegistry', '已注册块'),
    icon: 'mdiToyBrickOutline',
  },
  {
    value: 'file',
    label: tr('propertyEditor.customBlockSource.modeFile', '块文件'),
    icon: 'mdiFileOutline',
  },
])

const blockEntriesByValue = computed(() => {
  const map = new Map<string, PropertyCustomBlockEntry>()
  for (const scope of props.capabilities?.customBlocks ?? []) {
    for (const collection of scope.collections) {
      for (const entry of collection.entries) {
        map.set(entry.value, entry)
      }
    }
  }
  return map
})

const matchedBlock = computed(() => blockEntriesByValue.value.get(stringValue.value) ?? null)

const displayLabel = computed(() => {
  if (!stringValue.value) return placeholderText.value
  if (matchedBlock.value) return `${matchedBlock.value.name} (${matchedBlock.value.value})`
  return stringValue.value
})

watch(
  () => props.capabilities?.customBlocks,
  scopes => {
    const next: string[] = []
    for (const scope of scopes ?? []) {
      next.push(`block-scope::${scope.key}`)
      for (const collection of scope.collections) {
        next.push(`block-collection::${scope.key}::${collection.key}`)
      }
    }
    registryExpandedKeys.value = next
  },
  { immediate: true },
)

const registryTreeData = computed<OcNodeCollection>(() =>
  buildGroupedScopeTree(
    (props.capabilities?.customBlocks ?? []).map(scope => ({ ...scope, groups: scope.collections })),
    collection => collection.entries,
    collection => ({ key: collection.key, name: collection.name, icon: 'mdiFolder' }),
    (entry, collection) => ({
      key: entry.value,
      label: entry.name,
      searchText: `${entry.name} ${entry.blockKey} ${collection.name} ${entry.value}`,
      node: {
        visual: { type: 'icon', icon: 'mdiToyBrickOutline' },
        tail: `${collection.key}/${entry.blockKey}`,
      },
    }),
    registryQuery.value,
    { scope: 'block-scope', group: 'block-collection', entry: 'block-entry' },
  ),
)

const effectiveRegistryExpandedKeys = computed(() => {
  if (!registryQuery.value.trim()) return registryExpandedKeys.value
  return [...registryTreeData.value.children.keys()]
})

const selectedRegistryKeys = computed(() =>
  isBlockReference.value ? [`block-entry::${stringValue.value}`] : [],
)

function setActiveTab(next: string): void {
  activeTab.value = next === 'file' ? 'file' : 'registry'
}

function handleRegistrySearch(event: Event): void {
  registryQuery.value = (event.target as HTMLInputElement).value
}

function handleRegistryExpansionChange(event: OcNodeExpansionEvent): void {
  const next = new Set(registryExpandedKeys.value)
  if (event.expanded) next.add(event.key)
  else next.delete(event.key)
  registryExpandedKeys.value = [...next]
}

function handleRegistryNodeActivate(event: OcNodeActivateEvent): void {
  if (event.key.startsWith('block-entry::')) {
    handleSelect(event.key.slice('block-entry::'.length))
    return
  }
  const next = new Set(registryExpandedKeys.value)
  if (next.has(event.key)) next.delete(event.key)
  else next.add(event.key)
  registryExpandedKeys.value = [...next]
}

function handleSelect(nextValue: string): void {
  emit('update:value', nextValue.replace(/\\/g, '/'))
  closePopover(true)
}

function clearValue(): void {
  if (props.definition.isReadonly) return
  emit('update:value', '')
}

defineExpose({ activate: openPopover })
</script>

<style scoped>
.custom-block-source-field { flex: 1 1 auto; width: 100%; min-width: 0; }
.custom-block-source-field__trigger { display: flex; width: 100%; min-width: 0; height: 100%; align-items: center; gap: var(--oc-space-xs); padding: var(--oc-field-content-padding, 0 var(--oc-space-xs)); border: 0; outline: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; user-select: none; -webkit-user-select: none; }
.custom-block-source-field__trigger:disabled { cursor: not-allowed; }
.custom-block-source-field__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-block-source-field__value.is-placeholder { color: var(--oc-fg-muted); }
.custom-block-source-field__chevron { flex: 0 0 auto; transition: transform var(--oc-duration-quick) var(--oc-ease); }
.custom-block-source-field__chevron.is-open { transform: rotate(180deg); }
.custom-block-source-field__popover { box-sizing: border-box; display: flex; flex-direction: column; width: 300px; height: 320px; max-height: inherit; padding: var(--oc-space-xs); gap: var(--oc-space-xs); overflow: hidden; }
.custom-block-source-field__registry-picker, .custom-block-source-field__file-picker { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; gap: var(--oc-space-xs); }
.custom-block-source-field__registry-tree { display: flex; flex: 1 1 auto; min-height: 0; overflow: auto; }
</style>
