import { mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import OcOptionGroup from '../../../../components/standard/OcOptionGroup.vue'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../../../features/workspace/services/projectIconCatalog'
import { i18n, setAppLocale } from '../../../../i18n'
import OcRichTextEditor from '../../rich-text/OcRichTextEditor.vue'
import RichTextPreview from '../../rich-text/RichTextPreview.vue'
import RichTextStringPropertyField from './RichTextStringPropertyField.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RichTextStringPropertyField', () => {
  it('keeps dynamic style bindings when switching source and visual modes', async () => {
    const sourceHtml = '<p><mark style="background-color: {{parent.color}}; color: inherit;">Text</mark></p>'
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
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

  it('keeps the rich-text draft open when binding editing consumes Escape', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
      props: {
        definition: { title: 'Content', fieldType: 'string', richText: true },
        value: '<p><span data-oc-binding="self:name">{{self:name}}</span></p>',
      },
    })

    await wrapper.get('.rich-text-string-field__preview').trigger('click')
    await nextTick()
    await nextTick()
    const editor = (wrapper.findComponent(OcRichTextEditor).vm as unknown as { editor: Editor }).editor
    editor.view.dom.querySelector<HTMLElement>('.binding-node__label')!.click()
    ;(wrapper.findComponent(OcRichTextEditor).vm as unknown as { openSelectedNodeEditor: () => void }).openSelectedNodeEditor()
    await nextTick()

    ;(wrapper.findComponent(OcRichTextEditor).vm as unknown as { cancelSelectedNodeEditor: () => void })
      .cancelSelectedNodeEditor()
    await new Promise(resolve => window.setTimeout(resolve, 0))

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(document.getElementById(dialog!.getAttribute('aria-labelledby')!)?.textContent).toBe('Content')
    expect(editor.getHTML()).toContain('data-oc-binding="self:name"')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    wrapper.unmount()
  })

  it('edits sanitized HTML source inside the same draft transaction', async () => {
    const wrapper = mount(RichTextStringPropertyField, {
      attachTo: document.body,
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
    expect(wrapper.findComponent(OcRichTextEditor).exists()).toBe(false)
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
      props: { definition: { title: 'Content', fieldType: 'string', richText: true }, value: '<p>Original</p>' },
      global: { plugins: [i18n] },
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
