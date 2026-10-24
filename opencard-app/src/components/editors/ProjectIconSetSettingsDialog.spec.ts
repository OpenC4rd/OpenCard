import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProjectIconSetSettingsDialog from './ProjectIconSetSettingsDialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('ProjectIconSetSettingsDialog', () => {
  it('saves a trimmed display name and Key', async () => {
    const wrapper = mount(ProjectIconSetSettingsDialog, {
      props: {
        open: true, name: 'Status icons', seriesKey: 'status', existingKeys: ['status'],
      },
      global: { stubs: { Teleport: true } },
    })
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue(' 状态图标 ')
    await inputs[1]!.setValue(' status-new ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ name: '状态图标', key: 'status-new' })
  })

  it('refuses an invalid and a case-insensitively duplicated Key', async () => {
    const wrapper = mount(ProjectIconSetSettingsDialog, {
      props: { open: true, name: 'Status icons', seriesKey: 'status', existingKeys: ['status', 'Actions'] },
      global: { stubs: { Teleport: true } },
    })
    const keyInput = () => wrapper.findAll('input')[1]!

    await keyInput().setValue('has space')
    expect(keyInput().attributes('aria-invalid')).toBe('true')

    await keyInput().setValue('ACTIONS')
    expect(keyInput().attributes('aria-invalid')).toBe('true')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
