<!-- 图片源属性字段：展示缩略图与当前引用，浮层内可切换“图片文件”与“项目图标”两个选择器。 -->
<template>
  <div ref="rootRef" class="image-source-field">
    <OcFieldFrame full-width :readonly="definition.isReadonly">
      <button ref="triggerRef" type="button" class="image-source-field__trigger" :disabled="definition.isReadonly"
        :aria-label="definition.title" :aria-expanded="open" aria-haspopup="dialog"
        @click="togglePopover" @keydown="handleTriggerKeydown">
        <OcVisual class="image-source-field__visual" :visual="leadingVisual" size="sm" />
        <span class="image-source-field__value" :class="{ 'is-placeholder': !stringValue }" :data-tooltip="displayLabel" data-tooltip-overflow>
          {{ displayLabel }}
        </span>
        <OcIcon class="image-source-field__chevron" :class="{ 'is-open': open }" name="mdiChevronDown" size="sm" tone="muted" />
      </button>
      <template v-if="stringValue && !definition.isReadonly" #suffix>
        <OcButton icon-only size="sm" variant="ghost" icon="mdiClose" :aria-label="clearLabel" :data-tooltip="clearLabel" @click.stop="clearValue" />
      </template>
    </OcFieldFrame>

    <OcOverlayMarker ref="layer" :group="pickerId" :anchor="triggerRef" :owner="rootRef" placement="bottom-start"
      :max-height="360" :open="open" @update:open="open = $event" @close="open = false">
      <div class="image-source-field__popover" role="dialog" :aria-label="definition.title" @keydown.esc.stop.prevent="closePopover(true)">
        <OcOptionGroup :model-value="activeTab" :options="tabOptions" appearance="sliding-outline" size="sm" fill @update:model-value="setActiveTab" />

        <OcFilePicker v-if="activeTab === 'file'" class="image-source-field__picker"
          :model-value="isIconReference ? '' : stringValue" :scopes="capabilities?.files ?? []"
          :root="definition.root" :filter="effectiveFileFilter" :resolve-thumbnail-src="capabilities?.resolveImagePreview"
          :search-placeholder="tr('propertyEditor.imageSource.searchFiles', '搜索图片文件...')"
          :clear-search-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')"
          :empty-text="tr('propertyEditor.imageSource.emptyFiles', '没有匹配的图片文件')"
          @update:model-value="handleSelect" />

        <div v-else class="image-source-field__icon-picker">
          <OcFieldFrame full-width>
            <OcFieldInput variant="plain" full-width :value="iconQuery"
              :placeholder="tr('propertyEditor.imageSource.searchIcons', '搜索项目图标...')"
              :aria-label="tr('propertyEditor.imageSource.searchIcons', '搜索项目图标...')"
              autocomplete="off" spellcheck="false" @input="handleIconSearch" />
            <template v-if="iconQuery" #suffix>
              <OcButton icon-only size="sm" variant="ghost" icon="mdiClose"
                :aria-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')" @click="iconQuery = ''" />
            </template>
          </OcFieldFrame>

          <div class="image-source-field__icon-tree">
            <OcTree v-if="iconTreeData.rootKeys.length > 0" fill role="tree" selection-mode="single" activation-mode="single-click"
              :data="iconTreeData" :selected-keys="selectedIconKeys" :expanded-keys="effectiveIconExpandedKeys"
              @node-activate="handleIconNodeActivate" @expansion-change="handleIconExpansionChange" />
            <OcEmpty v-else tone="muted" inset="none">
              {{ tr('propertyEditor.imageSource.emptyIcons', '没有可用的项目图标') }}
            </OcEmpty>
          </div>
        </div>
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
import OcVisual from '../../../../components/base/OcVisual.vue'
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
import type { OcVisual as OcVisualModel } from '../../visual/visual.types'
import type {
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
  PropertyIconEntry,
} from '../propertyEditor.types'

type ImageSourceDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'imageSource' }>
type PickerTab = 'file' | 'icon'

const DEFAULT_IMAGE_FILTER: FilePathFilter = {
  target: 'file',
  pattern: '*.{png,jpg,jpeg,webp,gif,svg,bmp,avif}',
}

const props = defineProps<{
  /** 字段 schema 定义。决定标题、只读态、起始目录与图片过滤条件。 */
  definition: ImageSourceDefinition
  /** 当前图片源引用值（文件路径或 `icon:...` 引用）。 */
  value: unknown
  /** 环境资源能力（项目与资源包文件、图标及缩略图解析器）。 */
  capabilities?: PropertyFieldCapabilities
}>()

