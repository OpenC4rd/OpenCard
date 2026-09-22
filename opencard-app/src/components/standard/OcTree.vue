<!-- Standard tree/list view: consumes a key-only node collection and emits narrow node events. -->
<!-- Node tail actions sit in one horizontal row, so their tooltips rise above the row and never
     cover the sibling action next to the hovered one. -->
<template>
  <div
    ref="treeRootElement"
    class="oc-tree"
    data-tooltip-placement="top"
    :class="{
      'is-fill': props.fill,
      'is-empty': visibleEntries.length === 0,
      'is-dragging': Boolean(draggedKey) || isExternalDropActive,
      'is-root-drop': (Boolean(draggedKey) || isExternalDropActive)
        && dropTargetKey === null && dropPosition === 'inside',
    }"
    :role="props.role"
    :aria-multiselectable="props.selectionMode === 'multiple' ? 'true' : undefined"
    @scroll.passive="handleTreeScroll"
  >
    <OcText
      v-if="visibleEntries.length === 0 && props.placeholder"
      class="oc-tree__placeholder"
      tone="muted"
      size="sm"
    >
      {{ props.placeholder }}
    </OcText>
    <div class="oc-tree__content" :class="{ 'is-virtualized': props.virtualized }"
      :style="virtualContentStyle">
    <div
      v-for="entry in renderedEntries"
      :key="entry.key"
      class="oc-tree__node"
      :class="resolveNodeClass(entry.key)"
      :data-oc-tree-key="entry.key"
      :style="resolveNodeStyle(entry)"
    >
      <span
        v-if="entry.guideRows > 0"
        class="oc-tree__branch-guide"
        :data-guide-rows="entry.guideRows"
        :style="{ '--oc-tree-guide-rows': String(entry.guideRows) }"
        aria-hidden="true"
      />
      <span
        v-if="entry.parentKey !== null"
        class="oc-tree__branch-connector"
        aria-hidden="true"
      />
      <OcRow
        :ref="(element) => setRowRef(entry.key, element)"
        class="oc-tree__row"
        :class="{ 'is-selected': isSelected(entry.key), 'is-disabled': entry.item.disabled }"
        :data-actions-overflowed="collapsedActionKeys.has(entry.key) || undefined"
        :data-tooltip="entry.item.disabledReason"
        :role="rowRole"
        :tabindex="props.tabNavigation === 'roving' && activeKey === entry.key && !entry.item.disabled ? 0 : -1"
        :aria-disabled="entry.item.disabled || undefined"
        :aria-selected="props.role !== 'menu' && props.selectionMode !== 'none' ? isSelected(entry.key) : undefined"
        :aria-expanded="isExpandable(entry.key) ? isExpanded(entry.key) : undefined"
        :aria-posinset="props.virtualized ? entry.index + 1 : undefined"
        :aria-setsize="props.virtualized ? visibleEntries.length : undefined"
        @focus="activeKey = entry.key"
        @click="handleRowClick($event, entry.key)"
        @auxclick="handleRowAuxClick($event, entry.key)"
        @dblclick="handleRowDoubleClick($event, entry.key)"
        @mousedown="handleRowMouseDown($event, entry.key)"
        @keydown="handleRowKeydown($event, entry.key, entry.index)"
        @contextmenu="handleRowContextMenu($event, entry.key)"
      >
        <template #leading>
          <span
            class="oc-tree__icon-slot"
            :class="{ 'is-expandable': isExpandable(entry.key) }"
            data-tree-interactive="true"
            @mousedown="handleIconMouseDown($event, entry.key)"
            @click="handleIconClick($event, entry.key)"
          >
            <OcVisual
              v-if="entry.item.visual"
              class="oc-tree__node-visual"
              :class="{ 'is-expanded': entry.item.visual.type === 'icon' && isExpandable(entry.key) && isExpanded(entry.key) }"
              :visual="entry.item.visual"
              :label="entry.item.label"
              size="md"
            />
            <OcIcon v-else
              :name="'tree.chevron-right'"
              size="md"
              class="oc-tree__node-icon"
              :class="{ 'is-expanded': isExpandable(entry.key) && isExpanded(entry.key) }"
            />
            <span
              v-if="isExpandable(entry.key)"
              class="oc-tree__child-count oc-number-badge oc-number-badge--neutral"
              :class="{ 'is-expanded': isExpanded(entry.key) }"
              aria-hidden="true"
            >
              {{ formatChildCount(entry.key) }}
            </span>
          </span>
        </template>

        <template #title>
          <OcFieldInput
            v-if="renamingKey === entry.key"
            :ref="(element) => setRenameInputRef(entry.key, element)"
            as="input"
            class="oc-tree__rename-input"
            type="text"
            :value="renameDraft"
            data-tree-interactive="true"
            @mousedown.stop
            @click.stop
            @dblclick.stop
            @input="handleRenameInput"
            @keydown.stop="handleRenameKeydown($event, entry.key)"
            @blur="commitRename(entry.key)"
          />
          <OcText
            v-else
            class="oc-tree__label"
            :style="labelStyle(entry.item)"
            :tone="entry.item.tone"
            :truncate="true"
            :tooltip-on-overflow="entry.item.label"
          >
            {{ entry.item.label }}
          </OcText>
        </template>

        <template v-if="entry.item.tail" #append>
          <OcNodeTail
            class="oc-tree__tail"
            :tail="resolveTailParts(entry.key, entry.item.tail)"
            :action-visibility="props.actionVisibility"
            :button-tabindex="props.tabNavigation === 'none' ? -1 : undefined"
            @action="emitActionIntent(entry.key, $event.key)"
          />
        </template>
      </OcRow>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect,
  type ComponentPublicInstance, type CSSProperties } from 'vue'
