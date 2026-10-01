<template>
  <div ref="viewportRef" class="card-viewport" :class="{
    'card-viewport-panning': isPanning,
    'card-viewport--layer-view': effectiveLayerViewActive,
    'card-viewport--readonly': props.readonly,
  }"
    @pointerdown.self="handleViewportPointerDown" @mousedown="handleMouseDown" @mousemove="handleMouseMove"
    @mouseup="handleMouseUp" @mouseleave="handleMouseLeave" @mouseover="handleComparisonMouseOver"
    @wheel.prevent="handleWheel">
    <template v-if="props.comparison">
      <div class="card-viewport-comparison-layer" :class="{ 'is-transitioning': comparisonTransitioning }"
        :style="comparisonBeforeLayerStyle" @transitionend="finishComparisonTransition">
        <div ref="stageRef" class="card-viewport-stage card-viewport-stage--before" :class="{ 'is-transitioning': comparisonTransitioning }"
          :style="comparisonBeforeStageStyle" @transitionend="finishComparisonTransition">
          <div v-if="props.comparison.before.placeholder" class="card-comparison-placeholder" :style="placeholderStyle(props.comparison.before.face)" />
          <CardFaceRenderer v-else :face="props.comparison.before.face"
            :transform-disabled-block-ids="transformDisabledBlockIds" :clip-to-face="clipToFace"
            :resource-context="props.comparison.before.resourceContext"
            :visual-readiness="visualReadiness"
            :diff-highlights="props.comparison.before.diffHighlights ?? []" @block-click="handleBlockClick" />
        </div>
      </div>
      <div ref="comparisonAfterLayerRef" class="card-viewport-comparison-layer" :class="{ 'is-transitioning': comparisonTransitioning }"
        :style="comparisonAfterLayerStyle">
        <div ref="comparisonAfterStageRef" class="card-viewport-stage card-viewport-stage--after" :class="{ 'is-transitioning': comparisonTransitioning }"
          :style="comparisonAfterStageStyle">
          <div v-if="props.comparison.after.placeholder" class="card-comparison-placeholder" :style="placeholderStyle(props.comparison.after.face)" />
          <CardFaceRenderer v-else :face="props.comparison.after.face"
            :transform-disabled-block-ids="transformDisabledBlockIds" :clip-to-face="clipToFace"
            :resource-context="props.comparison.after.resourceContext"
            :visual-readiness="visualReadiness"
            :diff-highlights="props.comparison.after.diffHighlights ?? []" @block-click="handleBlockClick" />
        </div>
      </div>
    </template>
    <div v-else ref="stageRef" class="card-viewport-stage" :style="stageStyle">
      <CardFaceRenderer :face="face" :transform-disabled-block-ids="transformDisabledBlockIds"
        :clip-to-face="clipToFace" :resource-context="resourceContext"
        :visual-readiness="visualReadiness"
        :diff-highlights="diffHighlights" @block-click="handleBlockClick" />
      <Transition name="card-info-fade">
        <aside v-if="$slots.info && showInfo" class="card-viewport-info" :style="viewportInfoStyle">
          <slot name="info" />
        </aside>
      </Transition>
      <Transition name="card-info-fade">
        <aside v-if="$slots['left-info'] && showInfo" class="card-viewport-left-info" :style="viewportLeftInfoStyle"
          @pointerdown.stop.prevent="startFaceDimensionDrag('height', $event)">
          <span
            class="card-viewport-dimension-line card-viewport-dimension-line--vertical"
            :style="viewportLeftInfoLineStyle"
          >
            <span class="card-viewport-dimension-label"><slot name="left-info" /></span>
          </span>
        </aside>
      </Transition>
      <Transition name="card-info-fade">
        <aside v-if="$slots['bottom-info'] && showInfo" class="card-viewport-bottom-info" :style="viewportBottomInfoStyle"
          @pointerdown.stop.prevent="startFaceDimensionDrag('width', $event)">
          <span
            class="card-viewport-dimension-line card-viewport-dimension-line--horizontal"
            :style="viewportBottomInfoLineStyle"
          >
            <span class="card-viewport-dimension-label"><slot name="bottom-info" /></span>
          </span>
        </aside>
      </Transition>
    </div>
    <button v-if="props.comparison" type="button" class="card-viewport-comparison-divider"
      :class="{
        'is-static': props.comparison.viewMode === 'side-by-side',
        'is-dragging': comparisonDividerDragging,
      }"
      :disabled="props.comparison.viewMode === 'side-by-side'"
      :style="comparisonDividerStyle" :aria-label="props.comparisonDividerLabel"
      :data-tooltip="props.comparisonDividerLabel" data-tooltip-placement="right"
      @pointerdown.stop.prevent="startComparisonDividerDrag">
      <span v-if="props.comparison.beforeLabel" class="card-viewport-comparison-label card-viewport-comparison-label--before"
        :data-tooltip="props.comparison.beforeLabel" data-tooltip-overflow>{{ props.comparison.beforeLabel }}</span>
      <span v-if="props.comparison.afterLabel" class="card-viewport-comparison-label card-viewport-comparison-label--after"
        :data-tooltip="props.comparison.afterLabel" data-tooltip-overflow>{{ props.comparison.afterLabel }}</span>
    </button>
    <CardLayerView
      v-if="effectiveLayerViewActive"
      ref="layerViewRef"
      :face="face"
      :source-root="stageRef"
      :selected-block-id="selectedBlockId"
      :space-modifier-active="spaceModifierActive"
      :base-plane-label="layerViewBasePlaneLabel"
      :shortcut-legend-label="layerViewShortcutLegendLabel"
      :shortcut-hints="layerViewShortcutHints"
      :atomic-block-ids="layerViewAtomicBlockIds"
      :viewport-width="viewportWidth"
      :viewport-height="viewportHeight"
      @block-click="handleBlockClick"
      @z-index-step="emit('z-index-step', $event)"
    />
    <div
      v-if="statusFlash"
      :key="statusFlash.sequence"
      class="card-viewport-status-flash"
      role="status"
      aria-live="polite"
      @animationend="finishStatusFlash(statusFlash.sequence)"
    >
      <OcIcon :name="statusFlash.icon" size="display" />
      <span>{{ statusFlash.message }}</span>
    </div>
    <div v-if="!effectiveLayerViewActive" class="card-selection-layer">
      <div v-if="props.comparison" class="card-diff-overlay-layer card-diff-overlay-layer--before" :class="{ 'is-hidden': !diffOverlayVisible }" :style="comparisonBeforeLayerStyle" aria-hidden="true">
        <div v-for="highlight in diffOverlayBeforeHighlights" :key="highlight.key" class="card-diff-overlay"
          :class="[`card-diff-overlay--${highlight.kind}`, `card-diff-overlay--${highlight.side}`]" :style="highlight.style">
          <span class="card-diff-overlay__label"><OcIcon :name="highlight.icon" size="sm" /></span>
        </div>
      </div>
      <div v-if="props.comparison" class="card-diff-overlay-layer card-diff-overlay-layer--after" :class="{ 'is-hidden': !diffOverlayVisible }" :style="comparisonAfterLayerStyle" aria-hidden="true">
        <div v-for="highlight in diffOverlayAfterHighlights" :key="highlight.key" class="card-diff-overlay"
          :class="[`card-diff-overlay--${highlight.kind}`, `card-diff-overlay--${highlight.side}`]" :style="highlight.style">
          <span class="card-diff-overlay__label"><OcIcon :name="highlight.icon" size="sm" /></span>
        </div>
      </div>
      <svg v-if="comparisonHoverLink" class="card-diff-hover-link" aria-hidden="true">
        <defs>
          <marker id="card-diff-hover-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3.5 L0,7 Z" />
          </marker>
        </defs>
        <path :d="comparisonHoverLink.path" marker-end="url(#card-diff-hover-arrow)" />
      </svg>
      <svg v-if="alignmentSnapGuides.length > 0" class="selection-alignment-guides" aria-hidden="true">
        <line v-for="guide in alignmentSnapGuides" :key="guide.axis"
          :x1="guide.x1" :y1="guide.y1" :x2="guide.x2" :y2="guide.y2" />
      </svg>
      <Transition name="selection-overlay-fade">
      <svg v-if="moveGuide" class="selection-anchor-guide" aria-hidden="true">
        <defs>
          <marker id="selection-anchor-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
            orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3.5 L0,7 Z" />
          </marker>
        </defs>
        <polyline :points="moveGuide.points" />
        <line class="selection-anchor-guide-diagonal"
          :x1="moveGuide.parentX" :y1="moveGuide.parentY"
          :x2="moveGuide.selectionX" :y2="moveGuide.selectionY"
          marker-end="url(#selection-anchor-arrow)" />
        <circle :cx="moveGuide.parentX" :cy="moveGuide.parentY" r="3" />
        <text class="selection-anchor-guide-label selection-anchor-guide-label--x"
          :x="moveGuide.horizontalLabelX" :y="moveGuide.horizontalLabelY">
          x {{ moveGuide.x }}
        </text>
        <text class="selection-anchor-guide-label selection-anchor-guide-label--y"
          :x="moveGuide.verticalLabelX" :y="moveGuide.verticalLabelY"
          :transform="`rotate(-90 ${moveGuide.verticalLabelX} ${moveGuide.verticalLabelY})`">
          y {{ moveGuide.y }}
        </text>
      </svg>
      </Transition>
      <Transition name="selection-overlay-fade">
      <span v-if="moveGuide" class="selection-anchor-badge" :style="moveGuide.anchorBadgeStyle">
        {{ moveGuide.anchor }}
      </span>
      </Transition>
      <div v-if="selectionFrame" :key="selectedBlockId ?? 'selection'" class="selection-frame" :class="{
        'selection-frame-movable': showMoveHandle,
        'is-resizing': activeHandle,
        'is-moving': isMovingSelection,
      }"
        :style="selectionFrameStyle" tabindex="0" @pointerdown="handleSelectionFramePointerDown"
        @contextmenu="openSelectionContextMenu"
        @keydown="openSelectionKeyboardMenu">
        <Transition name="selection-overlay-fade">
        <OcOverlayToolbar v-if="selectionQuickActions.length > 0 && !isTransformingSelection"
          class="selection-quick-actions" :label="selectionActionLabels.label"
          :items="selectionQuickActions" @select="handleSelectionQuickAction($event.key)"
          @pointerdown.stop />
        </Transition>
        <Transition name="selection-info-fade">
        <aside v-if="selectionInfo && !isTransformingSelection" class="selection-block-info" @pointerdown.stop>
          <span class="selection-block-info__title">
            <OcIcon :name="selectionInfo.icon" :tone="selectionInfo.iconTone" size="sm" />
            <span>{{ selectionInfo.name }}</span>
          </span>
          <span v-if="selectionInfo.notes" class="selection-block-info__notes">{{ selectionInfo.notes }}</span>
        </aside>
        </Transition>
        <Transition name="selection-overlay-fade">
        <output v-if="resizeMetrics?.width" class="selection-size-label selection-size-label--width">
          {{ resizeMetrics.width }}
        </output>
        </Transition>
        <Transition name="selection-overlay-fade">
        <output v-if="resizeMetrics?.height" class="selection-size-label selection-size-label--height">
          <span>{{ resizeMetrics.height }}</span>
        </output>
        </Transition>
        <button v-for="handle in activeHandles" :key="handle" type="button" class="selection-handle"
          :class="[`selection-handle-${handle}`, { 'is-active': activeHandle === handle }]"
          :aria-label="`Resize ${handle}`"
          @pointerdown.stop.prevent="startResize(handle)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { IconToken, IconTone } from '../../../shared/ui/icon/iconRegistry'
import type { RenderReadyCardFace as ComparisonCardFace } from '../render.types'
import type { CardRenderResourceContext as ComparisonResourceContext } from '../cardRenderResources'

export type CardViewportSelectionAction =
  | { type: 'fill-parent'; blockId: string; width: boolean; height: boolean }
  | { type: 'fill-cross-axis'; blockId: string }
  | { type: 'center-cross-axis'; blockId: string }
  | {
      type: 'geometry.apply'
      operation: 'center' | 'inset' | 'outset'
      blockId: string
      width?: number
      height?: number
      x?: number
      y?: number
    }

export type CardViewportSelectionCommand = {
  key: string
  blockId: string
}

export type CardViewportSelectionActionLabels = {
  label: string
  fillParent: string
  centerInParent: string
  inset: string
  outset: string
  fillCrossAxis: string
  centerCrossAxis: string
}

