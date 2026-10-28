import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import AdditionalFieldCreateDialog from './AdditionalFieldCreateDialog.vue'

function mountDialog(props: Record<string, unknown>) {
  return mount(AdditionalFieldCreateDialog, {
    props: {
      open: true,
      fieldTypes: ['string', 'number'],
      fieldType: 'number',
      fieldKey: 'score',
      title: '',
      ...props,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { teleport: true },
    },
  })
}

describe('AdditionalFieldCreateDialog', () => {
  it('omits a blank title from the submitted definition', async () => {
    const wrapper = mountDialog({})

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number' }]])
  })

  it('submits number constraints typed through the field editor', async () => {
    const wrapper = mountDialog({ title: 'Score' })
    await wrapper.get('.additional-field-dialog__advanced-toggle').trigger('click')
    const editor = wrapper.getComponent({ name: 'PropertyEditor' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'min', value: '10' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'step', value: '2' })
    await nextTick()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number', title: 'Score', min: 10, step: 2 }]])
  })

  it('drops constraints that no longer apply after the type changes', async () => {
    const wrapper = mountDialog({ fieldKey: 'value' })
    await wrapper.get('.additional-field-dialog__advanced-toggle').trigger('click')
    wrapper.getComponent({ name: 'PropertyEditor' }).vm.$emit('add-property', {
      key: 'additional-field-definition', fieldKey: 'min', value: '10',
    })
    await wrapper.setProps({ fieldType: 'string' })
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'string' }]])
  })

  it('seeds constraints from the definition being edited and requires a second click to remove', async () => {
    const wrapper = mountDialog({
      mode: 'edit',
      title: 'Points',
      initialDefinition: { fieldType: 'number', title: 'Points', min: 3, step: 2 },
    })

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number', title: 'Points', min: 3, step: 2 }]])

    const remove = wrapper.get('.additional-field-dialog__remove')
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toBeUndefined()
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[]])
  })

  it('submits filePath target and pattern filter constraints', async () => {
    const wrapper = mountDialog({
      fieldTypes: ['string', 'filePath'],
      fieldType: 'filePath',
      fieldKey: 'assetPath',
      title: 'Asset',
    })
    await wrapper.get('.additional-field-dialog__advanced-toggle').trigger('click')
    const editor = wrapper.getComponent({ name: 'PropertyEditor' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'target', value: 'file' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'pattern', value: ' *.ocblock ' })
    await nextTick()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{
      fieldType: 'filePath',
      title: 'Asset',
      filter: { target: 'file', pattern: '*.ocblock' },
    }]])
  })
})
