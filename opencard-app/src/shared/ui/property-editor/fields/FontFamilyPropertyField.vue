<!-- 字体属性字段：单选字体选择器，行内用所选字体的字形预览，浮层按作用域（项目/资源包或系统字体）搜索并选取。 -->
<template>
  <div ref="rootRef" class="font-family-field">
    <component :is="'style'" v-if="previewFontCss" v-text="previewFontCss" />

    <OcFieldFrame full-width :readonly="definition.isReadonly">
      <button
        ref="triggerRef"
        type="button"
        class="font-family-field__trigger"
        :disabled="definition.isReadonly"
        :aria-label="definition.title"
        :aria-expanded="open"
        aria-haspopup="dialog"
        @click="togglePopover"
        @keydown="handleTriggerKeydown"
      >
        <OcIcon name="mdiFormatFont" size="sm" tone="muted" />
        <span
          class="font-family-field__value"
          :class="{ 'is-placeholder': !stringValue }"
          :style="selectedFontStyle"
          :data-tooltip="displayLabel"
          data-tooltip-overflow
        >
          {{ displayLabel }}
        </span>
        <OcIcon
          class="font-family-field__chevron"
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
        class="font-family-field__popover"
        role="dialog"
        :aria-label="definition.title"
        @keydown.esc.stop.prevent="closePopover(true)"
      >
        <OcFieldFrame full-width>
          <OcFieldInput
            variant="plain"
            full-width
            :value="query"
            :placeholder="tr('propertyEditor.fontFamily.searchPlaceholder', '搜索字体...')"
            :aria-label="tr('propertyEditor.fontFamily.searchPlaceholder', '搜索字体...')"
            autocomplete="off"
            spellcheck="false"
            @input="handleSearchInput"
          />
          <template v-if="query" #suffix>
            <OcButton
              icon-only
              size="sm"
              variant="ghost"
              icon="mdiClose"
              :aria-label="tr('propertyEditor.filePath.clearSearch', '清空搜索')"
              @click="query = ''"
            />
          </template>
        </OcFieldFrame>

        <div class="font-family-field__body">
          <OcTree
            v-if="treeData.rootKeys.length > 0"
            fill
            role="tree"
            selection-mode="single"
            activation-mode="single-click"
            :data="treeData"
            :selected-keys="selectedNodeKeys"
            :expanded-keys="effectiveExpandedKeys"
            @node-activate="handleNodeActivate"
            @expansion-change="handleExpansionChange"
          />
          <OcEmpty v-else tone="muted" inset="none">
            {{ tr('propertyEditor.fontFamily.empty', '没有可用的字体') }}
          </OcEmpty>
        </div>
      </div>
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch, type CSSProperties } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcEmpty from '../../../../components/base/OcEmpty.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../../components/base/OcIcon.vue'
import OcOverlayMarker from '../../../../components/standard/OcOverlayMarker.vue'
import OcTree from '../../../../components/standard/OcTree.vue'
import type {
  OcNode,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeKey,
} from '../../node/node.types'
import { useFieldPopover } from './useFieldPopover'
import type {
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
  PropertyFontEntry,
} from '../propertyEditor.types'

type FontFamilyDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'fontFamily' }>

const props = defineProps<{
  /** 字段 schema 定义。决定标题、占位文案与只读状态。 */
  definition: FontFamilyDefinition
  /** 当前选中的字体引用值（如 `font:<key>`、`<coord>#font:<key>` 或系统字体名）。 */
  value: unknown
  /** 环境资源能力（提供可选的字体作用域列表）。 */
  capabilities?: PropertyFieldCapabilities
}>()

const emit = defineEmits<{
  /** 选中字体或清空时触发。 */
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
} = useFieldPopover('font-family-picker', {
  isReadonly: () => props.definition.isReadonly,
})

const query = ref('')
const expandedKeys = ref<string[]>([])

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).trim())
const placeholderText = computed(
  () => props.definition.placeholder ?? tr('propertyEditor.fontFamily.placeholder', '默认字体'),
)
const clearLabel = computed(() => tr('propertyEditor.fontFamily.clearSelection', '清除已选字体'))

const fontScopes = computed(() => props.capabilities?.fonts ?? [])