export type CardViewportSelectionInfo = {
  icon: IconToken
  iconTone: IconTone
  name: string
  notes: string
}

export type CardViewportStatusFlash = {
  icon: IconToken
  message: string
}

export type CardDiffHighlight = {
  blockId: string
  kind: 'added' | 'removed' | 'changed'
}

export interface CardViewportComparisonLayer {
  face: ComparisonCardFace
  resourceContext: ComparisonResourceContext
  diffHighlights?: readonly CardDiffHighlight[]
  placeholder?: boolean
}

export interface CardViewportComparison {
  before: CardViewportComparisonLayer
  after: CardViewportComparisonLayer
  divider: number
  viewMode: 'split' | 'side-by-side'
  transitionRevision?: number
  beforeLabel?: string
  afterLabel?: string
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnchorPosition, FlowDirection } from '../../../entities/card/model'
import { clamp } from '../../../shared/model/number'
import OcIcon from '../../../components/base/OcIcon.vue'
import type { OcActionDefinition, OcActionMenuEntry } from '../../../shared/ui/action/action.types'
import OcOverlayToolbar from '../../../components/standard/OcOverlayToolbar.vue'
import type { OcShortcutPart } from '../../../components/standard/OcShortcut.vue'
import { useFloatingMenu } from '../../../composables/useFloatingMenu'
import CardFaceRenderer from './CardFaceRenderer.vue'
import { createCardVisualReadiness, type CardVisualReadinessState } from './cardRenderReadiness'
import CardLayerView from './CardLayerView.vue'
import { buildCardLayerGroups } from './cardLayerModel'
import type { RenderReadyCardBlock, RenderReadyCardFace } from '../render.types'
import type { CardRenderResourceContext } from '../cardRenderResources'
import {
  snapMoveRect,
  snapResizeRect,
  type ResizeSnapLock,
  type ResizeSnapLocks,
  type ResizeSnapTarget,
} from './resizeSnapping'
import {
  VIEWPORT_FIT_PADDING,
  VIEWPORT_MAX_SCALE,
  VIEWPORT_MIN_SCALE,
  VIEWPORT_WHEEL_ZOOM_SENSITIVITY,
  VIEWPORT_ZOOM_ANIMATION_EPSILON,
  VIEWPORT_ZOOM_ANIMATION_SMOOTHING,
  normalizeViewportWheelDelta,
  resolveViewportSafeRegion,
  type ViewportInsets,
} from '../../../shared/ui/viewport/viewportNavigation'

type ResizeHandle = 'lt' | 'rt' | 'lb' | 'rb' | 'l' | 'r' | 't' | 'b'
type ResizeMode = 'absolute' | 'flow' | 'none'
type SelectionFrame = {
  left: number
  top: number
  width: number
  height: number
}

type DiffOverlayHighlight = SelectionFrame & {
  key: string
  kind: CardDiffHighlight['kind']
  icon: 'action.add' | 'action.minus' | 'status.circle-medium'
  side: 'before' | 'after'
  style: Record<string, string>
}
type SelectionMeasurement = {
  frame: SelectionFrame
  parentFrame: SelectionFrame
  worldRect: SelectionFrame
  parentWorldWidth: number
  parentWorldHeight: number
}
type AlignmentSnapGuide = {
  axis: 'x' | 'y'
  x1: number
  y1: number
  x2: number
  y2: number
}
type AlignmentSnapDistances = {
  enter: number
  release: number
}
type ResizePayload = {
  width?: number
  height?: number
  x?: number
  y?: number
}
type AbsoluteResizePayload = Required<ResizePayload>
type MovePayload = {
  x: number
  y: number
}
type FaceDimension = 'width' | 'height'
type ViewportTransform = {
  x: number
  y: number
  scale: number
}
const TRANSFORM_EPSILON = 0.0001
const SELECTION_INSET_STEP = 10
const MIN_SELECTION_SIZE = 24

const emit = defineEmits<{
  (e: 'block-click', blockId: string, event: MouseEvent): void
  (e: 'blank-click', event: MouseEvent): void
  (e: 'resize-selection', payload: ResizePayload & { blockId: string }): void
  (e: 'move-selection', payload: MovePayload & { blockId: string }): void
  (e: 'selection-action', payload: CardViewportSelectionAction): void
  (e: 'selection-command', payload: CardViewportSelectionCommand): void
  (e: 'viewport-transform-change', payload: { x: number; y: number; scale: number }): void
  (e: 'viewport-size-change', payload: { width: number; height: number }): void
  (e: 'face-dimension-change', payload: { dimension: FaceDimension; value: number; final: boolean }): void
  (e: 'z-index-step', payload: { delta: -1 | 1; existingLayersOnly: boolean }): void
  (e: 'diff-divider-change', value: number): void
  (e: 'render-readiness-change', value: CardVisualReadinessState): void
}>()

const props = withDefaults(defineProps<{
  face: RenderReadyCardFace
  clipToFace?: boolean
  restoreKey?: string
  selectedBlockId?: string | null
  selectedLocationType?: 'simple-container-location' | 'flow-container-location' | null
  selectedAnchor?: AnchorPosition | null
  selectedParentBlockId?: string | null
  selectedParentFlowDirection?: FlowDirection | null
  selectedFlowAlign?: 'start' | 'center' | 'end' | 'justify' | null
  selectionInfo?: CardViewportSelectionInfo | null
  selectionActionLabels?: CardViewportSelectionActionLabels
  selectionCommandActions?: readonly OcActionDefinition[]
  showPositionOnMove?: boolean
  showSizeOnResize?: boolean
  alignmentSnappingEnabled?: boolean
  showInfo?: boolean
  layerViewActive?: boolean
  spaceModifierActive?: boolean
  layerViewShortcutLegendLabel?: string
  layerViewBasePlaneLabel?: string
  layerViewShortcutHints?: Array<{
    keys: OcShortcutPart[]
    label: string
  }>
  transform?: ViewportTransform
  transformDisabledBlockIds?: string[]
  layerViewAtomicBlockIds?: string[]
  widthLocked?: boolean
  heightLocked?: boolean
  resourceContext: CardRenderResourceContext
  viewportInsets?: ViewportInsets
  readonly?: boolean
  diffHighlights?: readonly CardDiffHighlight[]
  comparison?: CardViewportComparison
  comparisonDividerLabel?: string
}>(), {
  restoreKey: undefined,
  selectedBlockId: null,
  selectedLocationType: null,
  selectedAnchor: null,
  selectedParentBlockId: null,
  selectedParentFlowDirection: null,
  selectedFlowAlign: null,
  selectionInfo: null,
  selectionCommandActions: () => [],
  selectionActionLabels: () => ({
    label: 'Selection layout actions',
    fillParent: 'Fill parent',
    centerInParent: 'Center in parent',
    inset: 'Inset 10 px',
    outset: 'Outset 10 px',
    fillCrossAxis: 'Fill cross axis',
    centerCrossAxis: 'Center on cross axis',
  }),
  showPositionOnMove: true,
  showSizeOnResize: true,
  alignmentSnappingEnabled: true,
  showInfo: true,
  layerViewActive: false,
  spaceModifierActive: false,
  layerViewShortcutLegendLabel: '',
  layerViewBasePlaneLabel: '',
  layerViewShortcutHints: () => [],
  transform: undefined,
  transformDisabledBlockIds: () => [],
  layerViewAtomicBlockIds: () => [],
  widthLocked: false,
  heightLocked: false,
  clipToFace: false,
  viewportInsets: () => ({}),
  readonly: false,
  diffHighlights: () => [],
  comparison: undefined,
  comparisonDividerLabel: 'Comparison divider',
})

const visualReadiness = createCardVisualReadiness(state => emit('render-readiness-change', state))
visualReadiness.reset()

const viewportRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const comparisonAfterStageRef = ref<HTMLElement | null>(null)
const comparisonAfterLayerRef = ref<HTMLElement | null>(null)
const layerViewRef = ref<{
  stepLayer: (direction: -1 | 1, wholeLayer?: boolean) => void
  focusBlock: (blockId: string) => void
  getFocusedBlockId: () => string | null
  cycleLayerByInitial: (initial: string, currentLayerOnly?: boolean) => boolean
} | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)
const panX = ref(0)
const panY = ref(0)
const scale = ref(1)
const targetPanX = ref(0)
const targetPanY = ref(0)
const targetScale = ref(1)
const isPanning = ref(false)
const lastPointerX = ref(0)
const lastPointerY = ref(0)
const selectionFrame = ref<SelectionFrame | null>(null)
let selectionSyncScheduled = false
let selectionSyncInFlight = false
let selectionSyncAgain = false
const diffOverlayHighlights = ref<DiffOverlayHighlight[]>([])
const diffOverlayVisible = ref(true)
const diffOverlayBeforeHighlights = computed(() => diffOverlayHighlights.value.filter(highlight => highlight.side === 'before'))
const diffOverlayAfterHighlights = computed(() => diffOverlayHighlights.value.filter(highlight => highlight.side === 'after'))
const hoveredComparisonBlockId = ref<string | null>(null)
const comparisonHoverLink = computed(() => {
  if (props.comparison?.viewMode !== 'side-by-side' || !hoveredComparisonBlockId.value) return null
  const before = diffOverlayHighlights.value.find(highlight => highlight.key === `before:${hoveredComparisonBlockId.value}`)
  const after = diffOverlayHighlights.value.find(highlight => highlight.key === `after:${hoveredComparisonBlockId.value}`)
  if (!before || !after) return null
  const startX = before.left + before.width
  const startY = before.top + before.height / 2
  const endX = after.left
  const endY = after.top + after.height / 2
  const controlX = (startX + endX) / 2
  return {
    path: `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`,
  }
})
const activeHandle = ref<ResizeHandle | null>(null)
const isMovingSelection = ref(false)
const dragMeasurement = ref<SelectionMeasurement | null>(null)
const previewWorldRect = ref<SelectionFrame | null>(null)
const rawPreviewWorldRect = ref<SelectionFrame | null>(null)
const lastTransformClientPosition = ref<{ x: number; y: number } | null>(null)
const alignmentSnapTargets = ref<ResizeSnapTarget[]>([])
const alignmentSnapLocks = ref<ResizeSnapLocks>({})
const alignmentSnapDistances = ref<AlignmentSnapDistances | null>(null)
const transformBlockId = ref<string | null>(null)
const faceDimensionDrag = ref<{
  dimension: FaceDimension
  startClientPosition: number
  startValue: number
  lastValue: number
} | null>(null)
const statusFlash = ref<(CardViewportStatusFlash & { sequence: number }) | null>(null)
let statusFlashSequence = 0

let resizeObserver: ResizeObserver | null = null
let diffOverlayMutationObserver: MutationObserver | null = null
let zoomAnimationFrame: number | null = null
let lastEmittedTransform: ViewportTransform | null = null
let pendingTransformEchoes: ViewportTransform[] = []
let previousDimensionCursor = ''

const effectiveLayerViewActive = computed(() => (
  props.layerViewActive
  && buildCardLayerGroups(props.face, new Set(props.layerViewAtomicBlockIds)).length > 0
))

function applyViewportTransform(transform: ViewportTransform | undefined) {
  const nextTransform = transform ?? { x: 0, y: 0, scale: 1 }
  panX.value = nextTransform.x
  panY.value = nextTransform.y
  scale.value = clamp(nextTransform.scale, VIEWPORT_MIN_SCALE, VIEWPORT_MAX_SCALE)
  targetPanX.value = panX.value
  targetPanY.value = panY.value
  targetScale.value = scale.value
}

function hasSameViewportTransform(left: ViewportTransform | null, right: ViewportTransform) {
  return Boolean(left)
    && Math.abs(left!.x - right.x) < TRANSFORM_EPSILON
    && Math.abs(left!.y - right.y) < TRANSFORM_EPSILON
    && Math.abs(left!.scale - right.scale) < TRANSFORM_EPSILON
}

const baseOffsetX = computed(() => {
  return getBaseOffsetXForScale(scale.value)
})

const baseOffsetY = computed(() => {
  return getBaseOffsetYForScale(scale.value)
})

const translateX = computed(() => baseOffsetX.value + panX.value)
const translateY = computed(() => baseOffsetY.value + panY.value)

const stageStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  '--oc-viewport-inverse-scale': String(1 / scale.value),
}))
const comparisonDivider = computed(() => Math.min(1, Math.max(0, props.comparison?.divider ?? 0.5)))
const comparisonTransitioning = ref(false)
const comparisonDividerDragging = ref(false)
watch(() => props.comparison?.viewMode, (next, previous) => {
  if (next && previous && next !== previous) comparisonTransitioning.value = true
})
watch(() => props.comparison?.transitionRevision, (next, previous) => {
  if (next !== undefined && previous !== undefined && next !== previous && !comparisonDividerDragging.value) {
    comparisonTransitioning.value = true
  }
})
function finishComparisonTransition(event: TransitionEvent): void {
  if (event.propertyName === 'transform' || event.propertyName === 'clip-path') {
    comparisonTransitioning.value = false
  }
}
const comparisonSafeRegion = computed(() => resolveViewportSafeRegion(
  viewportWidth.value,
  viewportHeight.value,
  props.viewportInsets,
))
const comparisonDividerPosition = computed(() => (
  comparisonSafeRegion.value.left + comparisonSafeRegion.value.width * (
    props.comparison?.viewMode === 'side-by-side' ? 0.5 : comparisonDivider.value
  )
))
function resolveComparisonZoomLayer(viewportX: number): CardViewportComparisonLayer | null {
  if (props.comparison?.viewMode !== 'side-by-side') return null
  const safeRegion = comparisonSafeRegion.value
  return viewportX < safeRegion.left + safeRegion.width / 2
    ? props.comparison.before
    : props.comparison.after
}

function resolveZoomOrigin(layer: CardViewportComparisonLayer | null, value: number): { x: number; y: number } {
  if (!layer || props.comparison?.viewMode !== 'side-by-side') {
    return { x: getBaseOffsetXForScale(value), y: getBaseOffsetYForScale(value) }
  }
  const safeRegion = comparisonSafeRegion.value
  const halfWidth = safeRegion.width / 2
  const regionLeft = layer === props.comparison.after ? safeRegion.left + halfWidth : safeRegion.left
  return {
    x: regionLeft + halfWidth / 2 - layer.face.width * value / 2,
    y: safeRegion.top + safeRegion.height / 2 - layer.face.height * value / 2,
  }
}

function resolveComparisonStageStyle(layer: CardViewportComparisonLayer) {
  if (props.comparison?.viewMode !== 'side-by-side') return stageStyle.value
  const origin = resolveZoomOrigin(layer, scale.value)
  return {
    transform: `translate(${origin.x + panX.value}px, ${origin.y + panY.value}px) scale(${scale.value})`,
    '--oc-viewport-inverse-scale': String(1 / scale.value),
  }
}
const comparisonBeforeStageStyle = computed(() => props.comparison
  ? resolveComparisonStageStyle(props.comparison.before)
  : stageStyle.value)
const comparisonAfterStageStyle = computed(() => props.comparison
  ? resolveComparisonStageStyle(props.comparison.after)
  : stageStyle.value)
function placeholderStyle(face: ComparisonCardFace): Record<string, string> {
  return {
    width: `${face.width}px`,
    height: `${face.height}px`,
  }
}
const comparisonBeforeLayerStyle = computed(() => ({
  clipPath: `inset(0 ${Math.max(0, viewportWidth.value - comparisonDividerPosition.value) / Math.max(1, viewportWidth.value) * 100}% 0 0)`,
}))
const comparisonAfterLayerStyle = computed(() => ({
  clipPath: `inset(0 0 0 ${comparisonDividerPosition.value / Math.max(1, viewportWidth.value) * 100}%)`,
}))
const comparisonDividerStyle = computed(() => ({
  left: `${comparisonDividerPosition.value}px`,
  top: '0',
  height: '100%',
}))

