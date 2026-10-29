// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cardMarkupToTiptap,
  tiptapToCardMarkup,
  serializeTiptapMarkup,
  type TiptapBridgeNode,
} from './tiptapBridge'

describe('tiptapBridge: Plain Text and Paragraphs', () => {
  it('round-trips a single paragraph of plain text', () => {
    const markup = 'Hello world'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    })
    expect(serializeTiptapMarkup(tiptap)).toBe('Hello world')
  })

  it('round-trips multiple paragraphs separated by newlines', () => {
    const markup = 'First line\nSecond line'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content).toHaveLength(2)
    expect(tiptap.content![0]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'First line' }] })
    expect(tiptap.content![1]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] })
    expect(serializeTiptapMarkup(tiptap)).toBe('First line\nSecond line')
  })

  it('round-trips hardBreak inside a paragraph without creating extra paragraphs', () => {
    const markup = 'Line one@br()Line two'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content).toHaveLength(1)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'text', text: 'Line one' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Line two' },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe('Line one@br()Line two')
  })
})

describe('tiptapBridge: Text Alignment', () => {
  it.each([
    ['center', '@align(center){Centered text}'],
    ['end', '@align(end){Right-aligned}'],
    ['justify', '@align(justify){Justified text}'],
  ])('maps paragraph text alignment %s bidirectionally', (align, markup) => {
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.attrs?.textAlign).toBe(align)
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('normalizes legacy align names "left" and "right" to "start" and "end"', () => {
    const docWithLeft: TiptapBridgeNode = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'left' }, content: [{ type: 'text', text: 'Left' }] }],
    }
    const docWithRight: TiptapBridgeNode = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'Right' }] }],
    }
    expect(tiptapToCardMarkup(docWithLeft).blocks[0]).toMatchObject({ type: 'paragraph', align: undefined })
    expect(tiptapToCardMarkup(docWithRight).blocks[0]).toMatchObject({ type: 'paragraph', align: 'end' })
  })
})

describe('tiptapBridge: Inline Marks', () => {
  it('round-trips standard inline marks (bold, italic, underline, strike)', () => {
    const markup = '@b{Bold} @i{Italic} @u{Underline} @s{Strike}'
    const tiptap = cardMarkupToTiptap(markup)
    const marks = tiptap.content![0]!.content!.map(n => n.marks?.[0]?.type).filter(Boolean)
    expect(marks).toEqual(['bold', 'italic', 'underline', 'strike'])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('round-trips textStyle marks with color, fontSize, and fontFamily', () => {
    const markup = '@color(#ff0000){red} @size(20px){big} @font(Noto Sans){custom}'
    const tiptap = cardMarkupToTiptap(markup)
    const textStyles = tiptap.content![0]!.content!
      .map(n => n.marks?.find(m => m.type === 'textStyle')?.attrs)
      .filter(Boolean)
    expect(textStyles).toMatchObject([
      { color: '#ff0000' },
      { fontSize: '20px' },
      { fontFamily: 'Noto Sans' },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
    // Also parses when font is quoted
    expect(cardMarkupToTiptap('@font("Noto Sans"){custom}').content![0]!.content![0]!.marks).toEqual([
      { type: 'textStyle', attrs: { fontFamily: 'Noto Sans' } },
    ])
  })

  it('round-trips highlight marks with background markColor', () => {
    const markup = '@mark(color=#ffff00){highlighted}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content![0]!.marks).toEqual([{ type: 'highlight', attrs: { color: '#ffff00' } }])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('round-trips stroke, shadow, and image fill styles', () => {
    const markup = '@style(stroke=#000000 2,shadow=#111111 1 2 3,fill=image:art.png){styled}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content![0]!.marks).toEqual([{
      type: 'textStyle',
      attrs: {
        textStrokeColor: '#000000',
        textStrokeWidth: '2px',
        textShadowColor: '#111111',
        textShadowOffsetX: '1px',
        textShadowOffsetY: '2px',
        textShadowBlur: '3px',
        textFillType: 'image',
        textFillSource: 'art.png',
      },
    }])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
    // Also parses when arguments are quoted
    expect(cardMarkupToTiptap('@style(stroke="#000000 2"){styled}').content![0]!.content![0]!.marks).toEqual([
      { type: 'textStyle', attrs: { textStrokeColor: '#000000', textStrokeWidth: '2px' } },
    ])
  })
})

describe('tiptapBridge: Custom Nodes (@bind, @icon)', () => {
  it('converts binding markup into a ProseMirror binding atom node and back', () => {
    const markup = 'Score: {{player.score}} points'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'text', text: 'Score: ' },
      { type: 'binding', attrs: { expression: 'player.score' } },
      { type: 'text', text: ' points' },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('preserves marks on binding nodes', () => {
    const markup = '@b{{{stats.hp}}}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'binding', attrs: { expression: 'stats.hp' }, marks: [{ type: 'bold' }] },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('converts @icon into a ProseMirror projectIcon atom node and back', () => {
    const markup = 'Power: @icon(mana/fire)'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'text', text: 'Power: ' },
      { type: 'projectIcon', attrs: { iconPath: 'mana/fire' } },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe('Power: @icon(key=mana/fire)')
  })

  it('round-trips package-qualified project icons', () => {
    const markup = '@icon(key=gem,pkg=rpg-pack,version=1.2)'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'projectIcon', attrs: { iconPath: 'rpg-pack@1.2#icon:gem' } },
    ])
    const restored = tiptapToCardMarkup(tiptap)
    expect(restored.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'icon', key: 'gem', pkg: 'rpg-pack', version: '1.2' }],
    })
  })
})

describe('tiptapBridge: Lists', () => {
  it('round-trips unordered bullet lists with multiple items', () => {
    const markup = '@ul{@li{Alpha}@li{Beta}@li{Gamma}}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.type).toBe('bulletList')
    expect(tiptap.content![0]!.content).toHaveLength(3)
    expect(tiptap.content![0]!.content![0]).toMatchObject({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }],
    })
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('round-trips ordered lists with paragraph items', () => {
    const markup = '@ol{@li{Step 1}@li{Step 2}}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.type).toBe('orderedList')
    expect(tiptap.content![0]!.content).toHaveLength(2)
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })
})

describe('tiptapBridge: Mixed Formatting & Normalization', () => {
  it('round-trips nested formatting across text, bindings, and icons', () => {
    const markup = '@b{Level: @i{{{player.lvl}}} @icon(key=star)}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toEqual([
      { type: 'text', text: 'Level: ', marks: [{ type: 'bold' }] },
      { type: 'binding', attrs: { expression: 'player.lvl' }, marks: [{ type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: ' ', marks: [{ type: 'bold' }] },
      { type: 'projectIcon', attrs: { iconPath: 'star' }, marks: [{ type: 'bold' }] },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('merges adjacent text runs with identical marks when converting to markup', () => {
    const doc: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'world!', marks: [{ type: 'bold' }] },
        ],
      }],
    }
    const markupDoc = tiptapToCardMarkup(doc)
    expect(markupDoc.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'span', style: { bold: true }, children: [{ type: 'text', value: 'Hello world!' }] }],
    })
    expect(serializeTiptapMarkup(doc)).toBe('@b{Hello world!}')
  })

  it('normalizes empty input to an empty paragraph doc structure', () => {
    const emptyDoc = cardMarkupToTiptap('')
    expect(emptyDoc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(serializeTiptapMarkup(emptyDoc)).toBe('')
  })
})
