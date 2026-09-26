import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import OcCard from './OcCard.vue'

/**
 * jsdom ships no `window.matchMedia`, which the card reads on every content
 * transition, so the motion preference has to be provided explicitly.
 */
function stubMotionPreference(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

/** The card's collapse behaviour lives in the real built-in Transition hooks. */
const withRealTransition = { global: { stubs: { transition: false } } }

describe('OcCard', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('renders a surface card with content and no header by default', () => {
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      slots: { default: '<p class="body">Body</p>' },
    })

    expect(wrapper.get('section').classes()).toContain('oc-card--variant-surface')
    expect(wrapper.get('section').classes()).not.toContain('oc-card--fill')
    expect(wrapper.find('.oc-card__header').exists()).toBe(false)
    expect(wrapper.get('.oc-card__content .body').text()).toBe('Body')
  })

  it('maps variant and fill to root modifier classes', () => {
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      props: { variant: 'glass', fill: true },
    })

    expect(wrapper.classes()).toContain('oc-card--variant-glass')
    expect(wrapper.classes()).toContain('oc-card--fill')
    expect(wrapper.classes()).not.toContain('oc-card--variant-surface')

    const plain = mount(OcCard, { ...withRealTransition, props: { variant: 'plain' } })
    expect(plain.classes()).toContain('oc-card--variant-plain')
  })

  it('renders the header only once a title, an icon or an action exists', () => {
    expect(mount(OcCard, withRealTransition).find('.oc-card__header').exists()).toBe(false)

    const titled = mount(OcCard, { ...withRealTransition, props: { title: 'Layers', icon: 'action.play' } })
    expect(titled.get('.oc-card__header .oc-bar__title').text()).toBe('Layers')
    expect(titled.get('.oc-card__header .oc-bar__icon svg').classes()).toContain('oc-icon')
    expect(titled.get('.oc-card__header .oc-bar__append .oc-action-rail').findAll('button')).toHaveLength(0)

    const iconOnly = mount(OcCard, { ...withRealTransition, props: { icon: 'action.play' } })
    expect(iconOnly.find('.oc-card__header').exists()).toBe(true)
    expect(iconOnly.find('.oc-card__header .oc-bar__title').exists()).toBe(false)
  })

  it('renders the actions in the header rail and re-emits the selected key only', async () => {
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      props: {
        title: 'Layers',
        actions: [
          { key: 'add', icon: 'action.play', title: 'Add' },
          { key: 'remove', title: 'Remove' },
        ],
      },
    })

    const rail = wrapper.get('.oc-card__header .oc-bar__append .oc-action-rail')
    expect(rail.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Add', 'Remove'])

    await rail.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ key: 'remove' }]])
  })

  it('hides only the content while collapsed and restores it when expanded', async () => {
    stubMotionPreference(true)
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      props: { title: 'Layers' },
      slots: { default: '<p class="body">Body</p>' },
    })

    expect(wrapper.get('.oc-card__content .body').text()).toBe('Body')

    await wrapper.setProps({ collapsed: true })
    expect(wrapper.classes()).toContain('oc-card--collapsed')
    expect(wrapper.get('.oc-card__header .oc-bar__title').text()).toBe('Layers')
    expect(wrapper.find('.oc-card__content').exists()).toBe(false)

    await wrapper.setProps({ collapsed: false })
    expect(wrapper.classes()).not.toContain('oc-card--collapsed')
    expect(wrapper.get('.oc-card__content .body').text()).toBe('Body')
    expect(wrapper.get('.oc-card__content-shell').attributes('style') ?? '').not.toContain('height')
  })

  it('keeps the collapsing shell in place until the leave transition finishes', async () => {
    stubMotionPreference(false)
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      slots: { default: '<p class="body">Body</p>' },
    })

    await wrapper.setProps({ collapsed: true })
    const shell = wrapper.get('.oc-card__content-shell').element as HTMLElement
    expect(shell.style.overflow).toBe('hidden')
    expect(shell.style.transition).toContain('height')

    await new Promise(resolve => window.setTimeout(resolve, 320))
    await nextTick()

    expect(wrapper.find('.oc-card__content-shell').exists()).toBe(false)
  })

  it('merges parent classes and forwards the remaining attributes to the root', () => {
    const wrapper = mount(OcCard, {
      ...withRealTransition,
      props: { title: 'Layers' },
      attrs: { class: 'is-selected', style: 'width: 120px', 'data-test': 'card', role: 'region' },
    })

    const root = wrapper.get('section.oc-card')
    expect(root.classes()).toContain('is-selected')
    expect(root.classes()).toContain('oc-card--variant-surface')
    expect(root.attributes('data-test')).toBe('card')
    expect(root.attributes('role')).toBe('region')
    expect(root.attributes('style')).toContain('width: 120px')
  })
})
