import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import ShellPageFrame from './ShellPageFrame.vue'

it('returns opaque nested action keys to the header owner and keeps disabled actions inert', async () => {
  const onAction = vi.fn()
  const wrapper = mount(ShellPageFrame, {
    attachTo: document.body,
    slots: { default: '<div class="page-content">Content</div>' },
    props: { header: { title: 'Page', titleLoading: false, onAction, actions: [
      { key: 'blocked', icon: 'mdiContentSaveOutline', title: 'Blocked', disabled: true },
      { key: 'local', icon: 'mdiExport', title: 'Local', children: [{ key: 'page.custom-token', title: 'Child' }] },
    ] } },
  })
  try {
    await wrapper.get('button[aria-label="Blocked"]').trigger('click')
    expect(onAction).not.toHaveBeenCalled()
    await wrapper.get('button[aria-label="Local"]').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Child"]')!.click()
    expect(onAction).toHaveBeenCalledWith('page.custom-token')
    await wrapper.get('button[aria-label="Local"]').trigger('click')
    await flushPromises()
    const oldChild = document.body.querySelector<HTMLButtonElement>('button[aria-label="Child"]')!
    const nextOwner = vi.fn()
    await wrapper.setProps({ header: { ...wrapper.props('header')!, onAction: nextOwner } })
    expect(oldChild.isConnected).toBe(false)
    oldChild.click()
    expect(nextOwner).not.toHaveBeenCalled()
    await wrapper.setProps({ header: null })
    expect(wrapper.find('header').exists()).toBe(false)
    expect(wrapper.get('.page-content').text()).toBe('Content')


  } finally { wrapper.unmount() }
})
