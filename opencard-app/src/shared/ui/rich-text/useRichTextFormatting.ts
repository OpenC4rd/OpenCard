import { computed, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { PropertyEditorMutation } from '../property-editor/propertyEditor.types'
import type { createRichTextInteraction } from './richTextInteraction'

const defaults = {
  fontFamily: '', fontSize: '', color: '#24292f', backgroundColor: '#fff59d',
  fillType: 'none', fillSource: '', strokeColor: '#000000', strokeWidth: '0px',
  shadowColor: '#00000000', shadowOffsetX: '0px', shadowOffsetY: '0px', shadowBlur: '0px',
}
type Field = keyof typeof defaults
type Value = { kind: 'unset' | 'value' | 'mixed'; value: string }
const styleAttributes: Partial<Record<Field, string>> = {
  fontFamily: 'fontFamily', fontSize: 'fontSize', color: 'color',
  fillSource: 'textFillSource', strokeColor: 'textStrokeColor', strokeWidth: 'textStrokeWidth',
  shadowColor: 'textShadowColor', shadowOffsetX: 'textShadowOffsetX',
  shadowOffsetY: 'textShadowOffsetY', shadowBlur: 'textShadowBlur',
}
const sizeSteps = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96]

export function useRichTextFormatting(
  getEditor: () => Editor | undefined,
  revision: Ref<number>,
  interaction: ReturnType<typeof createRichTextInteraction>,
  baseSize: () => string | undefined,
) {
  const state = computed(() => {
    revision.value
    const editor = getEditor()
    const samples: Record<string, unknown>[] = []
    const collect = (node: ProseMirrorNode) => {
      if (!node.isInline) return
      const style = node.marks.find(mark => mark.type.name === 'textStyle')?.attrs ?? {}
      const highlight = node.marks.find(mark => mark.type.name === 'highlight')?.attrs ?? {}
      samples.push({ ...Object.fromEntries(Object.entries(styleAttributes).map(([field, attribute]) => [field, style[attribute]])),
        backgroundColor: highlight.color,
        fillType: style.textFillType ?? (highlight.color ? 'solid' : undefined),
      })
    }
    if (editor) {
      const selection = editor.state.selection
      if (selection.empty) {
        const marks = editor.state.storedMarks ?? selection.$from.marks()
        collect(editor.schema.text(' ', marks))
      } else {
        for (const range of selection.ranges) editor.state.doc.nodesBetween(range.$from.pos, range.$to.pos, collect)
      }
    }
    return Object.fromEntries(Object.entries(defaults).map(([field, fallback]) => {
      const values = samples.map(sample => sample[field] == null || sample[field] === '' ? null : String(sample[field]))
      const unique = new Set(values.map(value => value ?? fallback))
      return [field, { kind: unique.size > 1 ? 'mixed' : values.every(value => value === null) ? 'unset' : 'value',
        value: unique.size > 1 ? '' : values[0] ?? fallback } satisfies Value]
    })) as Record<Field, Value>
  })
  const value = (field: Field) => state.value[field].value
  function activeSize() {
    if (state.value.fontSize.kind === 'mixed') return ''
    const editor = getEditor()
    const size = value('fontSize') || (editor?.view.dom ? getComputedStyle(editor.view.dom).fontSize : '') || baseSize() || '16'
    return String(Number.parseFloat(size) || 16)
  }
  function apply(field: string, raw: string) {
    if (!(field in defaults)) return
    interaction.run(editor => {
      const chain = editor.chain()
      if (field === 'backgroundColor') chain.setHighlight({ color: raw })
      else if (field === 'fontFamily') raw ? chain.setFontFamily(raw) : chain.unsetFontFamily()
      else if (field === 'fontSize') {
        const size = Number.parseFloat(raw)
        if (!Number.isFinite(size) || size <= 0) return
        chain.setMark('textStyle', { fontSize: `${size}px` })
      } else if (field === 'fillType') {
        chain.setMark('textStyle', { textFillType: raw, textFillSource: raw === 'image' ? value('fillSource') : null })
        if (raw === 'solid') chain.setHighlight({ color: value('backgroundColor') || defaults.backgroundColor })
        else chain.unsetHighlight()
      } else if (field === 'fillSource') {
        chain.unsetHighlight().setMark('textStyle', { textFillType: 'image', textFillSource: raw.trim() || null })
      } else if (field === 'strokeWidth') {
        chain.setMark('textStyle', { textStrokeWidth: raw === '0px' ? null : raw,
          ...(raw === '0px' ? { textStrokeColor: null } : state.value.strokeColor.kind === 'unset' ? { textStrokeColor: defaults.strokeColor } : {}) })
      } else {
        const attribute = styleAttributes[field as Field]
        if (!attribute) return
        const length = field.startsWith('shadow') && field !== 'shadowColor'
        const next = length ? (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|pt|%)$/.test(raw.trim()) ? raw.trim() : '0px') : raw
        chain.setMark('textStyle', { [attribute]: next })
      }
      chain.run()
    }, true)
  }
  function preview(field: string, color: string) {
    const style = document.createElement('span').style
    if (field === 'color') style.color = color
    else if (field === 'backgroundColor') style.backgroundColor = color
    else if (field === 'strokeColor') style.webkitTextStrokeColor = color
    else if (field === 'shadowColor') style.textShadow = `${value('shadowOffsetX')} ${value('shadowOffsetY')} ${value('shadowBlur')} ${color}`
    interaction.preview(style.cssText)
  }
  function update(mutation: PropertyEditorMutation) {
    if (mutation.key === 'rich-text-selection') apply(mutation.fieldKey, String(mutation.value ?? ''))
  }
  function previewProperty(mutation: PropertyEditorMutation) {
    if (mutation.key === 'rich-text-selection') preview(mutation.fieldKey, String(mutation.value ?? ''))
  }
  function adjustSize(direction: -1 | 1) {
    const size = Number(activeSize()) || 16
    apply('fontSize', String(direction > 0
      ? sizeSteps.find(step => step > size) ?? sizeSteps[sizeSteps.length - 1]
      : [...sizeSteps].reverse().find(step => step < size) ?? sizeSteps[0]))
  }
  return { state, value, activeSize, apply, update, preview, previewProperty, adjustSize, sizeSteps }
}
