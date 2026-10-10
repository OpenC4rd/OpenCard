import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n, setAppLocale } from '../../../i18n'
import OcRichTextEditor from './OcRichTextEditor.vue'
import OcAutocompletePopover from '../../../components/standard/OcAutocompletePopover.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(): VueWrapper {
  return mount(OcRichTextEditor, {
    props: { modelValue: '<p>Hello</p>' },
    global: { plugins: [i18n] },
  })
}

function alignmentLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.oc-rich-text-editor__toolbar button')
    .map(button => button.attributes('aria-label') ?? '')
    .filter(label => /^(Align left|Center|Align right|Justify|左对齐|居中|右对齐|两端对齐)$/.test(label))
}

describe('OcRichTextEditor locale reactivity', () => {
  it('anchors toolbar completion to the focused input and preserves a custom value', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const input = wrapper.get('.oc-rich-text-editor__font-size input')
    await input.trigger('focus')
    const popover = wrapper.findAllComponents(OcAutocompletePopover)[1]!
    expect(popover.props('anchor')).toBe(input.element)
    expect(popover.props('open')).toBe(true)
    expect(popover.props('items').length).toBeGreaterThan(1)
    await input.setValue('13')
    await input.trigger('keydown', { key: 'Enter' })
    expect((wrapper.vm as unknown as { editor: { getAttributes: (name: string) => Record<string, unknown> } }).editor.getAttributes('textStyle').fontSize).toBe('13px')
    wrapper.unmount()
  })
  it('re-labels the font, stroke width and alignment controls when the language changes', async () => {
    setAppLocale('en-US')
    const wrapper = mountEditor()
    await nextTick()

    expect(alignmentLabels(wrapper)).toEqual(['Align left', 'Center', 'Align right', 'Justify'])

    setAppLocale('zh-CN')
    await nextTick()

    expect(alignmentLabels(wrapper)).toEqual(['左对齐', '居中', '右对齐', '两端对齐'])

    wrapper.unmount()
  })
})