import type { OcActionButtonAction } from './OcActionButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcNodeTail from './OcNodeTail.vue'
import OcRow from './OcRow.vue'
import OcText from '../base/OcText.vue'
import OcVisual from '../base/OcVisual.vue'
import { isNodeTailAction, normalizeNodeTail } from '../../shared/ui/node/node.types'
import { useFloatingMenu, type FloatingMenuItem } from '../../composables/useFloatingMenu'
import type {
  OcNode,
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeDropPosition,
  OcNodeExpansionEvent,
  OcNodeExpansionSyncEvent,
  OcNodeExternalDropEvent,
  OcNodeKey,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
  OcNodeTailPart,
} from '../../shared/ui/node/node.types'
import { resolveOcPixelToken } from '../../shared/ui/foundation'
import {
  useExternalFileDrop,
  type ExternalDropZone,
} from '../../shared/ui/drop/externalFileDrop'

type OcTreeSelectionMode = 'none' | 'single' | 'multiple'
type OcTreeActivationMode = 'none' | 'single-click' | 'double-click'
type OcTreeRole = 'tree' | 'listbox' | 'menu'
type OcTreeSelectionInput = 'left' | 'middle' | 'right' | 'keyboard'

interface OcTreeProps {
  data: OcNodeCollection
  selectedKeys?: readonly OcNodeKey[]
  expandedKeys?: readonly OcNodeKey[]
  selectionMode?: OcTreeSelectionMode
  activationMode?: OcTreeActivationMode
  role?: OcTreeRole
  fill?: boolean
  selectionExpansionMode?: 'none' | 'expand' | 'expand-exclusive'
  scrollToSelection?: boolean
  virtualized?: boolean
  actionOverflowTitle?: string
  actionVisibility?: 'on-interaction' | 'always'
  tabNavigation?: 'roving' | 'none'
  placeholder?: string
  /** Accepts file drops coming from outside the application and reports them as node intents. */
  externalDrop?: boolean
}

type VisibleEntry = {
  key: OcNodeKey
  item: OcNode
  level: number
  parentKey: OcNodeKey | null
  guideRows: number
  index: number
}

defineOptions({ name: 'OcTree' })

const props = withDefaults(defineProps<OcTreeProps>(), {
  selectedKeys: () => [],
  expandedKeys: () => [],
  selectionMode: 'single',
  activationMode: 'none',
  role: 'tree',
  fill: false,
  selectionExpansionMode: 'none',
  scrollToSelection: false,
  virtualized: false,
  actionOverflowTitle: 'More actions',
  actionVisibility: 'on-interaction',
  tabNavigation: 'roving',
  placeholder: '',
  externalDrop: false,
})

const emit = defineEmits<{
  'selection-change': [event: OcNodeSelectionEvent]
  'expansion-change': [event: OcNodeExpansionEvent]
  'expansion-sync': [event: OcNodeExpansionSyncEvent]
  'node-activate': [event: OcNodeActivateEvent]
  action: [event: OcNodeActionEvent]
  'rename-commit': [event: OcNodeRenameCommitEvent]
  move: [event: OcNodeMoveEvent]
  'external-drop': [event: OcNodeExternalDropEvent]
}>()
const { openContextMenu } = useFloatingMenu()

const treeRootElement = ref<HTMLElement | null>(null)
const rowRefs = new Map<OcNodeKey, HTMLElement>()
const renameInputRefs = new Map<OcNodeKey, InstanceType<typeof OcFieldInput>>()
const activeKey = ref<OcNodeKey | null>(null)
const renamingKey = ref<OcNodeKey | null>(null)
const renameDraft = ref('')
const selectionAnchorKey = ref<OcNodeKey | null>(null)
const pendingDrag = ref<{ key: OcNodeKey; startX: number; startY: number } | null>(null)
const draggedKey = ref<OcNodeKey | null>(null)
const dropTargetKey = ref<OcNodeKey | null>(null)
const dropPosition = ref<OcNodeDropPosition | null>(null)
const suppressClick = ref(false)
const isExternalDropActive = ref(false)
let externalDropZoneDispose: (() => void) | null = null
const warnedMessages = new Set<string>()
const virtualScrollTop = ref(0)
const virtualViewportHeight = ref(0)
const virtualRowHeight = ref(1)
const collapsedActionKeys = ref<ReadonlySet<OcNodeKey>>(new Set())
const directActionWidths = new Map<OcNodeKey, number>()
const VIRTUAL_OVERSCAN_ROWS = 6
/** Temporary tree state: every row shows its commands, used only to measure them. */
const COMMANDS_REVEALED_CLASS = 'are-commands-revealed'
let treeResizeObserver: ResizeObserver | null = null

const selectedKeySet = computed(() => new Set(props.selectedKeys))
const expandedKeySet = computed(() => new Set(props.expandedKeys))
const parentKeyLookup = computed(() => {
  const lookup = new Map<OcNodeKey, OcNodeKey>()
  for (const [parentKey, childKeys] of props.data.children) {
    for (const childKey of childKeys) lookup.set(childKey, parentKey)
  }
  return lookup
})
const rowRole = computed(() => {
  if (props.role === 'menu') return 'menuitem'
  if (props.role === 'listbox') return 'option'
  return 'treeitem'
})

