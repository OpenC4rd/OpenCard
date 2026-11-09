import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ArrayPropertyField from './ArrayPropertyField.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, te: () => false }) }))

/** 带内部状态的子编辑器：挂载时记下第一次收到的值。 */
const StatefulElement = defineComponent({
  props: { value: { type: String, default: '' } },
  setup(props) {
    const mountedWith = ref(props.value)
    return () => h('span', { class: 'element' }, mountedWith.value)
  },
})

function mountField(value: string[]) {
  return mount(ArrayPropertyField, {
    props: {
      definition: { title: 'items', fieldType: 'string[]' },
      elementDefinition: { title: 'items', fieldType: 'string', defaultValue: '' },
      value,
    },
    slots: { default: ({ value: item }) => h(StatefulElement, { value: String(item) }) },
  })
}

const mounted = (wrapper: ReturnType<typeof mountField>) => wrapper.findAll('.element').map(item => item.text())
const buttons = (wrapper: ReturnType<typeof mountField>, label: string) =>
  wrapper.findAll(`button[aria-label="${label}"]`)

describe('ArrayPropertyField', () => {
  it('keeps element editor state with its item when moving', async () => {
    const wrapper = mountField(['a', 'b', 'c'])

    await buttons(wrapper, 'Move up')[2]!.trigger('click')

    expect(mounted(wrapper)).toEqual(['a', 'c', 'b'])
  })

  it('keeps element editor state with its item when deleting duplicates', async () => {
    const wrapper = mountField(['a', 'a', 'b'])

    await buttons(wrapper, 'Delete item')[0]!.trigger('click')

    expect(mounted(wrapper)).toEqual(['a', 'b'])
  })

  it('adds the element default value', async () => {
    const wrapper = mountField(['a'])

    await wrapper.find('.array-property-field__add').trigger('click')

    expect(wrapper.emitted('update:value')?.[0]).toEqual([['a', '']])
  })
})
