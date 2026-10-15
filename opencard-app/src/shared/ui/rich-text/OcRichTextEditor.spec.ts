import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n, setAppLocale } from '../../../i18n'
import OcRichTextEditor from './OcRichTextEditor.vue'
import OcAutocompletePopover from '../../../components/standard/OcAutocompletePopover.vue'
import type { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import OcColorPicker from '../../../components/standard/OcColorPicker.vue'
import { fromCssFontFamily } from '../../../features/workspace/model/projectFonts'

beforeEach(() => setAppLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(): VueWrapper {
  return mount(OcRichTextEditor, {
    props: { initialHtml: '<p>Hello</p>' },
    global: { plugins: [i18n] },
  })
}

function alignmentLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.oc-rich-text-editor__toolbar button')
    .map(button => button.attributes('aria-label') ?? '')
    .filter(label => /^(Align left|Center|Align right|Justify|左对齐|居中|右对齐|两端对齐)$/.test(label))
}

describe('OcRichTextEditor locale reactivity', () => {


  it('renders resolved image fill while saving only stable resource references', async () => {
    const wrapper = mount(OcRichTextEditor, {
      props: { initialHtml: '<p><span data-oc-fill-type="image" data-oc-fill-source="素材/a.png" style="font-family: &quot;font:brand&quot;;">AB</span></p>',
        fontOptions: [{ label: 'Brand', value: 'font:brand', cssFamily: 'ScopedBrand' }],
        resolveImageSource: () => 'https://example.test/resolved.png' },
      global: { plugins: [i18n] },
    })
    await nextTick()
    const vm = wrapper.vm as unknown as { editor: Editor; getHtml: () => string }
    vm.editor.commands.setTextSelection({ from: 1, to: 3 })
    vm.editor.commands.setColor('#ff0000')
    expect(vm.editor.view.dom.innerHTML).toContain('resolved.png')
    const saved = vm.getHtml()
    const document = new DOMParser().parseFromString(saved, 'text/html')
    expect(fromCssFontFamily(document.querySelector('span')!.style.fontFamily)).toBe('font:brand')
    expect(saved).toContain('素材/a.png')
    expect(saved).not.toMatch(/ScopedBrand|resolved\.png|--oc-rich-font|data-oc-font/)
    wrapper.unmount()
  })

  it('previews without changing content or history, and commits one undoable color change', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const editor = (wrapper.vm as unknown as { editor: Editor }).editor
    editor.commands.setTextSelection({ from: 1, to: 6 })
    const original = editor.getJSON()
    const depth = undoDepth(editor.state)
    const picker = wrapper.findAllComponents(OcColorPicker)[0]!
    picker.vm.$emit('open-change', true)
    picker.vm.$emit('preview', '#ff0000')
    expect(editor.getJSON()).toEqual(original)
    expect(undoDepth(editor.state)).toBe(depth)
    picker.vm.$emit('cancel')
    expect(editor.getJSON()).toEqual(original)
    picker.vm.$emit('preview', '#00ff00')
    picker.vm.$emit('commit', '#00ff00')
    expect(editor.getAttributes('textStyle').color).toBe('#00ff00')
    expect(undoDepth(editor.state)).toBe(depth + 1)
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(original)
    wrapper.unmount()
  })


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
    await input.setValue('24')
    await nextTick()
    await nextTick()
    await input.trigger('keydown', { key: 'Enter' })
    expect((wrapper.vm as unknown as { editor: Editor }).editor.getAttributes('textStyle').fontSize).toBe('24px')
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
