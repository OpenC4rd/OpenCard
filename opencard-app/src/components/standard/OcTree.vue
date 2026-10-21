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
      <OcTreeRow v-for="entry in renderedEntries" :key="entry.key" :entry="entry" :context="rowContext" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, markRaw, watch,
  type ComponentPublicInstance, type CSSProperties } from 'vue'
import { taskScheduler } from '../../utils/taskScheduler'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcTreeRow, { type OcTreeRowEntry as VisibleEntry, type OcTreeRowContext } from './OcTreeRow.vue'
import { isNodeTailAction, normalizeNodeTail } from '../../shared/ui/node/node.types'
import { resolveNodeSelection, type OcNodeSelectionMode } from '../../shared/ui/node/nodeSelection'
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
import { readThemePixels } from '../../shared/ui/foundation/themeTokenPixels'
import {
  useExternalFileDrop,
  type ExternalDropZone,
} from '../../shared/ui/drop/externalFileDrop'

/** 每层缩进步进；与属性编辑器、数据表共用同一个 foundation token。 */
const INDENT_STEP = readThemePixels('--oc-indent-step')

type OcTreeSelectionMode = OcNodeSelectionMode
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
const virtualRowPitch = ref(1)
const VIRTUAL_OVERSCAN_ROWS = 6
let treeResizeObserver: ResizeObserver | null = null

const selectedKeySet = computed(() => new Set(props.selectedKeys))
const expandedKeySet = computed(() => new Set(props.expandedKeys))
const parentKeyLookup = shallowRef(new Map<OcNodeKey, OcNodeKey>())
const visibleEntryIndexes = shallowRef(new Map<OcNodeKey, number>())
const childCounts = shallowRef(new Map<OcNodeKey, number>())
const focusableIndexes = shallowRef<number[]>([])
const focusablePositions = shallowRef(new Map<OcNodeKey, number>())
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

const visibleEntries = shallowRef<VisibleEntry[]>([])
let structureRequest: AbortController | undefined
watch([() => props.data, () => props.expandedKeys], () => {
  structureRequest?.abort()
  const request = new AbortController()
  structureRequest = request
  const data = props.data
  const expanded = new Set(props.expandedKeys)
  const entries: VisibleEntry[] = []
  const indexes = new Map<OcNodeKey, number>()
  const parents = new Map<OcNodeKey, OcNodeKey>()
  const counts = new Map<OcNodeKey, number>()
  const focusable: number[] = []
  const positions = new Map<OcNodeKey, number>()
  const visiting = new Set<OcNodeKey>()
  const visited = new Set<OcNodeKey>()
  function* visit(key: OcNodeKey, level: number, parentKey: OcNodeKey | null): Generator<void> {
    if (visiting.has(key)) { warnContract(`Children cycle detected at key "${key}".`); return }
    if (visited.has(key)) { warnContract(`Node "${key}" is referenced more than once.`); return }
    const item = data.items.get(key)
    if (!item) { warnContract(`Missing item for key "${key}".`); return }
    visited.add(key); visiting.add(key)
    const entry: VisibleEntry = { key, item, level, parentKey, guideRows: 0, index: entries.length }
    entries.push(entry); indexes.set(key, entry.index)
    if (!item.disabled) { positions.set(key, focusable.length); focusable.push(entry.index) }
    yield
    if (expanded.has(key)) {
      let lastChildIndex = entry.index
      for (const child of data.children.get(key) ?? []) {
        lastChildIndex = entries.length
        yield* visit(child, level + 1, key)
      }
      entry.guideRows = Math.max(0, lastChildIndex - entry.index)
    }
    visiting.delete(key)
  }
  function* build(): Generator<void> {
    for (const [key, children] of data.children) {
      let count = 0
      for (const child of children) {
        parents.set(child, key)
        if (data.items.has(child) && !data.items.get(child)?.disabled) count++
        yield
      }
      counts.set(key, count)
    }
    for (const key of data.rootKeys) yield* visit(key, 0, null)
    parentKeyLookup.value = markRaw(parents)
    childCounts.value = markRaw(counts)
    focusableIndexes.value = markRaw(focusable)
    focusablePositions.value = markRaw(positions)
    visibleEntryIndexes.value = markRaw(indexes)
    visibleEntries.value = markRaw(entries)
  }
  void taskScheduler.runBatched(build(), request.signal).catch(error => {
    if (!request.signal.aborted) throw error
  })
}, { immediate: true, flush: 'sync' })

const virtualRange = computed<{ start: number; end: number }>((previous) => {
  const rowHeight = virtualRowPitch.value
  const start = props.virtualized
    ? Math.max(0, Math.floor(virtualScrollTop.value / rowHeight) - VIRTUAL_OVERSCAN_ROWS)
    : 0
  const visibleRows = Math.ceil(virtualViewportHeight.value / rowHeight)
  const end = props.virtualized
    ? Math.min(visibleEntries.value.length, start + visibleRows + VIRTUAL_OVERSCAN_ROWS * 2)
    : visibleEntries.value.length
  return previous?.start === start && previous.end === end ? previous : { start, end }
})
const renderedEntries = computed(() => visibleEntries.value.slice(
  virtualRange.value.start,
  virtualRange.value.end,
))
const virtualContentStyle = computed<CSSProperties | undefined>(() => props.virtualized
  ? { height: `${visibleEntries.value.length * virtualRowPitch.value}px` }
  : undefined)

