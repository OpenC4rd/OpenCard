import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProjectIconSetSettingsDialog from './ProjectIconSetSettingsDialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('ProjectIconSetSettingsDialog', () => {
  const mountDialog = (name = 'Status icons') => mount(ProjectIconSetSettingsDialog, {
    props: { open: true, name, seriesKey: 'status' },
    global: { stubs: { Teleport: true } },
  })

  it('saves a trimmed display name', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('input')[0]!.setValue(' 状态图标 ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ name: '状态图标' })
  })

  it('shows the Key as the folder name and never edits it', () => {
    const keyInput = mountDialog().findAll('input')[1]!
    expect(keyInput.element.value).toBe('status')
    expect(keyInput.attributes('disabled')).toBeDefined()
  })

  it('refuses a blank display name', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('input')[0]!.setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
