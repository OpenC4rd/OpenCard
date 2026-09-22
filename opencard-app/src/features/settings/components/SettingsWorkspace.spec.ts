import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SettingsWorkspace from './SettingsWorkspace.vue'
import type { SettingsCategoryViewModel } from '../composables/useSettingsWorkspace'

describe('SettingsWorkspace', () => {
  it('renders one card per settings group and forwards row events', async () => {
    const viewModel: SettingsCategoryViewModel = {
      key: 'general',
      title: 'General',
      cards: [{
        key: 'interface',
        title: 'Interface',
        icon: 'tool.settings',
        actions: [],
        items: [{
          key: 'appearance.baseFontSize',
          title: 'Base font size',
          content: [{
            type: 'editor',
            key: 'value',
            value: 12,
            definition: { title: 'Base font size', fieldType: 'number', presentation: 'slider', min: 10, max: 16 },
          }],
        }],
      }],
    }
    const wrapper = mount(SettingsWorkspace, { props: { viewModel } })
    expect(wrapper.findAllComponents({ name: 'OcCard' })).toHaveLength(1)

    const editor = wrapper.findComponent({ name: 'PropertyFieldRenderer' })
    editor.vm.$emit('preview:value', '14')
    editor.vm.$emit('commit:value', '15')

    expect(wrapper.emitted('intent')).toEqual([
      [{ type: 'setting.preview', key: 'appearance.baseFontSize', value: 14 }],
      [{ type: 'setting.change', key: 'appearance.baseFontSize', value: 15 }],
    ])
  })

  it('turns theme card actions and theme rows into theme intents', () => {
    const viewModel: SettingsCategoryViewModel = {
      key: 'appearance',
      title: 'Appearance',
      cards: [{
        key: 'theme:dark',
        title: 'Dark theme',
        icon: 'data.symbol-color',
        actions: [
          { key: 'theme.copy', title: 'Copy this theme preset', icon: 'action.copy' },
          { key: 'theme.read', title: 'Read a theme preset from the clipboard', icon: 'action.import' },
          { key: 'theme-preset.delete', title: 'Delete imported theme', icon: 'action.delete' },
        ],
        items: [{
          key: 'preset',
          title: 'Preset',
          content: [{
            type: 'editor',
            key: 'value',
            value: 'user:Forest',
            definition: { title: 'Preset', fieldType: 'string', presentation: 'select', options: ['user:Forest'] },
          }],
        }, {
          key: 'name',
          title: 'Theme name',
          content: [{
            type: 'editor',
            key: 'value',
            value: 'Forest',
            definition: { title: 'Theme name', fieldType: 'string', commitMode: 'blur' },
          }],
        }],
      }],
    }
    const wrapper = mount(SettingsWorkspace, { props: { viewModel } })

    const card = wrapper.findComponent({ name: 'OcCard' })
    card.vm.$emit('action', { key: 'theme-preset.delete' })
    card.vm.$emit('action', { key: 'theme.read' })
    const rows = wrapper.findAllComponents({ name: 'PropertyFieldRenderer' })
    rows[0]!.vm.$emit('commit:value', 'user:Forest')
    rows[1]!.vm.$emit('commit:value', '  My theme  ')

    expect(wrapper.emitted('intent')).toEqual([
      [{ type: 'theme-preset.delete', themeId: 'dark', presetId: 'user:Forest' }],
      [{ type: 'theme.read', themeId: 'dark' }],
      [{ type: 'theme-preset.change', themeId: 'dark', presetId: 'user:Forest' }],
      [{ type: 'theme-name.change', themeId: 'dark', name: 'My theme' }],
    ])
  })

  it('maps the author and project workspace card actions', () => {
    const viewModel: SettingsCategoryViewModel = {
      key: 'general',
      title: 'General',
      cards: [
        {
          key: 'identity',
          title: 'Author identity',
          actions: [{ key: 'identity.regenerate', title: 'Generate a new author ID', icon: 'action.refresh' }],
          items: [],
        },
        {
          key: 'file-tree',
          title: 'File tree',
          actions: [{ key: 'project-workspace.reset', title: 'Reset this project’s interface state', icon: 'action.restart' }],
          items: [],
        },
      ],
    }
    const wrapper = mount(SettingsWorkspace, { props: { viewModel } })
    const cards = wrapper.findAllComponents({ name: 'OcCard' })
    cards[0]!.vm.$emit('action', { key: 'identity.regenerate' })
    cards[1]!.vm.$emit('action', { key: 'project-workspace.reset' })

    expect(wrapper.emitted('intent')).toEqual([
      [{ type: 'identity.regenerate' }],
      [{ type: 'project-workspace.reset' }],
    ])
  })

  it('keeps the appearance preview above the cards', () => {
    const viewModel: SettingsCategoryViewModel = {
      key: 'appearance', title: 'Appearance', preview: { glassIntensity: 72 }, cards: [],
    }
    const wrapper = mount(SettingsWorkspace, { props: { viewModel } })
    expect(wrapper.find('.settings-workspace__preview-glass').exists()).toBe(true)
    expect(wrapper.find('.settings-workspace__cards').exists()).toBe(true)
  })

  it('brings the row named by focusKey into view and highlights it', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const viewModel: SettingsCategoryViewModel = {
        key: 'versionControl',
        title: 'Version control',
        cards: [{
          key: 'committer',
          title: 'Commit identity',
          actions: [],
          items: [{
            key: 'versionControl.committerEmail',
            title: 'Committer email',
            content: [{
              type: 'editor',
              key: 'value',
              value: '',
              definition: { title: 'Committer email', fieldType: 'string', commitMode: 'blur' },
            }],
          }],
        }],
      }
      const wrapper = mount(SettingsWorkspace, {
        props: { viewModel, focusKey: 'versionControl.committerEmail' },
      })
      await nextTick()

      expect(scrollIntoView).toHaveBeenCalled()
      expect(wrapper.get('[data-item-key="versionControl.committerEmail"]').classes())
        .toContain('is-settings-focus')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})
