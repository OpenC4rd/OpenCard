import { computed, type Ref } from 'vue'
import type { ChainedCommands, Editor } from '@tiptap/core'
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { PropertyEditorFieldIntent, PropertyEditorMutation } from '../property-editor/propertyEditor.types'
import type { createRichTextInteraction } from './richTextInteraction'
import { hexToRgba, normalizeHexColor, rgbaToHex } from '../../../components/standard/colorModel'
import { isAbsoluteLength, isLength, type TextShadow, type TextStroke } from '../../../features/card-rendering/markup'

/** 开启效果时写入的完整值；标记里没有半个描边或半个阴影。 */
const initialStroke: TextStroke = { color: '#000000', width: '0.2mm' }
const initialShadow: TextShadow = { color: '#00000080', offsetX: '0.3mm', offsetY: '0.3mm', blur: '0mm' }
const defaults = {
  fontFamily: '', fontSize: '', foregroundColor: '#24292f', backgroundColor: '#00000000',
  foregroundType: 'solid', foregroundSource: '',
  strokeEnabled: 'false', strokeColor: initialStroke.color, strokeWidth: initialStroke.width,
  shadowEnabled: 'false', shadowColor: initialShadow.color, shadowOffsetX: initialShadow.offsetX,
  shadowOffsetY: initialShadow.offsetY, shadowBlur: initialShadow.blur,
  textAlign: 'left',
}
type Field = keyof typeof defaults
export type RichTextFormatValue = { kind: 'unset' | 'value' | 'mixed'; value: string; explicit: boolean }
const styleAttributes: Partial<Record<Field, string>> = {
  fontFamily: 'fontFamily', fontSize: 'fontSize', foregroundColor: 'color', foregroundSource: 'textFillSource',
}
type Effect = { attribute: string; initial: Record<string, string> }
const stroke: Effect = { attribute: 'textStroke', initial: initialStroke }
const shadow: Effect = { attribute: 'textShadow', initial: initialShadow }
const effectToggles: Record<string, Effect> = { strokeEnabled: stroke, shadowEnabled: shadow }
const effectParts: Record<string, Effect & { part: string }> = {
  strokeColor: { ...stroke, part: 'color' }, strokeWidth: { ...stroke, part: 'width' },
  shadowColor: { ...shadow, part: 'color' }, shadowOffsetX: { ...shadow, part: 'offsetX' },
  shadowOffsetY: { ...shadow, part: 'offsetY' }, shadowBlur: { ...shadow, part: 'blur' },
}
const sizeSteps = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32]

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
      fontSize: baseSize() || '3.5mm',
      foregroundColor: inheritedStyle?.color || defaults.foregroundColor,
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
        ...Object.fromEntries(Object.entries(effectToggles).map(([field, { attribute }]) => [field, Boolean(style[attribute])])),
        ...Object.fromEntries(Object.entries(effectParts).map(([field, { attribute, part }]) => [field, style[attribute]?.[part]])),
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
        ? field === 'textAlign' ? inheritedAlignments[index] ?? effectiveFallback : effectiveFallback
        : isColor ? colorValue(value) : value)
      const unique = new Set(effective)
      return [field, { kind: unique.size > 1 ? 'mixed' : values.every(value => value === null) ? 'unset' : 'value',
        value: unique.size > 1 ? '' : effective[0] ?? effectiveFallback,
        explicit: !(field in effectToggles || field in effectParts) && values.some(value => value !== null) } satisfies RichTextFormatValue]
    })) as Record<Field, RichTextFormatValue>
  })
  const value = (field: Field) => state.value[field].value
  /** 逐段改写效果：选区里各段的其余参数互不相同时也要各自保留。 */
  function patchEffect(chain: ChainedCommands, attribute: string, next: (current: object | null) => object | null) {
    chain.command(({ tr, state }) => {
      const type = state.schema.marks.textStyle!
      const patched = (marks: readonly Mark[]) => {
        const attrs = type.isInSet(marks)?.attrs
        return type.create({ ...attrs, [attribute]: next(attrs?.[attribute] ?? null) })
      }
      const { doc, selection } = tr
      if (selection.empty) tr.addStoredMark(patched(tr.storedMarks ?? selection.$from.marks()))
      else for (const { $from: { pos: from }, $to: { pos: to } } of selection.ranges) {
        doc.nodesBetween(from, to, (node, position) => {
          if (node.isInline) tr.addMark(Math.max(position, from), Math.min(position + node.nodeSize, to), patched(node.marks))
        })
      }
      return true
    })
  }
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
        const size = normalizeLength(raw, isLength)
        if (!size || Number.parseFloat(size) <= 0) return
        chain.setMark('textStyle', { fontSize: size })
      } else if (field === 'foregroundType') {
        chain.setMark('textStyle', raw === 'image' ? { textFillType: 'image' }
          : { textFillType: null, textFillSource: null })
      } else if (field === 'foregroundSource') {
        chain.setMark('textStyle', { textFillType: 'image', textFillSource: raw.trim() || null })
      } else if (field === 'textAlign') {
        chain.setTextAlign(raw)
      } else if (field in effectToggles) {
        const { attribute, initial } = effectToggles[field]!
        patchEffect(chain, attribute, raw === 'true' ? current => current ?? initial : () => null)
      } else if (field in effectParts) {
        const { attribute, initial, part } = effectParts[field]!
        const next = part === 'color' ? raw : normalizeLength(raw, isAbsoluteLength)
        if (!next || ((part === 'width' || part === 'blur') && Number.parseFloat(next) < 0)) return
        patchEffect(chain, attribute, current => ({ ...(current ?? initial), [part]: next }))
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
    else if (field === 'strokeColor') style.webkitTextStroke = `${value('strokeWidth')} ${color}`
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
    const active = value('fontSize')
    const size = Number.parseFloat(active) || 3.5
    const next = direction > 0
      ? sizeSteps.find(step => step > size) ?? sizeSteps[sizeSteps.length - 1]
      : [...sizeSteps].reverse().find(step => step < size) ?? sizeSteps[0]
    apply('fontSize', `${next}mm`)
  }
  return { state, value, apply, reset, update, preview, previewProperty, adjustSize, sizeSteps }
}

/** 裸数字按毫米补单位；什么单位合法由 Card Markup 决定，存下的值必须能写回源码。 */
function normalizeLength(raw: string, isValid: (value: string) => boolean): string | null {
  const value = raw.trim().toLowerCase()
  const length = /^-?(?:\d+\.?\d*|\.\d+)$/.test(value) ? `${value}mm` : value
  return isValid(length) ? length : null
}
