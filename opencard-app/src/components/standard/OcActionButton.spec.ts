import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcActionButton from './OcActionButton.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'

/** The menu is rendered by the group host, so every menu interaction needs that host mounted. */
describe('OcActionButton', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function menus(): HTMLElement[] {
    return [...document.body.querySelectorAll<HTMLElement>('[role="menu"]')]
  }

  it('derives a plain accessible name from marked-up titles and badges', () => {
    const badged = mount(OcActionButton, {
      props: { action: { key: 'feedback', title: 'Feedback', badge: 3, badgeLabel: '3 unread replies' } },
    })
    expect(badged.get('button').attributes('aria-label')).toBe('Feedback, 3 unread replies')

    const markedUp = mount(OcActionButton, {
      props: { action: { key: 'fill', title: 'Fill [key]F[/key]' } },
    })
    expect(markedUp.get('button').attributes('aria-label')).toBe('Fill F')
  })

  it('keeps a clicked menu open after the pointer leaves and reports the chosen command', async () => {
    const wrapper = mount(OcActionButton, {
      attachTo: document.body,
      props: {
        action: {
          key: 'more',
          title: 'More',
          children: [{ key: 'reveal', title: 'Reveal in File Manager' }],
        },
      },
    })

    await wrapper.get('button[aria-label="More"]').trigger('click')
    await flushPromises()
    expect(menus()).toHaveLength(1)

    await wrapper.trigger('pointerleave')
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    await flushPromises()
    const reveal = document.body.querySelector<HTMLButtonElement>(
      '[role="menuitem"][data-oc-action-key="reveal"]',
    )
    expect(reveal).not.toBeNull()

    reveal?.click()
    await flushPromises()

    expect(wrapper.emitted('select')).toEqual([[{ key: 'reveal' }]])
    expect(menus()).toHaveLength(0)
    wrapper.unmount()
  })

  it('lets a menu opened in the same group replace the open one', async () => {
    const first = mount(OcActionButton, {
      attachTo: document.body,
      props: { action: { key: 'first', title: 'First', children: [{ key: 'a', title: 'First command' }] } },
    })
    const second = mount(OcActionButton, {
      attachTo: document.body,
      props: { action: { key: 'second', title: 'Second', children: [{ key: 'b', title: 'Second command' }] } },
    })
    try {
      await first.get('button').trigger('click')
      await flushPromises()
      expect(menus()).toHaveLength(1)
      expect(menus()[0]!.textContent).toContain('First command')

      await second.get('button').trigger('click')
      await flushPromises()

      // 同组只保留一份宿主：抢占换的是内容，不是再叠一层。
      expect(menus()).toHaveLength(1)
      expect(menus()[0]!.textContent).toContain('Second command')
      expect(menus()[0]!.textContent).not.toContain('First command')
    } finally {
      first.unmount()
      second.unmount()
    }
  })

  it('selects a leaf through four nested menu levels without dismissing its ancestors', async () => {
    const wrapper = mount(OcActionButton, {
      attachTo: document.body,
      props: {
        action: {
          key: 'more',
          title: 'More',
          children: [{
            key: 'delete',
            title: 'Delete',
            children: [{
              key: 'danger',
              title: 'Danger',
              children: [{
                key: 'really-delete',
                title: 'Really Delete',
                children: [{ key: 'confirm-delete', title: 'Confirm Delete' }],
              }],
            }],
          }],
        },
      },
    })

    await wrapper.get('button[aria-label="More"]').trigger('click')
    await flushPromises()

    for (let depth = 1; depth < 4; depth += 1) {
      const beforeOpen = menus()
      const parentMenu = beforeOpen[beforeOpen.length - 1]
      parentMenu?.querySelector<HTMLElement>('.oc-action-menu__item')
        ?.dispatchEvent(new Event('pointerenter'))
      await flushPromises()

      const afterOpen = menus()
      expect(afterOpen).toHaveLength(depth + 1)
      // 父层离开会把这一层排进延迟关闭；子层接手后它必须被撤销，否则整条父链会闪断。
      parentMenu?.dispatchEvent(new Event('pointerleave'))
      afterOpen[afterOpen.length - 1]?.dispatchEvent(new Event('pointerenter'))
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120))
    expect(menus()).toHaveLength(4)

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-oc-action-key="confirm-delete"]',
    )
    expect(confirmButton).not.toBeNull()
    confirmButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    await flushPromises()
    expect(confirmButton?.isConnected).toBe(true)

    confirmButton?.click()
    await flushPromises()
    expect(wrapper.emitted('select')).toEqual([[{ key: 'confirm-delete' }]])
    expect(menus()).toHaveLength(0)

    wrapper.unmount()
  })
})
