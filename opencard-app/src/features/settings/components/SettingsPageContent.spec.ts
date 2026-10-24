import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import PagePropertyEditor from '../../../shared/ui/property-editor/PagePropertyEditor.vue'
import type { EditorItem } from '../../../shared/ui/property-editor/propertyEditor.types'
import SettingsPageContent from './SettingsPageContent.vue'
import type { SettingsCategoryViewModel } from '../composables/useSettingsViewModel'

function row(key: string, value: unknown): EditorItem {
  return {
    key,
    title: key,
    content: [{ type: 'editor', key: 'value', value, definition: { title: key, fieldType: 'string' } }],
  }
}

function category(overrides: Partial<SettingsCategoryViewModel> = {}): SettingsCategoryViewModel {
  return { key: 'general', title: 'General', cards: [], ...overrides }
}

describe('SettingsPageContent', () => {
  it('turns row previews and commits into setting intents', () => {
    const wrapper = mount(SettingsPageContent, {
      props: {
        viewModel: category({
          cards: [{
            key: 'interface', title: 'Interface', actions: [],
            items: [row('appearance.baseFontSize', 12)],
          }],
        }),
      },
    })

    const editor = wrapper.getComponent(PagePropertyEditor)
    editor.vm.$emit('editor-preview', { itemPath: ['appearance.baseFontSize'], editorKey: 'value', value: 14 })
    editor.vm.$emit('editor-commit', { itemPath: ['appearance.baseFontSize'], editorKey: 'value', value: 15 })

    expect(wrapper.emitted('intent')).toEqual([
      [{ type: 'setting.preview', key: 'appearance.baseFontSize', value: 14 }],
      [{ type: 'setting.change', key: 'appearance.baseFontSize', value: 15 }],
    ])
  })

  it('routes theme rows and card actions to the theme they belong to', () => {
    const wrapper = mount(SettingsPageContent, {
      props: {
        viewModel: category({
          key: 'appearance',
          title: 'Appearance',
          cards: [{
            key: 'theme:dark',
            title: 'Dark theme',
            actions: [{ key: 'theme-preset.delete', title: 'Delete imported theme' }],
            items: [row('preset', 'user:Forest'), row('name', 'Forest')],
          }],
        }),
      },
    })

    const editor = wrapper.getComponent(PagePropertyEditor)
    editor.vm.$emit('editor-commit', { itemPath: ['name'], editorKey: 'value', value: '  My theme  ' })
    editor.vm.$emit('editor-commit', { itemPath: ['preset'], editorKey: 'value', value: 'user:Forest' })
    editor.vm.$emit('editor-commit', { itemPath: ['font'], editorKey: 'value', value: '   ' })

    expect(wrapper.emitted('intent')).toEqual([
      [{ type: 'theme-name.change', themeId: 'dark', name: 'My theme' }],
      [{ type: 'theme-preset.change', themeId: 'dark', presetId: 'user:Forest' }],
      [{ type: 'theme-font.change', themeId: 'dark', value: 'system' }],
    ])
  })

  it('refuses to delete a theme preset that is not a saved user preset', () => {
    const mountWithPreset = (preset: string) => mount(SettingsPageContent, {
      props: {
        viewModel: category({
          key: 'appearance',
          cards: [{
            key: 'theme:dark',
            title: 'Dark theme',
            actions: [{ key: 'theme-preset.delete', title: 'Delete imported theme' }],
            items: [row('preset', preset)],
          }],
        }),
      },
    })

    const builtin = mountWithPreset('default')
    builtin.getComponent({ name: 'OcCard' }).vm.$emit('action', { key: 'theme-preset.delete' })
    expect(builtin.emitted('intent')).toBeUndefined()

    const saved = mountWithPreset('user:Forest')
    saved.getComponent({ name: 'OcCard' }).vm.$emit('action', { key: 'theme-preset.delete' })
    expect(saved.emitted('intent')).toEqual([
      [{ type: 'theme-preset.delete', themeId: 'dark', presetId: 'user:Forest' }],
    ])
  })

  it('scrolls the row named by focusKey into view and ignores a key that is not on the page', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    const viewModel = category({
      cards: [{ key: 'committer', title: 'Commit identity', actions: [], items: [row('versionControl.committerEmail', '')] }],
    })
    try {
      const missing = mount(SettingsPageContent, { props: { viewModel, focusKey: 'versionControl.unknown' } })
      await nextTick()
      expect(scrollIntoView).not.toHaveBeenCalled()
      missing.unmount()

      mount(SettingsPageContent, { props: { viewModel, focusKey: 'versionControl.committerEmail' } })
      await nextTick()
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})