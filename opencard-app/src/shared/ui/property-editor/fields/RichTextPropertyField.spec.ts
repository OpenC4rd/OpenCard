import { mount, type VueWrapper } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import { i18n, setAppLocale } from '../../../../i18n'
import OcRichTextEditor from '../../rich-text/OcRichTextEditor.vue'
import PropertyEditor from '../PropertyEditor.vue'
import RichTextPropertyField from './RichTextPropertyField.vue'
import type { PropertyCompletionResult } from '../propertyEditor.types'

const SAVE = '[aria-label="保存富文本编辑"]'
const CANCEL = '[aria-label="取消富文本编辑"]'
const SOURCE_MODE = '[role="radio"][aria-label="源码"]'
const RICH_MODE = '[role="radio"][aria-label="富文本"]'

type FieldVm = {
  editor: Editor
  getHtml: () => string
  applyHtml: (html: string) => boolean
  getContent: () => string
  setContent: (content: string) => boolean
}

beforeEach(() => setAppLocale('zh-CN'))
afterEach(() => {
  for (const group of [...overlayGroups.keys()]) disposeGroup(group)
  document.body.innerHTML = ''
})

function mountField(value: string, definition: Record<string, unknown> = {}): VueWrapper {
  return mount(RichTextPropertyField, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props: {
      definition: { title: 'Content', fieldType: 'richText', ...definition },
      value,
    },
  })
}

async function openEditor(wrapper: VueWrapper): Promise<FieldVm> {
  await wrapper.get('.rich-text-field__preview').trigger('click')
  await nextTick()
  return wrapper.getComponent(OcRichTextEditor).vm as unknown as FieldVm
}

function click(label: string): void {
  document.querySelector<HTMLButtonElement>(label)!.click()
}

function sourceArea(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>('textarea')!
}

async function switchMode(mode: string): Promise<void> {
  click(mode)
  await nextTick()
}

function panel(wrapper: VueWrapper) {
  return wrapper.getComponent(PropertyEditor)
}

async function resetField(wrapper: VueWrapper, fieldKey: string): Promise<void> {
  const button = () => panel(wrapper).get(`[data-field-key="${fieldKey}"] [data-action-key="reset-property"] button`)
  await button().trigger('pointerdown')
  await button().trigger('click')
}

