import { computed, type Ref } from 'vue'
import type { ChainedCommands, Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { PropertyEditorFieldIntent, PropertyEditorMutation } from '../property-editor/propertyEditor.types'
import type { createRichTextInteraction } from './richTextInteraction'
import { hexToRgba, normalizeHexColor, rgbaToHex } from '../../../components/standard/colorModel'

const defaults = {
  fontFamily: '', fontSize: '', foregroundColor: '#24292f', backgroundColor: '#00000000',
  foregroundType: 'solid', foregroundSource: '', strokeColor: '#24292f', strokeWidth: '0px',
  shadowColor: '#00000000', shadowOffsetX: '0px', shadowOffsetY: '0px', shadowBlur: '0px',
  textAlign: 'left',
}
type Field = keyof typeof defaults
export type RichTextFormatValue = { kind: 'unset' | 'value' | 'mixed'; value: string; explicit: boolean }
const styleAttributes: Partial<Record<Field, string>> = {
  fontFamily: 'fontFamily', fontSize: 'fontSize', foregroundColor: 'color',
  foregroundSource: 'textFillSource', strokeColor: 'textStrokeColor', strokeWidth: 'textStrokeWidth',
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
    const inheritedStyle = editor?.view.dom ? getComputedStyle(editor.view.dom) : null
    const inherited = { ...defaults,
      fontSize: normalizeLength(inheritedStyle?.fontSize || baseSize() || '16px') || '16px',
      foregroundColor: inheritedStyle?.color || defaults.foregroundColor,
      strokeColor: inheritedStyle?.color || defaults.strokeColor,
      textAlign: inheritedStyle?.textAlign && inheritedStyle.textAlign !== 'start' ? inheritedStyle.textAlign : defaults.textAlign,
    }
    const colors = new Map<string, string>()
    const colorValue = (raw: string): string => {
      const hex = normalizeHexColor(raw)
      if (hex) return hex
      if (colors.has(raw)) return colors.get(raw)!
      // Let the browser resolve CSS spellings without touching the editable DOM or document.
      let resolved = raw
      if (!/^rgba?\(/.test(raw)) {
        const probe = document.createElement('span')
        probe.hidden = true
        probe.style.color = raw
        document.body.append(probe)
        resolved = getComputedStyle(probe).color
        probe.remove()
      }
      const channels = /^rgba?\(/.test(resolved) ? resolved.match(/[\d.]+/g)?.map(Number) : null
      const value = channels && channels.length >= 3
        ? rgbaToHex({ red: channels[0]!, green: channels[1]!, blue: channels[2]!, alpha: channels[3] ?? 1 }) : raw
      colors.set(raw, value)
      return value
    }
    const samples: Record<string, unknown>[] = []
    const alignments: unknown[] = []
    const inheritedAlignments: string[] = []
    const collectAlignment = (node: ProseMirrorNode, position: number) => {
      alignments.push(node.attrs.textAlign)
      const element = editor?.view.nodeDOM(position)
      const style = element instanceof HTMLElement ? getComputedStyle(element) : inheritedStyle
      const alignment = style?.textAlign || inherited.textAlign
      inheritedAlignments.push(alignment === 'start' ? style?.direction === 'rtl' ? 'right' : 'left'
        : alignment === 'end' ? style?.direction === 'rtl' ? 'left' : 'right' : alignment)
    }
    const collect = (node: ProseMirrorNode) => {
      if (!node.isInline) return
      const style = node.marks.find(mark => mark.type.name === 'textStyle')?.attrs ?? {}
      const highlight = node.marks.find(mark => mark.type.name === 'highlight')
      samples.push({ ...Object.fromEntries(Object.entries(styleAttributes).map(([field, attribute]) => [field, style[attribute]])),
        backgroundColor: highlight ? highlight.attrs.color || '#ffff00' : undefined,
        foregroundType: style.textFillType || undefined,
      })
    }
    if (editor) {
      const selection = editor.state.selection
      if (selection.empty) {
        if (selection.$from.parent.isTextblock) collectAlignment(selection.$from.parent, selection.$from.before())
        const marks = editor.state.storedMarks ?? selection.$from.marks()
        collect(editor.schema.text(' ', marks))
      } else {
        for (const range of selection.ranges) editor.state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, position) => {
          if (node.isTextblock) collectAlignment(node, position)
          collect(node)
        })
      }
    }
    return Object.fromEntries(Object.entries(inherited).map(([field, fallback]) => {
      const isColor = field.endsWith('Color')
      const effectiveFallback = isColor ? colorValue(fallback) : fallback
      const values = (field === 'textAlign' ? alignments : samples.map(sample => sample[field]))
        .map(value => value == null || value === '' ? null : String(value))
      const effective = values.map((value, index) => value === null
        ? field === 'textAlign' ? inheritedAlignments[index] ?? effectiveFallback
          : field === 'strokeColor' ? colorValue(String(samples[index]?.foregroundColor || inherited.foregroundColor)) : effectiveFallback
        : isColor ? colorValue(value) : value)
      const unique = new Set(effective)
      return [field, { kind: unique.size > 1 ? 'mixed' : values.every(value => value === null) ? 'unset' : 'value',
        value: unique.size > 1 ? '' : effective[0] ?? effectiveFallback,
        explicit: values.some(value => value !== null) } satisfies RichTextFormatValue]
    })) as Record<Field, RichTextFormatValue>
  })
  const value = (field: Field) => state.value[field].value
  function commit(chain: ChainedCommands) {
    chain.command(({ tr }) => {
      const style = tr.storedMarks?.find(mark => mark.type.name === 'textStyle')
      if (style && !Object.values(style.attrs).some(Boolean)) tr.removeStoredMark(style.type)
      return true
    }).removeEmptyTextStyle().run()
  }
  function apply(field: string, raw: string) {
    if (!(field in defaults)) return
    interaction.run(editor => {
      const chain = editor.chain()
      if (field === 'backgroundColor') {
        if (!raw || raw === 'transparent' || hexToRgba(raw)?.alpha === 0) chain.unsetHighlight()
        else chain.setHighlight({ color: raw })
      } else if (field === 'foregroundColor') chain.setMark('textStyle', { color: raw, textFillType: null, textFillSource: null })
      else if (field === 'fontFamily') raw ? chain.setFontFamily(raw) : chain.unsetFontFamily()
      else if (field === 'fontSize') {
        const size = normalizeLength(raw)
        if (!size || Number.parseFloat(size) <= 0) return
        chain.setMark('textStyle', { fontSize: size })
      } else if (field === 'foregroundType') {
        chain.setMark('textStyle', raw === 'image' ? { textFillType: 'image' }
          : { textFillType: null, textFillSource: null })
      } else if (field === 'foregroundSource') {
        chain.setMark('textStyle', { textFillType: 'image', textFillSource: raw.trim() || null })
      } else if (field === 'textAlign') {
        chain.setTextAlign(raw)
      } else {
        const attribute = styleAttributes[field as Field]
        if (!attribute) return
        const length = field === 'strokeWidth' || (field.startsWith('shadow') && field !== 'shadowColor')
        const next = length ? normalizeLength(raw) : raw
        if (!next || (length && field !== 'shadowOffsetX' && field !== 'shadowOffsetY' && Number.parseFloat(next) < 0)) return
        chain.setMark('textStyle', { [attribute]: next })
      }
      commit(chain)
    }, true)
  }
  function reset(intent: PropertyEditorFieldIntent) {
    if (intent.key !== 'rich-text-selection') return
    interaction.run(editor => {
      const chain = editor.chain()
      if (intent.fieldKey === 'backgroundColor') chain.unsetHighlight()
      else if (intent.fieldKey === 'textAlign') chain.unsetTextAlign()
      else if (intent.fieldKey === 'foregroundType') chain.setMark('textStyle', { textFillType: null, textFillSource: null })
      else {
        const attribute = styleAttributes[intent.fieldKey as Field]
        if (!attribute) return
        chain.setMark('textStyle', { [attribute]: null })
      }
      commit(chain)
    }, true)
  }
  function preview(field: string, color: string) {
    const style = document.createElement('span').style
    if (field === 'foregroundColor') { style.color = color; style.backgroundImage = 'none' }
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
    const editor = getEditor()
    const active = value('fontSize')
    const rendered = editor?.view.domAtPos(editor.state.selection.from).node
    const element = rendered instanceof Element ? rendered : rendered?.parentElement
    const size = Number.parseFloat(active.endsWith('px') ? active : element ? getComputedStyle(element).fontSize : active) || 16
    apply('fontSize', String(direction > 0
      ? sizeSteps.find(step => step > size) ?? sizeSteps[sizeSteps.length - 1]
      : [...sizeSteps].reverse().find(step => step < size) ?? sizeSteps[0]))
  }
  return { state, value, apply, reset, update, preview, previewProperty, adjustSize, sizeSteps }
}

function normalizeLength(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|pt|%)?$/.test(value)
    ? /[a-z%]$/.test(value) ? value : `${value}px`
    : null
}