const previewFontCss = computed(() =>
  fontScopes.value
    .map(scope => scope.previewCss ?? '')
    .filter(Boolean)
    .join('\n'),
)

const fontEntriesByValue = computed(() => {
  const map = new Map<string, PropertyFontEntry>()
  for (const scope of fontScopes.value) {
    for (const entry of scope.entries) {
      map.set(entry.value, entry)
    }
  }
  return map
})

const matchedFont = computed(() => fontEntriesByValue.value.get(stringValue.value) ?? null)

const selectedFontStyle = computed<CSSProperties | undefined>(() => {
  if (!stringValue.value) return undefined
  const family = matchedFont.value?.cssFamily ?? stringValue.value
  return family ? { fontFamily: family } : undefined
})

const displayLabel = computed(() => {
  if (!stringValue.value) return placeholderText.value
  return matchedFont.value?.label ?? stringValue.value
})

const scopeNodeKey = (scopeKey: string) => `font-scope::${scopeKey}`
const entryNodeKey = (value: string) => `font-entry::${value}`

watch(
  fontScopes,
  scopes => {
    expandedKeys.value = scopes.map(scope => scopeNodeKey(scope.key))
  },
  { immediate: true },
)

const treeData = computed<OcNodeCollection>(() => {
  const items = new Map<OcNodeKey, OcNode>()
  const children = new Map<OcNodeKey, readonly OcNodeKey[]>()
  const rootKeys: OcNodeKey[] = []
  const normalizedQuery = query.value.trim().toLocaleLowerCase()

  for (const scope of fontScopes.value) {
    const sKey = scopeNodeKey(scope.key)
    const entryKeys: OcNodeKey[] = []
    for (const entry of scope.entries) {
      if (
        normalizedQuery
        && !`${entry.label} ${entry.value} ${entry.detail ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        continue
      }
      const eKey = entryNodeKey(entry.value)
      items.set(eKey, {
        label: entry.label,
        labelFont: entry.cssFamily ?? entry.value,
        visual: { type: 'icon', icon: 'mdiFormatFont' },
        ...(entry.detail ? { tail: entry.detail } : {}),
      })
      entryKeys.push(eKey)
    }
    if (entryKeys.length > 0) {
      rootKeys.push(sKey)
      items.set(sKey, {
        label: scope.label,
        visual: { type: 'icon', icon: scope.packageKey ? 'mdiPackageVariantClosed' : 'mdiFolder' },
      })
      children.set(sKey, entryKeys)
    }
  }

  return { rootKeys, items, children }
})

const effectiveExpandedKeys = computed(() =>
  query.value.trim() ? fontScopes.value.map(scope => scopeNodeKey(scope.key)) : expandedKeys.value,
)

const selectedNodeKeys = computed(() =>
  stringValue.value ? [entryNodeKey(stringValue.value)] : [],
)

function handleSearchInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value
}

function handleExpansionChange(event: OcNodeExpansionEvent): void {
  const next = new Set(expandedKeys.value)
  if (event.expanded) next.add(event.key)
  else next.delete(event.key)
  expandedKeys.value = [...next]
}

function handleNodeActivate(event: OcNodeActivateEvent): void {
  if (event.key.startsWith('font-entry::')) {
    const value = event.key.slice('font-entry::'.length)
    emit('update:value', value)
    closePopover(true)
    return
  }
  const next = new Set(expandedKeys.value)
  if (next.has(event.key)) next.delete(event.key)
  else next.add(event.key)
  expandedKeys.value = [...next]
}

function clearValue(): void {
  if (props.definition.isReadonly) return
  emit('update:value', '')
}

defineExpose({ activate: openPopover })
</script>

<style scoped>
.font-family-field {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}

.font-family-field__trigger {
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

.font-family-field__trigger:disabled {
  cursor: not-allowed;
}

.font-family-field__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-family-field__value.is-placeholder {
  color: var(--oc-fg-muted);
}

.font-family-field__chevron {
  flex: 0 0 auto;
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.font-family-field__chevron.is-open {
  transform: rotate(180deg);
}

.font-family-field__popover {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 280px;
  max-height: inherit;
  padding: var(--oc-space-xs);
  gap: var(--oc-space-xs);
  overflow: hidden;
}

.font-family-field__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