function startComparisonDividerDrag(event: PointerEvent): void {
  if (props.comparison?.viewMode !== 'split') return
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  comparisonTransitioning.value = false
  comparisonDividerDragging.value = true
  target.setPointerCapture(event.pointerId)
  const update = (clientX: number) => {
    const rect = viewportRef.value?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const safeRegion = resolveViewportSafeRegion(rect.width, rect.height, props.viewportInsets)
    emit('diff-divider-change', Math.min(1, Math.max(0,
      (clientX - rect.left - safeRegion.left) / safeRegion.width,
    )))
  }
  const move = (moveEvent: PointerEvent) => update(moveEvent.clientX)
  const finish = (upEvent: PointerEvent) => {
    update(upEvent.clientX)
    comparisonDividerDragging.value = false
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', finish)
    target.removeEventListener('pointercancel', finish)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', finish)
  target.addEventListener('pointercancel', finish)
  update(event.clientX)
}
const viewportInfoStyle = computed(() => {
  const safeScale = scale.value || 1
  return {
    left: `${props.face.width + 16 / safeScale}px`,
    transform: `scale(${1 / safeScale})`,
  }
})
const viewportLeftInfoStyle = computed(() => {
  const safeScale = scale.value || 1
  return {
    left: `${-12 / safeScale}px`,
    top: `${props.face.height / 2}px`,
    transform: `translate(-50%, -50%) scale(${1 / safeScale})`,
  }
})
const viewportBottomInfoStyle = computed(() => {
  const safeScale = scale.value || 1
  return {
    left: `${props.face.width / 2}px`,
    top: `${props.face.height + 12 / safeScale}px`,
    transform: `translateX(-50%) scale(${1 / safeScale})`,
  }
})
const viewportLeftInfoLineStyle = computed(() => ({
  height: `${props.face.height * scale.value}px`,
}))
const viewportBottomInfoLineStyle = computed(() => ({
  width: `${props.face.width * scale.value}px`,
}))
const resizeMode = computed<ResizeMode>(() => {
  if (!props.selectedBlockId) {
    return 'none'
  }
  return props.selectedLocationType === 'flow-container-location' ? 'flow' : 'absolute'
})
const activeHandles = computed<ResizeHandle[]>(() => {
  if (resizeMode.value === 'flow') {
    const horizontal = props.selectedParentFlowDirection === 'lr'
      || props.selectedParentFlowDirection === 'rl'
    const mainHandle: ResizeHandle = props.selectedParentFlowDirection === 'rl'
      ? 'l'
      : props.selectedParentFlowDirection === 'bt'
        ? 't'
        : horizontal ? 'r' : 'b'
    const filterLocked = (handles: ResizeHandle[]) => handles.filter(handle => (
      handle === 'l' || handle === 'r' ? !props.widthLocked : !props.heightLocked
    ))
    if (props.selectedFlowAlign === 'justify') return filterLocked([mainHandle])
    if (horizontal) {
      if (props.selectedFlowAlign === 'end') return filterLocked([mainHandle, 't'])
      if (props.selectedFlowAlign === 'center') return filterLocked([mainHandle, 't', 'b'])
      return filterLocked([mainHandle, 'b'])
    }
    if (props.selectedFlowAlign === 'end') return filterLocked([mainHandle, 'l'])
    if (props.selectedFlowAlign === 'center') return filterLocked([mainHandle, 'l', 'r'])
    return filterLocked([mainHandle, 'r'])
  }
  if (resizeMode.value === 'absolute') {
    const handles: ResizeHandle[] = ['lt', 't', 'rt', 'l', 'r', 'lb', 'b', 'rb']
    return handles.filter(handle => {
      const horizontal = handle.includes('l') || handle.includes('r')
      const vertical = handle.includes('t') || handle.includes('b')
      return (!horizontal || !props.widthLocked) && (!vertical || !props.heightLocked)
    })
  }
  return []
})
const showMoveHandle = computed(() => props.selectedLocationType === 'simple-container-location')
const selectionQuickActions = computed<OcActionDefinition[]>(() => {
  if (!props.selectedBlockId) return []
  if (resizeMode.value === 'absolute') {
    return [
      ...props.selectionCommandActions,
      ...(!props.widthLocked || !props.heightLocked ? [{
        key: 'fill-parent',
        title: props.selectionActionLabels.fillParent,
        icon: 'layout.fill',
      } as OcActionDefinition] : []),
      {
        key: 'center',
        title: props.selectionActionLabels.centerInParent,
        icon: 'layout.center',
      },
      ...(!props.widthLocked || !props.heightLocked ? [{
        key: 'inset',
        title: props.selectionActionLabels.inset,
        icon: 'layout.inset',
      },
      {
        key: 'outset',
        title: props.selectionActionLabels.outset,
        icon: 'layout.outset',
      }] as OcActionDefinition[] : []),
    ]
  }
  if (resizeMode.value === 'flow') {
    const horizontalFlow = props.selectedParentFlowDirection === 'lr'
      || props.selectedParentFlowDirection === 'rl'
    return [
      ...props.selectionCommandActions,
      ...(!(horizontalFlow ? props.heightLocked : props.widthLocked) ? [{
        key: 'fill-cross-axis',
        title: props.selectionActionLabels.fillCrossAxis,
        icon: horizontalFlow ? 'layout.fill-vertical' : 'layout.fill-horizontal',
      } as OcActionDefinition] : []),
      {
        key: 'center-cross-axis',
        title: props.selectionActionLabels.centerCrossAxis,
        icon: 'format.align-center',
      },
    ]
  }
  return []
})

const selectionContextMenuActions = computed<OcActionMenuEntry[]>(() => {
  const actions = selectionQuickActions.value
  const commandCount = props.selectionCommandActions.length
  if (commandCount === 0 || commandCount >= actions.length) return actions
  return [
    ...actions.slice(0, commandCount),
    { type: 'divider', key: 'selection-layout-divider' },
    ...actions.slice(commandCount),
  ]
})

function findSelectionAction(
  actions: readonly OcActionDefinition[],
  actionKey: string,
): OcActionDefinition | null {
  for (const action of actions) {
    if (action.key === actionKey) return action
    for (const child of action.children ?? []) {
      if (child.type === 'divider') continue
      const match = findSelectionAction([child], actionKey)
      if (match) return match
    }
  }
  return null
}
const { openContextMenu } = useFloatingMenu()

function openSelectionContextMenu(event: MouseEvent): void {
  openContextMenu({
    event,
    items: selectionContextMenuActions.value,
    onSelect: handleSelectionQuickAction,
  })
}

function openSelectionKeyboardMenu(event: KeyboardEvent): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
  if (selectionQuickActions.value.length === 0 || !(event.currentTarget instanceof HTMLElement)) return
  event.preventDefault()
  openContextMenu({
    anchor: event.currentTarget,
    items: selectionContextMenuActions.value,
    onSelect: handleSelectionQuickAction,
  })
}
const selectionFrameStyle = computed(() => {
  const frame = selectionFrame.value
  if (!frame) {
    return {}
  }
  return {
    left: `${frame.left}px`,
    top: `${frame.top}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
  }
})
const isTransformingSelection = computed(() => Boolean(activeHandle.value) || isMovingSelection.value)
const resizeMetrics = computed(() => {
  const preview = previewWorldRect.value
  const handle = activeHandle.value
  if (!props.showSizeOnResize || !handle || !preview) return null
  const changesWidth = handle === 'l' || handle === 'r' || handle.length === 2
  const changesHeight = handle === 't' || handle === 'b' || handle.length === 2
  return {
    width: changesWidth ? formatGeometryValue(preview.width) : null,
    height: changesHeight ? formatGeometryValue(preview.height) : null,
  }
})
const alignmentSnapGuides = computed<AlignmentSnapGuide[]>(() => {
  if (!props.alignmentSnappingEnabled) return []
  const measurement = dragMeasurement.value
  const preview = previewWorldRect.value
  if ((!activeHandle.value && !isMovingSelection.value) || !measurement || !preview) return []
  return ([alignmentSnapLocks.value.x, alignmentSnapLocks.value.y]
    .filter((lock): lock is NonNullable<typeof lock> => Boolean(lock))
    .map((lock) => {
      const target = lock.target.rect
      const left = measurement.parentFrame.left
        + Math.min(preview.left, target.left) * scale.value
      const right = measurement.parentFrame.left
        + Math.max(preview.left + preview.width, target.left + target.width) * scale.value
      const top = measurement.parentFrame.top
        + Math.min(preview.top, target.top) * scale.value
      const bottom = measurement.parentFrame.top
        + Math.max(preview.top + preview.height, target.top + target.height) * scale.value
      const position = lock.axis === 'x'
        ? measurement.parentFrame.left + lock.position * scale.value
        : measurement.parentFrame.top + lock.position * scale.value
      return lock.axis === 'x'
        ? { axis: lock.axis, x1: position, y1: top, x2: position, y2: bottom }
        : { axis: lock.axis, x1: left, y1: position, x2: right, y2: position }
    }))
})
const moveGuide = computed(() => {
  const frame = selectionFrame.value
  const measurement = dragMeasurement.value
  if (!props.showPositionOnMove || !isMovingSelection.value || !frame || !measurement) return null

  const anchor = props.selectedAnchor ?? 'lt'
  const parentPoint = getAnchorPoint(measurement.parentFrame, anchor)
  const selectionPoint = getAnchorPoint(frame, anchor)
  const position = buildMovePayload(previewWorldRect.value!, measurement)
  return {
    anchor: anchor.toUpperCase(),
    parentX: parentPoint.x,
    parentY: parentPoint.y,
    selectionX: selectionPoint.x,
    selectionY: selectionPoint.y,
    horizontalLabelX: (parentPoint.x + selectionPoint.x) / 2,
    horizontalLabelY: parentPoint.y,
    verticalLabelX: selectionPoint.x,
    verticalLabelY: (parentPoint.y + selectionPoint.y) / 2,
    x: formatGeometryValue(position.x),
    y: formatGeometryValue(position.y),
    anchorBadgeStyle: {
      left: `${selectionPoint.x + 8}px`,
      top: `${selectionPoint.y + 8}px`,
    },
    points: [
      `${parentPoint.x},${parentPoint.y}`,
      `${selectionPoint.x},${parentPoint.y}`,
      `${selectionPoint.x},${selectionPoint.y}`,
    ].join(' '),
  }
})

function formatGeometryValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${Object.is(rounded, -0) ? 0 : rounded}px`
}

function getAnchorPoint(frame: SelectionFrame, anchor: AnchorPosition): { x: number; y: number } {
  const horizontal = anchor[0]
  const vertical = anchor[1]
  const x = horizontal === 'l'
    ? frame.left
    : horizontal === 'r' ? frame.left + frame.width : frame.left + frame.width / 2
  const y = vertical === 't'
    ? frame.top
    : vertical === 'b' ? frame.top + frame.height : frame.top + frame.height / 2
  return { x, y }
}

function handleSelectionQuickAction(actionKey: string): void {
  const blockId = props.selectedBlockId
  if (!blockId) return

  if (actionKey === 'fill-parent') {
    if (props.widthLocked && props.heightLocked) return
    emit('selection-action', {
      type: 'fill-parent', blockId,
      width: !props.widthLocked,
      height: !props.heightLocked,
    })
    return
  }
  if (actionKey === 'fill-cross-axis') {
    emit('selection-action', { type: 'fill-cross-axis', blockId })
    return
  }
  if (actionKey === 'center-cross-axis') {
    emit('selection-action', { type: 'center-cross-axis', blockId })
    return
  }
  if (findSelectionAction(props.selectionCommandActions, actionKey)) {
    emit('selection-command', { key: actionKey, blockId })
    return
  }
  if (actionKey !== 'center' && actionKey !== 'inset' && actionKey !== 'outset') return

  const measurement = measureSelection()
  if (!measurement) return
  const nextRect = buildQuickActionRect(actionKey, measurement)
  if (!nextRect) return
  const geometry = buildAbsoluteResizePayload(nextRect, measurement)
  const isCenter = actionKey === 'center'
  emit('selection-action', {
    type: 'geometry.apply',
    operation: actionKey,
    blockId,
    ...(!isCenter && !props.widthLocked ? { width: geometry.width, x: geometry.x ?? 0 } : {}),
    ...(!isCenter && !props.heightLocked ? { height: geometry.height, y: geometry.y ?? 0 } : {}),
    ...(isCenter ? { x: geometry.x ?? 0, y: geometry.y ?? 0 } : {}),
  })
}

function runSelectionQuickAction(actionKey: string): boolean {
  const action = findSelectionAction(selectionQuickActions.value, actionKey)
  if (!action || action.disabled) return false
  handleSelectionQuickAction(actionKey)
  return true
}

function nudgeSelection(deltaX: number, deltaY: number): boolean {
  const blockId = props.selectedBlockId
  if (!showMoveHandle.value || !blockId) return false
  const measurement = measureSelection()
  if (!measurement) return false

  emit('move-selection', {
    blockId,
    ...buildMovePayload({
      ...measurement.worldRect,
      left: measurement.worldRect.left + deltaX,
      top: measurement.worldRect.top + deltaY,
    }, measurement),
  })
  return true
}

function buildQuickActionRect(
  actionKey: string,
  measurement: SelectionMeasurement,
): SelectionFrame | null {
  const current = measurement.worldRect
  if (actionKey === 'center') {
    return {
      left: (measurement.parentWorldWidth - current.width) / 2,
      top: (measurement.parentWorldHeight - current.height) / 2,
      width: current.width,
      height: current.height,
    }
  }
  if (actionKey !== 'inset' && actionKey !== 'outset') return null

  const delta = actionKey === 'inset' ? -SELECTION_INSET_STEP * 2 : SELECTION_INSET_STEP * 2
  const width = Math.max(MIN_SELECTION_SIZE, current.width + delta)
  const height = Math.max(MIN_SELECTION_SIZE, current.height + delta)
  return {
    left: current.left - (width - current.width) / 2,
    top: current.top - (height - current.height) / 2,
    width,
    height,
  }
}

function handleMouseDown(event: MouseEvent) {
  if (effectiveLayerViewActive.value) return
  if (event.button !== 1) return

  event.preventDefault()
  stopZoomAnimation()
  isPanning.value = true
  lastPointerX.value = event.clientX
  lastPointerY.value = event.clientY
}

function handleMouseMove(event: MouseEvent) {
  updateHoveredComparisonBlock(event.target)
  if (!isPanning.value) return

  const deltaX = event.clientX - lastPointerX.value
  const deltaY = event.clientY - lastPointerY.value

  panX.value += deltaX
  panY.value += deltaY
  targetPanX.value = panX.value
  targetPanY.value = panY.value

  lastPointerX.value = event.clientX
  lastPointerY.value = event.clientY
}

function handleMouseUp() {
  isPanning.value = false
}

function handleComparisonMouseOver(event: MouseEvent): void {
  updateHoveredComparisonBlock(event.target)
}

function updateHoveredComparisonBlock(target: EventTarget | null): void {
  if (props.comparison?.viewMode !== 'side-by-side' || !(target instanceof Element)) {
    hoveredComparisonBlockId.value = null
    return
  }
  const afterIds = new Set((props.comparison?.after.diffHighlights ?? []).map(highlight => highlight.blockId))
  const linkedBlockIds = new Set((props.comparison?.before.diffHighlights ?? [])
    .map(highlight => highlight.blockId)
    .filter(blockId => afterIds.has(blockId)))
  let element: Element | null = target.closest('[data-block-id]')
  while (element) {
    const blockId = element instanceof HTMLElement ? element.dataset.blockId : undefined
    if (blockId && linkedBlockIds.has(blockId)) {
      hoveredComparisonBlockId.value = blockId
      return
    }
    element = element.parentElement?.closest('[data-block-id]') ?? null
  }
  hoveredComparisonBlockId.value = null
}

function handleMouseLeave(): void {
  handleMouseUp()
  hoveredComparisonBlockId.value = null
}

function handleWheel(event: WheelEvent) {
  if (effectiveLayerViewActive.value) return
  const viewport = viewportRef.value
  if (!viewport) return

  const rect = viewport.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  const normalizedDelta = normalizeWheelDelta(event.deltaY, event.deltaMode)
  if (Math.abs(normalizedDelta) < 0.01) return
  const nextScale = targetScale.value * Math.exp(-normalizedDelta * VIEWPORT_WHEEL_ZOOM_SENSITIVITY)
  zoomAt(nextScale, mouseX, mouseY)
}

function zoomByWheelAt(
  deltaY: number,
  deltaMode: number,
  viewportX: number,
  viewportY: number,
): void {
  if (effectiveLayerViewActive.value) return
  const normalizedDelta = normalizeWheelDelta(deltaY, deltaMode)
  if (Math.abs(normalizedDelta) < 0.01) return
  zoomAt(
    targetScale.value * Math.exp(-normalizedDelta * VIEWPORT_WHEEL_ZOOM_SENSITIVITY),
    viewportX,
    viewportY,
  )
}

function zoomBy(factor: number): void {
  if (effectiveLayerViewActive.value) return
  const region = resolveViewportSafeRegion(viewportWidth.value, viewportHeight.value, props.viewportInsets)
  zoomAt(
    targetScale.value * factor,
    region.centerX,
    region.centerY,
  )
}

function zoomAt(nextValue: number, viewportX: number, viewportY: number): void {
  const previousScale = targetScale.value
  const nextScale = clamp(nextValue, VIEWPORT_MIN_SCALE, VIEWPORT_MAX_SCALE)
  if (Math.abs(nextScale - previousScale) < 0.0001) return

  const comparisonLayer = resolveComparisonZoomLayer(viewportX)
  const previousOrigin = resolveZoomOrigin(comparisonLayer, previousScale)
  const nextOrigin = resolveZoomOrigin(comparisonLayer, nextScale)
  const previousTranslateX = previousOrigin.x + targetPanX.value
  const previousTranslateY = previousOrigin.y + targetPanY.value
  const worldX = (viewportX - previousTranslateX) / previousScale
  const worldY = (viewportY - previousTranslateY) / previousScale

  targetScale.value = nextScale
  targetPanX.value = viewportX - nextOrigin.x - worldX * nextScale
  targetPanY.value = viewportY - nextOrigin.y - worldY * nextScale
  startZoomAnimation()
}

function resetView(): void {
  if (effectiveLayerViewActive.value) return
  stopZoomAnimation()
  panX.value = 0
  panY.value = 0
  scale.value = 1
  targetPanX.value = 0
  targetPanY.value = 0
  targetScale.value = 1
}

function fitView(targetRect?: { left: number; top: number; width: number; height: number }): void {
  fitContent({ left: 0, top: 0, width: props.face.width, height: props.face.height }, targetRect)
}

function fitBottomRightHalfView(): void {
  const viewport = viewportRef.value
  if (!viewport) return
  fitView({
    left: viewport.getBoundingClientRect().left + viewportWidth.value / 2,
    top: viewport.getBoundingClientRect().top + viewportHeight.value / 2,
    width: viewportWidth.value / 2,
    height: viewportHeight.value / 2,
  })
}

function fitContent(
  contentRect: { left: number; top: number; width: number; height: number },
  targetRect?: { left: number; top: number; width: number; height: number },
): void {
  if (effectiveLayerViewActive.value) return
  const viewport = viewportRef.value
  if (!viewport || viewportWidth.value <= 0 || viewportHeight.value <= 0
    || contentRect.width <= 0 || contentRect.height <= 0) return

  const viewportRect = viewport.getBoundingClientRect()
  const hasTargetRegion = Boolean(targetRect && targetRect.width > 0 && targetRect.height > 0)
  const safeRegion = resolveViewportSafeRegion(viewportWidth.value, viewportHeight.value, props.viewportInsets)
  const regionLeft = hasTargetRegion ? targetRect!.left - viewportRect.left : safeRegion.left
  const regionTop = hasTargetRegion ? targetRect!.top - viewportRect.top : safeRegion.top
  const regionWidth = hasTargetRegion ? targetRect!.width : safeRegion.width
  const regionHeight = hasTargetRegion ? targetRect!.height : safeRegion.height
  const availableWidth = Math.max(1, regionWidth - VIEWPORT_FIT_PADDING * 2)
  const availableHeight = Math.max(1, regionHeight - VIEWPORT_FIT_PADDING * 2)
  const nextScale = clamp(
    Math.min(availableWidth / contentRect.width, availableHeight / contentRect.height),
    VIEWPORT_MIN_SCALE,
    VIEWPORT_MAX_SCALE,
  )

  stopZoomAnimation()
  panX.value = regionLeft + regionWidth / 2
    - getBaseOffsetXForScale(nextScale) - (contentRect.left + contentRect.width / 2) * nextScale
  panY.value = regionTop + regionHeight / 2
    - getBaseOffsetYForScale(nextScale) - (contentRect.top + contentRect.height / 2) * nextScale
  scale.value = nextScale
  targetPanX.value = panX.value
  targetPanY.value = panY.value
  targetScale.value = nextScale
}

function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  return normalizeViewportWheelDelta(deltaY, deltaMode, viewportHeight.value || window.innerHeight)
}

function getBaseOffsetXForScale(value: number): number {
  if (viewportWidth.value <= 0) {
    return 0
  }
  return (viewportWidth.value - props.face.width * value) / 2
}

function getBaseOffsetYForScale(value: number): number {
  if (viewportHeight.value <= 0) {
    return 0
  }
  return (viewportHeight.value - props.face.height * value) / 2
}

function startZoomAnimation() {
  if (zoomAnimationFrame !== null) {
    return
  }

  const animate = () => {
    const scaleDelta = targetScale.value - scale.value
    const panXDelta = targetPanX.value - panX.value
    const panYDelta = targetPanY.value - panY.value

    if (
      Math.abs(scaleDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON &&
      Math.abs(panXDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON &&
      Math.abs(panYDelta) < VIEWPORT_ZOOM_ANIMATION_EPSILON
    ) {
      scale.value = targetScale.value
      panX.value = targetPanX.value
      panY.value = targetPanY.value
      zoomAnimationFrame = null
      return
    }

    scale.value += scaleDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    panX.value += panXDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    panY.value += panYDelta * VIEWPORT_ZOOM_ANIMATION_SMOOTHING
    zoomAnimationFrame = requestAnimationFrame(animate)
  }

  zoomAnimationFrame = requestAnimationFrame(animate)
}

function stopZoomAnimation() {
  if (zoomAnimationFrame !== null) {
    cancelAnimationFrame(zoomAnimationFrame)
    zoomAnimationFrame = null
  }
  targetScale.value = scale.value
  targetPanX.value = panX.value
  targetPanY.value = panY.value
}

function handleBlockClick(blockId: string, event: MouseEvent) {
  emit('block-click', blockId, event)
}

function stepLayer(direction: -1 | 1, wholeLayer = false): void {
  layerViewRef.value?.stepLayer(direction, wholeLayer)
}

function focusLayerBlock(blockId: string): void {
  layerViewRef.value?.focusBlock(blockId)
}

function getFocusedLayerBlockId(): string | null {
  return layerViewRef.value?.getFocusedBlockId() ?? null
}

function cycleLayerByInitial(initial: string, currentLayerOnly = false): boolean {
  return layerViewRef.value?.cycleLayerByInitial(initial, currentLayerOnly) ?? false
}

function handleViewportPointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  if (target.closest('[data-block-id]') || target.closest('.selection-frame') || target.closest('.selection-handle')) {
    return
  }

  emit('blank-click', event as unknown as MouseEvent)
}

function startFaceDimensionDrag(dimension: FaceDimension, event: PointerEvent): void {
  if (event.button !== 0) return
  const startValue = dimension === 'width' ? props.face.width : props.face.height
  faceDimensionDrag.value = {
    dimension,
    startClientPosition: dimension === 'width' ? event.clientX : event.clientY,
    startValue,
    lastValue: startValue,
  }
  previousDimensionCursor = document.body.style.cursor
  document.body.style.cursor = dimension === 'width' ? 'ew-resize' : 'ns-resize'
  window.addEventListener('pointermove', handleFaceDimensionDrag)
  window.addEventListener('pointerup', stopFaceDimensionDrag)
  window.addEventListener('pointercancel', stopFaceDimensionDrag)
}

function handleFaceDimensionDrag(event: PointerEvent): void {
  const drag = faceDimensionDrag.value
  if (!drag) return
  const clientPosition = drag.dimension === 'width' ? event.clientX : event.clientY
  const directionalDelta = drag.dimension === 'width'
    ? clientPosition - drag.startClientPosition
    : drag.startClientPosition - clientPosition
  const rawValue = drag.startValue + directionalDelta / (scale.value || 1)
  const nextValue = Math.max(16, event.shiftKey
    ? Math.round(rawValue / 10) * 10
    : Math.round(rawValue))
  if (nextValue === drag.lastValue) return
  drag.lastValue = nextValue
  emit('face-dimension-change', { dimension: drag.dimension, value: nextValue, final: false })
}

function stopFaceDimensionDrag(): void {
  const drag = faceDimensionDrag.value
  faceDimensionDrag.value = null
  window.removeEventListener('pointermove', handleFaceDimensionDrag)
  window.removeEventListener('pointerup', stopFaceDimensionDrag)
  window.removeEventListener('pointercancel', stopFaceDimensionDrag)
  if (!drag) return
  document.body.style.cursor = previousDimensionCursor
  previousDimensionCursor = ''
  if (drag.lastValue === drag.startValue) return
  emit('face-dimension-change', { dimension: drag.dimension, value: drag.lastValue, final: true })
}

function getElementFrame(element: Element, viewportRect: DOMRect): SelectionFrame {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left - viewportRect.left,
    top: rect.top - viewportRect.top,
    width: rect.width,
    height: rect.height,
  }
}

async function refreshDiffOverlay(): Promise<void> {
  await nextTick()
  await nextTick()
  syncDiffOverlayHighlights()
  await nextTick()
  syncDiffOverlayHighlights()
}

function observeDiffOverlayStages(): void {
  diffOverlayMutationObserver?.disconnect()
  diffOverlayMutationObserver = null
  if (!props.comparison || typeof MutationObserver === 'undefined') return
  diffOverlayMutationObserver = new MutationObserver(() => {
    syncDiffOverlayHighlights()
  })
  for (const root of [stageRef.value, comparisonAfterStageRef.value]) {
    if (root) diffOverlayMutationObserver.observe(root, { childList: true, subtree: true, attributes: true })
  }
}

function escapeAttributeSelectorValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, character => `\\${character}`)
}

