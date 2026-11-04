import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OcActionBar from './OcActionBar.vue'
import type { OcActionBarItem } from '../../shared/ui/action/action.types'

const ACTIONS: OcActionBarItem[] = ['a', 'b', 'c', 'd', 'e'].map(key => ({ key, title: key.toUpperCase(), icon: 'mdiPlus' }))

describe('OcActionBar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('marks every action with its key and toggles with aria-pressed', () => {
    const wrapper = mount(OcActionBar, {
      props: { items: [{ key: 'snap', icon: 'mdiMagnet', active: true }, { key: 'plain', icon: 'mdiPlus' }] },
    })
    expect(wrapper.get('[data-action-key="snap"] button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-action-key="plain"] button').attributes('aria-pressed')).toBeUndefined()
  })

  it('renders nothing for an empty item list', () => {
    expect(mount(OcActionBar, { props: { items: [] } }).find('.oc-action-bar').exists()).toBe(false)
  })

  it('folds what does not fit into a more button, keeping the leading actions', async () => {
    // jsdom 没有布局：条宽 100，每个按钮 30 见方，五个放不下。
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('oc-action-bar') ? 100 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(30)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 30, 30))

    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS.slice(0, 4) } })
    await wrapper.setProps({ items: ACTIONS })
    await flushPromises()

    const shown = wrapper.findAll('[data-action-key]').map(node => node.attributes('data-action-key'))
    expect(shown).toEqual(['a', 'b', '__oc-action-bar-more__'])
  })

  it('moves focus between buttons with the arrow keys', async () => {
    const wrapper = mount(OcActionBar, { attachTo: document.body, props: { items: ACTIONS.slice(0, 3) } })
    const buttons = wrapper.findAll('button')
    buttons[0]!.element.focus()
    await buttons[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[1]!.element)
    await buttons[1]!.trigger('keydown', { key: 'ArrowLeft' })
    await buttons[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons[2]!.element)
  })
})