function warnContract(message: string): void {
  if (!import.meta.env.DEV || warnedMessages.has(message)) return
  warnedMessages.add(message)
  console.warn(`[OcTree] ${message}`)
}

function validateContract(): void {
  const referenceCounts = new Map<OcNodeKey, number>()
  const countReference = (key: OcNodeKey) => {
    referenceCounts.set(key, (referenceCounts.get(key) ?? 0) + 1)
  }

  for (const rootKey of props.data.rootKeys) countReference(rootKey)
  for (const [parentKey, childKeys] of props.data.children) {
    if (!props.data.items.has(parentKey)) warnContract(`Children are declared for missing parent "${parentKey}".`)
    for (const childKey of childKeys) countReference(childKey)
  }
  for (const [key, count] of referenceCounts) {
    if (!props.data.items.has(key)) warnContract(`Missing item for key "${key}".`)
    if (count > 1) warnContract(`Node "${key}" is referenced more than once.`)
  }

  const visited = new Set<OcNodeKey>()
  const visiting = new Set<OcNodeKey>()
  function visitNode(key: OcNodeKey): void {
    if (visiting.has(key)) {
      warnContract(`Children cycle detected at key "${key}".`)
      return
    }
    if (visited.has(key)) return
    visiting.add(key)
    for (const childKey of props.data.children.get(key) ?? []) visitNode(childKey)
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of props.data.items.keys()) visitNode(key)
}

watchEffect(validateContract)

const visibleEntries = computed<VisibleEntry[]>(() => {
  const entries: VisibleEntry[] = []
  const visited = new Set<OcNodeKey>()

  function visit(key: OcNodeKey, level: number, parentKey: OcNodeKey | null, ancestors: Set<OcNodeKey>): void {
    const item = props.data.items.get(key)
    if (!item) {
      warnContract(`Missing item for key "${key}".`)
      return
    }
    if (ancestors.has(key)) {
      warnContract(`Children cycle detected at key "${key}".`)
      return
    }
    if (visited.has(key)) {
      warnContract(`Node "${key}" is referenced more than once.`)
      return
    }

    visited.add(key)
    entries.push({ key, item, level, parentKey, guideRows: 0, index: entries.length })
    if (!isExpanded(key)) return

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(key)
    for (const childKey of props.data.children.get(key) ?? []) {
      visit(childKey, level + 1, key, nextAncestors)
    }
  }

  for (const rootKey of props.data.rootKeys) {
    visit(rootKey, 0, null, new Set())
  }

  const entryIndexes = new Map(entries.map((entry, index) => [entry.key, index]))
  for (const [index, entry] of entries.entries()) {
    if (!isExpanded(entry.key)) continue
    const childKeys = props.data.children.get(entry.key) ?? []
    const lastChildIndex = entryIndexes.get(childKeys[childKeys.length - 1] ?? '')
    if (lastChildIndex !== undefined) entry.guideRows = lastChildIndex - index
  }

  return entries
})

const virtualRange = computed(() => {
  if (!props.virtualized) return { start: 0, end: visibleEntries.value.length }
  const rowHeight = virtualRowHeight.value
  const start = Math.max(0, Math.floor(virtualScrollTop.value / rowHeight) - VIRTUAL_OVERSCAN_ROWS)
  const visibleRows = Math.ceil(virtualViewportHeight.value / rowHeight)
  return {
    start,
    end: Math.min(visibleEntries.value.length, start + visibleRows + VIRTUAL_OVERSCAN_ROWS * 2),
  }
})
const renderedEntries = computed(() => visibleEntries.value.slice(
  virtualRange.value.start,
  virtualRange.value.end,
))
const virtualContentStyle = computed<CSSProperties | undefined>(() => props.virtualized
  ? { height: `${visibleEntries.value.length * virtualRowHeight.value}px` }
  : undefined)

function resolveNodeStyle(entry: VisibleEntry): CSSProperties {
  return {
    '--oc-tree-indent': `${entry.level * 12}px`,
    ...(props.virtualized ? { transform: `translateY(${entry.index * virtualRowHeight.value}px)` } : {}),
  } as CSSProperties
}

/** 标签字体由调用方给完整的 `font-family` 值（含引号与回退），节点只负责套用。 */
function labelStyle(item: OcNode): CSSProperties | undefined {
  return item.labelFont ? { fontFamily: item.labelFont } : undefined
}

/** jsdom 不实现 FontFaceSet，缺失时也就没有字体加载完成事件可等。 */
function fontFaceSet(): FontFaceSet | undefined {
  return document.fonts as FontFaceSet | undefined
}

function handleTreeScroll(event: Event): void {
  if (!props.virtualized || !(event.currentTarget instanceof HTMLElement)) return
  virtualScrollTop.value = event.currentTarget.scrollTop
}

function syncVirtualMetrics(): void {
  const root = treeRootElement.value
  if (!props.virtualized || !root) return
  virtualRowHeight.value = Math.max(1, resolveOcPixelToken('--oc-size-md', root))
  virtualViewportHeight.value = root.clientHeight
  virtualScrollTop.value = root.scrollTop
}

/**
 * Width the row's commands occupy right now, including the gaps between them.
 * Collapsed commands are represented by the single overflow button, so this doubles
 * as the "collapsed" width the projected-title calculation needs.
 */
