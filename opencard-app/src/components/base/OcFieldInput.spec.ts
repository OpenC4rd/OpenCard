import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcFieldInput from './OcFieldInput.vue'

describe('OcFieldInput', () => {
  it('carries its own content inset, so a wrapping frame never has to set it', () => {
    const wrapper = mount(OcFieldInput, { props: { variant: 'plain' } })

    expect(wrapper.classes()).toContain('oc-field-input--plain')
    // jsdom does not evaluate the scoped stylesheet, so read the source to pin the invariant:
    // a `plain` field draws no surface but still insets its own text, and a context can zero it
    // through the token (the property panel does, because its row already provides the padding).
    const source = readFileSync(
      join(process.cwd(), 'src/components/base/OcFieldInput.vue'),
      'utf8',
    )
    const start = source.indexOf('\n.oc-field-input--plain {')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(source.slice(start, source.indexOf('}', start)))
      .toContain('padding: var(--oc-field-content-padding, var(--oc-space-1) var(--oc-space-2))')
  })
})
