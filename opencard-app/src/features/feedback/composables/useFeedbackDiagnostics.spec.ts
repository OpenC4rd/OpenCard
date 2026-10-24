import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { useFeedbackDiagnostics } from './useFeedbackDiagnostics'

type Diagnostics = ReturnType<typeof useFeedbackDiagnostics>

function mountOwner() {
  let diagnostics!: Diagnostics
  const wrapper = mount(defineComponent({
    setup() {
      diagnostics = useFeedbackDiagnostics()
      return () => null
    },
  }))
  return { diagnostics, wrapper }
}

describe('useFeedbackDiagnostics', () => {
  it('keeps the latest uncaught error in memory after immediate redaction', async () => {
    const { diagnostics, wrapper } = mountOwner()
    const error = new Error('Failed to read C:\\Users\\Alice\\secret.ocdocument')
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }))
    await nextTick()

    expect(diagnostics.latestDiagnostics.value?.errorMessage).toContain('<local-path>')
    expect(diagnostics.latestDiagnostics.value?.errorMessage).not.toContain('Alice')
    wrapper.unmount()
  })

  it('removes global listeners when its owner unmounts', async () => {
    const { diagnostics, wrapper } = mountOwner()
    window.dispatchEvent(new ErrorEvent('error', { message: 'first' }))
    await nextTick()
    expect(diagnostics.latestDiagnostics.value?.errorMessage).toBe('first')

    wrapper.unmount()
    window.dispatchEvent(new ErrorEvent('error', { message: 'second' }))
    expect(diagnostics.latestDiagnostics.value?.errorMessage).toBe('first')
  })
})
