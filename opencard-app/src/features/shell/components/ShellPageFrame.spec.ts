import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ShellPageFrame from './ShellPageFrame.vue'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'
import type { ShellHeaderModel } from '../shell.types'

// 子菜单由共享组宿主渲染，测试要查 document.body 里的真实按钮。
let overlayRoot: VueWrapper | null = null

beforeEach(() => {
  overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
})

afterEach(() => {
  overlayRoot?.unmount()
  overlayRoot = null
  for (const group of [...overlayGroups.keys()]) disposeGroup(group)
  document.body.innerHTML = ''
})

function menuItem(label: string): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>(`[role="menuitem"][aria-label="${label}"]`)
}

function header(onAction: (key: string) => void): ShellHeaderModel {
  return {
    title: 'Page',
    titleLoading: false,
    onAction,
    actions: [
      { key: 'blocked', icon: 'mdiContentSaveOutline', title: 'Blocked', disabled: true },
      { key: 'local', icon: 'mdiExport', title: 'Local', children: [{ key: 'page.custom-token', title: 'Child' }] },
    ],
  }
}

it('keeps a disabled header action inert', async () => {
  const onAction = vi.fn()
  const wrapper = mount(ShellPageFrame, { attachTo: document.body, props: { header: header(onAction) } })
  try {
    await wrapper.get('button[aria-label="Blocked"]').trigger('click')

    expect(onAction).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})

it('returns nested action keys to the header owner that is currently showing', async () => {
  const onAction = vi.fn()
  const nextOwner = vi.fn()
  const wrapper = mount(ShellPageFrame, { attachTo: document.body, props: { header: header(onAction) } })
  try {
    await wrapper.get('button[aria-label="Local"]').trigger('click')
    await flushPromises()
    menuItem('Child')!.click()
    expect(onAction).toHaveBeenCalledWith('page.custom-token')
    await flushPromises()

    // 菜单内容随 header 的 owner 一起换：重新打开后，条目归新的 owner 处理。
    await wrapper.setProps({ header: header(nextOwner) })
    await flushPromises()
    await wrapper.get('button[aria-label="Local"]').trigger('click')
    await flushPromises()
    menuItem('Child')!.click()

    expect(nextOwner).toHaveBeenCalledWith('page.custom-token')
    expect(onAction).toHaveBeenCalledTimes(1)
  } finally { wrapper.unmount() }
})
