import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCard from './OcCard.vue'

describe('OcCard', () => {
  it('renders a surface card with content and no header by default', () => {
    const wrapper = mount(OcCard, {
      slots: { default: '<p class="body">Body</p>' },
    })

    expect(wrapper.get('section').classes()).toContain('oc-card--variant-surface')
    expect(wrapper.get('section').classes()).not.toContain('oc-card--fill')
    expect(wrapper.find('.oc-card__header').exists()).toBe(false)
    expect(wrapper.get('.oc-card__content .body').text()).toBe('Body')
  })

  it('maps variant and fill to root modifier classes', () => {
    const wrapper = mount(OcCard, {
      props: { variant: 'glass', fill: true },
    })

    expect(wrapper.classes()).toContain('oc-card--variant-glass')
    expect(wrapper.classes()).toContain('oc-card--fill')
    expect(wrapper.classes()).not.toContain('oc-card--variant-surface')

    const plain = mount(OcCard, { props: { variant: 'plain' } })
    expect(plain.classes()).toContain('oc-card--variant-plain')
  })

  it('renders the header only once a title, an icon or an action exists', () => {
    expect(mount(OcCard).find('.oc-card__header').exists()).toBe(false)

    const titled = mount(OcCard, { props: { title: 'Layers', icon: 'mdiPlayOutline' } })
    expect(titled.get('.oc-card__header .oc-bar__title').text()).toBe('Layers')
    expect(titled.get('.oc-card__header .oc-bar__icon svg').classes()).toContain('oc-icon')
    expect(titled.get('.oc-card__header .oc-bar__append .oc-action-rail').findAll('button')).toHaveLength(0)

    const iconOnly = mount(OcCard, { props: { icon: 'mdiPlayOutline' } })
    expect(iconOnly.find('.oc-card__header').exists()).toBe(true)
    expect(iconOnly.find('.oc-card__header .oc-bar__title').exists()).toBe(false)
  })

  it('renders the actions in the header rail and re-emits the selected key only', async () => {
    const wrapper = mount(OcCard, {
      props: {
        title: 'Layers',
        actions: [
          { key: 'add', icon: 'mdiPlayOutline', title: 'Add' },
          { key: 'remove', title: 'Remove' },
        ],
      },
    })

    const rail = wrapper.get('.oc-card__header .oc-bar__append .oc-action-rail')
    expect(rail.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Add', 'Remove'])

    await rail.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ key: 'remove' }]])
  })

  it('merges parent classes and forwards the remaining attributes to the root', () => {
    const wrapper = mount(OcCard, {
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