function resolveNodeStyle(entry: VisibleEntry): CSSProperties {
  return {
    '--oc-tree-indent': `${entry.level * INDENT_STEP}px`,
    ...(props.virtualized ? { transform: `translateY(${entry.index * virtualRowPitch.value}px)` } : {}),
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
  // 行距 = 行高 + 行间空隙（空隙由 `.oc-tree__node` 的下内边距给出）。
  virtualRowPitch.value = Math.max(1,
    resolveOcPixelToken('--oc-size-md', root) + resolveOcPixelToken('--oc-space-2xs', root))
  virtualViewportHeight.value = root.clientHeight
  virtualScrollTop.value = root.scrollTop
}

function syncTreeMetrics(): void { syncVirtualMetrics() }

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
    const index = visibleEntryIndexes.value.get(key)
    if (index === undefined) return
    const rowTop = index * virtualRowPitch.value
    const rowBottom = rowTop + virtualRowPitch.value
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
    if (activeKey.value && visibleEntryIndexes.value.has(activeKey.value)) return
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
  return props.data.items.get(key)?.expandable ?? ((props.data.children.get(key)?.length ?? 0) > 0)
}

/** 计子项时只认真正能用的子项：空分组里那行占位（disabled）不是这一组的孩子，不该被数出来。 */
function childCount(key: OcNodeKey): number {
  return childCounts.value.get(key) ?? 0
}

function formatChildCount(key: OcNodeKey): string {
  const count = childCount(key)
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
  const resolution = resolveNodeSelection({
    mode: props.selectionMode,
    orderedEntries: visibleEntries.value,
    indexByKey: visibleEntryIndexes.value,
    selectedKeys: props.selectedKeys,
    triggerKey: key,
    anchorKey: selectionAnchorKey.value,
    toggle,
    range,
  })
  if (!resolution) return
  if (input !== 'right' && resolution.movesAnchor) selectionAnchorKey.value = key
  emit('selection-change', { triggerKey: key, selectedKeys: resolution.selectedKeys })
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

/**
 * 常显命令直接保留，其余多个命令合并成菜单。
 */
function resolveTailParts(key: OcNodeKey, tail: OcNode['tail']): readonly OcNodeTailPart[] {
  const parts = normalizeNodeTail(tail)
  const actions = parts.filter(isNodeTailAction).filter(action => !action.alwaysVisible)
  if (actions.length <= 1) return parts
  let overflowPlaced = false
  return parts.flatMap((part): OcNodeTailPart[] => {
    if (!isNodeTailAction(part) || part.alwaysVisible) return [part]
    if (overflowPlaced) return []
    overflowPlaced = true
    return [{
      key: `__oc-tree-action-overflow__:${key}`,
      icon: 'mdiDotsHorizontal',
      title: props.actionOverflowTitle,
      children: actions,
    }]
  })
}

function resolveContextActions(key: OcNodeKey): FloatingMenuItem[] {
  const result: FloatingMenuItem[] = []
  const entries = props.data.items.get(key)?.contextActions
  for (const entry of (typeof entries === 'function' ? entries() : entries) ?? []) {
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
  const key = visibleEntries.value[start]?.key
  const position = key ? focusablePositions.value.get(key) ?? 0 : 0
  const indexes = focusableIndexes.value
  return indexes.length ? indexes[(position + direction + indexes.length) % indexes.length]! : start
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
    focusEntry(focusableIndexes.value[0] ?? -1)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusEntry(focusableIndexes.value[focusableIndexes.value.length - 1] ?? -1)
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
  const maximum = Math.max(0, visibleEntries.value.length * virtualRowPitch.value - root.clientHeight)
  if (root.scrollTop > maximum) root.scrollTop = maximum
  virtualScrollTop.value = root.scrollTop
})

onMounted(() => {
  window.addEventListener('mousemove', handleGlobalMouseMove)
  window.addEventListener('mouseup', handleGlobalMouseUp)
  // 字体就绪后核对虚拟行距；不读取或揭示行内命令。
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
  structureRequest?.abort()
  fontFaceSet()?.removeEventListener('loadingdone', syncTreeMetrics)
  treeResizeObserver?.disconnect()
  externalDropZoneDispose?.()
  externalDropZoneDispose = null
  window.removeEventListener('mousemove', handleGlobalMouseMove)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
})
// One stable owner per tree. Each row tracks its own presentation dependencies;
// scrolling the viewport does not invalidate slots in rows that remain mounted.
const rowContext: OcTreeRowContext = {
  props,
  get rowRole() { return rowRole.value },
  get activeKey() { return activeKey.value },
  set activeKey(key) { activeKey.value = key },
  get renamingKey() { return renamingKey.value },
  get renameDraft() { return renameDraft.value },
  get visibleCount() { return visibleEntries.value.length },
  resolveNodeClass, resolveNodeStyle, setRowRef, isSelected, isExpandable, isExpanded,
  handleRowClick, handleRowAuxClick, handleRowDoubleClick, handleRowMouseDown,
  handleRowKeydown, handleRowContextMenu, handleIconMouseDown, handleIconClick,
  childCount, formatChildCount, setRenameInputRef, handleRenameInput,
  handleRenameKeydown, commitRename, labelStyle, resolveTailParts, emitActionIntent,
}

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
  padding: var(--oc-space-sm);
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

.oc-tree.is-fill {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.oc-tree.is-root-drop {
  box-shadow: inset 0 0 0 1px var(--oc-border-accent);
}
</style>
