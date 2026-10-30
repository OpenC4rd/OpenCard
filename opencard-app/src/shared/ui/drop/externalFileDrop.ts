/**
 * 模块说明：
 * - 把 Tauri 的窗口级文件拖放事件（enter/over/drop/leave）收敛成按区域分发的协议。
 * 职责边界：
 * - 只负责命中判定与坐标换算，不解释路径含义、不决定任何领域行为。
 * - 区域由调用方显式注册，未命中任何区域的投放交给未处理回调。
 */
import { computed, ref, type Ref } from 'vue'
import { getCurrentWindow, type DragDropEvent } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import type { Event as TauriEvent, UnlistenFn } from '@tauri-apps/api/event'
import { filterSupportedExternalOpenPaths } from '../../../features/shell/services/externalOpenService'

/** 拖放期间指针的视口坐标（CSS 像素）。 */
interface ExternalDropPoint {
  x: number
  y: number
}

export interface ExternalDropZone {
  /** 命中判定：指针下的元素落在该区域内时返回 true。 */
  contains: (element: Element) => boolean
  /** 指针在该区域内移动时触发。 */
  onHover: (point: ExternalDropPoint) => void
  /** 指针离开该区域、拖拽结束或区域注销时触发，用于清除投放反馈。 */
  onExit: () => void
  /** 在该区域内松手；返回 true 表示已消费这次投放。 */
  onDrop: (paths: readonly string[], point: ExternalDropPoint) => boolean
}

interface ExternalFileDrop {
  registerZone: (zone: ExternalDropZone) => () => void
  /** 窗口内是否正有一次外部拖拽；区域命中不区分文件类型。 */
  isDragActive: Readonly<Ref<boolean>>
  /** 拖拽内容是否包含 OpenCard 能直接打开的文件，用于整窗“释放以打开”提示。 */
  isOpenableDragActive: Readonly<Ref<boolean>>
  /** 当前拖拽是否正悬停在某个已注册区域上；调用方据此让位给区域自己的投放提示。 */
  isOverZone: Readonly<Ref<boolean>>
}

/** Tauri 的拖放事件携带物理像素，DOM 命中测试使用 CSS 像素。 */
function toViewportPoint(position: { x: number; y: number }): ExternalDropPoint {
  const ratio = typeof window === 'undefined' || !window.devicePixelRatio ? 1 : window.devicePixelRatio
  return { x: position.x / ratio, y: position.y / ratio }
}

function elementAtPoint(point: ExternalDropPoint): Element | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null
  return document.elementFromPoint(point.x, point.y)
}

class ExternalFileDropMechanism {
  private readonly zones = new Set<ExternalDropZone>()
  private readonly dragActive = ref(false)
  private readonly overZone = ref(false)
  private dragPaths: readonly string[] = []
  private hoveredZone: ExternalDropZone | null = null
  private hoveredPoint: ExternalDropPoint | null = null
  private unhandledDrop: ((paths: readonly string[]) => void) | null = null
  private unlisten: UnlistenFn | null = null
  private listening = false

  readonly isDragActive = computed(() => this.dragActive.value)
  readonly isOpenableDragActive = computed(() =>
    this.dragActive.value && filterSupportedExternalOpenPaths(this.dragPaths).length > 0)
  readonly isOverZone = computed(() => this.overZone.value)

  registerZone(zone: ExternalDropZone): () => void {
    this.zones.add(zone)
    this.syncListener()
    return () => {
      if (this.hoveredZone === zone) this.setHoveredZone(null, null)
      this.zones.delete(zone)
      this.syncListener()
    }
  }

  setUnhandledDrop(handler: ((paths: readonly string[]) => void) | null): void {
    this.unhandledDrop = handler
    this.syncListener()
  }

  private syncListener(): void {
    const shouldListen = this.zones.size > 0 || this.unhandledDrop !== null
    if (shouldListen === this.listening) return

    if (!shouldListen) {
      this.unlisten?.()
      this.unlisten = null
      this.listening = false
      this.detachBrowserDropGuard()
      this.reset()
      return
    }

    this.listening = true
    this.attachBrowserDropGuard()
    if (!isTauri()) return

    void getCurrentWindow().onDragDropEvent(event => this.handleEvent(event)).then((unlisten) => {
      if (!this.listening) {
        unlisten()
        return
      }
      this.unlisten = unlisten
    }).catch(() => {
      this.listening = false
    })
  }

