import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcCard from './OcCard.vue'

describe('OcCard', () => {
  it('re-emits only the key of a chosen header action', async () => {
    const wrapper = mount(OcCard, {
      props: {
        title: 'Layers',
        actions: [
          { key: 'add', icon: 'mdiPlayOutline', title: 'Add' },
          { key: 'remove', title: 'Remove' },
        ],
      },
    })

    const remove = wrapper.findAll('button').find(button => button.attributes('aria-label') === 'Remove')
    await remove!.trigger('click')

    expect(wrapper.emitted('action')).toEqual([[{ key: 'remove' }]])
  })
})
