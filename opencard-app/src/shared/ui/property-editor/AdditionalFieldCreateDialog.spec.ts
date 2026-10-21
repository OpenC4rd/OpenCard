import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import AdditionalFieldCreateDialog from './AdditionalFieldCreateDialog.vue'

describe('AdditionalFieldCreateDialog', () => {
  it('always renders the field type selector', () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
    const wrapper = mount(AdditionalFieldCreateDialog, {
      props: {
        open: true,
        fieldTypes: ['string', 'number'],
        fieldType: 'string',
        fieldKey: '',
        title: '',
      },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })

    expect(wrapper.findComponent({ name: 'OcSelect' }).props('options')).toEqual([
      { value: 'string', label: 'Text' },
      { value: 'number', label: 'Number' },
    ])
    const titleInput = wrapper.findAll('input').find(input => input.attributes('placeholder') === '')
    expect(titleInput).toBeDefined()
  })

  it('uses the Key as a title placeholder and previews the real field editor without persisting a title', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
    const wrapper = mount(AdditionalFieldCreateDialog, {
      props: { open: true, fieldTypes: ['string', 'number'], fieldType: 'number', fieldKey: 'score', title: '' },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })

    expect(wrapper.findAll('input').some(input => input.attributes('placeholder') === 'score')).toBe(true)
    expect(wrapper.get('.additional-field-dialog__preview-field').text()).toContain('score')
    expect(wrapper.getComponent({ name: 'PropertyFieldRenderer' }).props('value')).toBe('0')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number' }]])
  })

  it('edits number constraints through PropertyEditor and submits a typed definition', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
    const wrapper = mount(AdditionalFieldCreateDialog, {
      props: { open: true, fieldTypes: ['string', 'number'], fieldType: 'number', fieldKey: 'score', title: 'Score' },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })
    await wrapper.get('.additional-field-dialog__advanced-toggle').trigger('click')
    const editor = wrapper.getComponent({ name: 'PropertyEditor' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'min', value: '10' })
    editor.vm.$emit('add-property', { key: 'additional-field-definition', fieldKey: 'step', value: '2' })
    await nextTick()
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number', title: 'Score', min: 10, step: 2 }]])
  })

  it('clears incompatible constraints after changing type', async () => {    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
    const wrapper = mount(AdditionalFieldCreateDialog, {
      props: { open: true, fieldTypes: ['string', 'number'], fieldType: 'number', fieldKey: 'value', title: '' },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })
    await wrapper.get('.additional-field-dialog__advanced-toggle').trigger('click')
    wrapper.getComponent({ name: 'PropertyEditor' }).vm.$emit('add-property', {
      key: 'additional-field-definition', fieldKey: 'min', value: '10',
    })
    await wrapper.setProps({ fieldType: 'string' })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'string' }]])
  })

  it('locks the key, seeds constraints and offers removal when editing a definition', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
    const wrapper = mount(AdditionalFieldCreateDialog, {
      props: {
        open: true, mode: 'edit', fieldTypes: ['string', 'number'], fieldType: 'number',
        fieldKey: 'score', title: 'Points',
        initialDefinition: { fieldType: 'number', title: 'Points', min: 3, step: 2 },
      },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })

    const keyInput = wrapper.findAll('input').find(input => (input.element as HTMLInputElement).value === 'score')
    expect(keyInput?.attributes('readonly')).toBeDefined()
    expect(wrapper.findComponent({ name: 'OcSelect' }).props('readonly')).toBe(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toEqual([[{ fieldType: 'number', title: 'Points', min: 3, step: 2 }]])

    const remove = wrapper.get('.additional-field-dialog__remove')
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toBeUndefined()
    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([[]])
  })
})
