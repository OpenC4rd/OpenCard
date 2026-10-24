import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcProgressBar from './OcProgressBar.vue'

describe('OcProgressBar', () => {
  it('exposes the value and its limit to assistive tech', () => {
    const bar = mount(OcProgressBar, { props: { value: 50, max: 200 } })

    expect(bar.get('.oc-progress-bar').attributes('aria-valuenow')).toBe('50')
    expect(bar.get('.oc-progress-bar').attributes('aria-valuemax')).toBe('200')
  })

  it('omits the limit when the progress has none', () => {
    const bar = mount(OcProgressBar, { props: { value: 0, max: null } })

    expect(bar.get('.oc-progress-bar').attributes('aria-valuemax')).toBeUndefined()
  })
})
