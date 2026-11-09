import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PropertyEditorFieldDefinition } from './propertyEditor.types'
import PropertyFieldRenderer from './PropertyFieldRenderer.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, te: () => false }) }))

function mountField(fieldType: string, value: unknown) {
  return mount(PropertyFieldRenderer, {
    props: {
      definition: { title: 'items', fieldType } as PropertyEditorFieldDefinition,
      editorId: 'field',
      value,
    },
  })
}

describe('PropertyFieldRenderer lists', () => {
  it('nests one list field per `[]`', () => {
    const wrapper = mountField('boolean[][]', [['true'], ['false', 'true']])

    expect(wrapper.findAll('.array-property-field')).toHaveLength(3)
    expect(wrapper.findAll('.array-property-field .array-property-field')).toHaveLength(2)
    expect(wrapper.findAllComponents({ name: 'BooleanPropertyField' })).toHaveLength(3)
  })

  it('writes nested edits back through every level', async () => {
    const wrapper = mountField('string[][]', [['a'], []])

    await wrapper.findAll('.array-property-field__add')[1]!.trigger('click')
    expect(wrapper.emitted('update:value')?.[0]).toEqual([[['a'], ['']]])

    const adds = wrapper.findAll('.array-property-field__add')
    await adds[adds.length - 1]!.trigger('click')
    expect(wrapper.emitted('update:value')?.[1]).toEqual([[['a'], [''], []]])
  })
})
