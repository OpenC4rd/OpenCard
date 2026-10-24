import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShellTitleBar from './ShellTitleBar.vue'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'

function mountTitleBar(props: Record<string, unknown>): VueWrapper {
  return mount(ShellTitleBar, {
    attachTo: document.body,
    props: { collapsed: false, brandLabel: 'OpenCard', menuGroups: [], ...props },
  })
}

describe('ShellTitleBar', () => {
  // 菜单、任务面板都由共享组宿主渲染，组件自己不再持有浮层。
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

  it('cancels a task by its stable key', async () => {
    const wrapper = mountTitleBar({
      cancelTaskLabel: 'Cancel task',
      tasks: [{
        key: 'export', title: 'Exporting cards', progress: 0.25,
        detail: 'Rendering cards/main.ocdocument', cancellable: true,
      }],
    })
    await wrapper.get('.titlebar-brand-lockup').trigger('pointerenter')
    await flushPromises()

    document.body.querySelector<HTMLButtonElement>('button[aria-label="Cancel task"]')?.click()

    expect(wrapper.emitted('cancel-task')).toEqual([['export']])
    wrapper.unmount()
  })

  it('routes an open menu to the group it currently shows', async () => {
    const onAction = vi.fn()
    const nextOwner = vi.fn()
    const wrapper = mountTitleBar({
      menuGroups: [{
        key: 'file', onAction,
        label: 'File',
        actions: [{ key: 'open-project', title: 'Open Project' }],
      }],
    })

    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await flushPromises()

    // 菜单内容随 props.menuGroups 实时渲染：切页后条目归新 owner 处理。
    await wrapper.setProps({
      menuGroups: [{ key: 'file', label: 'Other page', actions: [{ key: 'open-project', title: 'Other' }], onAction: nextOwner }],
    })
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click()

    expect(nextOwner).toHaveBeenCalledWith('open-project')
    expect(onAction).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps an arbitrarily deep menu branch open through pointerdown and routes its leaf', async () => {
    const onAction = vi.fn()
    const wrapper = mountTitleBar({
      menuGroups: [{
        key: 'file', onAction,
        label: 'File',
        actions: [{
          key: 'level-1',
          title: 'Level 1',
          children: [{
            key: 'level-2',
            title: 'Level 2',
            children: [{
              key: 'level-3',
              title: 'Level 3',
              children: [{ key: 'leaf', title: 'Leaf' }],
            }],
          }],
        }],
      }],
    })

    await wrapper.get('button[aria-haspopup="menu"]').trigger('click')
    await flushPromises()
    for (let depth = 1; depth < 4; depth += 1) {
      const layers = document.body.querySelectorAll<HTMLElement>('.oc-floating-layer')
      layers[layers.length - 1]?.querySelector<HTMLElement>('.oc-action-menu__item')
        ?.dispatchEvent(new Event('pointerenter'))
      await flushPromises()
    }

    const leafButton = document.body.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Leaf"]',
    )!
    leafButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    await flushPromises()
    leafButton.click()

    expect(onAction).toHaveBeenCalledWith('leaf')
    wrapper.unmount()
  })

  it('switches menus on hover only after a menu has been activated', async () => {
    const wrapper = mountTitleBar({
      menuGroups: [
        { key: 'file', label: 'File', actions: [] },
        { key: 'edit', label: 'Edit', actions: [] },
      ],
    })
    const menus = wrapper.findAll('.titlebar-menu')
    const buttons = wrapper.findAll('button[aria-haspopup="menu"]')

    await menus[1]!.trigger('pointerenter')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('false')

    await buttons[0]!.trigger('click')
    await menus[1]!.trigger('pointerenter')

    expect(buttons[0]!.attributes('aria-expanded')).toBe('false')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('true')
  })
})