function measureTailActionWidth(row: HTMLElement): number {
  const parts = [...row.querySelectorAll<HTMLElement>('.oc-node-tail__action')]
  if (parts.length === 0) return 0
  const gap = resolveOcPixelToken('--oc-space-1', treeRootElement.value)
  return parts.reduce((total, part) => total + part.getBoundingClientRect().width, 0)
    + gap * (parts.length - 1)
}

/** Width the node's trailing text occupies right now; the row trades it away before the title. */
function measureTailTextWidth(row: HTMLElement): number {
  return [...row.querySelectorAll<HTMLElement>('.oc-node-tail__text')]
    .reduce((total, part) => total + part.getBoundingClientRect().width, 0)
}

/**
 * Commands stay hidden until the row is interacted with, so a row at rest reports no width for them.
 * The decision below is about the row the user will actually see, so measurement runs with the tree
 * temporarily showing every row's commands: the reveal class is added, read back, and removed in the
 * same task, before the browser can paint the revealed state.
 */
function withCommandsRevealed<T>(measure: () => T): T {
  const root = treeRootElement.value
  if (!root) return measure()
  root.classList.add(COMMANDS_REVEALED_CLASS)
  try {
    return measure()
  } finally {
    root.classList.remove(COMMANDS_REVEALED_CLASS)
  }
}

/**
 * A row yields space in one order: the trailing text first, then the commands (all of them replaced
 * by one overflow menu), and only then the title. This pass decides the middle step — a row collapses
 * its commands exactly while the title cannot be shown in full without that trade.
 */
function syncActionOverflow(): void {
  const nextCollapsed = new Set(collapsedActionKeys.value)

  withCommandsRevealed(() => {
    for (const [key, row] of rowRefs) {
      const actionCount = tailActionParts(key).length
      if (actionCount <= 1 || row.clientWidth <= 0) {
        nextCollapsed.delete(key)
        directActionWidths.delete(key)
        continue
      }
      const label = row.querySelector<HTMLElement>('.oc-tree__label')
      if (!label || row.querySelector('.oc-node-tail__action') === null) continue
      // Width the title holds once the trailing text has given up everything it can, and the width
      // it needs to be shown in full.
      const titleWidth = label.getBoundingClientRect().width + measureTailTextWidth(row)
      const titleDemand = label.scrollWidth
      const actionWidth = measureTailActionWidth(row)

      if (!nextCollapsed.has(key)) {
        directActionWidths.set(key, actionWidth)
        if (titleWidth < titleDemand) nextCollapsed.add(key)
        continue
      }

      const directWidth = directActionWidths.get(key)
      if (directWidth === undefined) continue
      const projectedTitleWidth = titleWidth - Math.max(0, directWidth - actionWidth)
      if (projectedTitleWidth >= titleDemand) nextCollapsed.delete(key)
    }
  })

  const current = collapsedActionKeys.value
  if (nextCollapsed.size === current.size && [...nextCollapsed].every(key => current.has(key))) return
  collapsedActionKeys.value = nextCollapsed
}

function syncTreeMetrics(): void {
  syncVirtualMetrics()
  syncActionOverflow()
}

function resolveSelectionAncestorKeys(key: OcNodeKey): OcNodeKey[] {
  const ancestors: OcNodeKey[] = []
  const visited = new Set<OcNodeKey>([key])
  let currentKey = key

  while (true) {
    const parentKey = parentKeyLookup.value.get(currentKey)
    if (!parentKey || visited.has(parentKey)) return ancestors
    ancestors.push(parentKey)
    visited.add(parentKey)
    currentKey = parentKey
  }
}

function isSameOrDescendantKey(key: OcNodeKey, ancestorKey: OcNodeKey): boolean {
  const visited = new Set<OcNodeKey>()
  let currentKey: OcNodeKey | undefined = key

  while (currentKey && !visited.has(currentKey)) {
    if (currentKey === ancestorKey) return true
    visited.add(currentKey)
    currentKey = parentKeyLookup.value.get(currentKey)
  }

  return false
}

watch(
  [
    () => props.selectedKeys,
    () => props.selectionExpansionMode,
    parentKeyLookup,
  ],
  ([selectedKeys, mode]) => {
    if (selectedKeys.length === 0 || mode === 'none') return

    const ancestorKeys = selectedKeys.flatMap(resolveSelectionAncestorKeys)
    const nextKeys = mode === 'expand-exclusive'
      ? [...new Set([
          ...ancestorKeys,
          ...props.expandedKeys.filter((key) => selectedKeys.some(selectedKey => (
            isSameOrDescendantKey(key, selectedKey)
          ))),
        ])]
      : [...new Set([...props.expandedKeys, ...ancestorKeys])]

    if (
      nextKeys.length === props.expandedKeys.length
      && nextKeys.every((key, index) => key === props.expandedKeys[index])
    ) {
      return
    }

    emit('expansion-sync', { expandedKeys: nextKeys })
  },
  { immediate: true },
)

const selectionRevealKey = computed(() => {
  if (activeKey.value && selectedKeySet.value.has(activeKey.value)) return activeKey.value
  return props.selectedKeys[props.selectedKeys.length - 1] ?? null
})

