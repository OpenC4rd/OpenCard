import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import PagePropertyEditor from './PagePropertyEditor.vue'
import PropertyFieldRenderer from './PropertyFieldRenderer.vue'
import type { EditorItem } from './propertyEditor.types'

describe('PagePropertyEditor', () => {
  it('renders recursive mixed content and emits native values with item paths', async () => {
    const items: EditorItem[] = [{
      key: 'group',
      title: 'Group',
      children: [{
        key: 'value',
        title: 'Value',
        content: [
          { type: 'editor', key: 'number', value: 12, definition: {
            title: 'Value', fieldType: 'number', presentation: 'slider', min: 10, max: 16,
          } },
          'px',
          { type: 'action', key: 'reset', title: 'Reset', icon: 'mdiRestart',
            iconOnly: true, variant: 'outline' },
        ],
      }],
    }]
    const wrapper = mount(PagePropertyEditor, { props: { items } })
    const field = wrapper.getComponent(PropertyFieldRenderer)

    field.vm.$emit('preview:value', '14')
    field.vm.$emit('commit:value', '16')
    field.vm.$emit('commit:value', 'invalid')
    wrapper.getComponent(OcActionButton).vm.$emit('select', { key: 'reset' })

    expect(wrapper.text()).toContain('Group')
    expect(wrapper.text()).toContain('px')
    expect(wrapper.findAll('.page-property-editor-item')[1].attributes('style'))
      .toContain('var(--oc-indent-step) * 1')
    expect(wrapper.emitted('editor-preview')).toEqual([[
      { itemPath: ['group', 'value'], editorKey: 'number', value: 14 },
    ]])
    expect(wrapper.emitted('editor-commit')).toEqual([[
      { itemPath: ['group', 'value'], editorKey: 'number', value: 16 },
    ]])
    expect(wrapper.emitted('action')).toEqual([[
      { itemPath: ['group', 'value'], actionKey: 'reset' },
    ]])
  })

  it('decodes boolean commits and allows content with children', () => {
    const items: EditorItem[] = [{
      key: 'parent',
      title: 'Parent',
      content: [{ type: 'editor', key: 'enabled', value: false,
        definition: { title: 'Enabled', fieldType: 'boolean' } }],
      children: [{ key: 'child', title: 'Child' }],
    }]
    const wrapper = mount(PagePropertyEditor, { props: { items } })

    wrapper.getComponent(PropertyFieldRenderer).vm.$emit('commit:value', 'true')

    expect(wrapper.findAll('.page-property-editor-item')).toHaveLength(2)
    expect(wrapper.emitted('editor-commit')).toEqual([[
      { itemPath: ['parent'], editorKey: 'enabled', value: true },
    ]])
  })
})
