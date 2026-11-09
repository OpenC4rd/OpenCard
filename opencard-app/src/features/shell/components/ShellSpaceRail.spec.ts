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
        { key: 'export', labelKey: 'export', icon: 'mdiPrinter', available: availability, unavailableHintKey: 'needs-project' },
      ],
    },
  })
  return { wrapper, availability, button: () => wrapper.findAll('button')[1]! }
}

describe('ShellSpaceRail', () => {
  it('keeps an unavailable space visible but does not enter it', async () => {
    const { wrapper, button } = mountRail(false)

    await button().trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(button().attributes('aria-disabled')).toBe('true')
    expect(button().attributes('data-tooltip')).toBe('needs-project')
  })

  it('reacts when a space becomes available', async () => {
    const { wrapper, availability, button } = mountRail(false)

    availability.value = true
    await wrapper.vm.$nextTick()
    await button().trigger('click')

    expect(wrapper.emitted('select')).toEqual([['export']])
    expect(button().attributes('aria-disabled')).toBeUndefined()
    expect(button().attributes('data-tooltip')).toBe('export')
  })
})
