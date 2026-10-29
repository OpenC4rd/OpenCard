import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n, setAppLocale } from '../../../i18n'
import OcRichTextEditor from './OcRichTextEditor.vue'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'
import type { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { NodeSelection } from '@tiptap/pm/state'
import OcColorPicker from '../../../components/standard/OcColorPicker.vue'

beforeEach(() => setAppLocale('zh-CN'))
afterEach(() => {
  for (const group of [...overlayGroups.keys()]) disposeGroup(group)
  document.body.innerHTML = ''
})

function mountEditor(): VueWrapper {
  return mount(OcRichTextEditor, {
    // 候选列表要真的渲染出来：jsdom 只让已挂进文档的控件获得焦点，未挂载时菜单根本不会开。
    attachTo: document.body,
    props: { initialHtml: '<p>Hello</p>' },
    global: { plugins: [i18n] },
  })
}

/** 组宿主渲染工具栏候选列表；列表与控制项的关联只能从真实 DOM 读。 */
function listbox(): HTMLElement | null {
  return document.body.querySelector('[role="listbox"]')
}

describe('OcRichTextEditor locale reactivity', () => {
  it.each([
    '@b{Hello world}',
    '@i{Italic} and @u{Underline}',
    '@ul{@li{Alpha}@li{Beta}}',
    'Level: {{player.lvl}} @icon(key=star)',
    '@style(color=red,size="20px"){Custom text}',
  ])('preserves Card Markup content and structure through source handoff: %s', async source => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; applyHtml: (markup: string) => boolean; getHtml: () => string }
      expect(vm.applyHtml(source)).toBe(true)
      expect(vm.getHtml()).toBe(source)
      const before = vm.editor.getJSON()
      expect(vm.applyHtml(vm.getHtml())).toBe(true)
      expect(vm.editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount() }
  })

  it('tolerantly converts legacy HTML into Card Markup without html tags', async () => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; applyHtml: (markup: string) => boolean; getHtml: () => string }
      expect(vm.applyHtml('<p><strong>Legacy</strong> <em>content</em></p>')).toBe(true)
      expect(vm.getHtml()).toBe('@b{Legacy} @i{content}')
      expect(vm.getHtml()).not.toMatch(/<p>|<strong|<span|<em/)
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

  it('saves stable resource references instead of resolved preview sources', async () => {
    const wrapper = mount(OcRichTextEditor, {
      props: {
        initialHtml: '<p><span data-oc-fill-type="image" data-oc-fill-source="素材/a.png" style="font-family: &quot;font:brand&quot;;">AB</span></p>',
        capabilities: {
          fonts: [{
            key: 'project',
            label: 'Current Project',
            packageKey: null,
            entries: [{ key: 'font:brand', label: 'Brand', value: 'font:brand', cssFamily: 'ScopedBrand' }],
          }],
          resolveImagePreview: () => 'https://example.test/resolved.png',
        },
      },
      global: { plugins: [i18n] },
    })
    await nextTick()
    const vm = wrapper.vm as unknown as { editor: Editor; getHtml: () => string }
    vm.editor.commands.setTextSelection({ from: 1, to: 3 })
    vm.editor.commands.setColor('#ff0000')
    const saved = vm.getHtml()
    expect(saved).toContain('font:brand')
    expect(saved).toContain('素材/a.png')
    expect(saved).not.toMatch(/ScopedBrand|resolved\.png|--oc-rich-font|data-oc-font/)
    expect(saved).not.toMatch(/<p|<span/)
    wrapper.unmount()
  })

  it('composes image fill, background and outline through previews, undo and source handoff', async () => {
    const wrapper = mount(OcRichTextEditor, {
      props: {
        initialHtml: '<p><mark style="background-color:yellow;color:inherit"><span data-oc-fill-type="image" data-oc-fill-source="assets/a.png" style="color:red;-webkit-text-stroke-width:1px;-webkit-text-stroke-color:blue">ABC</span></mark></p>',
        capabilities: {
          resolveImagePreview: reference => `https://example.test/${reference}`,
        },
      },
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
      backgroundPicker.vm.$emit('cancel')
      const picker = wrapper.findAllComponents(OcColorPicker)[0]!
      picker.vm.$emit('preview', '#00ff00')
      expect(editor.getJSON()).toEqual(before)
      expect(undoDepth(editor.state)).toBe(depth)
      picker.vm.$emit('cancel')
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
    const overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
    const wrapper = mountEditor()
    try {
      await nextTick()
      const input = wrapper.get('.oc-rich-text-editor__font-size input')
      ;(input.element as HTMLInputElement).focus()
      await flushPromises()
      // 补全挂在被聚焦的输入上：候选列表就是输入框 aria-controls 指向的那个 listbox。
      const options = document.body.querySelectorAll('[role="option"]')
      expect(input.attributes('aria-controls')).toBe(listbox()?.id)
      expect(options.length).toBeGreaterThan(1)
      await input.setValue('13')
      await input.trigger('keydown', { key: 'Enter' })
      expect((wrapper.vm as unknown as { editor: { getAttributes: (name: string) => Record<string, unknown> } }).editor.getAttributes('textStyle').fontSize).toBe('13px')
      await input.setValue('24')
      await nextTick()
      await nextTick()
      await input.trigger('keydown', { key: 'Enter' })
      expect((wrapper.vm as unknown as { editor: Editor }).editor.getAttributes('textStyle').fontSize).toBe('24px')
      await nextTick()
      expect(listbox()).toBeNull()
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
    } finally {
      wrapper.unmount()
      overlayRoot.unmount()
    }
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

  it('supports selecting and deleting atom nodes (@icon and {{expr}})', async () => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; applyHtml: (markup: string) => boolean; getHtml: () => string }
      vm.applyHtml('Hello {{user.name}} world')
      expect(vm.getHtml()).toBe('Hello {{user.name}} world')

      // NodeSelection on binding atom node (pos 7)
      const bindingPos = 7
      const trBinding = vm.editor.state.tr.setSelection(NodeSelection.create(vm.editor.state.doc, bindingPos))
      vm.editor.view.dispatch(trBinding)
      expect(vm.editor.state.selection instanceof NodeSelection).toBe(true)
      expect((vm.editor.state.selection as NodeSelection).node.type.name).toBe('binding')

      // Delete the selected atom node
      vm.editor.view.dispatch(vm.editor.state.tr.deleteSelection())
      expect(vm.getHtml()).toBe('Hello  world')

      // Now test with projectIcon
      vm.applyHtml('Star: @icon(key=star) done')
      expect(vm.getHtml()).toBe('Star: @icon(key=star) done')
      const iconPos = 7
      const trIcon = vm.editor.state.tr.setSelection(NodeSelection.create(vm.editor.state.doc, iconPos))
      vm.editor.view.dispatch(trIcon)
      expect(vm.editor.state.selection instanceof NodeSelection).toBe(true)
      expect((vm.editor.state.selection as NodeSelection).node.type.name).toBe('projectIcon')

      vm.editor.view.dispatch(vm.editor.state.tr.deleteSelection())
      expect(vm.getHtml()).toBe('Star:  done')
    } finally { wrapper.unmount() }
  })

  it('activates binding input when typing {{ via input rules', async () => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; getHtml: () => string }
      vm.editor.commands.clearContent()
      vm.editor.commands.focus()

      const view = vm.editor.view
      // User types first '{' (inserted into doc)
      view.dispatch(view.state.tr.insertText('{'))
      // User types second '{', intercepted by input rule
      const handled = view.someProp('handleTextInput', f => f(view, 2, 2, '{', () => view.state.tr.insertText('{', 2, 2)))
      expect(handled).toBe(true)
      await nextTick()

      // Binding atom node was inserted by the input rule
      const json = vm.editor.getJSON()
      const paragraph = json.content?.[0]
      const hasBinding = paragraph?.content?.some(child => child.type === 'binding')
      expect(hasBinding).toBe(true)
    } finally { wrapper.unmount() }
  })

  it('preserves package coordinate, version and size when pasting @icon(...) markup', async () => {
    const wrapper = mountEditor()
    try {
      await nextTick()
      const vm = wrapper.vm as unknown as { editor: Editor; getHtml: () => string }
      vm.editor.commands.clearContent()
      vm.editor.commands.focus()

      // Paste @icon with package, version, and size
      if (typeof ClipboardEvent === 'undefined') {
        (globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {}
      }
      const markup = '@icon(key=blade,pkg=@scoped/pack,version=1.0.0,size=24px)'
      const view = vm.editor.view
      view.pasteHTML(markup)
      await nextTick()

      const json = vm.editor.getJSON()
      const iconNode = json.content?.[0]?.content?.find(child => child.type === 'projectIcon')
      expect(iconNode).toBeDefined()
      expect(iconNode?.attrs?.iconPath).toBe('@scoped/pack@1.0.0#icon:blade')
      expect(iconNode?.attrs?.size).toBe('24px')
      expect(vm.getHtml()).toContain('blade')
      expect(vm.getHtml()).toContain('@scoped/pack')
      expect(vm.getHtml()).toContain('24px')
    } finally { wrapper.unmount() }
  })
})