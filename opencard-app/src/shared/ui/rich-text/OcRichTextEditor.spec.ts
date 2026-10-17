import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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
    attachTo: document.body,
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
  it.each([
    '<p><span data-oc-fill-type="unexpected">A</span></p>',
    '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
    '<table><colgroup><col style="width: 80px"><col style="width: 120px"></colgroup><thead><tr><th colspan="2"><p>AB</p></th></tr></thead><tbody><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table>',
    '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr></tbody></table>',
  ])('preserves table content and geometry through source handoff: %s', async source => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; applyHtml: (html: string) => boolean; getHtml: () => string }
      expect(vm.applyHtml(source)).toBe(true)
      expect(vm.getHtml()).toBe(source)
      const before = vm.editor.getJSON()
      expect(vm.applyHtml(vm.editor.getHTML())).toBe(true)
      expect(vm.editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount() }
  })

  it('blocks handoff while ordinary editor composition is in progress', async () => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; flushPendingInput: () => boolean }
      vm.editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      expect(vm.flushPendingInput()).toBe(false)
      vm.editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      expect(vm.flushPendingInput()).toBe(true)
    } finally { wrapper.unmount() }
  })


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

  it('composes image fill, background and outline through previews, undo and source handoff', async () => {
    const wrapper = mount(OcRichTextEditor, {
      props: { initialHtml: '<p><mark style="background-color:yellow;color:inherit"><span data-oc-fill-type="image" data-oc-fill-source="assets/a.png" style="color:red;-webkit-text-stroke-width:1px;-webkit-text-stroke-color:blue">ABC</span></mark></p>',
        resolveImageSource: reference => `https://example.test/${reference}` },
      global: { plugins: [i18n] },
    })
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; getHtml: () => string; applyHtml: (html: string) => boolean;
        properties: { update: (mutation: { key: string; fieldKey: string; value: string }) => void } }
      const editor = vm.editor
      editor.commands.setTextSelection({ from: 2, to: 3 })
      const before = editor.getJSON()
      const depth = undoDepth(editor.state)
      const backgroundPicker = wrapper.findAllComponents(OcColorPicker)[1]!
      backgroundPicker.vm.$emit('preview', '#00000000')
      const clearedBackground = [...editor.view.dom.querySelectorAll<HTMLElement>('span')].find(span => span.textContent === 'B' && span.style.backgroundImage)!
      expect(clearedBackground.style.backgroundImage).not.toContain('yellow')
      expect(clearedBackground.style.backgroundImage).toContain('rgba(0, 0, 0, 0)')
      backgroundPicker.vm.$emit('cancel')
      const picker = wrapper.findAllComponents(OcColorPicker)[0]!
      picker.vm.$emit('preview', '#00ff00')
      const preview = [...editor.view.dom.querySelectorAll<HTMLElement>('span')].find(span => span.textContent === 'B' && span.style.backgroundImage === 'none')!
      expect(preview.style.color).toBe('rgb(0, 255, 0)')
      expect(editor.view.dom.innerHTML).toContain('https://example.test/assets/a.png')
      expect(editor.getJSON()).toEqual(before)
      expect(undoDepth(editor.state)).toBe(depth)
      picker.vm.$emit('cancel')
      expect(editor.view.dom.querySelector('span[style*="background-image: none"]')).toBeNull()
      vm.properties.update({ key: 'rich-text-selection', fieldKey: 'backgroundColor', value: '#ff0000' })
      expect(editor.getAttributes('textStyle')).toMatchObject({ textFillType: 'image', textFillSource: 'assets/a.png', textStrokeWidth: '1px' })
      expect(editor.getAttributes('highlight').color).toBe('#ff0000')
      editor.commands.undo()
      expect(editor.getJSON()).toEqual(before)
      picker.vm.$emit('commit', '#00ff00')
      expect(editor.getAttributes('textStyle')).toMatchObject({ textFillType: null, textFillSource: null, color: '#00ff00', textStrokeWidth: '1px' })
      expect(editor.getAttributes('highlight').color).toBe('yellow')
      const saved = vm.getHtml()
      expect(saved).not.toContain('example.test')
      expect(vm.applyHtml(saved)).toBe(true)
      editor.commands.setTextSelection({ from: 1, to: 2 })
      vm.properties.update({ key: 'rich-text-selection', fieldKey: 'backgroundColor', value: '#00000000' })
      expect(editor.getAttributes('highlight').color).toBeFalsy()
      expect(editor.getAttributes('textStyle').textFillType).toBe('image')
    } finally { wrapper.unmount() }
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
    ;(input.element as HTMLInputElement).focus()
    await flushPromises()
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
    await nextTick()
    expect(popover.props('open')).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('24px')
    await input.setValue('24')
    await input.trigger('blur')
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('24px')
    await wrapper.get('button[aria-label="增大字号"]').trigger('click')
    expect((wrapper.vm as unknown as { editor: Editor }).editor.getAttributes('textStyle').fontSize).toBe('28px')
    await input.setValue('1.5em')
    await input.trigger('keydown', { key: 'Enter' })
    expect((wrapper.vm as unknown as { editor: Editor }).editor.getAttributes('textStyle').fontSize).toBe('1.5em')
    wrapper.unmount()
  })

  it('uses the same length input rules for outline and shadow without replacing invalid drafts with zero', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const vm = wrapper.vm as unknown as { editor: Editor;
      properties: { update: (mutation: { key: string; fieldKey: string; value: string }) => void } }
    const update = (fieldKey: string, value: string) => vm.properties.update({ key: 'rich-text-selection', fieldKey, value })
    update('strokeWidth', '2')
    update('shadowOffsetX', '-3')
    update('shadowBlur', '0.5em')
    expect(vm.editor.getAttributes('textStyle')).toMatchObject({ textStrokeWidth: '2px', textShadowOffsetX: '-3px', textShadowBlur: '0.5em' })
    update('shadowOffsetX', '-')
    update('shadowBlur', '-2px')
    expect(vm.editor.getAttributes('textStyle')).toMatchObject({ textShadowOffsetX: '-3px', textShadowBlur: '0.5em' })
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