describe('RichTextPropertyField', () => {
  it('opens empty content and saves nothing when the empty source is unchanged', async () => {
    const wrapper = mountField('')
    try {
      const { editor } = await openEditor(wrapper)
      expect(editor.isEmpty).toBe(true)
      await switchMode(SOURCE_MODE)
      expect(sourceArea().value).toBe('')
      await switchMode(RICH_MODE)
      click(SAVE)
      expect(wrapper.emitted('update:value')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it('opens with focus in the active editor', async () => {
    const wrapper = mountField('<p>Hello</p>')
    try {
      await openEditor(wrapper)
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(document.activeElement?.getAttribute('contenteditable')).toBe('true')
      expect(document.querySelector('[role="listbox"]')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it('resets explicit formatting by removing it, including values equal to inheritance and paragraph alignment', async () => {
    const wrapper = mountField(
      '@align(end){@style(size="4mm",color=red){a}b}',
      { baseStyle: { fontSize: '4mm' } },
    )
    try {
      const vm = await openEditor(wrapper)
      vm.editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      await resetField(wrapper, 'fontSize')
      expect(vm.getHtml()).not.toContain('size')
      expect(vm.getHtml()).toContain('@color(red)')
      expect(panel(wrapper).find('[data-field-key="fontSize"] [data-action-key="reset-property"]').exists()).toBe(false)
      await resetField(wrapper, 'foregroundColor')
      await resetField(wrapper, 'textAlign')
      expect(vm.getHtml()).toBe('ab')
      vm.editor.commands.undo()
      expect(vm.editor.state.doc.firstChild!.attrs.textAlign).toBe('end')
      expect(vm.getHtml()).not.toContain('size')
    } finally { wrapper.unmount() }
  })

  it('clears only pending caret formatting without changing existing text or leaving empty style marks', async () => {
    const wrapper = mountField('@size(6mm){A}')
    try {
      const { editor } = await openEditor(wrapper)
      editor.commands.setTextSelection(2)
      const panel = wrapper.getComponent(PropertyEditor)
      panel.vm.$emit('update-property', { key: 'rich-text-selection', fieldKey: 'fontSize', value: '12' })
      await nextTick()
      await panel.get('[data-field-key="fontSize"] [data-action-key="reset-property"] button').trigger('click')
      expect(editor.state.doc.firstChild!.firstChild!.marks[0]!.attrs.fontSize).toBe('6mm')
      editor.view.dispatch(editor.state.tr.insertText('X'))
      expect(editor.state.doc.firstChild!.lastChild!.text).toBe('X')
      expect(editor.state.doc.firstChild!.lastChild!.marks).toHaveLength(0)
    } finally { wrapper.unmount() }
  })

  it('preserves independent shadow settings through reset and the sanitized handoff', async () => {
    const wrapper = mountField('@style(shadow="red 1mm 2mm 0mm"){A}')
    try {
      const vm = await openEditor(wrapper)
      vm.editor.commands.setTextSelection({ from: 1, to: 2 })
      await nextTick()
      await panel(wrapper).get('[data-field-key="foregroundColor"] [data-action-key="field-editor.use-raw-string"] button').trigger('click')
      const raw = panel(wrapper).get('[data-field-key="foregroundColor"] input')
      await raw.setValue('red')
      await raw.trigger('keydown', { key: 'Enter' })
      expect(vm.editor.getAttributes('textStyle').color).toBe('red')
      await panel(wrapper).get('[data-field-key="foregroundColor"] [data-action-key="field-editor.use-field"] button').trigger('click')
      await resetField(wrapper, 'shadowOffsetX')
      expect(vm.getHtml()).toContain('shadow')
      await resetField(wrapper, 'shadowColor')
      const saved = vm.getHtml()
      expect(saved).toContain('shadow')
      expect(vm.applyHtml(saved)).toBe(true)
      expect(vm.editor.getAttributes('textStyle').textShadowOffsetY).toBe('2mm')
    } finally { wrapper.unmount() }
  })

  it('recognizes inherited size and equivalent CSS colors as common selection values without rewriting them', async () => {
    const wrapper = mountField(
      '@b{@color(red){A}@style(size="5mm",color="#ff0000"){B}}',
      { baseStyle: { fontSize: '5mm' } },
    )
    try {
      const { editor } = await openEditor(wrapper)
      const before = editor.getJSON()
      editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      expect(editor.isActive('bold')).toBe(true)
      expect(editor.getJSON()).toEqual(before)
    } finally { wrapper.unmount() }
  })

  it('changes only the requested selection property and types over it using its first character format', async () => {
    const wrapper = mountField('@size(2.5mm){O}@b{@style(size="3mm",color=red){A}@style(size="6mm",color=blue){B}}')
    try {
      const { editor } = await openEditor(wrapper)
      editor.commands.setTextSelection({ from: 2, to: 4 })
      await nextTick()
      const color = panel(wrapper).get('[data-field-key="foregroundColor"] input')
      await color.trigger('pointerdown')
      await color.setValue('#00FF00')
      await color.trigger('keydown', { key: 'Enter' })
      expect(editor.state.doc.nodeAt(2)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('3mm')
      expect(editor.state.doc.nodeAt(3)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('6mm')
      editor.view.dispatch(editor.state.tr.insertText('X'))
      expect(editor.state.doc.textContent).toBe('OX')
      const inserted = editor.state.doc.nodeAt(2)!
      expect(inserted.marks.some(mark => mark.type.name === 'bold')).toBe(true)
      expect(inserted.marks.find(mark => mark.type.name === 'textStyle')?.attrs).toMatchObject({ fontSize: '3mm', color: '#00FF00' })
      expect(editor.state.doc.nodeAt(1)!.marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize).toBe('2.5mm')
    } finally { wrapper.unmount() }
  })

  it('keeps mixed formatting intact when the real sidebar updates an unrelated attribute', async () => {
    const wrapper = mountField('Hello')
    try {
      const vm = await openEditor(wrapper)
      const editor = vm.editor
      vm.applyHtml('@style(size="3mm",color=red){A}@style(size="6mm",color=blue){B}')
      editor.commands.setTextSelection({ from: 1, to: 3 })
      await nextTick()
      const input = panel(wrapper).get('[data-field-key="strokeWidth"] input')
      await input.trigger('pointerdown')
      await input.setValue('0.5mm')
      await input.trigger('keydown', { key: 'Enter' })
      const marks = editor.state.doc.firstChild!.content.content.map(node => node.marks.find(mark => mark.type.name === 'textStyle')!.attrs)
      expect(marks.map(attrs => attrs.fontSize)).toEqual(['3mm', '6mm'])
      expect(marks.map(attrs => attrs.color)).toEqual(['red', 'blue'])
      expect(marks.map(attrs => attrs.textStrokeWidth)).toEqual(['0.5mm', '0.5mm'])
    } finally { wrapper.unmount() }
  })

  it('flushes composed binding input on save and ignores completion after the dialog closes', async () => {
    let resolveCompletion!: (result: PropertyCompletionResult) => void
    const provider = vi.fn(() => new Promise<PropertyCompletionResult>(resolve => { resolveCompletion = resolve }))
    const wrapper = mountField('{{self:name}}', { binding: { provider } })
    try {
      const { editor } = await openEditor(wrapper)
      editor.view.dom.querySelector('.binding-node__label')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await nextTick()
      const input = document.querySelector<HTMLInputElement>('.binding-node__input')!
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      input.value = 'self:名称'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      click(SAVE)
      await nextTick()
      expect(wrapper.emitted('update:value')?.[0]?.[0]).toContain('{{self:名称}}')
      resolveCompletion({ replaceStart: 2, replaceEnd: 2, items: [{ key: 'late', label: 'Late', insertText: 'late' }] })
      await Promise.resolve()
      await nextTick()
      expect(document.querySelector('[role="listbox"]')).toBeNull()
      expect(wrapper.emitted('update:value')).toHaveLength(1)
    } finally { wrapper.unmount() }
  })

  it('writes a local draft only when the user saves', async () => {
    const wrapper = mountField('Original')
    try {
      let { editor } = await openEditor(wrapper)
      editor.commands.setContent('Cancelled', true)
      expect(wrapper.emitted('update:value')).toBeUndefined()
      click(CANCEL)
      await nextTick()
      expect(wrapper.emitted('update:value')).toBeUndefined()

      ;({ editor } = await openEditor(wrapper))
      editor.commands.setContent('Saved', true)
      click(SAVE)
      await nextTick()
      expect(wrapper.emitted('update:value')).toEqual([['Saved']])
    } finally { wrapper.unmount() }
  })

  it('allows bi-directional roundtrip switching between visual and source modes and displays syntax diagnostics', async () => {
    const source = '@b{Bold} {{user.name}} @icon(key=star)'
    const wrapper = mountField(source)
    try {
      const vm = await openEditor(wrapper)
      vm.editor.commands.setTextSelection({ from: 1, to: 3 })
      expect(vm.editor.isActive('bold')).toBe(true)

      // Switch to source mode
      await switchMode(SOURCE_MODE)
      expect(sourceArea().value).toBe(source)

      // Inject unclosed tag syntax error
      sourceArea().value = '@b{Unclosed'
      sourceArea().dispatchEvent(new Event('input'))
      await nextTick()

      // Diagnostic appears in source mode
      expect(document.querySelector('.rich-text-popover__diagnostics')?.textContent).toContain('缺少结尾')

      // Switch back to rich mode without being blocked
      await switchMode(RICH_MODE)
      expect(vm.editor.isEmpty).toBe(false)

      // Switch back to source mode again
      await switchMode(SOURCE_MODE)
      expect(sourceArea().value).toBeTruthy()
    } finally { wrapper.unmount() }
  })

  it('renders inline icon in preview resolving seriesKey/iconKey path and custom size', async () => {
    const wrapper = mount(RichTextPropertyField, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: {
        definition: { title: 'Content', fieldType: 'richText' },
        value: 'Hero @icon(key=rpg/sword,size=7mm)',
        capabilities: {
          icons: [{
            key: 'host',
            label: 'Host',
            packageKey: null,
            series: [{
              key: 'rpg',
              name: 'RPG',
              entries: [{
                key: 'rpg:sword',
                value: 'icon:rpg/sword',
                seriesKey: 'rpg',
                iconKey: 'sword',
                name: 'Sword',
                iconPath: '#icon:rpg/sword',
                inlineStyle: { backgroundImage: 'url(data:image/svg+xml,...)' },
                previewStyle: { backgroundImage: 'url(data:image/svg+xml,...)' },
              }],
            }],
          }],
        },
      },
    })
    try {
      await nextTick()
      const icon = wrapper.find('.rich-text-preview__icon')
      expect(icon.exists()).toBe(true)
      expect(icon.attributes('style')).toContain('7mm')
      expect(wrapper.find('.rich-text-preview__missing').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })
})