function scrollRowIntoTreeViewport(key: OcNodeKey): void {
  const root = treeRootElement.value
  if (!root) return
  if (props.virtualized) {
    const index = visibleEntries.value.findIndex(entry => entry.key === key)
    if (index < 0) return
    const rowTop = index * virtualRowHeight.value
    const rowBottom = rowTop + virtualRowHeight.value
    if (rowTop < root.scrollTop) root.scrollTop = rowTop
    else if (rowBottom > root.scrollTop + root.clientHeight) root.scrollTop = rowBottom - root.clientHeight
    virtualScrollTop.value = root.scrollTop
    return
  }

  const row = rowRefs.get(key)
  if (!row) return

  const rootRect = root.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < rootRect.top) {
    root.scrollTop -= rootRect.top - rowRect.top
  } else if (rowRect.bottom > rootRect.bottom) {
    root.scrollTop += rowRect.bottom - rootRect.bottom
  }
}

watch(
  [selectionRevealKey, () => props.scrollToSelection, visibleEntries],
  async ([selectedKey]) => {
    if (!props.scrollToSelection || !selectedKey) return
    await nextTick()
    scrollRowIntoTreeViewport(selectedKey)
  },
  { flush: 'post', immediate: true },
)
watch(
  visibleEntries,
  async (entries) => {
    if (renamingKey.value && !props.data.items.has(renamingKey.value)) cancelRename()
    if (activeKey.value && entries.some((entry) => entry.key === activeKey.value)) return
    activeKey.value = entries.find((entry) => !entry.item.disabled)?.key ?? null
    await nextTick()
  },
  { immediate: true },
)
watch(renderedEntries, entries => {
  if (!props.virtualized || entries.some(entry => entry.key === activeKey.value)) return
  const selectedKey = selectionRevealKey.value
  activeKey.value = entries.find(entry => entry.key === selectedKey && !entry.item.disabled)?.key
    ?? entries.find(entry => !entry.item.disabled)?.key
    ?? null
})

function isSelected(key: OcNodeKey): boolean {
  return selectedKeySet.value.has(key)
}

function isExpandable(key: OcNodeKey): boolean {
  return (props.data.children.get(key)?.length ?? 0) > 0
}

function formatChildCount(key: OcNodeKey): string {
  const count = props.data.children.get(key)?.length ?? 0
  return count > 99 ? '99+' : String(count)
}

function isExpanded(key: OcNodeKey): boolean {
  return expandedKeySet.value.has(key)
}

function toggleExpanded(key: OcNodeKey): void {
  if (!isExpandable(key)) return
  emit('expansion-change', { key, expanded: !isExpanded(key) })
}

function handleIconMouseDown(event: MouseEvent, key: OcNodeKey): void {
  if (isExpandable(key)) event.stopPropagation()
}

function handleIconClick(event: MouseEvent, key: OcNodeKey): void {
  if (!isExpandable(key)) return
  event.stopPropagation()
  focusRowFromPointer(key)
  toggleExpanded(key)
}

function emitSelectionIntent(
  key: OcNodeKey,
  toggle: boolean,
  input: OcTreeSelectionInput,
  range: boolean,
): void {
  if (props.selectionMode === 'none') return
  const canRangeSelect = props.selectionMode === 'multiple' && range
  const mode = canRangeSelect
    ? 'range'
    : props.selectionMode === 'multiple' && toggle ? 'toggle' : 'replace'
  let selectedKeys: OcNodeKey[]
  if (mode === 'range') {
    const anchorKey = selectionAnchorKey.value && visibleEntries.value.some(entry => entry.key === selectionAnchorKey.value)
      ? selectionAnchorKey.value
      : props.selectedKeys[0] ?? key
    const anchorIndex = visibleEntries.value.findIndex(entry => entry.key === anchorKey)
    const targetIndex = visibleEntries.value.findIndex(entry => entry.key === key)
    const rangeKeys = anchorIndex < 0 || targetIndex < 0
      ? [key]
      : visibleEntries.value
        .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
        .map(entry => entry.key)
    const selectedSet = new Set(toggle ? [...props.selectedKeys, ...rangeKeys] : rangeKeys)
    selectedKeys = visibleEntries.value
      .filter(entry => selectedSet.has(entry.key))
      .map(entry => entry.key)
  } else if (mode === 'toggle') {
    selectedKeys = [...props.selectedKeys]
    const index = selectedKeys.indexOf(key)
    if (index >= 0) selectedKeys.splice(index, 1)
    else selectedKeys.push(key)
  } else {
    selectedKeys = [key]
  }
  if (input !== 'right' && mode !== 'range') selectionAnchorKey.value = key
  emit('selection-change', { triggerKey: key, selectedKeys })
}

function handleRowClick(event: MouseEvent, key: OcNodeKey): void {
  if (props.data.items.get(key)?.disabled || suppressClick.value || renamingKey.value === key) return
  focusRowFromPointer(key)
  emitSelectionIntent(key, event.ctrlKey || event.metaKey, 'left', event.shiftKey)
  if (props.activationMode === 'single-click') emit('node-activate', { key })
}

function focusRowFromPointer(key: OcNodeKey): void {
  activeKey.value = key
  rowRefs.get(key)?.focus({ preventScroll: true })
}

function handleRowAuxClick(event: MouseEvent, key: OcNodeKey): void {
  if (event.button !== 1 || props.data.items.get(key)?.disabled) return
  event.preventDefault()
  emitSelectionIntent(key, event.ctrlKey || event.metaKey, 'middle', event.shiftKey)
}

function handleRowDoubleClick(event: MouseEvent, key: OcNodeKey): void {
  if (props.data.items.get(key)?.disabled) return
  event.preventDefault()
  if (props.activationMode === 'double-click') emit('node-activate', { key })
}

