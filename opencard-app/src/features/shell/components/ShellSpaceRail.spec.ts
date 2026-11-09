import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import ShellSpaceRail from './ShellSpaceRail.vue'

function mountRail(available: boolean) {
  const availability = ref(available)
  const wrapper = mount(ShellSpaceRail, {
    props: {
      activeSpace: 'welcome',
      label: 'Spaces',
      translate: key => key,
      spaces: [
        { key: 'welcome', labelKey: 'welcome', icon: 'mdiHumanGreeting' },
        { key: 'export', labelKey: 'export', icon: 'mdiPrinter', available: availability },
      ],
    },
  })
  return { wrapper, availability, button: () => wrapper.findAll('button')[1]! }
}

describe('ShellSpaceRail', () => {
  it('hides an unavailable space', () => {
    const { wrapper } = mountRail(false)

    expect(wrapper.findAll('button')).toHaveLength(1)
  })

  it('shows a space when it becomes available', async () => {
    const { wrapper, availability, button } = mountRail(false)

    availability.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('button')).toHaveLength(2)
    await button().trigger('click')

    expect(wrapper.emitted('select')).toEqual([['export']])
    expect(button().attributes('data-tooltip')).toBe('export')
  })
})
