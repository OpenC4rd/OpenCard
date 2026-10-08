/**
 * Card Designer overlay layout state.
 *
 * Dock components own pointer/keyboard resize lifecycles. This controller owns
 * only session layout state, transient resize updates, and the shared viewport
 * inset projection.
 */
import { computed, ref, watch, type CSSProperties, type Ref } from 'vue'
import type { CardDesignerLayoutState } from './cardDesigner.types'
import {
  clampCdeOverlayExtent,
  resolveCdeOverlayViewportInsets,
  settleCdeOverlayExtent,
  type CdeOverlayGeometryConfig,
  type CdeOverlaySide,
} from './cdeOverlayGeometry'

type OverlayPanel = 'instance' | 'preview' | 'structure' | 'property'
type CommittedDockLayout = {
  leftExtent: number
  rightExtent: number
  leftExpandedExtent: number
  rightExpandedExtent: number
}
type UseCdeOverlayLayoutOptions = {
  layout: Readonly<Ref<CardDesignerLayoutState | undefined>>
  geometryConfig: Readonly<CdeOverlayGeometryConfig>
  topMinHeight: number
  commitLayout: (layout: CardDesignerLayoutState) => void
}

export function useCdeOverlayLayout(options: UseCdeOverlayLayoutOptions) {
  const isInstancePanelExpanded = ref(true)
  const isPreviewPanelExpanded = ref(true)
  const isStructureTreePanelExpanded = ref(true)
  const isPropertyPanelExpanded = ref(true)
  const leftDockExtent = ref(options.geometryConfig.minExtent)
  const rightDockExtent = ref(options.geometryConfig.minExtent)
  const leftExpandedDockExtent = ref(options.geometryConfig.minExtent)
  const rightExpandedDockExtent = ref(options.geometryConfig.minExtent)
  let committedDockLayout: CommittedDockLayout = {
    leftExtent: options.geometryConfig.minExtent,
    rightExtent: options.geometryConfig.minExtent,
    leftExpandedExtent: options.geometryConfig.minExtent,
    rightExpandedExtent: options.geometryConfig.minExtent,
  }
  const leftSidebarTopHeight = ref<number | null>(null)
  const rightSidebarTopHeight = ref<number | null>(null)
  const viewportInsets = computed(() => resolveCdeOverlayViewportInsets(
    leftDockExtent.value,
    rightDockExtent.value,
    options.geometryConfig,
  ))
  const editorShellStyle = computed<CSSProperties>(() => ({
    display: 'flex',
    flex: '1 1 auto',
    width: '100%',
    height: '100%',
    minWidth: '0',
    minHeight: '0',
    position: 'relative',
    overflow: 'hidden',
  }))

  function createLayoutState(): CardDesignerLayoutState {
    return {
      panels: {
        instanceExpanded: isInstancePanelExpanded.value,
        previewExpanded: isPreviewPanelExpanded.value,
        structureExpanded: isStructureTreePanelExpanded.value,
        propertyExpanded: isPropertyPanelExpanded.value,
      },
      leftTopHeight: leftSidebarTopHeight.value,
      rightTopHeight: rightSidebarTopHeight.value,
      leftDockExtent: committedDockLayout.leftExtent,
      rightDockExtent: committedDockLayout.rightExtent,
      leftExpandedDockExtent: committedDockLayout.leftExpandedExtent,
      rightExpandedDockExtent: committedDockLayout.rightExpandedExtent,
    }
  }

  function commitLayoutState(): void {
    options.commitLayout(createLayoutState())
  }

  function commitDockExtent(side: CdeOverlaySide): void {
    if (side === 'left') {
      if (leftDockExtent.value >= options.geometryConfig.minExtent) {
        leftExpandedDockExtent.value = leftDockExtent.value
      }
      committedDockLayout = {
        ...committedDockLayout,
        leftExtent: leftDockExtent.value,
        leftExpandedExtent: leftExpandedDockExtent.value,
      }
    } else {
      if (rightDockExtent.value >= options.geometryConfig.minExtent) {
        rightExpandedDockExtent.value = rightDockExtent.value
      }
      committedDockLayout = {
        ...committedDockLayout,
        rightExtent: rightDockExtent.value,
        rightExpandedExtent: rightExpandedDockExtent.value,
      }
    }
    commitLayoutState()
  }

  function updateDockExtent(side: CdeOverlaySide, extent: number): void {
    const next = clampCdeOverlayExtent(extent, options.geometryConfig)
    if (side === 'left') {
      leftDockExtent.value = next
    } else {
      rightDockExtent.value = next
    }
  }

  function settleDockExtent(side: CdeOverlaySide, extent: number, startExtent: number): void {
    const next = settleCdeOverlayExtent(extent, startExtent, options.geometryConfig)
    updateDockExtent(side, next)
    commitDockExtent(side)
  }

  function toggleDockCollapsed(side: CdeOverlaySide): void {
    const current = side === 'left' ? leftDockExtent.value : rightDockExtent.value
    const expanded = side === 'left' ? leftExpandedDockExtent.value : rightExpandedDockExtent.value
    const next = current > options.geometryConfig.collapsedExtent
      ? options.geometryConfig.collapsedExtent
      : clampCdeOverlayExtent(expanded, options.geometryConfig)
    if (side === 'left') leftDockExtent.value = next
    else rightDockExtent.value = next
    commitDockExtent(side)
  }

  function updateDockTopSize(side: CdeOverlaySide, value: number | null): void {
    const next = normalizeStoredTopHeight(value, options.topMinHeight)
    if (side === 'left') {
      if (leftSidebarTopHeight.value !== next) leftSidebarTopHeight.value = next
    } else if (rightSidebarTopHeight.value !== next) {
      rightSidebarTopHeight.value = next
    }
  }

  function togglePanel(panel: OverlayPanel): void {
    const target = panel === 'instance'
      ? isInstancePanelExpanded
      : panel === 'preview'
        ? isPreviewPanelExpanded
        : panel === 'structure'
          ? isStructureTreePanelExpanded
          : isPropertyPanelExpanded
    target.value = !target.value
    commitLayoutState()
  }

  function ensurePanelsExpanded(panels: readonly OverlayPanel[]): boolean {
    let changed = false
    for (const panel of panels) {
      const target = panel === 'instance'
        ? isInstancePanelExpanded
        : panel === 'preview'
          ? isPreviewPanelExpanded
          : panel === 'structure'
            ? isStructureTreePanelExpanded
            : isPropertyPanelExpanded
      if (!target.value) {
        target.value = true
        changed = true
      }
    }
    if (changed) commitLayoutState()
    return changed
  }

  watch(
    options.layout,
    layout => {
      const panels = layout?.panels
      isInstancePanelExpanded.value = panels?.instanceExpanded ?? true
      isPreviewPanelExpanded.value = panels?.previewExpanded ?? true
      isStructureTreePanelExpanded.value = panels?.structureExpanded ?? true
      isPropertyPanelExpanded.value = panels?.propertyExpanded ?? true
      leftSidebarTopHeight.value = normalizeStoredTopHeight(layout?.leftTopHeight, options.topMinHeight)
      rightSidebarTopHeight.value = normalizeStoredTopHeight(layout?.rightTopHeight, options.topMinHeight)
      const leftExtent = normalizeStoredDockExtent(layout?.leftDockExtent, options.geometryConfig)
      const rightExtent = normalizeStoredDockExtent(layout?.rightDockExtent, options.geometryConfig)
      leftDockExtent.value = leftExtent
      rightDockExtent.value = rightExtent
      leftExpandedDockExtent.value = normalizeStoredExpandedDockExtent(
        layout?.leftExpandedDockExtent,
        options.geometryConfig,
        leftExtent,
      )
      rightExpandedDockExtent.value = normalizeStoredExpandedDockExtent(
        layout?.rightExpandedDockExtent,
        options.geometryConfig,
        rightExtent,
      )
      committedDockLayout = {
        leftExtent: leftDockExtent.value,
        rightExtent: rightDockExtent.value,
        leftExpandedExtent: leftExpandedDockExtent.value,
        rightExpandedExtent: rightExpandedDockExtent.value,
      }
    },
    { immediate: true, deep: true },
  )

  return {
    editorShellStyle,
    ensurePanelsExpanded,
    commitDockExtent,
    commitLayout: commitLayoutState,
    isInstancePanelExpanded,
    isPreviewPanelExpanded,
    isPropertyPanelExpanded,
    isStructureTreePanelExpanded,
    leftDockExtent,
    leftSidebarTopHeight,
    rightDockExtent,
    rightSidebarTopHeight,
    settleDockExtent,
    toggleDockCollapsed,
    togglePanel,
    updateDockExtent,
    updateDockTopSize,
    viewportInsets,
  }
}

function normalizeStoredTopHeight(value: number | null | undefined, minimum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : null
}

function normalizeStoredDockExtent(
  value: number | undefined,
  config: Readonly<CdeOverlayGeometryConfig>,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return config.minExtent
  const extent = clampCdeOverlayExtent(value, config)
  return extent <= config.collapsedExtent ? config.collapsedExtent : Math.max(config.minExtent, extent)
}

function normalizeStoredExpandedDockExtent(
  value: number | undefined,
  config: Readonly<CdeOverlayGeometryConfig>,
  currentExtent: number,
): number {
  const fallback = currentExtent >= config.minExtent ? currentExtent : config.minExtent
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(config.minExtent, clampCdeOverlayExtent(value, config))
}
