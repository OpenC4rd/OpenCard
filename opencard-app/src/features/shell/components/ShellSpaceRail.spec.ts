import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ShellSpaceRail from './ShellSpaceRail.vue'

const spaces = [
  { key: 'welcome', labelKey: 'app.shell.space.welcome', icon: 'nav.welcome' },
  { key: 'workbench', labelKey: 'app.shell.space.workbench', icon: 'nav.workbench' },
  { key: 'settings', labelKey: 'app.shell.space.settings', icon: 'tool.settings' },
] as const

describe('ShellSpaceRail', () => {
  it('marks the active space and emits a typed selection', async () => {
    const wrapper = mount(ShellSpaceRail, {
      props: {
        activeSpace: 'workbench',
        spaces,
        label: 'Spaces',
        translate: key => ({
          'app.shell.space.welcome': 'Welcome',
          'app.shell.space.workbench': 'Workbench',
          'app.shell.space.settings': 'Settings',
        }[key] ?? key),
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[1]!.attributes('aria-current')).toBe('page')
    expect(buttons[1]!.attributes('aria-label')).toBe('Workbench')

    await buttons[2]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['settings']])
  })
})
