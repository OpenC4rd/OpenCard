import { computed, ref, watchEffect } from 'vue'
import { useOverlayDismiss } from '../useOverlayDismiss'
import type { OcActionDefinition } from './action.types'

/**
 * 菜单栏行为：点击开关，已打开时悬停直接换到相邻菜单。
 * 同一时刻只有一个菜单；按钮按 data-action-key 现查，折叠重排后也找得到。
 */
export function useMenubar(
  getRoot: () => HTMLElement | null,
  getMenus: () => readonly OcActionDefinition[],
  onSelect: (menu: OcActionDefinition, key: string) => void,
) {
  const openKey = ref<string | null>(null)
  const isOpen = computed(() => openKey.value !== null)
  const openMenu = computed(() => getMenus().find(menu => menu.key === openKey.value) ?? null)

  function buttonOf(key: string): HTMLElement | null {
    const buttons = getRoot()?.querySelectorAll<HTMLElement>('[data-action-key]') ?? []
    return [...buttons].find(button => button.dataset.actionKey === key) ?? null
  }

  /** 每次换菜单都是新函数，marker 才会把新锚点推进组里让宿主滑过去；函数锚点让 autoUpdate 读到当前矩形。 */
  const anchor = computed(() => {
    const key = openKey.value
    return () => (key ? buttonOf(key)?.getBoundingClientRect() ?? null : null)
  })

  function hover(key: string): void {
    if (isOpen.value) openKey.value = key
  }

  function toggle(key: string): void {
    openKey.value = openKey.value === key ? null : key
  }

  /** 键盘关闭时焦点还给打开它的那个按钮。 */
  function close(restoreFocus = false): void {
    const button = restoreFocus && openKey.value ? buttonOf(openKey.value) : null
    openKey.value = null
    button?.focus()
  }

  /** 选中一项先收起再执行：动作自己带闭包，不依赖菜单还开着。 */
  function select(key: string): void {
    const menu = openMenu.value
    openKey.value = null
    if (menu) onSelect(menu, key)
  }

  /** 打开的菜单被折叠或被移除时跟着收，不留一个指向不存在按钮的菜单。 */
  function closeIfGone(): void {
    if (isOpen.value && !openMenu.value) close()
  }

  useOverlayDismiss(() => isOpen.value, getRoot, close)

  // 焦点在菜单里时由菜单自己收（它会把焦点还给按钮），这里只兜住焦点不在菜单里的情况。
  watchEffect(cleanup => {
    if (!isOpen.value) return
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof Element && event.target.closest('.oc-action-menu')) return
      close()
    }
    window.addEventListener('keydown', dismissOnEscape, true)
    cleanup(() => window.removeEventListener('keydown', dismissOnEscape, true))
  })

  return { openKey, isOpen, openMenu, anchor, hover, toggle, close, select, closeIfGone }
}
