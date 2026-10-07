import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import ShellWorkspaceFrame from './ShellWorkspaceFrame.vue'

it('returns opaque nested action keys to the header owner and keeps disabled actions inert', async () => {
  const onAction = vi.fn()
  const wrapper = mount(ShellWorkspaceFrame, {
    attachTo: document.body,
    props: { header: { title: 'Page', titleLoading: false, onAction, actions: [
      { key: 'blocked', icon: 'action.save', hoverTip: 'Blocked', disabled: true },
      { key: 'local', icon: 'action.export', hoverTip: 'Local', children: [{ key: 'page.custom-token', title: 'Child' }] },
    ] } },
  })
  try {
    await wrapper.get('button[aria-label="Blocked"]').trigger('click')
    expect(onAction).not.toHaveBeenCalled()
    await wrapper.get('button[aria-label="Local"]').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Child"]')!.click()
    expect(onAction).toHaveBeenCalledWith('page.custom-token')
  } finally { wrapper.unmount() }
})