function tailActionParts(key: OcNodeKey): OcActionButtonAction[] {
  return normalizeNodeTail(props.data.items.get(key)?.tail).filter(isNodeTailAction)
}

/**
 * The node's trailing line in order. When the row runs out of label space, its commands are
 * replaced by one overflow menu placed at the first command's position.
 */
function resolveTailParts(key: OcNodeKey, tail: OcNode['tail']): readonly OcNodeTailPart[] {
  const parts = normalizeNodeTail(tail)
  const actions = parts.filter(isNodeTailAction)
  if (actions.length <= 1 || !collapsedActionKeys.value.has(key)) return parts
  let overflowPlaced = false
  return parts.flatMap((part): OcNodeTailPart[] => {
    if (!isNodeTailAction(part)) return [part]
    if (overflowPlaced) return []
    overflowPlaced = true
    return [{
      key: `__oc-tree-action-overflow__:${key}`,
      icon: 'nav.more',
      title: props.actionOverflowTitle,
      children: actions,
    }]
  })
}

function resolveContextActions(key: OcNodeKey): FloatingMenuItem[] {
  const result: FloatingMenuItem[] = []
  for (const entry of props.data.items.get(key)?.contextActions ?? []) {
    if (entry.type === 'divider') {
      if (result.length > 0 && result[result.length - 1]?.type !== 'divider') result.push(entry)
      continue
    }
    result.push(entry)
  }
  if (result[result.length - 1]?.type === 'divider') result.pop()
  return result
}

function openItemContextMenu(key: OcNodeKey, event?: MouseEvent): boolean {
  const item = props.data.items.get(key)
  if (!item || item.disabled) return false
  const actions = resolveContextActions(key)
  if (actions.length === 0) return false
  if (!isSelected(key)) emitSelectionIntent(key, false, 'right', false)
  return openContextMenu({
    event,
    anchor: event ? undefined : rowRefs.get(key),
    items: actions,
    onSelect: actionKey => emitActionIntent(key, actionKey, 'context'),
  })
}

function handleRowContextMenu(event: MouseEvent, key: OcNodeKey): void {
  openItemContextMenu(key, event)
}

function emitActionIntent(key: OcNodeKey, actionKey: string, source: 'inline' | 'context' = 'inline'): void {
  emit('action', { key, actionKey, source })
}

async function startRename(key: OcNodeKey): Promise<void> {
  const item = props.data.items.get(key)
  if (!item?.renamable || item.disabled) return
  renamingKey.value = key
  renameDraft.value = item.label
  if (props.virtualized) scrollRowIntoTreeViewport(key)
  await nextTick()
  renameInputRefs.get(key)?.focus()
  const element = renameInputRefs.get(key)?.$el
  if (element instanceof HTMLInputElement) {
    const selection = item.renameSelection
    if (!selection) {
      element.select()
      return
    }

    const length = renameDraft.value.length
    const start = Math.max(0, Math.min(selection.start, length))
    const end = Math.max(start, Math.min(selection.end, length))
    element.setSelectionRange(start, end)
  }
}

defineExpose({ beginRename: startRename })

function cancelRename(): void {
  renamingKey.value = null
  renameDraft.value = ''
}

function commitRename(key: OcNodeKey): void {
  if (renamingKey.value !== key) return
  const name = renameDraft.value
  cancelRename()
  emit('rename-commit', { key, name })
}

function handleRenameInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) renameDraft.value = target.value
}

function handleRenameKeydown(event: KeyboardEvent, key: OcNodeKey): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename(key)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
    rowRefs.get(key)?.focus()
  }
}

async function focusEntry(index: number): Promise<void> {
  const entry = visibleEntries.value[index]
  if (!entry || entry.item.disabled) return
  activeKey.value = entry.key
  if (props.virtualized) scrollRowIntoTreeViewport(entry.key)
  await nextTick()
  rowRefs.get(entry.key)?.focus()
}

function findFocusableIndex(start: number, direction: -1 | 1): number {
  const entries = visibleEntries.value
  for (let offset = 1; offset <= entries.length; offset += 1) {
    const index = (start + offset * direction + entries.length) % entries.length
    if (!entries[index]?.item.disabled) return index
  }
  return start
}

function handleRowKeydown(event: KeyboardEvent, key: OcNodeKey, index: number): void {
  if (props.data.items.get(key)?.disabled) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusEntry(findFocusableIndex(index, 1))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusEntry(findFocusableIndex(index, -1))
  } else if (event.key === 'Home') {
    event.preventDefault()
    focusEntry(visibleEntries.value.findIndex((entry) => !entry.item.disabled))
  } else if (event.key === 'End') {
    event.preventDefault()
    const reverseIndex = [...visibleEntries.value].reverse().findIndex((entry) => !entry.item.disabled)
    if (reverseIndex >= 0) focusEntry(visibleEntries.value.length - reverseIndex - 1)
  } else if (event.key === 'ArrowRight' && isExpandable(key) && !isExpanded(key)) {
    event.preventDefault()
    toggleExpanded(key)
  } else if (event.key === 'ArrowLeft' && isExpandable(key) && isExpanded(key)) {
    event.preventDefault()
    toggleExpanded(key)
  } else if (event.key === 'F2') {
    event.preventDefault()
    if (props.data.items.get(key)?.renamable) void startRename(key)
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    if (openItemContextMenu(key)) event.preventDefault()
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emitSelectionIntent(key, event.ctrlKey || event.metaKey, 'keyboard', event.shiftKey)
    if (props.activationMode !== 'none') emit('node-activate', { key })
  }
}

