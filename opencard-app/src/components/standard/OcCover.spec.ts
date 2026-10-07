import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCover from './OcCover.vue'

describe('OcCover', () => {



  it('hides an image that fails to load until the source changes', async () => {
    const wrapper = mount(OcCover, {
      props: { visual: { type: 'image', src: 'asset://broken.png' } },
    })

    await wrapper.get('.oc-cover__visual').trigger('error')
    expect(wrapper.find('.oc-cover__visual').exists()).toBe(false)
    expect(wrapper.get('.oc-cover').classes()).toContain('oc-cover--empty')

    await wrapper.setProps({ visual: { type: 'image', src: 'asset://replaced.png' } })
    expect(wrapper.get('.oc-cover__visual').attributes('src')).toBe('asset://replaced.png')
  })


})
