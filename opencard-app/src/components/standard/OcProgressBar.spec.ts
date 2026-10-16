import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcProgressBar from './OcProgressBar.vue'

describe('OcProgressBar', () => {
  it('fills by the ratio and clamps at the limit', () => {
    const bar = mount(OcProgressBar, { props: { value: 50, max: 200 } })
    expect(bar.get('.oc-progress-bar__fill').attributes('style')).toContain('width: 25%')
    expect(bar.get('.oc-progress-bar').attributes('aria-valuenow')).toBe('50')
    expect(bar.get('.oc-progress-bar').attributes('aria-valuemax')).toBe('200')

    const over = mount(OcProgressBar, { props: { value: 300, max: 200 } })
    expect(over.get('.oc-progress-bar__fill').attributes('style')).toContain('width: 100%')
  })

  it('draws no fill without a limit and shows the text', () => {
    const bar = mount(OcProgressBar, { props: { value: 0, max: null, text: '0B' } })
    expect(bar.get('.oc-progress-bar__fill').attributes('style')).toContain('width: 0%')
    expect(bar.get('.oc-progress-bar').attributes('aria-valuemax')).toBeUndefined()
    expect(bar.text()).toBe('0B')
  })
})
