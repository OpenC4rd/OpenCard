import { mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import PropertyEditor from '../PropertyEditor.vue'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../../../features/workspace/services/projectIconCatalog'
import { i18n, setAppLocale } from '../../../../i18n'
import OcRichTextEditor from '../../rich-text/OcRichTextEditor.vue'
import RichTextPreview from '../../rich-text/RichTextPreview.vue'
import RichTextStringPropertyField from './RichTextStringPropertyField.vue'
import type { PropertyCompletionResult } from '../propertyEditor.types'
import { sanitizeRichTextHtml } from '../../../rich-text/richTextHtml'

beforeEach(() => setAppLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
})

describe('RichTextStringPropertyField', () => {
  it('opens empty content visually and preserves an empty source across handoff and saving', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      expect(document.querySelector('[role="alert"]')).toBeNull()
      expect(document.querySelector('[role="radio"][aria-label="富文本"]')?.getAttribute('aria-checked')).toBe('true')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const { editor, getHtml } = rich.vm as unknown as { editor: Editor; getHtml: () => string }
      expect(editor.isEmpty).toBe(true)
      expect(getHtml()).toBe('')
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
      await nextTick()
      const source = document.querySelector<HTMLTextAreaElement>('textarea')!
      expect(source.value).toBe('')
      source.value = '<p>Text</p>'
      source.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
      await nextTick()
      expect(editor.getText()).toBe('Text')
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
      await nextTick()
      const clearedSource = document.querySelector<HTMLTextAreaElement>('textarea')!
      clearedSource.value = ''
      clearedSource.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
      await nextTick()
      expect(document.querySelector('textarea')).toBeNull()
      expect(document.querySelector('[role="alert"]')).toBeNull()
      expect(getHtml()).toBe('')
      expect(editor.isEmpty).toBe(true)
      document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
      expect(wrapper.emitted('update:value')).toBeUndefined()
    } finally { wrapper.unmount() }
  })
  it('reads paragraph alignment from its rendered context without making inherited styles explicit', async () => {
    const style = document.createElement('style')
    // jsdom does not resolve inherited UA table styles; exercise the real cascade with paragraph rules.
    style.textContent = '.ProseMirror th p { text-align: center } .ProseMirror td p { text-align: end; direction: rtl }'
    document.head.append(style)
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<table><tbody><tr><th><p>H</p></th><td><p>D</p></td></tr></tbody></table>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const editor = (rich.vm as unknown as { editor: Editor }).editor
      const positions: number[] = []
      editor.state.doc.descendants((node, position) => { if (node.isTextblock) positions.push(position) })
      const field = () => wrapper.getComponent(PropertyEditor).props('inputs')[0]!
      const before = editor.getJSON()
      editor.commands.setTextSelection(positions[0]! + 1)
      await nextTick()
      expect(field().record.textAlign).toBe('center')
      expect(field().fields.textAlign).toMatchObject({ resettable: false, valueState: 'unset' })
      expect(rich.get('button[aria-label="居中"]').classes()).toContain('oc-button--active')
      editor.commands.setTextSelection(positions[1]! + 1)
      await nextTick()
      expect(field().record.textAlign).toBe('left')
      editor.commands.setTextSelection({ from: positions[0]! + 1, to: positions[1]! + 2 })
      await nextTick()
      expect(field().fields.textAlign?.valueState).toBe('mixed')
      expect(editor.getJSON()).toEqual(before)
      editor.commands.setTextSelection(positions[0]! + 1)
      editor.commands.setTextAlign('left')
      await nextTick()
      expect(field().record.textAlign).toBe('left')
      expect(field().fields.textAlign?.resettable).toBe(true)
      wrapper.getComponent(PropertyEditor).vm.$emit('reset-property', { key: 'rich-text-selection', fieldKey: 'textAlign' })
      await nextTick()
      expect(field().record.textAlign).toBe('center')
      expect(editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount(); style.remove() }
  })
  it.each(['<p>Hello</p>', '<p><video>Source only</video></p>'])('opens with focus in the active editor without ever focusing toolbar fields: %s', async value => {
    const focused: Element[] = []
    const captureFocus = (event: FocusEvent) => { if (event.target instanceof Element) focused.push(event.target) }
    document.addEventListener('focusin', captureFocus)
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(focused.some(element => element.closest('.oc-rich-text-editor__toolbar'))).toBe(false)
      const target = value.includes('video') ? document.querySelector('textarea') : document.querySelector('[contenteditable="true"]')
      expect(document.activeElement).toBe(target)
      expect(document.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      document.removeEventListener('focusin', captureFocus)
      wrapper.unmount()
    }
  })
  it('resets explicit formatting by removing it, including values equal to inheritance and paragraph alignment', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true, richTextBaseStyle: { fontSize: '16px' } },
        value: '<p style="text-align:left"><span style="font-size:16px;color:red">a</span>b</p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const vm = rich.vm as unknown as { editor: Editor; getHtml: () => string }
      vm.editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      const reset = async (field: string) => {
        await wrapper.getComponent(PropertyEditor).get(`[data-field-key="${field}"] button[aria-label="重置"]`).trigger('pointerdown')
        await wrapper.getComponent(PropertyEditor).get(`[data-field-key="${field}"] button[aria-label="重置"]`).trigger('click')
      }
      await reset('fontSize')
      expect(vm.getHtml()).not.toContain('font-size')
      expect(vm.getHtml()).toContain('color: red')
      expect(wrapper.getComponent(PropertyEditor).find('[data-field-key="fontSize"] button[aria-label="重置"]').exists()).toBe(false)
      await reset('foregroundColor')
      await reset('textAlign')
      expect(vm.getHtml()).toBe('<p>ab</p>')
      vm.editor.commands.undo()
      expect(vm.editor.state.doc.firstChild!.attrs.textAlign).toBe('left')
      expect(vm.getHtml()).not.toContain('font-size')
    } finally { wrapper.unmount() }
  })

  it('clears only pending caret formatting without changing existing text or leaving empty style marks', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span style="font-size:24px">A</span></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
      editor.commands.setTextSelection(2)
      const panel = wrapper.getComponent(PropertyEditor)
      panel.vm.$emit('update-property', { key: 'rich-text-selection', fieldKey: 'fontSize', value: '12' })
      await nextTick()
      await panel.get('[data-field-key="fontSize"] button[aria-label="重置"]').trigger('click')
      expect(editor.state.doc.firstChild!.firstChild!.marks[0]!.attrs.fontSize).toBe('24px')
      editor.view.dispatch(editor.state.tr.insertText('X'))
      expect(editor.state.doc.firstChild!.lastChild!.text).toBe('X')
      expect(editor.state.doc.firstChild!.lastChild!.marks).toHaveLength(0)
    } finally { wrapper.unmount() }
  })

  it('uses the shared raw string editor and preserves independent shadow settings after reset and source handoff', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span data-oc-shadow-color="red" data-oc-shadow-offset-x="4px" data-oc-shadow-offset-y="5px">A</span></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const vm = wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor; getHtml: () => string; applyHtml: (html: string) => boolean }
      vm.editor.commands.setTextSelection({ from: 1, to: 2 })
      await nextTick()
      const panel = wrapper.getComponent(PropertyEditor)
      await panel.get('[data-field-key="foregroundColor"] button[aria-label="使用原始字符串编辑器"]').trigger('click')
      expect(panel.find('[data-field-key="foregroundColor"] .oc-color-picker').exists()).toBe(false)
      const raw = panel.get('[data-field-key="foregroundColor"] input')
      await raw.setValue('red')
      await raw.trigger('keydown', { key: 'Enter' })
      expect(vm.editor.getAttributes('textStyle').color).toBe('red')
      await panel.get('[data-field-key="foregroundColor"] button[aria-label="使用字段编辑器"]').trigger('click')
      expect(panel.find('[data-field-key="foregroundColor"] .oc-color-picker').exists()).toBe(true)
      await panel.get('[data-field-key="shadowOffsetX"] button[aria-label="重置"]').trigger('click')
      expect(vm.getHtml()).not.toContain('data-oc-shadow-offset-x')
      expect(vm.getHtml()).toContain('data-oc-shadow-offset-y="5px"')
      await panel.get('[data-field-key="shadowColor"] button[aria-label="重置"]').trigger('click')
      const saved = sanitizeRichTextHtml(vm.getHtml())
      expect(saved).not.toContain('data-oc-shadow-color')
      expect(saved).toContain('data-oc-shadow-offset-y="5px"')
      expect(vm.applyHtml(saved)).toBe(true)
      expect(vm.editor.getHTML()).toContain('data-oc-shadow-offset-y="5px"')
    } finally { wrapper.unmount() }
  })

  it('follows the character before the caret and keeps pending input marks only at that position', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true, richTextBaseStyle: { fontSize: '16px' } },
        value: '<p><span style="font-size:12px;color:red">AB</span><em><span style="font-size:24px;color:blue">CD</span></em></p><p></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const editor = (rich.vm as unknown as { editor: Editor }).editor
      const size = () => (rich.get('.oc-rich-text-editor__font-size input').element as HTMLInputElement).value
      editor.commands.setTextSelection(3)
      await nextTick()
      expect(size()).toBe('12px')
      editor.commands.setTextSelection(4)
      await nextTick()
      expect(size()).toBe('24px')
      const before = editor.getJSON()
      await rich.get('button[aria-label="粗体"]').trigger('click')
      expect(editor.getJSON()).toEqual(before)
      editor.view.dispatch(editor.state.tr.insertText('X'))
      const inserted = editor.state.doc.nodeAt(4)!
      expect(inserted.marks.map(mark => mark.type.name)).toEqual(expect.arrayContaining(['bold', 'italic']))
      expect(inserted.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('24px')
      editor.commands.setTextSelection(3)
      await nextTick()
      expect(size()).toBe('12px')
      expect(editor.isActive('bold')).toBe(false)
      expect(editor.isActive('italic')).toBe(false)
      editor.view.dispatch(editor.state.tr.insertText('Y'))
      expect(editor.state.doc.nodeAt(3)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('12px')
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      await nextTick()
      expect(size()).toBe('16px')
      expect(editor.isActive('bold')).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('recognizes inherited size and equivalent CSS colors as common selection values without rewriting them', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true, richTextBaseStyle: { fontSize: '20px' } },
        value: '<p><strong><span style="color:red">A</span><span style="font-size:20px;color:#ff0000">B</span></strong></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const editor = (rich.vm as unknown as { editor: Editor }).editor
      const before = editor.getJSON()
      editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      expect((rich.get('.oc-rich-text-editor__font-size input').element as HTMLInputElement).value).toBe('20px')
      expect((wrapper.getComponent(PropertyEditor).get('[data-field-key="foregroundColor"] input').element as HTMLInputElement).value).toBe('#FF0000')
      expect(editor.isActive('bold')).toBe(true)
      expect(editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount() }
  })

  it('changes only the requested selection property and types over it using its first character format', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span style="font-size:10px">O</span><strong><span style="font-size:12px;color:red">A</span><span style="font-size:24px;color:blue">B</span></strong></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const rich = wrapper.getComponent(OcRichTextEditor)
      const editor = (rich.vm as unknown as { editor: Editor }).editor
      editor.commands.setTextSelection({ from: 2, to: 4 })
      await nextTick()
      expect((rich.get('.oc-rich-text-editor__font-size input').element as HTMLInputElement).value).toBe('')
      expect(editor.isActive('bold')).toBe(true)
      const color = wrapper.getComponent(PropertyEditor).get('[data-field-key="foregroundColor"] input')
      await color.trigger('pointerdown')
      await color.setValue('#00FF00')
      await color.trigger('keydown', { key: 'Enter' })
      expect(editor.state.doc.nodeAt(2)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('12px')
      expect(editor.state.doc.nodeAt(3)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('24px')
      editor.view.dispatch(editor.state.tr.insertText('X'))
      expect(editor.state.doc.textContent).toBe('OX')
      const inserted = editor.state.doc.nodeAt(2)!
      expect(inserted.marks.some(mark => mark.type.name === 'bold')).toBe(true)
      expect(inserted.marks.find(mark => mark.type.name === 'textStyle')?.attrs).toMatchObject({ fontSize: '12px', color: '#00FF00' })
      expect(editor.state.doc.nodeAt(1)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('10px')
    } finally { wrapper.unmount() }
  })

  it('opens real fill and color panels and keeps glyph fill independent of the background', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Hello</p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
      editor.commands.setTextSelection({ from: 1, to: 6 })
      await nextTick()
      const dialog = document.querySelector('[data-oc-modal-root]')!
      const chooseFill = async (label: string) => {
        dialog.querySelector<HTMLButtonElement>('[data-field-key="foregroundType"] [role="combobox"]')!.click()
        await nextTick()
        expect(dialog.contains(document.querySelector('.oc-select__floating'))).toBe(true)
        ;[...dialog.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent?.includes(label))!.click()
        await nextTick()
      }
      await chooseFill('纯色')
      expect(editor.getAttributes('highlight').color).toBeFalsy()
      expect(editor.getAttributes('textStyle')).toEqual({})
      await chooseFill('图片')
      dialog.querySelector<HTMLButtonElement>('.oc-rich-text-editor__toolbar button[aria-label="文字背景色"]')!.click()
      await nextTick()
      expect(dialog.contains(document.querySelector('.oc-color-picker__floating'))).toBe(true)
      dialog.querySelector<HTMLButtonElement>('.oc-color-picker__preset')!.click()
      await nextTick()
      expect(editor.getAttributes('highlight').color).toBeTruthy()
      expect(editor.getAttributes('textStyle').textFillType).toBe('image')
      const background = editor.getAttributes('highlight').color
      await chooseFill('图片')
      expect(editor.getAttributes('highlight').color).toBe(background)
      expect(dialog.querySelector('[data-field-key="backgroundColor"] input')).not.toBeNull()
      dialog.querySelector<HTMLButtonElement>('[data-field-key="foregroundType"] button[aria-label="重置"]')!.click()
      await nextTick()
      expect(editor.getAttributes('highlight').color).toBe(background)
      expect(editor.getAttributes('textStyle')).toEqual({})
      expect(dialog.querySelector('[data-field-key="foregroundColor"] input')).not.toBeNull()
    } finally { wrapper.unmount() }
  })

  it('edits, saves, reopens and hands off merged table geometry without losing content', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<table><tbody><tr><td colspan="2" colwidth="80,120"><p>AB</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table>' },
    })
    try {
      expect(wrapper.getComponent(RichTextPreview).find('col').attributes('style')).toContain('80px')
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      await nextTick()
      const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
      expect(document.querySelector('.rich-text-string-popover__diagnostics')).toBeNull()
      editor.commands.setTextSelection(4)
      await nextTick()
      const click = async (label: string) => {
        document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
        await nextTick()
      }
      await click('表格操作')
      await click('拆分单元格')
      expect(editor.view.dom.querySelectorAll('td')).toHaveLength(4)
      const cells: number[] = []
      editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') cells.push(pos) })
      editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0]!, cells[1]!)))
      await nextTick()
      await click('表格操作')
      await click('合并单元格')
      expect(editor.view.dom.querySelector('td')?.getAttribute('colspan')).toBe('2')
      await click('保存富文本编辑')
      const saved = wrapper.emitted('update:value')?.[0]?.[0] as string
      expect(saved).toContain('AB')
      expect(saved).toContain('colwidth="80,120"')
      const sanitized = new DOMParser().parseFromString(sanitizeRichTextHtml(saved.replace('<table', '<table onclick="bad()"')), 'text/html')
      expect(sanitized.querySelector('table')?.hasAttribute('onclick')).toBe(false)
      expect(sanitized.querySelector('td')?.getAttribute('colspan')).toBe('2')
      expect(sanitized.querySelector('td')?.getAttribute('colwidth')).toBe('80,120')
      await wrapper.setProps({ value: saved })
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      await nextTick()
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
      await nextTick()
      expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(saved)
      document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
      await nextTick()
      expect(document.querySelector('.rich-text-string-popover__diagnostics')).toBeNull()
      expect(document.querySelector('.oc-rich-text-editor__content td')?.getAttribute('colspan')).toBe('2')
      expect(wrapper.getComponent(RichTextPreview).find('td').attributes('colspan')).toBe('2')
    } finally { wrapper.unmount() }
  })

  it('displays mixed color without committing a fallback when the field only receives focus', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span style="color: #ff0000">A</span><span style="color: #0000ff">B</span></p>' },
    })
    try {
      await wrapper.get('.rich-text-string-field__preview').trigger('click')
      const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
      editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      const before = editor.getJSON()
      const input = wrapper.getComponent(PropertyEditor).get('[data-field-key="foregroundColor"] input')
      expect(input.attributes('placeholder')).toBe('混合')
      expect((input.element as HTMLInputElement).value).toBe('')
      await input.trigger('focus')
      await input.trigger('blur')
      expect(editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount() }
  })

  it('preserves pending caret formatting across consecutive real sidebar inputs', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Hello</p>' },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.commands.setTextSelection(6)
    const size = wrapper.getComponent(OcRichTextEditor).get('.oc-rich-text-editor__font-size input')
    await size.trigger('pointerdown')
    await size.setValue('24')
    await size.trigger('blur')
    await nextTick()
    const color = wrapper.getComponent(PropertyEditor).get('[data-field-key="foregroundColor"] input')
    await color.trigger('pointerdown')
    await color.setValue('#F14C4C')
    await color.trigger('keydown', { key: 'Enter' })
    editor.commands.insertContent('X')
    const style = editor.state.doc.firstChild!.lastChild!.marks.find(mark => mark.type.name === 'textStyle')!.attrs
    expect(style.fontSize).toBe('24px')
    expect(style.color).toBe('#F14C4C')
    wrapper.unmount()
  })

  it('keeps mixed formatting intact when the real sidebar updates an unrelated attribute', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Hello</p>' },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.commands.setContent('<p><span style="font-size: 12px; color: red;">A</span><span style="font-size: 24px; color: blue;">B</span></p>', false)
    editor.commands.setTextSelection({ from: 1, to: 3 })
    await nextTick()
    expect((wrapper.getComponent(OcRichTextEditor).get('.oc-rich-text-editor__font-size input').element as HTMLInputElement).value).toBe('')
    const input = wrapper.getComponent(PropertyEditor).get('[data-field-key="strokeWidth"] input')
    await input.trigger('pointerdown')
    await input.setValue('2px')
    await input.trigger('keydown', { key: 'Enter' })
    const marks = editor.state.doc.firstChild!.content.content.map(node => node.marks.find(mark => mark.type.name === 'textStyle')!.attrs)
    expect(marks.map(attrs => attrs.fontSize)).toEqual(['12px', '24px'])
    expect(marks.map(attrs => attrs.color)).toEqual(['red', 'blue'])
    expect(marks.map(attrs => attrs.textStrokeWidth)).toEqual(['2px', '2px'])
    wrapper.unmount()
  })

  it('keeps node and cell selection types when the real sidebar changes formatting', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Hello</p>' },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.commands.setContent('<p><span data-oc-binding="self:name">{{self:name}}</span></p>', false)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)))
    await wrapper.getComponent(PropertyEditor).trigger('pointerdown')
    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', { key: 'rich-text-selection', fieldKey: 'fontSize', value: '24' })
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.doc.nodeAt(1)?.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('24px')
    editor.commands.setContent('<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>', false)
    const cells: number[] = []
    editor.state.doc.descendants((node, position) => { if (node.type.name === 'tableCell') cells.push(position) })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0]!, cells[1]!)))
    await wrapper.getComponent(PropertyEditor).trigger('pointerdown')
    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', { key: 'rich-text-selection', fieldKey: 'foregroundColor', value: '#ff0000' })
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    wrapper.unmount()
  })

  it('round-trips centered bindings and image fill containing package icons without losing the fill', async () => {
    const html = '<p style="text-align: center;"><span data-oc-binding="card:name">{{card:name}}</span></p><p style="text-align: center;"></p><p style="text-align: center;">aaa<span data-oc-icon-path="icon:hua-se/fang-kuai"></span><span data-oc-icon-path="icon:hua-se/fang-kuai"></span><span data-oc-icon-path="icon:hua-se/fang-kuai"></span>aa<span data-oc-fill-type="image" data-oc-fill-source="素材/卡绘/借刀杀人.png">aa<span data-oc-icon-path="game-icons.net/game-icons@1.0.0#icon:rank/achievement"></span></span></p>'
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: html },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    expect(wrapper.getComponent(OcRichTextEditor).isVisible()).toBe(true)
    expect(document.querySelector('.rich-text-string-popover__diagnostics')).toBeNull()
    const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    expect(editor.getHTML()).toBe(html)
    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
    await nextTick()
    expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(html)
    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
    await nextTick()
    expect(wrapper.getComponent(OcRichTextEditor).isVisible()).toBe(true)
    expect(editor.getHTML()).toBe(html)
    wrapper.unmount()
  })

  it('flushes composed binding input on save and ignores completion after the dialog closes', async () => {
    let resolveCompletion!: (result: PropertyCompletionResult) => void
    const provider = vi.fn(() => new Promise<PropertyCompletionResult>(resolve => { resolveCompletion = resolve }))
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true, binding: { provider } },
        value: '<p><span data-oc-binding="self:name">{{self:name}}</span></p>' },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    const editor = (wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.view.dom.querySelector('.binding-node__label')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    const input = document.querySelector<HTMLInputElement>('.binding-node__input')!
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = 'self:名称'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    expect(editor.getHTML()).toContain('data-oc-binding="self:name"')
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
    await nextTick()
    expect(wrapper.emitted('update:value')?.[0]?.[0]).toContain('data-oc-binding="self:名称"')
    resolveCompletion({ replaceStart: 2, replaceEnd: 2, items: [{ key: 'late', label: 'Late', insertText: 'late' }] })
    await Promise.resolve()
    await nextTick()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(wrapper.emitted('update:value')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the same editor and history through source edits, preserving untouched HTML', async () => {
    const original = '<p>  Hello <b>世界</b></p>'
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body, global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: original },
    })
    const switchView = async (label: string) => {
      document.querySelector<HTMLButtonElement>(`[role="radio"][aria-label="${label}"]`)!.click()
      await nextTick()
    }
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    const component = wrapper.getComponent(OcRichTextEditor)
    const editor = (component.vm as unknown as { editor: Editor }).editor
    await switchView('HTML 源码')
    expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(original)
    await switchView('富文本')
    editor.commands.insertContent('Added')
    const beforeSource = editor.getJSON()
    await switchView('HTML 源码')
    const source = document.querySelector<HTMLTextAreaElement>('textarea')!
    source.value = '<p>Source change</p>'
    source.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await switchView('富文本')
    expect((wrapper.getComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor).toBe(editor)
    expect(editor.getText()).toBe('Source change')
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(beforeSource)
    editor.commands.undo()
    await switchView('HTML 源码')
    expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(original)
    document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps dynamic style bindings when switching source and visual modes', async () => {
    const sourceHtml = '<p><mark style="background-color: {{parent.color}}; color: inherit;">Text</mark></p>'
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: sourceHtml },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
    await nextTick()
    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="HTML 源码"]')!.value)
      .toContain('background-color: {{parent.color}}; color: inherit;')
    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
    await nextTick()
    document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })
  it('writes a local draft only when the user saves', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p>Original</p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    let editor = (wrapper.findComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.commands.setContent('<p>Cancelled</p>', true)

    expect(wrapper.emitted('update:value')).toBeUndefined()
    document.querySelector<HTMLButtonElement>('[aria-label="取消富文本编辑"]')!.click()
    await nextTick()
    expect(wrapper.emitted('update:value')).toBeUndefined()

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    editor = (wrapper.findComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.commands.setContent('<p>Saved</p>', true)
    document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
    await nextTick()

    expect(wrapper.emitted('update:value')).toEqual([['<p>Saved</p>']])
    wrapper.unmount()
  })

  it('passes the shared font catalog to the rich-text editor', async () => {
    const fontOptions = [{
      label: 'Brand Sans',
      value: 'font:brand-sans',
      cssFamily: '"font:brand-sans"',
    }]
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true, fontOptions },
        value: '<p>Original</p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()

    expect(wrapper.getComponent(OcRichTextEditor).props('fontOptions')).toEqual(fontOptions)
    wrapper.unmount()
  })

  /**
   * The host catalog alone cannot resolve a package icon: without the sources the toolbar offers no
   * package groups, and a stored package icon renders as a placeholder instead of the icon.
   */
  it('passes the package icon sources to both the preview and the editor', async () => {
    const packageIconSources = [{
      packageKey: 'starter-pack/kit@1.0.0',
      label: 'Starter Pack',
      catalog: EMPTY_PROJECT_ICON_CATALOG,
    }]
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: {
          title: 'Content',
          fieldType: 'string',
          richText: true,
          projectIcon: { sources: packageIconSources },
        },
        value: '<p>Original</p>',
      },
    })

    expect(wrapper.getComponent(RichTextPreview).props('packageIconSources')).toEqual(packageIconSources)

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()

    expect(wrapper.getComponent(OcRichTextEditor).props('packageIconSources')).toEqual(packageIconSources)
    wrapper.unmount()
  })

  it('edits bindings inline on double click without opening a dialog', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span data-oc-binding="self:name">{{self:name}}</span></p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    await nextTick()
    const editor = (wrapper.findComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.view.dom.querySelector<HTMLElement>('.binding-node__label')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()

    expect(document.querySelector<HTMLElement>('.binding-node__input')).not.toBeNull()
    expect(document.querySelector<HTMLElement>('.oc-rich-text-editor [role="dialog"]')).toBeNull()
    expect(editor.getHTML()).toContain('data-oc-binding="self:name"')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  it('edits sanitized HTML source inside the same draft transaction', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p>Original</p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    expect(wrapper.getComponent(OcOptionGroup).props('options')).toEqual([
      { value: 'rich', label: '富文本', icon: 'format.text-variant-outline' },
      { value: 'source', label: 'HTML 源码', icon: 'format.xml' },
    ])
    expect(wrapper.getComponent(OcOptionGroup).props('appearance')).toBe('sliding-outline')

    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
    await nextTick()
    const source = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="HTML 源码"]')!
    source.value = '<p><strong>Edited</strong><script>bad</script><span data-oc-binding="self:name">{{self:name}}</span></p>'
    source.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('update:value')).toBeUndefined()

    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="富文本"]')!.click()
    await nextTick()
    expect(wrapper.getComponent(OcRichTextEditor).isVisible()).toBe(false)
    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="HTML 源码"]')!.value)
      .toContain('<script>bad</script>')

    document.querySelector<HTMLButtonElement>('[aria-label="保存富文本编辑"]')!.click()
    await nextTick()
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  it('formats rich-text blocks when opening the source view', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p>First</p><p><strong>Second</strong></p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    document.querySelector<HTMLButtonElement>('[role="radio"][aria-label="HTML 源码"]')!.click()
    await nextTick()

    expect(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="HTML 源码"]')!.value)
      .toBe('<p>First</p><p><strong>Second</strong></p>')
    wrapper.unmount()
  })

  it('opens invalid persisted HTML in source mode without discarding it', async () => {
    const source = '<p>Before</p><script>bad()</script><p>After</p>'
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: source },
    })
    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    const sourceEditor = document.querySelector<HTMLTextAreaElement>('.rich-text-string-popover__source')
    expect(sourceEditor).not.toBeNull()
    expect(sourceEditor?.value).toBe(source)
    expect(document.querySelector('.rich-text-string-popover__diagnostics')?.textContent).toContain('script')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  /**
   * A language switch must re-label the editor view switch of an already open dialog, not wait for
   * the next open.
   */
  it('re-labels the editor view switch when the language changes while the dialog is open', async () => {
    setAppLocale('en-US')
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Original</p>' },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    expect(document.querySelector('[role="radio"][aria-label="Rich text"]')).not.toBeNull()
    expect(document.querySelector('[role="radio"][aria-label="HTML source"]')).not.toBeNull()

    setAppLocale('zh-CN')
    await nextTick()
    expect(document.querySelector('[role="radio"][aria-label="Rich text"]')).toBeNull()
    expect(document.querySelector('[role="radio"][aria-label="HTML source"]')).toBeNull()
    expect(document.querySelector('[role="radio"][aria-label="富文本"]')).not.toBeNull()
    expect(document.querySelector('[role="radio"][aria-label="HTML 源码"]')).not.toBeNull()
    wrapper.unmount()
  })
})
