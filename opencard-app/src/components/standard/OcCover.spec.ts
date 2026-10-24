import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCover from './OcCover.vue'

describe('OcCover', () => {
  it('hides a broken image and retries when its source changes', async () => {
    const wrapper = mount(OcCover, {
      props: { visual: { type: 'image', src: 'asset://broken.png' } },
    })

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)

    await wrapper.setProps({ visual: { type: 'image', src: 'asset://replaced.png' } })
    expect(wrapper.get('img').attributes('src')).toBe('asset://replaced.png')
  })
})
