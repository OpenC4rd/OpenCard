import { reactive, shallowReactive } from 'vue'
import type { Placement } from '@floating-ui/vue'

/** null：调用点的控件还没挂载，这一层此刻没有可锚的位置，marker 不显示。 */
export type OverlayAnchor = HTMLElement | DOMRect | (() => DOMRect | null) | null

/** 描述「这一层长什么样、锚在哪」；同一个组的宿主换 marker 时只换这些。 */
interface OverlayMarkerLayout {
  anchor: OverlayAnchor
  owner?: HTMLElement | null
  placement?: Placement
  maxHeight?: number
}

interface OverlayGroupState {
  anchor: OverlayAnchor
  owner: HTMLElement | null
  placement: Placement
  maxHeight: number
  activeMarker: string | null
  /** 组是否还占着宿主：最后一个 marker 关闭后置 false，离场播完由宿主 disposeGroup 删掉整个组。 */
  visible: boolean
  contentEl: HTMLElement | null
}

/**
 * Map 只跟踪「有哪些组」：增删一个组才重渲染根节点。
 * 组内字段是各自的 reactive 对象，位置和尺寸变化只惊动一个宿主。
 */
const groups = shallowReactive(new Map<string, OverlayGroupState>())

/** 只读视图：外部只读组状态，增删一律走下面的函数。 */
export const overlayGroups: ReadonlyMap<string, OverlayGroupState> = groups

const LAYOUT_DEFAULTS = {
  owner: null,
  placement: 'bottom-start',
  maxHeight: 480,
} as const satisfies Omit<Required<OverlayMarkerLayout>, 'anchor'>

function withDefaults(layout: OverlayMarkerLayout): Omit<OverlayGroupState, 'activeMarker' | 'visible' | 'contentEl'> {
  return {
    anchor: layout.anchor,
    owner: layout.owner ?? LAYOUT_DEFAULTS.owner,
    placement: layout.placement ?? LAYOUT_DEFAULTS.placement,
    maxHeight: layout.maxHeight ?? LAYOUT_DEFAULTS.maxHeight,
  }
}

function createGroup(group: string, layout: OverlayMarkerLayout): OverlayGroupState {
  const state = reactive<OverlayGroupState>({
    ...withDefaults(layout),
    activeMarker: null,
    visible: true,
    contentEl: null,
  })
  groups.set(group, state)
  return state
}

/**
 * 组内某 marker 请求显示：旧 marker 被抢占（真正关闭），组指向新的。
 * 返回被抢占的 marker id —— 关闭它的是调用者，不能在这里回调：
 * 旧 marker 的关闭只清自己的内容，组此刻已经指向新 marker，不能再被回溯改写。
 * 重复激活同一个 marker 不算抢占，返回 null。
 *
 * 共享一组的成员必须能让「新的先打开」：hover 触发、或者点击但自己不挂
 * pointerdown dismiss。点击 + 外部点击关闭的控件共享组不会滑——dismiss 会
 * 先把旧的关掉，宿主进入离场，新的只能重建宿主。
 */
export function activateMarker(
  group: string,
  markerId: string,
  layout: OverlayMarkerLayout,
): string | null {
  const state = groups.get(group) ?? createGroup(group, layout)
  const previousMarkerId = state.activeMarker
  // 函数锚点原样存：autoUpdate 每次都重新求值，光标跟随才成立。
  Object.assign(state, withDefaults(layout), { activeMarker: markerId, visible: true })
  return previousMarkerId === markerId ? null : previousMarkerId
}

/** marker 主动关闭（用户 Esc / 点外部 / 代码 close）。只有它仍是 activeMarker 时才让组进入离场。 */
export function deactivateMarker(group: string, markerId: string): void {
  const state = groups.get(group)
  if (!state || state.activeMarker !== markerId) return
  state.activeMarker = null
  state.visible = false
}

/** 宿主离场动画结束后调用。 */
export function disposeGroup(group: string): void {
  groups.delete(group)
}

/** 供 marker 拿到自己的 host 内容容器（Teleport 目标）。 */
export function groupContentEl(group: string): HTMLElement | null {
  return groups.get(group)?.contentEl ?? null
}

/**
 * 程序化回焦（收起子层后把焦点还给父项）会触发父项的 focusin，
 * 而 focusin 的默认行为是展开子层——不抑制就会「关掉又立刻打开」。
 * 焦点事件是同步派发的，所以只在这次调用期间置位。
 */
let suppressFocusOpen = false

export function withFocusOpenSuppressed<T>(run: () => T): T {
  const previous = suppressFocusOpen
  suppressFocusOpen = true
  try {
    return run()
  } finally {
    suppressFocusOpen = previous
  }
}

export function isFocusOpenSuppressed(): boolean {
  return suppressFocusOpen
}
