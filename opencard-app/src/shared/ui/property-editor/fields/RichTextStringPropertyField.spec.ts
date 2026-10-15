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

beforeEach(() => setAppLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
})

describe('RichTextStringPropertyField', () => {
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
    await nextTick()
    const color = wrapper.getComponent(PropertyEditor).get('input[aria-label="前景色"]')
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
    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', { key: 'rich-text-selection', fieldKey: 'color', value: '#ff0000' })
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
