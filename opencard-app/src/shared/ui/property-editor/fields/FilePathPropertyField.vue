<!-- 文件路径属性字段：以浮层文件选择器（OcFilePicker）在当前项目与资源包作用域中选取文件或目录。 -->
<template>
  <div ref="rootRef" class="file-path-field">
    <OcFieldFrame full-width :readonly="definition.isReadonly">
      <button
        ref="triggerRef"
        type="button"
        class="file-path-field__trigger"
        :disabled="definition.isReadonly"
        :aria-label="definition.title"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @click="togglePopover"
        @keydown="handleTriggerKeydown"
      >
        <OcIcon :name="leadingIcon" size="sm" tone="muted" />
        <span
          class="file-path-field__value"
          :class="{ 'is-placeholder': !stringValue }"
          :data-tooltip="stringValue || placeholderText"
          data-tooltip-overflow
        >
          {{ stringValue || placeholderText }}
        </span>
        <OcIcon
          class="file-path-field__chevron"
          :class="{ 'is-open': open }"
          name="mdiChevronDown"
          size="sm"
          tone="muted"
        />
      </button>
      <template v-if="stringValue && !definition.isReadonly" #suffix>
        <OcButton
          icon-only
          size="sm"
          variant="ghost"
          icon="mdiClose"
          :aria-label="clearLabel"
          :data-tooltip="clearLabel"
          @click.stop="clearValue"
        />
      </template>
    </OcFieldFrame>

    <OcOverlayMarker
      ref="layer"
      :group="pickerId"
      :anchor="triggerRef"
      :owner="rootRef"
      placement="bottom-start"
      :max-height="320"
      :open="open"
      @update:open="open = $event"
      @close="open = false"
    >
      <div
        class="file-path-field__popover"
        role="dialog"
        :aria-label="definition.title"
        @keydown.esc.stop.prevent="closePopover(true)"
      >
        <OcFilePicker
          :model-value="stringValue"
          :scopes="capabilities?.files ?? []"
          :root="definition.root"
          :filter="definition.filter"
          :resolve-thumbnail-src="capabilities?.resolveImagePreview"
          :search-placeholder="tr('propertyEditor.filePath.searchPlaceholder', '搜索文件...')"
          :clear-search-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')"
          :empty-text="tr('propertyEditor.filePath.empty', '没有匹配的文件')"
          @update:model-value="handleSelect"
        />
      </div>
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcIcon from '../../../../components/base/OcIcon.vue'
import OcFilePicker from '../../../../components/standard/OcFilePicker.vue'
import OcOverlayMarker from '../../../../components/standard/OcOverlayMarker.vue'
import { useFieldPopover } from './useFieldPopover'
import type {
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
} from '../propertyEditor.types'

type FilePathDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'filePath' }>

const props = defineProps<{
  /** 字段 schema 定义。决定标题、只读态、起始子目录及过滤规则。 */
  definition: FilePathDefinition
  /** 当前路径值。展示在触发器文本区并在浮层树中高亮选中项。 */
  value: unknown
  /** 环境资源能力（项目与资源包文件作用域等）。提供浮层文件选择器的作用域列表。 */
  capabilities?: PropertyFieldCapabilities
}>()

const emit = defineEmits<{
  /** 选中文件或清空时触发。 */
  (e: 'update:value', value: string): void
}>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

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
} = useFieldPopover('file-path-picker', {
  isReadonly: () => props.definition.isReadonly,
})

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).replace(/\\/g, '/'))
const leadingIcon = computed(() =>
  props.definition.filter?.target === 'directory' ? ('mdiFolder' as const) : ('mdiFileOutline' as const),
)
const placeholderText = computed(
  () => props.definition.placeholder ?? tr('propertyEditor.filePath.placeholder', '选择文件...'),
)
const clearLabel = computed(() => tr('propertyEditor.filePath.clearSelection', '清除已选文件'))

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
.file-path-field {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.file-path-field__trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  align-items: center;
  gap: var(--oc-space-xs);
  padding: var(--oc-field-content-padding, 0 var(--oc-space-xs));
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.file-path-field__trigger:disabled {
  cursor: not-allowed;
}

.file-path-field__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path-field__value.is-placeholder {
  color: var(--oc-fg-muted);
}

.file-path-field__chevron {
  flex: 0 0 auto;
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.file-path-field__chevron.is-open {
  transform: rotate(180deg);
}

.file-path-field__popover {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 280px;
  max-height: inherit;
  padding: var(--oc-space-xs);
  overflow: hidden;
}
</style>