/** 行由 OcRow 渲染，组件实例要取出根元素，行高测量、聚焦与拖放命中才拿到真实行盒。 */
function setRowRef(key: OcNodeKey, element: Element | ComponentPublicInstance | null): void {
  const row = element instanceof HTMLElement
    ? element
    : (element as ComponentPublicInstance | null)?.$el

  if (row instanceof HTMLElement) rowRefs.set(key, row)
  else rowRefs.delete(key)
}

function setRenameInputRef(key: OcNodeKey, element: Element | ComponentPublicInstance | null): void {
  if (element && '$el' in element) renameInputRefs.set(key, element as InstanceType<typeof OcFieldInput>)
  else renameInputRefs.delete(key)
}

function handleRowMouseDown(event: MouseEvent, key: OcNodeKey): void {
  const item = props.data.items.get(key)
  if (event.button !== 0 || !item?.draggable || item.disabled) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('[data-tree-interactive="true"]')) return
  pendingDrag.value = { key, startX: event.clientX, startY: event.clientY }
}

function clearDragState(): void {
  pendingDrag.value = null
  draggedKey.value = null
  dropTargetKey.value = null
  dropPosition.value = null
}

function handleGlobalMouseMove(event: MouseEvent): void {
  const pending = pendingDrag.value
  if (!pending && !draggedKey.value) return
  if (!draggedKey.value && pending) {
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
    if (distance < 4) return
    draggedKey.value = pending.key
  }

  const location = resolveDropLocation(event.clientX, event.clientY)
  dropTargetKey.value = location.targetKey
  dropPosition.value = location.position
}

/**
 * Single source of truth for "which row is the pointer over, and where inside it": both the internal
 * mouse drag and external file drops resolve their highlight through this.
 */
function resolveDropLocation(clientX: number, clientY: number): {
  targetKey: OcNodeKey | null
  position: OcNodeDropPosition | null
} {
  const targetElement = document.elementFromPoint(clientX, clientY)
  const rowElement = targetElement instanceof Element
    ? targetElement.closest<HTMLElement>('[data-oc-tree-key]')
    : null
  if (rowElement) {
    const rect = rowElement.getBoundingClientRect()
    const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
    return {
      targetKey: rowElement.dataset.ocTreeKey ?? null,
      position: ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside',
    }
  }

  const rootRect = treeRootElement.value?.getBoundingClientRect()
  const insideRoot = rootRect
    && clientX >= rootRect.left
    && clientX <= rootRect.right
    && clientY >= rootRect.top
    && clientY <= rootRect.bottom
  return { targetKey: null, position: insideRoot ? 'inside' : null }
}

function handleGlobalMouseUp(): void {
  const key = draggedKey.value
  const targetKey = dropTargetKey.value
  const position = dropPosition.value
  if (key && position) {
    emit('move', { key, targetKey, position })
    suppressClick.value = true
    window.setTimeout(() => { suppressClick.value = false }, 0)
  }
  clearDragState()
}

/**
 * External drops reuse the internal drag highlight, so both paths show the same before/inside/after
 * affordance; the tree only reports the landing node and never interprets the dropped payload.
 */
const externalDropZone: ExternalDropZone = {
  contains: element => treeRootElement.value?.contains(element) ?? false,
  onHover: (point) => {
    const location = resolveDropLocation(point.x, point.y)
    isExternalDropActive.value = location.position !== null
    dropTargetKey.value = location.position ? location.targetKey : null
    dropPosition.value = location.position
  },
  onExit: () => {
    isExternalDropActive.value = false
    dropTargetKey.value = null
    dropPosition.value = null
  },
  onDrop: (paths, point) => {
    const location = resolveDropLocation(point.x, point.y)
    if (!location.position) return false
    emit('external-drop', { targetKey: location.targetKey, position: location.position, payload: paths })
    return true
  },
}

function syncExternalDropZone(): void {
  if (props.externalDrop === Boolean(externalDropZoneDispose)) return
  if (props.externalDrop) {
    externalDropZoneDispose = useExternalFileDrop().registerZone(externalDropZone)
    return
  }
  externalDropZoneDispose?.()
  externalDropZoneDispose = null
}

function resolveNodeClass(key: OcNodeKey): Record<string, boolean> {
  const draggingSelection = Boolean(draggedKey.value && isSelected(draggedKey.value))
  return {
    'is-drag-source': draggedKey.value === key || (draggingSelection && isSelected(key)),
    'is-drop-before': dropTargetKey.value === key && dropPosition.value === 'before',
    'is-drop-inside': dropTargetKey.value === key && dropPosition.value === 'inside',
    'is-drop-after': dropTargetKey.value === key && dropPosition.value === 'after',
  }
}

watch([() => props.virtualized, () => visibleEntries.value.length], async () => {
  await nextTick()
  syncVirtualMetrics()
  const root = treeRootElement.value
  if (!props.virtualized || !root) return
  const maximum = Math.max(0, visibleEntries.value.length * virtualRowHeight.value - root.clientHeight)
  if (root.scrollTop > maximum) root.scrollTop = maximum
  virtualScrollTop.value = root.scrollTop
})
watch([renderedEntries, () => props.data], async () => {
  await nextTick()
  syncActionOverflow()
})

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', handleGlobalMouseUp)
  // 标签字体是异步加载的：装好后标签宽度会变，而 ResizeObserver 只看容器，不看文本，必须在这里补一次重测。
  fontFaceSet()?.addEventListener('loadingdone', syncTreeMetrics)
  syncTreeMetrics()
  syncExternalDropZone()
  if (typeof ResizeObserver !== 'undefined' && treeRootElement.value) {
    treeResizeObserver = new ResizeObserver(syncTreeMetrics)
    treeResizeObserver.observe(treeRootElement.value)
  }
})