  /**
   * Window drag drop is default-on, and without a frontend handler the browser may act on a dropped
   * file itself (opening it, navigating the webview away from the app). Cancelling the window-level
   * event for file drags prevents that and leaves non-file drags untouched.
   */
  private readonly bypassBrowserFileDrop = (event: DragEvent): void => {
    const items = event.dataTransfer?.items
    if (!items || ![...items].some(item => item.kind === 'file')) return
    event.preventDefault()
  }

  private attachBrowserDropGuard(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('dragover', this.bypassBrowserFileDrop)
    window.addEventListener('drop', this.bypassBrowserFileDrop)
  }

  private detachBrowserDropGuard(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('dragover', this.bypassBrowserFileDrop)
    window.removeEventListener('drop', this.bypassBrowserFileDrop)
  }

  private reset(): void {
    this.dragActive.value = false
    this.dragPaths = []
    this.setHoveredZone(null, null)
  }

  private setHoveredZone(zone: ExternalDropZone | null, point: ExternalDropPoint | null): void {
    if (this.hoveredZone !== zone) {
      this.hoveredZone?.onExit()
      this.hoveredZone = zone
      this.hoveredPoint = null
      this.overZone.value = zone !== null
    }
    if (!zone || !point) {
      this.hoveredPoint = null
      return
    }
    if (this.hoveredPoint?.x === point.x && this.hoveredPoint.y === point.y) return
    this.hoveredPoint = point
    zone.onHover(point)
  }

  private resolveZone(point: ExternalDropPoint): ExternalDropZone | null {
    const element = elementAtPoint(point)
    if (!element) return null
    for (const zone of [...this.zones].reverse()) {
      if (zone.contains(element)) return zone
    }
    return null
  }

  private handleEvent(event: TauriEvent<DragDropEvent>): void {
    const payload = event.payload
    if (payload.type === 'enter') {
      this.dragPaths = payload.paths
      this.dragActive.value = payload.paths.length > 0
      if (this.dragActive.value) this.trackPointer(toViewportPoint(payload.position))
      return
    }
    if (payload.type === 'over') {
      if (this.dragActive.value) this.trackPointer(toViewportPoint(payload.position))
      return
    }
    if (payload.type === 'drop') {
      // Zones decide for themselves what they accept, so they receive the untouched platform paths.
      const paths = payload.paths
      const point = toViewportPoint(payload.position)
      const zone = this.dragActive.value && paths.length > 0
        ? this.resolveZone(point) ?? this.hoveredZone
        : null
      const handled = zone?.onDrop(paths, point) ?? false
      this.reset()
      if (!handled && paths.length > 0) this.unhandledDrop?.(paths)
      return
    }
    this.reset()
  }

  private trackPointer(point: ExternalDropPoint): void {
    this.setHoveredZone(this.resolveZone(point), point)
  }
}

const mechanism = new ExternalFileDropMechanism()
const unhandledHandlers = new Set<(paths: readonly string[]) => void>()

/** 应用内共享同一个窗口级拖放机制；各区域通过 registerZone 接入。 */
export function useExternalFileDrop(): ExternalFileDrop {
  return {
    registerZone: zone => mechanism.registerZone(zone),
    isDragActive: mechanism.isDragActive,
    isOpenableDragActive: mechanism.isOpenableDragActive,
    isOverZone: mechanism.isOverZone,
  }
}

/** 没有区域消费的外部投放；多个监听方都由同一个窗口监听分发。 */
export function registerUnhandledExternalDrop(handler: (paths: readonly string[]) => void): () => void {
  if (unhandledHandlers.size === 0) {
    mechanism.setUnhandledDrop((paths) => {
      unhandledHandlers.forEach(registered => registered(paths))
    })
  }
  unhandledHandlers.add(handler)
  return () => {
    unhandledHandlers.delete(handler)
    if (unhandledHandlers.size === 0) mechanism.setUnhandledDrop(null)
  }
}