function syncDiffOverlayHighlights(): void {
  const viewport = viewportRef.value
  const comparison = props.comparison
  if (!viewport || !comparison) {
    if (diffOverlayHighlights.value.length > 0) diffOverlayHighlights.value = []
    return
  }
  const viewportRect = viewport.getBoundingClientRect()
  const layers = [
    { side: 'before', root: stageRef.value, highlights: comparison.before.diffHighlights ?? [] },
    { side: 'after', root: comparisonAfterStageRef.value, highlights: comparison.after.diffHighlights ?? [] },
  ] as const
  const nextHighlights: DiffOverlayHighlight[] = layers.flatMap(({ side, root, highlights }) => {
    if (!root) return []
    return highlights.flatMap(highlight => {
      const element = root.querySelector(`[data-block-id="${escapeAttributeSelectorValue(highlight.blockId)}"]`)
      if (!element) return []
      const frame = getElementFrame(element, viewportRect)
      return [{
        ...frame,
        key: `${side}:${highlight.blockId}`,
        kind: highlight.kind,
        icon: highlight.kind === 'added' ? 'action.add' : highlight.kind === 'removed' ? 'action.minus' : 'status.circle-medium',
        side,
        style: {
          left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px`,
        },
      }]
    })
  })
  if (!sameDiffOverlayHighlights(diffOverlayHighlights.value, nextHighlights)) {
    diffOverlayHighlights.value = nextHighlights
  }
}

function sameDiffOverlayHighlights(
  current: readonly DiffOverlayHighlight[],
  next: readonly DiffOverlayHighlight[],
): boolean {
  if (current.length !== next.length) return false
  return current.every((item, index) => {
    const candidate = next[index]
    return candidate !== undefined
      && item.key === candidate.key
      && item.left === candidate.left
      && item.top === candidate.top
      && item.width === candidate.width
      && item.height === candidate.height
      && item.kind === candidate.kind
      && item.side === candidate.side
  })
}

function measureSelection(): SelectionMeasurement | null {
  const viewport = viewportRef.value
  const stage = stageRef.value
  const selectedBlockId = props.selectedBlockId
  if (!viewport || !stage || !selectedBlockId) {
    return null
  }

  const selectedElement = stage.querySelector(`[data-block-id="${selectedBlockId}"]`)
  if (!selectedElement) {
    return null
  }

  const viewportRect = viewport.getBoundingClientRect()
  const selectedFrame = getElementFrame(selectedElement, viewportRect)

  const parentElement = props.selectedParentBlockId
    ? stage.querySelector(`[data-block-id="${props.selectedParentBlockId}"]`)
    : stage.querySelector('.card-canvas')

  if (!parentElement) {
    return null
  }

  const parentFrame = getElementFrame(parentElement, viewportRect)
  const safeScale = scale.value || 1
  return {
    frame: selectedFrame,
    parentFrame,
    worldRect: {
      left: (selectedFrame.left - parentFrame.left) / safeScale,
      top: (selectedFrame.top - parentFrame.top) / safeScale,
      width: selectedFrame.width / safeScale,
      height: selectedFrame.height / safeScale,
    },
    parentWorldWidth: parentFrame.width / safeScale,
    parentWorldHeight: parentFrame.height / safeScale,
  }
}

function readAlignmentSnapDistances(): AlignmentSnapDistances | null {
  if (!props.alignmentSnappingEnabled) return null
  const viewport = viewportRef.value
  if (!viewport) return null
  const styles = getComputedStyle(viewport)
  const enterPixels = Number.parseFloat(styles.getPropertyValue('--oc-viewport-alignment-snap-distance'))
  const releasePixels = Number.parseFloat(styles.getPropertyValue('--oc-viewport-alignment-snap-release-distance'))
  const safeScale = scale.value || 1
  if (!Number.isFinite(enterPixels) || !Number.isFinite(releasePixels)
    || enterPixels <= 0 || releasePixels < enterPixels) return null
  return { enter: enterPixels / safeScale, release: releasePixels / safeScale }
}

function measureAlignmentSnapTargets(measurement: SelectionMeasurement): ResizeSnapTarget[] {
  if (!props.alignmentSnappingEnabled || resizeMode.value !== 'absolute') return []
  const stage = stageRef.value
  const selectedBlockId = props.selectedBlockId
  if (!stage || !selectedBlockId) return []

  const targets: ResizeSnapTarget[] = [{
    id: props.selectedParentBlockId ?? props.face.id,
    kind: 'parent',
    rect: {
      left: 0,
      top: 0,
      width: measurement.parentWorldWidth,
      height: measurement.parentWorldHeight,
    },
  }]
  const safeScale = scale.value || 1
  for (const block of directSiblingBlocks()) {
    if (!block.visible || block.id === selectedBlockId) continue
    const element = [...stage.querySelectorAll<HTMLElement>('[data-block-id]')]
      .find(candidate => candidate.dataset.blockId === block.id)
    if (!element) continue
    const frame = getElementFrame(element, viewportRef.value!.getBoundingClientRect())
    targets.push({
      id: block.id,
      kind: 'sibling',
      rect: {
        left: (frame.left - measurement.parentFrame.left) / safeScale,
        top: (frame.top - measurement.parentFrame.top) / safeScale,
        width: frame.width / safeScale,
        height: frame.height / safeScale,
      },
    })
  }
  return targets
}

function directSiblingBlocks(): readonly RenderReadyCardBlock[] {
  const parentId = props.selectedParentBlockId
  if (!parentId) return props.face.children.map(child => child.block)
  const parent = findRenderBlock(props.face.children.map(child => child.block), parentId)
  return parent && (parent.type === 'simple-container-block' || parent.type === 'flow-container-block')
    ? parent.children.map(child => child.block) : []
}

function findRenderBlock(blocks: readonly RenderReadyCardBlock[], blockId: string): RenderReadyCardBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block
    if (block.type !== 'simple-container-block' && block.type !== 'flow-container-block') continue
    const match = findRenderBlock(block.children.map(child => child.block), blockId)
    if (match) return match
  }
  return null
}

function requestSelectionFrameSync() {
  if (selectionSyncInFlight) {
    selectionSyncAgain = true
    return
  }
  if (selectionSyncScheduled) return
  selectionSyncScheduled = true
  void nextTick().then(async () => {
    selectionSyncScheduled = false
    selectionSyncInFlight = true
    try {
      await syncSelectionFrame()
    } finally {
      selectionSyncInFlight = false
      if (selectionSyncAgain) {
        selectionSyncAgain = false
        requestSelectionFrameSync()
      }
    }
  })
}

async function syncSelectionFrame() {
  await nextTick()
  if (props.comparison) {
    observeDiffOverlayStages()
    await nextTick()
  }
  syncDiffOverlayHighlights()
  const measurement = measureSelection()
  const nextFrame = measurement?.frame ?? null
  if (!sameSelectionFrame(selectionFrame.value, nextFrame)) selectionFrame.value = nextFrame
}

function sameSelectionFrame(current: SelectionFrame | null, next: SelectionFrame | null): boolean {
  if (current === next) return true
  if (!current || !next) return false
  return current.left === next.left
    && current.top === next.top
    && current.width === next.width
    && current.height === next.height
}

function startResize(handle: ResizeHandle) {
  if (resizeMode.value === 'none' || isMovingSelection.value) {
    return
  }

  const measurement = measureSelection()
  if (!measurement) {
    return
  }

  activeHandle.value = handle
  isMovingSelection.value = false
  dragMeasurement.value = measurement
  previewWorldRect.value = { ...measurement.worldRect }
  rawPreviewWorldRect.value = { ...measurement.worldRect }
  alignmentSnapTargets.value = measureAlignmentSnapTargets(measurement)
  alignmentSnapLocks.value = {}
  alignmentSnapDistances.value = readAlignmentSnapDistances()
  transformBlockId.value = props.selectedBlockId
  selectionFrame.value = measurement.frame
  lastTransformClientPosition.value = null

  bindTransformListeners()
}

function startMove() {
  if (!showMoveHandle.value || activeHandle.value || isMovingSelection.value) {
    return
  }

  const measurement = measureSelection()
  if (!measurement) {
    return
  }

  activeHandle.value = null
  isMovingSelection.value = true
  dragMeasurement.value = measurement
  previewWorldRect.value = { ...measurement.worldRect }
  rawPreviewWorldRect.value = { ...measurement.worldRect }
  alignmentSnapTargets.value = measureAlignmentSnapTargets(measurement)
  alignmentSnapLocks.value = {}
  alignmentSnapDistances.value = readAlignmentSnapDistances()
  transformBlockId.value = props.selectedBlockId
  selectionFrame.value = measurement.frame
  lastTransformClientPosition.value = null

  bindTransformListeners()
}

function handleSelectionFramePointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  event.stopPropagation()
  event.preventDefault()

  const target = event.target
  if (target instanceof Element && target.closest('.selection-handle')) {
    return
  }

  if (!showMoveHandle.value) {
    return
  }

  startMove()
}

function bindTransformListeners() {
  window.addEventListener('pointermove', handleTransformMove)
  window.addEventListener('pointerup', stopTransform)
  window.addEventListener('pointercancel', stopTransform)
}

function handleTransformMove(event: PointerEvent) {
  const measurement = dragMeasurement.value
  const preview = previewWorldRect.value
  const rawPreview = rawPreviewWorldRect.value
  if (!measurement || !preview || !rawPreview) {
    return
  }

  const previousClientPosition = lastTransformClientPosition.value ?? { x: event.clientX, y: event.clientY }
  const deltaX = (event.clientX - previousClientPosition.x) / (scale.value || 1)
  const deltaY = (event.clientY - previousClientPosition.y) / (scale.value || 1)
  lastTransformClientPosition.value = { x: event.clientX, y: event.clientY }
  let interactionPreview = rawPreview

  if (isMovingSelection.value) {
    rawPreview.left += deltaX
    rawPreview.top += deltaY
  } else if (activeHandle.value) {
    const flowHorizontal = resizeMode.value === 'flow'
      && (props.selectedParentFlowDirection === 'lr' || props.selectedParentFlowDirection === 'rl')
    const centeredFlowCrossAxis = resizeMode.value === 'flow' && props.selectedFlowAlign === 'center'
    switch (activeHandle.value) {
      case 'lt':
        rawPreview.left += deltaX
        rawPreview.top += deltaY
        rawPreview.width -= deltaX
        rawPreview.height -= deltaY
        break
      case 'rt':
        rawPreview.top += deltaY
        rawPreview.width += deltaX
        rawPreview.height -= deltaY
        break
      case 'lb':
        rawPreview.left += deltaX
        rawPreview.width -= deltaX
        rawPreview.height += deltaY
        break
      case 'rb':
        rawPreview.width += deltaX
        rawPreview.height += deltaY
        break
      case 'l':
        rawPreview.left += deltaX
        rawPreview.width -= centeredFlowCrossAxis && !flowHorizontal ? deltaX * 2 : deltaX
        break
      case 'r':
        if (centeredFlowCrossAxis && !flowHorizontal) rawPreview.left -= deltaX
        rawPreview.width += centeredFlowCrossAxis && !flowHorizontal ? deltaX * 2 : deltaX
        break
      case 't':
        rawPreview.top += deltaY
        rawPreview.height -= centeredFlowCrossAxis && flowHorizontal ? deltaY * 2 : deltaY
        break
      case 'b':
        if (centeredFlowCrossAxis && flowHorizontal) rawPreview.top -= deltaY
        rawPreview.height += centeredFlowCrossAxis && flowHorizontal ? deltaY * 2 : deltaY
        break
    }
    interactionPreview = constrainResizePreview(
      rawPreview,
      activeHandle.value,
      centeredFlowCrossAxis,
      flowHorizontal,
    )
  }

  // 按住 Shift 就是等比：文本流里高度由内容决定，等比没有意义，所以这条路不参与。
  const proportionalResize = resizeMode.value === 'absolute' && event.shiftKey && activeHandle.value !== null

  if (props.alignmentSnappingEnabled && isMovingSelection.value && alignmentSnapDistances.value) {
    const snapped = snapMoveRect({
      rect: interactionPreview,
      targets: alignmentSnapTargets.value,
      enterDistance: alignmentSnapDistances.value.enter,
      releaseDistance: alignmentSnapDistances.value.release,
      previousLocks: alignmentSnapLocks.value,
    })
    Object.assign(preview, snapped.rect)
    alignmentSnapLocks.value = snapped.locks
  } else if (proportionalResize && activeHandle.value && alignmentSnapDistances.value) {
    const constrained = constrainProportionalResize(
      interactionPreview,
      activeHandle.value,
      measurement.worldRect,
      {
        targets: alignmentSnapTargets.value,
        distances: alignmentSnapDistances.value,
        previousLocks: alignmentSnapLocks.value,
      },
    )
    Object.assign(preview, constrained.rect)
    alignmentSnapLocks.value = constrained.locks
  } else if (props.alignmentSnappingEnabled
    && activeHandle.value
    && resizeMode.value === 'absolute'
    && alignmentSnapDistances.value) {
    const snapped = snapResizeRect({
      rect: interactionPreview,
      handle: activeHandle.value,
      targets: alignmentSnapTargets.value,
      enterDistance: alignmentSnapDistances.value.enter,
      releaseDistance: alignmentSnapDistances.value.release,
      previousLocks: alignmentSnapLocks.value,
      minSize: MIN_SELECTION_SIZE,
    })
    Object.assign(preview, snapped.rect)
    alignmentSnapLocks.value = snapped.locks
  } else {
    Object.assign(
      preview,
      proportionalResize && activeHandle.value
        ? constrainResizeToRatio(interactionPreview, activeHandle.value, measurement.worldRect)
        : interactionPreview,
    )
    alignmentSnapLocks.value = {}
  }

  selectionFrame.value = {
    left: measurement.parentFrame.left + preview.left * scale.value,
    top: measurement.parentFrame.top + preview.top * scale.value,
    width: preview.width * scale.value,
    height: preview.height * scale.value,
  }
}

function buildAbsoluteResizePayload(preview: SelectionFrame, measurement: SelectionMeasurement): AbsoluteResizePayload {
  const anchor = props.selectedAnchor ?? 'lt'
  const horizontalAnchor = anchor[0]
  const verticalAnchor = anchor[1]
  const left = preview.left
  const top = preview.top
  const right = preview.left + preview.width
  const bottom = preview.top + preview.height

  let x = left
  if (horizontalAnchor === 'c') {
    x = left + preview.width / 2 - measurement.parentWorldWidth / 2
  } else if (horizontalAnchor === 'r') {
    x = measurement.parentWorldWidth - right
  }

  let y = top
  if (verticalAnchor === 'c') {
    y = top + preview.height / 2 - measurement.parentWorldHeight / 2
  } else if (verticalAnchor === 'b') {
    y = measurement.parentWorldHeight - bottom
  }

  return {
    width: preview.width,
    height: preview.height,
    x,
    y,
  }
}

function buildMovePayload(preview: SelectionFrame, measurement: SelectionMeasurement): MovePayload {
  const absolutePayload = buildAbsoluteResizePayload(preview, measurement)
  return {
    x: absolutePayload.x ?? 0,
    y: absolutePayload.y ?? 0,
  }
}

function hasMeaningfulResizeChange(preview: SelectionFrame, measurement: SelectionMeasurement): boolean {
  const resizePayload = buildAbsoluteResizePayload(preview, measurement)
  return (
    Math.abs(preview.width - measurement.worldRect.width) > TRANSFORM_EPSILON ||
    Math.abs(preview.height - measurement.worldRect.height) > TRANSFORM_EPSILON ||
    Math.abs((resizePayload.x ?? 0) - buildAbsoluteResizePayload(measurement.worldRect, measurement).x!) > TRANSFORM_EPSILON ||
    Math.abs((resizePayload.y ?? 0) - buildAbsoluteResizePayload(measurement.worldRect, measurement).y!) > TRANSFORM_EPSILON
  )
}

function hasMeaningfulMoveChange(preview: SelectionFrame, measurement: SelectionMeasurement): boolean {
  const movePayload = buildMovePayload(preview, measurement)
  const originalPayload = buildMovePayload(measurement.worldRect, measurement)
  return (
    Math.abs(movePayload.x - originalPayload.x) > TRANSFORM_EPSILON ||
    Math.abs(movePayload.y - originalPayload.y) > TRANSFORM_EPSILON
  )
}

function stopTransform() {
  const measurement = dragMeasurement.value
  const preview = previewWorldRect.value
  const blockId = transformBlockId.value
  if (measurement && preview && blockId) {
    if (activeHandle.value && hasMeaningfulResizeChange(preview, measurement)) {
      const payload = resizeMode.value === 'flow'
        ? buildFlowResizePayload(preview, activeHandle.value)
        : buildAbsoluteResizePayload(preview, measurement)
      emit('resize-selection', { blockId, ...payload })
    } else if (isMovingSelection.value && hasMeaningfulMoveChange(preview, measurement)) {
      emit('move-selection', { blockId, ...buildMovePayload(preview, measurement) })
    }
  }

  activeHandle.value = null
  isMovingSelection.value = false
  dragMeasurement.value = null
  previewWorldRect.value = null
  rawPreviewWorldRect.value = null
  alignmentSnapTargets.value = []
  alignmentSnapLocks.value = {}
  alignmentSnapDistances.value = null
  transformBlockId.value = null
  lastTransformClientPosition.value = null
  window.removeEventListener('pointermove', handleTransformMove)
  window.removeEventListener('pointerup', stopTransform)
  window.removeEventListener('pointercancel', stopTransform)
  requestSelectionFrameSync()
}

/** 等比缩放的最小缩放系数：两条边都不能小于最小选择尺寸。 */
function minProportionalScale(start: SelectionFrame): number {
  const smaller = Math.min(start.width, start.height)
  return smaller > 0 ? MIN_SELECTION_SIZE / smaller : 1
}

/**
 * 按住 Shift 缩放＝等比缩放：保持按下那一刻的宽高比。
 * 跟手的是**比较长的那条边**（拖边时就是那条边自己）：整段拖拽只有一个轴在跟指针，
 * 不会拖到一半换轴、来回抖；另一条边按比例跟上。对角的那个角（边手柄是另一条边）留在原处，
 * 自由的那一轴就地居中，手感就是"整块按比例放大缩小"。
 */
function constrainResizeToRatio(
  raw: SelectionFrame,
  handle: ResizeHandle,
  start: SelectionFrame,
): SelectionFrame {
  if (start.width <= 0 || start.height <= 0) return raw

  const widthDriven = handle === 'l' || handle === 'r'
    || (handle !== 't' && handle !== 'b' && start.width >= start.height)
  const proposed = (widthDriven ? raw.width : raw.height) / (widthDriven ? start.width : start.height)
  return proportionalResizeRect(start, handle, Math.max(minProportionalScale(start), proposed))
}

/** 由一个缩放系数算出等比缩放后的矩形；锚点、居中与最小尺寸都归这里管。 */
function proportionalResizeRect(start: SelectionFrame, handle: ResizeHandle, scale: number): SelectionFrame {
  const width = start.width * scale
  const height = start.height * scale
  const right = start.left + start.width
  const bottom = start.top + start.height
  const anchoredLeft = handle === 'rt' || handle === 'rb' || handle === 'r'
  const anchoredTop = handle === 'lb' || handle === 'rb' || handle === 'b'
  return {
    left: anchoredLeft
      ? start.left
      : handle === 't' || handle === 'b'
        ? start.left + (start.width - width) / 2
        : right - width,
    top: anchoredTop
      ? start.top
      : handle === 'l' || handle === 'r'
        ? start.top + (start.height - height) / 2
        : bottom - height,
    width,
    height,
  }
}

/** 让某条边精确落在吸附目标上所需的缩放系数；小于最小尺寸就作废（那会把块缩没）。 */
function proportionalScaleForLock(lock: ResizeSnapLock, start: SelectionFrame): number | null {
  const horizontal = lock.axis === 'x'
  const dimension = horizontal ? start.width : start.height
  if (dimension <= 0) return null
  const anchor = horizontal
    ? (lock.movingEdge === 'left' ? start.left + start.width : start.left)
    : (lock.movingEdge === 'top' ? start.top + start.height : start.top)
  const grows = lock.movingEdge === 'right' || lock.movingEdge === 'bottom'
  const scale = (grows ? lock.position - anchor : anchor - lock.position) / dimension
  return Number.isFinite(scale) && scale >= minProportionalScale(start) ? scale : null
}

/**
 * 等比缩放里的吸附。等比只有一个自由度，两条边不可能各自都吸在自己的目标上，所以：
 * 先按比例约束出预览（跟手那条边就是鼠标位置，另一条边由比例决定），再拿**这个预览**去各轴找目标
 * —— 找的必须是被比例约束之后的边，否则算出来的目标离实际边很远，一吸就是一次大跳。
 * 最后挑一条（离目标更近的那条，跟手的那条在同样近时优先），用它的目标位置反算缩放系数：
 * 比例不变、那条边精确落在线上；另一条边的锁丢掉 —— 留着只会把引导线画在一条其实没吸上的边上。
 */
function constrainProportionalResize(
  raw: SelectionFrame,
  handle: ResizeHandle,
  start: SelectionFrame,
  snap: {
    targets: readonly ResizeSnapTarget[]
    distances: { enter: number; release: number }
    previousLocks: ResizeSnapLocks
  },
): { rect: SelectionFrame; locks: ResizeSnapLocks } {
  const proportional = constrainResizeToRatio(raw, handle, start)
  const snapped = snapResizeRect({
    rect: proportional,
    handle,
    targets: snap.targets,
    enterDistance: snap.distances.enter,
    releaseDistance: snap.distances.release,
    previousLocks: snap.previousLocks,
    minSize: MIN_SELECTION_SIZE,
  })

  const driverAxis: 'x' | 'y' = handle === 'l' || handle === 'r'
    ? 'x'
    : handle === 't' || handle === 'b' ? 'y' : start.width >= start.height ? 'x' : 'y'
  let chosen: ResizeSnapLock | null = null
  let chosenDistance = Number.POSITIVE_INFINITY
  let chosenScale: number | null = null
  for (const axis of ['x', 'y'] as const) {
    const lock = snapped.locks[axis]
    if (!lock) continue
    const scale = proportionalScaleForLock(lock, start)
    if (scale === null) continue
    const distance = Math.abs((axis === 'x'
      ? lock.movingEdge === 'left' ? proportional.left : proportional.left + proportional.width
      : lock.movingEdge === 'top' ? proportional.top : proportional.top + proportional.height) - lock.position)
    const preferred = axis === driverAxis
    if (distance < chosenDistance || (distance === chosenDistance && preferred)) {
      chosen = lock
      chosenDistance = distance
      chosenScale = scale
    }
  }

  if (!chosen || chosenScale === null) return { rect: proportional, locks: {} }
  return {
    rect: proportionalResizeRect(start, handle, chosenScale),
    locks: { [chosen.axis]: chosen },
  }
}

function constrainResizePreview(
  raw: SelectionFrame,
  handle: ResizeHandle,
  centeredFlowCrossAxis: boolean,
  flowHorizontal: boolean,
): SelectionFrame {
  const constrained = { ...raw }
  if (constrained.width < MIN_SELECTION_SIZE) {
    if (centeredFlowCrossAxis && !flowHorizontal) {
      constrained.left += (constrained.width - MIN_SELECTION_SIZE) / 2
    } else if (handle === 'lt' || handle === 'lb' || handle === 'l') {
      constrained.left -= MIN_SELECTION_SIZE - constrained.width
    }
    constrained.width = MIN_SELECTION_SIZE
  }
  if (constrained.height < MIN_SELECTION_SIZE) {
    if (centeredFlowCrossAxis && flowHorizontal) {
      constrained.top += (constrained.height - MIN_SELECTION_SIZE) / 2
    } else if (handle === 'lt' || handle === 'rt' || handle === 't') {
      constrained.top -= MIN_SELECTION_SIZE - constrained.height
    }
    constrained.height = MIN_SELECTION_SIZE
  }
  return constrained
}

function buildFlowResizePayload(preview: SelectionFrame, handle: ResizeHandle): ResizePayload {
  const changesWidth = handle === 'l' || handle === 'r'
  const changesHeight = handle === 't' || handle === 'b'
  return {
    ...(changesWidth ? { width: preview.width } : {}),
    ...(changesHeight ? { height: preview.height } : {}),
  }
}

function updateViewportSize() {
  const viewport = viewportRef.value
  if (!viewport) return

  const width = viewport.clientWidth
  const height = viewport.clientHeight
  if (width === viewportWidth.value && height === viewportHeight.value) return

  viewportWidth.value = width
  viewportHeight.value = height
  emit('viewport-size-change', { width, height })
}

watch(
  () => [panX.value, panY.value, scale.value] as const,
  ([x, y, zoomScale]) => {
    const nextTransform = {
      x,
      y,
      scale: zoomScale,
    }
    if (hasSameViewportTransform(lastEmittedTransform, nextTransform)) {
      return
    }

    lastEmittedTransform = nextTransform
    pendingTransformEchoes.push(nextTransform)
    if (pendingTransformEchoes.length > 8) {
      pendingTransformEchoes.shift()
    }
    emit('viewport-transform-change', nextTransform)
  },
)

watch(
  () => props.restoreKey,
  () => {
    pendingTransformEchoes = []
    applyViewportTransform(props.transform)
    lastEmittedTransform = {
      x: panX.value,
      y: panY.value,
      scale: scale.value,
    }
    requestSelectionFrameSync()
  },
)

watch(
  () => props.transform,
  (nextTransform) => {
    const echoIndex = nextTransform
      ? pendingTransformEchoes.findIndex((candidate) => hasSameViewportTransform(candidate, nextTransform))
      : -1
    if (echoIndex >= 0) {
      pendingTransformEchoes.splice(0, echoIndex + 1)
      return
    }

    if (
      !nextTransform
      || hasSameViewportTransform({
        x: panX.value,
        y: panY.value,
        scale: scale.value,
      }, nextTransform)
    ) {
      return
    }

    pendingTransformEchoes = []
    stopZoomAnimation()
    applyViewportTransform(nextTransform)
    lastEmittedTransform = { ...nextTransform }
    requestSelectionFrameSync()
  },
  { deep: true },
)

onMounted(() => {
  applyViewportTransform(props.transform)
  lastEmittedTransform = {
    x: panX.value,
    y: panY.value,
    scale: scale.value,
  }
  updateViewportSize()

  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateViewportSize()
      requestSelectionFrameSync()
    })
    resizeObserver.observe(viewportRef.value)
  }

  requestSelectionFrameSync()
  void nextTick().then(observeDiffOverlayStages)
})

onBeforeUnmount(() => {
  visualReadiness.dispose()
  stopTransform()
  stopFaceDimensionDrag()
  stopZoomAnimation()
  resizeObserver?.disconnect()
  resizeObserver = null
  diffOverlayMutationObserver?.disconnect()
  diffOverlayMutationObserver = null
  statusFlash.value = null
})

function flashStatus(status: CardViewportStatusFlash): void {
  statusFlashSequence += 1
  statusFlash.value = { ...status, sequence: statusFlashSequence }
}

function finishStatusFlash(sequence: number): void {
  if (statusFlash.value?.sequence === sequence) statusFlash.value = null
}

defineExpose({
  zoomBy,
  zoomByWheelAt,
  resetView,
  fitView,
  fitBottomRightHalfView,
  fitContent,
  nudgeSelection,
  runSelectionQuickAction,
  stepLayer,
  focusLayerBlock,
  getFocusedLayerBlockId,
  cycleLayerByInitial,
  flashStatus,
  refreshDiffOverlay,
})

watch(
  () => [
    props.selectedBlockId,
    props.selectedParentBlockId,
    props.selectedLocationType,
    props.selectedAnchor,
    props.transformDisabledBlockIds.join('|'),
    scale.value,
    translateX.value,
    translateY.value,
  ],
  () => {
    if (activeHandle.value || isMovingSelection.value) {
      return
    }
    requestSelectionFrameSync()
  }
)

watch(
  () => props.comparison,
  async () => {
    if (!props.comparison) {
      diffOverlayVisible.value = false
      diffOverlayHighlights.value = []
      return
    }

    diffOverlayVisible.value = false
    await nextTick()
    await nextTick()
    observeDiffOverlayStages()
    syncDiffOverlayHighlights()
    await nextTick()
    diffOverlayVisible.value = true
  },
  { deep: true },
)

watch(
  () => props.face,
  () => {
    if (activeHandle.value || isMovingSelection.value) {
      return
    }
    requestSelectionFrameSync()
  },
  { deep: true }
)
</script>

<style scoped>
.card-viewport--readonly .card-viewport-stage { pointer-events: none; }
.card-diff-overlay-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 1;
  transition: opacity var(--oc-duration-fast) var(--oc-ease);
}

.card-diff-overlay-layer.is-hidden {
  opacity: 0;
}

.card-diff-overlay {
  position: absolute;
  z-index: var(--oc-z-overlay-toolbar);
  box-sizing: border-box;
  border: var(--oc-border-width) solid var(--oc-diff-changed-border);
  border-radius: var(--oc-radius-sm);
  pointer-events: none;
}
.card-diff-overlay--added { border-color: var(--oc-diff-added-border); }
.card-diff-overlay--removed { border-color: var(--oc-diff-removed-border); }
.card-diff-overlay__label {
  position: absolute;
  top: calc(var(--oc-border-width) * -1);
  left: calc(var(--oc-border-width) * -1);
  display: grid;
  width: var(--oc-icon-size-md);
  height: var(--oc-icon-size-md);
  place-items: center;
  border-radius: var(--oc-radius-sm) 0 var(--oc-radius-sm) 0;
  background: var(--oc-diff-changed-border);
  color: var(--oc-fg-default);
}
.card-diff-overlay--added .card-diff-overlay__label { background: var(--oc-diff-added-border); }
.card-diff-overlay--removed .card-diff-overlay__label { background: var(--oc-diff-removed-border); }
.card-diff-overlay--after .card-diff-overlay__label {
  right: calc(var(--oc-border-width) * -1);
  left: auto;
  border-radius: 0 var(--oc-radius-sm) 0 var(--oc-radius-sm);
}
.card-diff-overlay--before { border-top-left-radius: 0; }
.card-diff-overlay--after { border-top-right-radius: 0; }
.card-diff-overlay__label .oc-icon { flex: none; }

.card-diff-hover-link {
  position: absolute;
  inset: 0;
  z-index: var(--oc-z-overlay-toolbar);
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.card-diff-hover-link path {
  fill: none;
  stroke: var(--oc-diff-changed-border);
  stroke-width: var(--oc-border-width);
  stroke-linecap: round;
  stroke-dasharray: var(--oc-space-1) var(--oc-space-1);
  marker-end: url(#card-diff-hover-arrow);
}

.card-diff-hover-link marker path {
  fill: var(--oc-diff-changed-border);
  stroke: none;
}

.card-viewport-comparison-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.card-viewport-comparison-layer.is-transitioning {
  transition: clip-path var(--oc-duration-normal) var(--oc-ease);
}

.card-viewport-comparison-layer .card-viewport-stage.is-transitioning {
  transition: transform var(--oc-duration-normal) var(--oc-ease);
}

.card-comparison-placeholder {
  position: absolute;
  inset: 0 auto auto 0;
  box-sizing: border-box;
  border: calc(var(--oc-border-width) * var(--oc-viewport-inverse-scale, 1)) dashed var(--oc-fg-default);
  background: transparent;
  pointer-events: none;
}

.card-viewport-comparison-divider {
  position: absolute;
  z-index: 0;
  width: var(--oc-size-sm);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translateX(-50%);
  cursor: ew-resize;
  touch-action: none;
  transition: left var(--oc-duration-normal) var(--oc-ease);
}

.card-viewport-comparison-divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: var(--oc-diff-divider-width);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-diff-divider);
  transform: translateX(-50%);
}

.card-viewport-comparison-divider:focus-visible::before {
  box-shadow: var(--oc-focus-ring);
}

.card-viewport-comparison-label {
  position: absolute;
  top: var(--oc-space-2);
  display: block;
  max-width: var(--oc-diff-version-label-max-width);
  overflow: hidden;
  color: var(--oc-fg-muted);
  font: var(--oc-text-xs);
  font-family: var(--oc-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.card-viewport-comparison-label--before {
  right: calc(50% + var(--oc-space-2));
  text-align: right;
}

.card-viewport-comparison-label--after {
  left: calc(50% + var(--oc-space-2));
  text-align: left;
}

.card-viewport-comparison-divider.is-static { cursor: default; pointer-events: none; }
.card-viewport-comparison-divider.is-dragging { transition: none; }
.card-viewport {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background-color: var(--oc-bg-raised);
  background-image: var(--oc-viewport-dot-pattern);
  background-size: var(--oc-viewport-dot-size);
  background-position: var(--oc-viewport-dot-position);
  cursor: default;
}

.card-viewport-panning {
  cursor: grabbing;
}

.card-viewport-status-flash {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  display: inline-flex;
  width: var(--oc-viewport-status-size);
  aspect-ratio: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-3);
  max-width: calc(100% - var(--oc-space-8) * 2);
  padding: var(--oc-space-5);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-md);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-sm);
  pointer-events: none;
  animation: card-viewport-status-flash var(--oc-viewport-status-duration) var(--oc-ease) both;
}

.card-viewport-status-flash > span {
  width: 100%;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: normal;
}

@keyframes card-viewport-status-flash {
  0% {
    opacity: 0;
    transform: translate(-50%, calc(-50% + var(--oc-space-2)));
  }
  20%, 75% {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, calc(-50% - var(--oc-space-2)));
  }
}

.card-viewport-stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity var(--oc-duration-fast) var(--oc-ease);
}

.card-viewport--layer-view .card-viewport-stage {
  opacity: 0;
  pointer-events: none;
}

.card-viewport-stage :deep([data-block-id]) {
  pointer-events: auto;
}

.card-viewport--layer-view .card-viewport-stage :deep([data-block-id]) {
  pointer-events: none;
}

.card-viewport-info {
  position: absolute;
  top: 0;
  width: 228px;
  transform-origin: top left;
  pointer-events: auto;
}

.card-info-fade-enter-active {
  transition: opacity 140ms ease-out;
}

.card-info-fade-leave-active {
  transition: opacity 100ms ease-in;
  pointer-events: none;
}

.card-info-fade-enter-from,
.card-info-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .card-viewport-stage {
    transition: none;
  }

  .card-viewport-status-flash {
    animation-timing-function: linear;
  }
}

.card-viewport-left-info,
.card-viewport-bottom-info {
  position: absolute;
  transform-origin: center;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
}

.card-viewport-left-info {
  cursor: ns-resize;
}

.card-viewport-bottom-info {
  cursor: ew-resize;
}

.card-viewport-dimension-line {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--oc-fg-default);
}

.card-viewport-dimension-line--horizontal {
  height: 16px;
}

.card-viewport-dimension-line--vertical {
  width: 16px;
}

.card-viewport-dimension-line::before,
.card-viewport-dimension-line::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 50%;
  height: 1px;
  background: currentColor;
  opacity: 0.34;
  transform: translateY(-50%);
  transition: opacity 140ms ease-out;
}

.card-viewport-dimension-line::after {
  inset: 3px 0;
  width: 100%;
  height: auto;
  border-inline: 1px solid currentColor;
  background: transparent;
  transform: none;
}

.card-viewport-dimension-line--vertical::before {
  inset: 0 auto;
  left: 50%;
  width: 1px;
  height: auto;
  transform: translateX(-50%);
}

.card-viewport-dimension-line--vertical::after {
  inset: 0 3px;
  width: auto;
  height: 100%;
  border-block: 1px solid currentColor;
  border-inline: 0;
}

.card-viewport-left-info:hover .card-viewport-dimension-line::before,
.card-viewport-left-info:hover .card-viewport-dimension-line::after,
.card-viewport-bottom-info:hover .card-viewport-dimension-line::before,
.card-viewport-bottom-info:hover .card-viewport-dimension-line::after,
.card-viewport-left-info:hover .card-viewport-dimension-label,
.card-viewport-bottom-info:hover .card-viewport-dimension-label {
  opacity: 1;
}

.card-viewport-dimension-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  padding: 0 5px;
  background: var(--oc-bg-raised);
  opacity: 0.34;
  transition: opacity 140ms ease-out;
}

.card-viewport-dimension-line--vertical .card-viewport-dimension-label {
  transform: rotate(-90deg);
}

.card-selection-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.selection-alignment-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  color: var(--oc-accent);
  pointer-events: none;
}

.selection-alignment-guides line {
  stroke: currentColor;
  stroke-width: var(--oc-border-width);
  vector-effect: non-scaling-stroke;
}

.selection-anchor-guide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  color: var(--oc-accent);
  pointer-events: none;
}

.selection-anchor-guide polyline {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke;
}

.selection-anchor-guide-diagonal {
  stroke: currentColor;
  stroke-width: 1.25;
  vector-effect: non-scaling-stroke;
}

.selection-anchor-guide circle,
.selection-anchor-guide marker path {
  fill: currentColor;
}

.selection-anchor-guide-label {
  fill: var(--oc-fg-default);
  stroke: var(--oc-bg-raised);
  stroke-width: 5px;
  paint-order: stroke fill;
  font-size: var(--oc-text-xs);
  font-variant-numeric: tabular-nums;
  text-anchor: middle;
  dominant-baseline: central;
}

.selection-anchor-badge {
  position: absolute;
  z-index: 2;
  padding: 2px 4px;
  border: 1px solid var(--oc-accent);
  border-radius: 3px;
  background: var(--oc-bg-raised);
  color: var(--oc-fg-accent);
  font-size: var(--oc-text-xs);
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  transform: translateY(-50%);
}

.selection-frame {
  position: absolute;
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--oc-accent-glow);
  pointer-events: none;
  animation: selection-frame-enter 140ms ease-out;
  transition: box-shadow 100ms ease-out;
}

.selection-frame-movable {
  pointer-events: auto;
  cursor: move;
}

.selection-frame.is-resizing {
  box-shadow: 0 0 0 1px var(--oc-accent), 0 0 0 3px var(--oc-accent-glow);
}

.selection-frame.is-moving {
  box-shadow: 0 0 0 1px var(--oc-accent), 0 0 0 3px var(--oc-accent-glow);
}

.selection-quick-actions {
  position: absolute;
  left: calc(var(--oc-border-width) * -1);
  bottom: calc(100% + var(--oc-floating-surface-gap));
  z-index: var(--oc-z-overlay-toolbar);
  pointer-events: auto;
}

.selection-block-info {
  position: absolute;
  top: 0;
  left: calc(100% + 12px);
  z-index: 2;
  display: flex;
  width: max-content;
  max-width: min(240px, 35vw);
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--oc-fg-default);
  cursor: default;
  font-size: var(--oc-text-xs);
  line-height: 1.45;
  pointer-events: auto;
  transform-origin: left top;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}

.selection-block-info:hover {
  border-color: var(--oc-border-default);
  background: color-mix(in srgb, var(--oc-bg-raised) 94%, transparent);
}

.selection-block-info__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.selection-block-info__title > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-block-info__notes {
  overflow-wrap: anywhere;
  color: var(--oc-fg-muted);
  white-space: pre-wrap;
}

.selection-info-fade-enter-active {
  transition: opacity 140ms ease-out, transform 140ms cubic-bezier(.2, .8, .2, 1);
}

.selection-info-fade-leave-active {
  transition: opacity 100ms ease-in, transform 100ms ease-in;
}

.selection-info-fade-enter-from,
.selection-info-fade-leave-to {
  opacity: 0;
  transform: scale(.94);
}

.selection-size-label {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  min-height: 20px;
  padding: 2px 6px;
  border: 1px solid var(--oc-accent);
  background: color-mix(in srgb, var(--oc-bg-raised) 94%, transparent);
  box-shadow: 0 0 0 2px var(--oc-accent-glow);
  color: var(--oc-fg-accent);
  font-size: var(--oc-text-xs);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  pointer-events: none;
}

.selection-size-label--width {
  top: 100%;
  left: 50%;
  border-top: 0;
  border-radius: 0 0 5px 5px;
  transform: translateX(-50%);
}

.selection-size-label--height {
  top: 50%;
  right: 100%;
  border-right: 0;
  border-radius: 5px 0 0 5px;
  transform: translateY(-50%);
}

.selection-size-label--height > span {
  display: inline-block;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.selection-handle {
  box-sizing: border-box;
  position: absolute;
  z-index: 3;
  width: 14px;
  height: 14px;
  border: 0;
  background: transparent;
  pointer-events: auto;
  padding: 0;
  opacity: 1;
  animation: selection-handle-enter 140ms cubic-bezier(.2, .8, .2, 1) backwards;
  transition: opacity 100ms ease-out;
}

.selection-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border: 1px solid var(--oc-accent-fg);
  border-radius: 2px;
  background: color-mix(in srgb, var(--oc-accent) 55%, transparent);
  box-shadow: 0 0 0 1px var(--oc-handle-shadow);
  transform: translate(-50%, -50%);
  transition:
    transform 120ms cubic-bezier(.2, .8, .2, 1),
    background-color 100ms ease-out,
    box-shadow 100ms ease-out;
}

.selection-handle:hover::before,
.selection-handle:focus-visible::before {
  background: color-mix(in srgb, var(--oc-accent) 75%, transparent);
  box-shadow: 0 0 0 1px var(--oc-accent-fg), 0 0 0 3px var(--oc-accent-glow);
  transform: translate(-50%, -50%) scale(1.15);
}

.selection-handle.is-active::before {
  background: var(--oc-accent);
  box-shadow: 0 0 0 1px var(--oc-accent-fg), 0 0 0 4px var(--oc-accent-glow);
  transform: translate(-50%, -50%) scale(1.2);
}

.selection-handle:focus-visible {
  outline: none;
}

.selection-frame.is-resizing .selection-handle:not(.is-active) {
  opacity: .35;
}

.selection-frame.is-moving .selection-handle {
  opacity: .35;
}

.selection-handle:nth-child(2) {
  animation-delay: 12ms;
}

.selection-handle:nth-child(3) {
  animation-delay: 24ms;
}

.selection-handle:nth-child(4) {
  animation-delay: 36ms;
}

.selection-handle:nth-child(5) {
  animation-delay: 48ms;
}

.selection-handle:nth-child(6) {
  animation-delay: 60ms;
}

.selection-handle:nth-child(7) {
  animation-delay: 72ms;
}

.selection-handle:nth-child(8) {
  animation-delay: 84ms;
}

.selection-handle-lt {
  top: -7px;
  left: -7px;
  cursor: nwse-resize;
}

.selection-handle-rt {
  top: -7px;
  right: -7px;
  cursor: nesw-resize;
}

.selection-handle-lb {
  bottom: -7px;
  left: -7px;
  cursor: nesw-resize;
}

.selection-handle-rb {
  right: -7px;
  bottom: -7px;
  cursor: nwse-resize;
}

.selection-handle-r {
  top: calc(50% - 7px);
  right: -7px;
  cursor: ew-resize;
}

.selection-handle-l {
  top: calc(50% - 7px);
  left: -7px;
  cursor: ew-resize;
}

.selection-handle-b {
  left: calc(50% - 7px);
  bottom: -7px;
  cursor: ns-resize;
}

.selection-handle-t {
  left: calc(50% - 7px);
  top: -7px;
  cursor: ns-resize;
}

.selection-handle-l::before,
.selection-handle-r::before {
  width: 5px;
  height: 12px;
}

.selection-handle-t::before,
.selection-handle-b::before {
  width: 12px;
  height: 5px;
}

.selection-overlay-fade-enter-active {
  transition: opacity 140ms ease-out;
}

.selection-overlay-fade-leave-active {
  transition: opacity 100ms ease-in;
  pointer-events: none;
}

.selection-overlay-fade-enter-from,
.selection-overlay-fade-leave-to {
  opacity: 0;
}

@keyframes selection-frame-enter {
  from {
    opacity: 0;
  }
}

@keyframes selection-handle-enter {
  from {
    opacity: 0;
    transform: scale(.7);
  }
}

@media (prefers-reduced-motion: reduce) {
  .selection-frame,
  .selection-handle {
    animation: none;
  }

  .selection-overlay-fade-enter-active,
  .selection-overlay-fade-leave-active {
    transition: none;
  }

  .selection-frame,
  .selection-handle,
  .selection-handle::before {
    transition: none;
  }
}
</style>