watch(() => props.externalDrop, syncExternalDropZone)

onBeforeUnmount(() => {
  fontFaceSet()?.removeEventListener('loadingdone', syncTreeMetrics)
  treeResizeObserver?.disconnect()
  externalDropZoneDispose?.()
  externalDropZoneDispose = null
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
})
</script>

<style scoped>
.oc-tree {
  display: flex;
  flex-direction: column;
  min-width: 0;
  user-select: none;
}

.oc-tree__placeholder {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--oc-size-md);
  padding: var(--oc-space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.oc-tree__content {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.oc-tree__content.is-virtualized {
  position: relative;
  flex: 0 0 auto;
}

.oc-tree__content.is-virtualized > .oc-tree__node {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}

.oc-tree__node-visual {
  flex: none;
  /* 精灵图裁剪按 em 计量，字号决定实际尺寸。 */
  font-size: var(--oc-size-sm);
  transform-origin: center;
  transition: transform var(--oc-duration-fast) var(--oc-ease);
}

.oc-tree.is-fill {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.oc-tree.is-root-drop {
  box-shadow: inset 0 0 0 1px var(--oc-border-accent);
}

.oc-tree__node {
  position: relative;
  flex: 0 0 auto;
}

.oc-tree__branch-guide {
  position: absolute;
  z-index: 1;
  top: calc(var(--oc-size-md) * 0.5 + 7px);
  left: calc(var(--oc-space-3) + var(--oc-tree-indent, 0px) + 7px);
  width: 1px;
  height: calc(var(--oc-tree-guide-rows) * var(--oc-size-md) - 7px);
  background: var(--oc-border-muted);
  pointer-events: none;
}

.oc-tree__branch-connector {
  position: absolute;
  z-index: 1;
  top: calc(var(--oc-size-md) * 0.5);
  left: calc(var(--oc-space-3) + var(--oc-tree-indent, 0px) - 5px);
  width: 12px;
  height: 1px;
  background: var(--oc-border-muted);
  pointer-events: none;
}

/*
 * 行的盒模型与状态外观由 OcRow 提供；缩进是树的几何，只补起始内边距。
 * 选择器带上节点容器，避免与 OcRow 自己的 `.oc-row` 规则同权重而依赖样式表顺序。
 */
.oc-tree__node > .oc-tree__row {
  padding-inline-start: calc(var(--oc-space-3) + var(--oc-tree-indent, 0px));
}

.oc-tree__icon-slot {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--oc-icon-size-md);
  height: var(--oc-icon-size-md);
}

.oc-tree__icon-slot.is-expandable {
  cursor: pointer;
}

.oc-tree__node-icon {
  flex: 0 0 auto;
  transform-origin: center;
  transition: transform var(--oc-duration-fast) var(--oc-ease);
}

.oc-tree__node-icon.is-expanded {
  transform: rotate(45deg);
}

.oc-tree__child-count {
  position: absolute;
  z-index: 1;
  top: -6px;
  right: -9px;
  transition:
    border-color var(--oc-duration-fast) var(--oc-ease),
    color var(--oc-duration-fast) var(--oc-ease),
    background-color var(--oc-duration-fast) var(--oc-ease);
}

.oc-tree__icon-slot:hover .oc-tree__child-count,
.oc-tree__child-count.is-expanded {
  border-color: var(--oc-border-accent);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-accent);
}

/*
 * 标题内容住在 OcRow 的标题位里：标签必须是块盒，单行省略与溢出提示才量得到真实宽度。
 */
.oc-tree__label {
  display: block;
  min-width: 0;
}

/*
 * 尾部行由 OcNodeTail 渲染，根元素不参与盒模型：命令、徽标与文本继续作为行尾的直接 flex 项，
 * 让位顺序与命令宽度测量都和以前一致。
 */
.oc-tree__tail {
  display: contents;
}

.oc-tree__rename-input {
  display: block;
  width: 100%;
  height: calc(var(--oc-size-md) - var(--oc-space-1));
}

/*
 * 命令平时不显示：行被交互或正在测量时由变量揭示，常显由 OcNodeTail 的 actionVisibility 负责。
 * 变量按继承生效，所以这一条只需写在行上。
 */
.oc-tree__row:hover,
.oc-tree__row:focus-within,
.oc-tree__row.is-selected,
.oc-tree.are-commands-revealed {
  --oc-node-tail-action-display: inline-flex;
}

.oc-tree__node.is-drag-source {
  opacity: 0.45;
}

.oc-tree__node.is-drop-before::before,
.oc-tree__node.is-drop-after::after {
  content: '';
  position: absolute;
  z-index: 2;
  left: calc(var(--oc-space-3) + var(--oc-tree-indent, 0px));
  right: 0;
  height: 2px;
  background: var(--oc-border-accent);
  pointer-events: none;
}

.oc-tree__node.is-drop-before::before {
  top: 0;
}

.oc-tree__node.is-drop-after::after {
  bottom: 0;
}

.oc-tree__node.is-drop-inside .oc-tree__row {
  background: var(--oc-bg-accent-subtle);
}
</style>
