import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { CardDesignerLayoutState } from './cardDesigner.types'
import { CDE_OVERLAY_GEOMETRY_CONFIG } from './cdeOverlayConfig'
import { useCdeOverlayLayout } from './useCdeOverlayLayout'

function createLayout(overrides: Partial<CardDesignerLayoutState> = {}): CardDesignerLayoutState {
  return {
    panels: {
      instanceExpanded: true,
      previewExpanded: true,
      structureExpanded: true,
      propertyExpanded: true,
    },
    leftTopHeight: null,
    rightTopHeight: null,
    leftDockExtent: 280,
    rightDockExtent: 280,
    leftExpandedDockExtent: 280,
    rightExpandedDockExtent: 280,
    ...overrides,
  }
}

function createController(initialLayout = createLayout()) {
  const layout = ref<CardDesignerLayoutState | undefined>(initialLayout)
  const commits: CardDesignerLayoutState[] = []
  const controller = useCdeOverlayLayout({
    layout,
    geometryConfig: CDE_OVERLAY_GEOMETRY_CONFIG,
    topMinHeight: 160,
    commitLayout: value => commits.push(value),
  })
  return { commits, controller, layout }
}

describe('useCdeOverlayLayout', () => {
  it('syncs session panel state and commits semantic panel commands', () => {
    const { commits, controller } = createController(createLayout({
      panels: {
        instanceExpanded: false,
        previewExpanded: true,
        structureExpanded: false,
        propertyExpanded: false,
      },
      leftTopHeight: 100,
      rightTopHeight: 260,
    }))

    expect(controller.isInstancePanelExpanded.value).toBe(false)
    expect(controller.leftSidebarTopHeight.value).toBe(160)
    controller.togglePanel('instance')

    expect(commits[commits.length - 1]).toEqual(createLayout({
      panels: {
        instanceExpanded: true,
        previewExpanded: true,
        structureExpanded: false,
        propertyExpanded: false,
      },
      leftTopHeight: 160,
      rightTopHeight: 260,
    }))
  })

  it('derives mirrored dock geometry and viewport insets from one extent per side', () => {
    const { controller } = createController()

    controller.updateDockExtent('left', 120)
    controller.updateDockExtent('right', 120)

    expect(controller.viewportInsets.value.left).toBeCloseTo(120 + 6 * (120 / 280))
    expect(controller.viewportInsets.value.right).toBeCloseTo(120 + 6 * (120 / 280))
  })

  it('restores each side to its last expanded width after collapsing', () => {
    const { controller } = createController()

    controller.updateDockExtent('left', 420)
    controller.updateDockExtent('right', 360)
    controller.commitDockExtent('left')
    controller.commitDockExtent('right')
    controller.toggleDockCollapsed('left')
    controller.toggleDockCollapsed('right')
    expect(controller.leftDockExtent.value).toBe(0)
    expect(controller.rightDockExtent.value).toBe(0)

    controller.toggleDockCollapsed('left')
    controller.toggleDockCollapsed('right')
    expect(controller.leftDockExtent.value).toBe(420)
    expect(controller.rightDockExtent.value).toBe(360)
  })

  it('restores committed dock extents and expanded widths from session layout', () => {
    const { controller } = createController(createLayout({
      leftDockExtent: 0,
      rightDockExtent: 360,
      leftExpandedDockExtent: 420,
      rightExpandedDockExtent: 360,
    }))

    expect(controller.leftDockExtent.value).toBe(0)
    expect(controller.rightDockExtent.value).toBe(360)
    controller.toggleDockCollapsed('left')
    expect(controller.leftDockExtent.value).toBe(420)
  })

  it('does not cache a transient partial drag as the expanded width', () => {
    const { controller } = createController()

    controller.updateDockExtent('left', 420)
    controller.commitDockExtent('left')
    controller.settleDockExtent('left', 200, 420)
    controller.toggleDockCollapsed('left')

    expect(controller.leftDockExtent.value).toBe(420)
  })

  it('persists only settled dock extents', () => {
    const { commits, controller } = createController()

    controller.updateDockExtent('left', 200)
    controller.settleDockExtent('left', 200, 280)
    expect(controller.leftDockExtent.value).toBe(0)
    expect(commits).toHaveLength(1)
    expect(commits[0]?.leftDockExtent).toBe(0)

    controller.updateDockExtent('right', 0)
    controller.settleDockExtent('right', 40, 0)
    expect(controller.rightDockExtent.value).toBe(280)
    expect(commits).toHaveLength(2)
    expect(commits[1]?.rightDockExtent).toBe(280)
  })

  it('updates top sizes independently and only commits layout through the explicit callback', () => {
    const { commits, controller } = createController()

    controller.updateDockTopSize('right', 320)
    expect(controller.rightSidebarTopHeight.value).toBe(320)
    expect(commits).toHaveLength(0)

    controller.togglePanel('property')
    expect(commits).toHaveLength(1)
    expect(commits[0]?.rightTopHeight).toBe(320)
  })

  it('ensures requested panels are expanded without changing transient dock extents', () => {
    const { commits, controller } = createController(createLayout({
      panels: {
        instanceExpanded: false,
        previewExpanded: true,
        structureExpanded: false,
        propertyExpanded: false,
      },
    }))
    controller.updateDockExtent('left', 140)

    expect(controller.ensurePanelsExpanded(['instance', 'structure', 'property'])).toBe(true)
    expect(controller.leftDockExtent.value).toBe(140)
    expect(controller.isStructureTreePanelExpanded.value).toBe(true)
    expect(controller.isPropertyPanelExpanded.value).toBe(true)
    expect(commits[0]?.leftDockExtent).toBe(280)
  })
})