const emit = defineEmits<{
  /** 选中图片文件、项目图标或清空时触发。 */
  (e: 'update:value', value: string): void
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).replace(/\\/g, '/'))
const isIconReference = computed(() => /(?:^|#)icon:/i.test(stringValue.value))
const activeTab = ref<PickerTab>('file')

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
} = useFieldPopover('image-source-picker', {
  isReadonly: () => props.definition.isReadonly,
  onOpen: () => {
    activeTab.value = isIconReference.value ? 'icon' : 'file'
  },
})

const iconQuery = ref('')
const iconExpandedKeys = ref<string[]>([])

const effectiveFileFilter = computed<FilePathFilter>(() => props.definition.filter ?? DEFAULT_IMAGE_FILTER)
const placeholderText = computed(
  () => props.definition.placeholder ?? tr('propertyEditor.imageSource.placeholder', '选择图片或图标...'),
)
const clearLabel = computed(() => tr('propertyEditor.imageSource.clearSelection', '清除已选图片'))

const tabOptions = computed<readonly OcOption[]>(() => [
  { value: 'file', label: tr('propertyEditor.imageSource.modeFile', '图片文件'), icon: 'mdiImageOutline' },
  { value: 'icon', label: tr('propertyEditor.imageSource.modeIcon', '项目图标'), icon: 'mdiStickerEmoji' },
])

const iconEntriesByValue = computed(() => {
  const map = new Map<string, PropertyIconEntry>()
  for (const scope of props.capabilities?.icons ?? []) {
    for (const series of scope.series) {
      for (const entry of series.entries) {
        map.set(entry.value, entry)
      }
    }
  }
  return map
})

const matchedIcon = computed(() => iconEntriesByValue.value.get(stringValue.value) ?? null)

const leadingVisual = computed<OcVisualModel>(() => {
  if (matchedIcon.value) {
    return { type: 'style', style: matchedIcon.value.previewStyle, label: matchedIcon.value.name }
  }
  if (stringValue.value && !isIconReference.value && props.capabilities?.resolveImagePreview) {
    const src = props.capabilities.resolveImagePreview(stringValue.value)
    if (src) return { type: 'image', src, label: stringValue.value }
  }
  return { type: 'icon', icon: isIconReference.value ? 'mdiStickerEmoji' : 'mdiImageOutline', iconTone: 'muted' }
})

const displayLabel = computed(() => {
  if (!stringValue.value) return placeholderText.value
  if (matchedIcon.value) return `${matchedIcon.value.name} (${matchedIcon.value.value})`
  return stringValue.value
})

watch(
  () => props.capabilities?.icons,
  scopes => {
    const next: string[] = []
    for (const scope of scopes ?? []) {
      next.push(`icon-scope::${scope.key}`)
      for (const series of scope.series) {
        next.push(`icon-series::${scope.key}::${series.key}`)
      }
    }
    iconExpandedKeys.value = next
  },
  { immediate: true },
)

const iconTreeData = computed<OcNodeCollection>(() =>
  buildGroupedScopeTree(
    (props.capabilities?.icons ?? []).map(scope => ({ ...scope, groups: scope.series })),
    series => series.entries,
    series => ({ key: series.key, name: series.name, icon: 'mdiStickerEmoji' }),
    (entry, series) => ({
      key: entry.value,
      label: entry.name,
      searchText: `${entry.name} ${entry.iconKey} ${series.name} ${entry.value}`,
      node: {
        visual: {
          type: 'style',
          get style() {
            return entry.previewStyle
          },
          label: entry.name,
        },
        tail: `${series.key}/${entry.iconKey}`,
      },
    }),
    iconQuery.value,
    { scope: 'icon-scope', group: 'icon-series', entry: 'icon-entry' },
  ),
)

const effectiveIconExpandedKeys = computed(() => {
  if (!iconQuery.value.trim()) return iconExpandedKeys.value
  return [...iconTreeData.value.children.keys()]
})

const selectedIconKeys = computed(() =>
  isIconReference.value ? [`icon-entry::${stringValue.value}`] : [],
)

function setActiveTab(next: string): void {
  activeTab.value = next === 'icon' ? 'icon' : 'file'
}

function handleIconSearch(event: Event): void {
  iconQuery.value = (event.target as HTMLInputElement).value
}

function handleIconExpansionChange(event: OcNodeExpansionEvent): void {
  const next = new Set(iconExpandedKeys.value)
  if (event.expanded) next.add(event.key)
  else next.delete(event.key)
  iconExpandedKeys.value = [...next]
}

function handleIconNodeActivate(event: OcNodeActivateEvent): void {
  if (event.key.startsWith('icon-entry::')) {
    handleSelect(event.key.slice('icon-entry::'.length))
    return
  }
  const next = new Set(iconExpandedKeys.value)
  if (next.has(event.key)) next.delete(event.key)
  else next.add(event.key)
  iconExpandedKeys.value = [...next]
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
.image-source-field { flex: 1 1 auto; width: 100%; min-width: 0; }
.image-source-field__trigger { display: flex; width: 100%; min-width: 0; height: 100%; align-items: center; gap: var(--oc-space-xs); padding: var(--oc-field-content-padding, 0 var(--oc-space-xs)); border: 0; outline: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.image-source-field__trigger:disabled { cursor: not-allowed; }
.image-source-field__visual { flex: 0 0 var(--oc-icon-size-md); width: var(--oc-icon-size-md); height: var(--oc-icon-size-md); font-size: var(--oc-icon-size-md); border-radius: var(--oc-radius-sm, 2px); object-fit: contain; }
.image-source-field__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-source-field__value.is-placeholder { color: var(--oc-fg-muted); }
.image-source-field__chevron { flex: 0 0 auto; transition: transform var(--oc-duration-quick) var(--oc-ease); }
.image-source-field__chevron.is-open { transform: rotate(180deg); }
.image-source-field__popover { box-sizing: border-box; display: flex; flex-direction: column; width: 300px; height: 320px; max-height: inherit; padding: var(--oc-space-xs); gap: var(--oc-space-xs); overflow: hidden; }
.image-source-field__picker, .image-source-field__icon-picker { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; gap: var(--oc-space-xs); }
.image-source-field__icon-tree { display: flex; flex: 1 1 auto; min-height: 0; overflow: auto; }
</style>
