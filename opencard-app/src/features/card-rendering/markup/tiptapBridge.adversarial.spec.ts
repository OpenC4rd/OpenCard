// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  cardMarkupToTiptap,
  tiptapToCardMarkup,
  serializeTiptapMarkup,
  type TiptapBridgeMark,
  type TiptapBridgeNode,
} from './tiptapBridge'
import { parseCardMarkup } from './cardMarkupParser'

function sortMarks(marks?: readonly TiptapBridgeMark[]): TiptapBridgeMark[] {
  if (!marks) return []
  return [...marks].sort((a, b) => a.type.localeCompare(b.type))
}

describe('tiptapBridge Adversarial: All @tag Variants Roundtrip Fidelity', () => {
  it('round-trips basic flag tags (@b, @i, @u, @s) individually and combined', () => {
    const markup = '@b{bold} and @i{italic} and @u{underlined} and @s{strikethrough}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content).toHaveLength(7)
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)

    // All four flags simultaneously on one run
    const quad = '@style(b=true,i=true,u=true,s=true){all four}'
    const quadDoc = cardMarkupToTiptap(quad)
    const marks = quadDoc.content![0]!.content![0]!.marks!.map(m => m.type)
    expect(marks).toContain('bold')
    expect(marks).toContain('italic')
    expect(marks).toContain('underline')
    expect(marks).toContain('strike')
    expect(serializeTiptapMarkup(quadDoc)).toBe(quad)
  })

  it('round-trips typography tags (@color, @size, @font) with various length units and quotes', () => {
    const cases = [
      '@color(#123456){hex}',
      '@color(rgb(10, 20, 30)){rgb}',
      '@color(rgba(255, 0, 0, 0.5)){rgba}',
      '@size(14px){pixel size}',
      '@size(1.5rem){rem size}',
      '@size(120%){percent size}',
      '@font(Roboto){unquoted font}',
      '@font("Times New Roman"){quoted font}',
      '@font("PingFang SC"){cjk font}',
    ]

    for (const markup of cases) {
      const tiptap = cardMarkupToTiptap(markup)
      const reserialized = serializeTiptapMarkup(tiptap)
      // Normalization check: parsing reserialized should match parsing original
      const originalDoc = parseCardMarkup(markup).document
      const reserializedDoc = parseCardMarkup(reserialized).document
      expect(reserializedDoc.blocks).toEqual(originalDoc.blocks)
    }
  })

  it('round-trips stroke, shadow, and fill variations via @style', () => {
    const strokeVariants = [
      '@style(stroke=#ff0000 2){stroke with px}',
      '@style(stroke=rgba(0,0,0,0.5) 1.5){stroke with fractional and rgba}',
      '@style(stroke=currentColor 3){stroke with currentColor}',
    ]

    for (const markup of strokeVariants) {
      const tiptap = cardMarkupToTiptap(markup)
      const reserialized = serializeTiptapMarkup(tiptap)
      const origBlocks = parseCardMarkup(markup).document.blocks
      const reserBlocks = parseCardMarkup(reserialized).document.blocks
      expect(reserBlocks).toEqual(origBlocks)
    }

    const shadowVariants = [
      '@style(shadow=#000000 2 3 4){shadow with blur}',
      '@style(shadow=rgba(10,20,30,0.8) -2 -4 0){negative offsets}',
    ]

    for (const markup of shadowVariants) {
      const tiptap = cardMarkupToTiptap(markup)
      const reserialized = serializeTiptapMarkup(tiptap)
      const origBlocks = parseCardMarkup(markup).document.blocks
      const reserBlocks = parseCardMarkup(reserialized).document.blocks
      expect(reserBlocks).toEqual(origBlocks)
    }

    const fillVariants = [
      '@style(fill=image:texture.webp){image fill}',
      '@style(fill=#abcdef){color fill}',
    ]

    for (const markup of fillVariants) {
      const tiptap = cardMarkupToTiptap(markup)
      const reserialized = serializeTiptapMarkup(tiptap)
      const origBlocks = parseCardMarkup(markup).document.blocks
      const reserBlocks = parseCardMarkup(reserialized).document.blocks
      expect(reserBlocks).toEqual(origBlocks)
    }
  })

  it('round-trips @mark highlight styles', () => {
    const markup = '@mark(color=#ffeedd){highlighted text}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content![0]!.marks).toEqual([
      { type: 'highlight', attrs: { color: '#ffeedd' } },
    ])
    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('round-trips @img inline images with all attributes and quote normalization', () => {
    // Unquoted path without spaces
    const unquotedMarkup = '@img(src=avatar.png,w=48px,h=48px,fit=cover,align=center)'
    const tiptap1 = cardMarkupToTiptap(unquotedMarkup)
    expect(tiptap1.content![0]!.content![0]).toEqual({
      type: 'image',
      attrs: {
        src: 'avatar.png',
        width: '48px',
        height: '48px',
        fit: 'cover',
        align: 'center',
      },
    })
    expect(serializeTiptapMarkup(tiptap1)).toBe(unquotedMarkup)

    // Quoted path with spaces
    const quotedMarkup = '@img(src="assets/my hero.png",w=100,h=100,fit=contain,align=start)'
    const tiptap2 = cardMarkupToTiptap(quotedMarkup)
    expect(tiptap2.content![0]!.content![0]).toMatchObject({
      type: 'image',
      attrs: {
        src: 'assets/my hero.png',
      },
    })
    // Serialized output normalizes non-delimited strings to unquoted shape
    expect(serializeTiptapMarkup(tiptap2)).toBe('@img(src=assets/my hero.png,w=100,h=100,fit=contain,align=start)')
    expect(parseCardMarkup(serializeTiptapMarkup(tiptap2)).document.blocks).toEqual(parseCardMarkup(quotedMarkup).document.blocks)

    // When value contains delimiters like comma, quotes are strictly preserved
    const commaMarkup = '@img(src="assets/hero,special.png",w=50,h=50)'
    const tiptap3 = cardMarkupToTiptap(commaMarkup)
    expect(serializeTiptapMarkup(tiptap3)).toBe(commaMarkup)
  })
})

describe('tiptapBridge Adversarial: Atom Nodes (@bind, @icon)', () => {
  it('handles complex and symbolic binding expressions without corruption', () => {
    const expressions = [
      'player.inventory[0].name',
      'a > 0 ? "positive" : "negative"',
      'calculateBonus(stats.str, stats.dex)',
      'x + y * 2 / (z - 1)',
      '用户.基础属性.生命值',
      'data["nested-key"].val',
      'flag ? 1 : 0',
    ]

    for (const expr of expressions) {
      const markup = `Value: {{${expr}}} units`
      const tiptap = cardMarkupToTiptap(markup)
      const bindingNode = tiptap.content![0]!.content!.find(n => n.type === 'binding')
      expect(bindingNode).toBeDefined()
      expect(bindingNode!.attrs?.expression).toBe(expr)

      const reserialized = serializeTiptapMarkup(tiptap)
      expect(reserialized).toBe(markup)
    }
  })

  it('handles all @icon variations: host, package, version, scoped npm package, and size', () => {
    const iconScenarios = [
      {
        markup: '@icon(key=star)',
        expectedAttrs: { iconPath: 'star' },
        expectedKey: 'star',
      },
      {
        markup: '@icon(key=star,scope=host)',
        expectedAttrs: { iconPath: '#icon:star' },
        expectedKey: 'star',
        expectedScope: 'host',
      },
      {
        markup: '@icon(key=gem,pkg=rpg-items)',
        expectedAttrs: { iconPath: 'rpg-items#icon:gem' },
        expectedKey: 'gem',
        expectedPkg: 'rpg-items',
      },
      {
        markup: '@icon(key=potion,pkg=rpg-items,version=2.1.0)',
        expectedAttrs: { iconPath: 'rpg-items@2.1.0#icon:potion' },
        expectedKey: 'potion',
        expectedPkg: 'rpg-items',
        expectedVersion: '2.1.0',
      },
      {
        markup: '@icon(key=blade,pkg=@scoped/pack,version=1.0.0)',
        expectedAttrs: { iconPath: '@scoped/pack@1.0.0#icon:blade' },
        expectedKey: 'blade',
        expectedPkg: '@scoped/pack',
        expectedVersion: '1.0.0',
      },
      {
        markup: '@icon(key=shield,pkg=@scoped/pack)',
        expectedAttrs: { iconPath: '@scoped/pack#icon:shield' },
        expectedKey: 'shield',
        expectedPkg: '@scoped/pack',
      },
      {
        markup: '@icon(key=clock,size=24px)',
        expectedAttrs: { iconPath: 'clock', size: '24px' },
        expectedKey: 'clock',
        expectedSize: '24px',
      },
      {
        markup: '@icon(key=gem,pkg=rpg-pack,version=2.0.0,size=32px)',
        expectedAttrs: { iconPath: 'rpg-pack@2.0.0#icon:gem', size: '32px' },
        expectedKey: 'gem',
        expectedPkg: 'rpg-pack',
        expectedVersion: '2.0.0',
        expectedSize: '32px',
      },
    ]

    for (const scenario of iconScenarios) {
      const tiptap = cardMarkupToTiptap(scenario.markup)
      const iconNode = tiptap.content![0]!.content![0]!
      expect(iconNode.type).toBe('projectIcon')
      expect(iconNode.attrs?.iconPath).toBe(scenario.expectedAttrs.iconPath)

      const restored = tiptapToCardMarkup(tiptap)
      const restoredIcon = restored.blocks[0]!.type === 'paragraph'
        ? (restored.blocks[0] as any).children[0]
        : null
      expect(restoredIcon).toBeDefined()
      expect(restoredIcon.type).toBe('icon')
      expect(restoredIcon.key).toBe(scenario.expectedKey)
      if (scenario.expectedScope) expect(restoredIcon.scope).toBe(scenario.expectedScope)
      if (scenario.expectedPkg) expect(restoredIcon.pkg).toBe(scenario.expectedPkg)
      if (scenario.expectedVersion) expect(restoredIcon.version).toBe(scenario.expectedVersion)
      if (scenario.expectedSize) expect(restoredIcon.size).toBe(scenario.expectedSize)
    }
  })

  it('preserves marks applied to atom nodes across roundtrips', () => {
    const markup = '@b{@color(red){{{user.name}} @icon(key=verified)}}'
    const tiptap = cardMarkupToTiptap(markup)
    const binding = tiptap.content![0]!.content![0]!
    const icon = tiptap.content![0]!.content![2]!

    expect(binding.type).toBe('binding')
    expect(binding.marks).toEqual([
      { type: 'bold' },
      { type: 'textStyle', attrs: { color: 'red' } },
    ])
    expect(icon.type).toBe('projectIcon')
    expect(icon.marks).toEqual([
      { type: 'bold' },
      { type: 'textStyle', attrs: { color: 'red' } },
    ])

    const reserialized = serializeTiptapMarkup(tiptap)
    const reparsed = cardMarkupToTiptap(reserialized)
    expect(reparsed.content![0]!.content![0]!.marks).toEqual(binding.marks)
    expect(reparsed.content![0]!.content![2]!.marks).toEqual(icon.marks)
  })
})

describe('tiptapBridge Adversarial: Deep Nesting & Conflicting Styles', () => {
  it('correctly flattens and factors 10-level deep nested spans', () => {
    // 10 nested levels of styles
    let markup = 'Deep text'
    markup = `@color(red){${markup}}`
    markup = `@size(18px){${markup}}`
    markup = `@font(Arial){${markup}}`
    markup = `@b{${markup}}`
    markup = `@i{${markup}}`
    markup = `@u{${markup}}`
    markup = `@s{${markup}}`
    markup = `@mark(color=yellow){${markup}}`
    markup = `@style(stroke=#000 2){${markup}}`
    markup = `@style(shadow=#111 1 1 2){${markup}}`

    const tiptap = cardMarkupToTiptap(markup)
    const textNode = tiptap.content![0]!.content![0]!
    expect(textNode.type).toBe('text')
    expect(textNode.text).toBe('Deep text')

    // Verify all marks are present on the leaf node
    const markTypes = textNode.marks!.map(m => m.type)
    expect(markTypes).toContain('bold')
    expect(markTypes).toContain('italic')
    expect(markTypes).toContain('underline')
    expect(markTypes).toContain('strike')
    expect(markTypes).toContain('highlight')
    expect(markTypes).toContain('textStyle')

    const textStyleAttrs = textNode.marks!.find(m => m.type === 'textStyle')!.attrs
    expect(textStyleAttrs).toMatchObject({
      color: 'red',
      fontSize: '18px',
      fontFamily: 'Arial',
      textStrokeColor: '#000',
      textStrokeWidth: '2px',
      textShadowColor: '#111',
      textShadowOffsetX: '1px',
      textShadowOffsetY: '1px',
      textShadowBlur: '2px',
    })

    // Bi-directional roundtrip preserves all attributes regardless of mark array order
    const restored = tiptapToCardMarkup(tiptap)
    const secondTiptap = cardMarkupToTiptap(restored)
    expect(sortMarks(secondTiptap.content![0]!.content![0]!.marks)).toEqual(sortMarks(textNode.marks))
  })

  it('resolves conflicting styles with inner-override semantics', () => {
    // Outer is red, middle is green, innermost is blue
    const markup = '@color(red){outer @color(green){middle @color(blue){inner} middle2} outer2}'
    const tiptap = cardMarkupToTiptap(markup)
    const nodes = tiptap.content![0]!.content!

    const colors = nodes.map(n => n.marks?.find(m => m.type === 'textStyle')?.attrs?.color)
    expect(colors).toEqual(['red', 'green', 'blue', 'green', 'red'])

    // Reconstructing markup preserves correct colors for each segment
    const restored = tiptapToCardMarkup(tiptap)
    const restoredTiptap = cardMarkupToTiptap(restored)
    const restoredColors = restoredTiptap.content![0]!.content!.map(
      n => n.marks?.find(m => m.type === 'textStyle')?.attrs?.color,
    )
    expect(restoredColors).toEqual(['red', 'green', 'blue', 'green', 'red'])
  })

  it('merges multiple adjacent sibling spans and text runs with identical styles', () => {
    const doc: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Seg1 ', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: 'Seg2 ', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: 'Seg3', marks: [{ type: 'bold' }, { type: 'italic' }] },
        ],
      }],
    }

    const restored = tiptapToCardMarkup(doc)
    expect(restored.blocks[0]!.type).toBe('paragraph')
    const p = restored.blocks[0] as any
    // All three runs should have merged into a single text child inside the span
    expect(p.children).toHaveLength(1)
    expect(p.children[0].type).toBe('span')
    expect(p.children[0].style).toEqual({ bold: true, italic: true })
    expect(p.children[0].children).toEqual([{ type: 'text', value: 'Seg1 Seg2 Seg3' }])
  })
})

describe('tiptapBridge Adversarial: Lists, Nesting & Structural Complexities', () => {
  it('round-trips lists containing formatted inline spans, bindings, and icons', () => {
    const markup = '@ul{@li{@b{Item 1} {{score}}}@li{@i{Item 2} @icon(key=star)}}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.type).toBe('bulletList')
    expect(tiptap.content![0]!.content).toHaveLength(2)

    const item1 = tiptap.content![0]!.content![0]!
    expect(item1.content![0]!.content![0]!.marks).toEqual([{ type: 'bold' }])
    expect(item1.content![0]!.content![2]!.type).toBe('binding')

    const item2 = tiptap.content![0]!.content![1]!
    expect(item2.content![0]!.content![0]!.marks).toEqual([{ type: 'italic' }])
    expect(item2.content![0]!.content![2]!.type).toBe('projectIcon')

    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('round-trips list items containing multiple paragraphs', () => {
    const markup = '@ol{@li{Step 1 paragraph 1\nStep 1 paragraph 2}@li{Step 2}}'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.type).toBe('orderedList')
    const item1 = tiptap.content![0]!.content![0]!
    expect(item1.content).toHaveLength(2) // Two paragraphs in item 1

    expect(serializeTiptapMarkup(tiptap)).toBe(markup)
  })

  it('gracefully degrades nested ProseMirror lists into paragraph list items', () => {
    const nestedListDoc: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Top item' }] },
            {
              type: 'bulletList',
              content: [{
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sub item' }] }],
              }],
            },
          ],
        }],
      }],
    }

    const restored = tiptapToCardMarkup(nestedListDoc)
    expect(restored.blocks[0]!.type).toBe('list')
    const list = restored.blocks[0] as any
    // Sub-items flattened to paragraphs within the list
    expect(list.items[0]).toHaveLength(2)
    expect(list.items[0][0].children[0].value).toBe('Top item')
    expect(list.items[0][1].children[0].value).toBe('Sub item')
  })

  it('extracts paragraphs from ProseMirror table nodes without crashing', () => {
    const tableDoc: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 1' }] }],
              },
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header 2' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
              },
            ],
          },
        ],
      }],
    }

    const restored = tiptapToCardMarkup(tableDoc)
    expect(restored.blocks).toHaveLength(4)
    expect((restored.blocks[0] as any).children[0].value).toBe('Header 1')
    expect((restored.blocks[1] as any).children[0].value).toBe('Header 2')
    expect((restored.blocks[2] as any).children[0].value).toBe('Cell 1')
    expect((restored.blocks[3] as any).children[0].value).toBe('Cell 2')
  })
})

describe('tiptapBridge Adversarial: Whitespace & Special Character Fidelity', () => {
  it('preserves leading, trailing, and consecutive empty paragraphs', () => {
    const cases = [
      '\nLeading empty',
      'Trailing empty\n',
      'Middle\n\nEmpty',
      'Multiple\n\n\n\nEmpties',
      '\n\nLeading two\n\n\nTrailing three\n\n\n',
    ]

    for (const markup of cases) {
      const tiptap = cardMarkupToTiptap(markup)
      const reserialized = serializeTiptapMarkup(tiptap)
      expect(reserialized).toBe(markup)
    }
  })

  it('preserves leading, trailing, and standalone whitespaces in styled text runs', () => {
    const markup = '@b{  leading} and @i{trailing  } and @u{   middle   }'
    const tiptap = cardMarkupToTiptap(markup)
    expect(tiptap.content![0]!.content![0]!.text).toBe('  leading')
    expect(tiptap.content![0]!.content![2]!.text).toBe('trailing  ')
    expect(tiptap.content![0]!.content![4]!.text).toBe('   middle   ')

    const reserialized = serializeTiptapMarkup(tiptap)
    expect(reserialized).toBe(markup)
  })

  it('round-trips completely empty document and single whitespace string', () => {
    const emptyDoc = cardMarkupToTiptap('')
    expect(emptyDoc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(serializeTiptapMarkup(emptyDoc)).toBe('')

    const spaceDoc = cardMarkupToTiptap('   ')
    expect(spaceDoc.content![0]!.content![0]!.text).toBe('   ')
    expect(serializeTiptapMarkup(spaceDoc)).toBe('   ')
  })

  it('escapes and preserves markup-special characters in text runs (@, {, }, \\, <, >, &)', () => {
    // In cardMarkup, literal @, {, }, \ are escaped as \@, \{, \}, \\
    const textWithSpecials = 'Email: user@example.com, code: { a && b < 10 }, path: C:\\temp'
    const tiptap: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: textWithSpecials }],
      }],
    }

    const markupDoc = tiptapToCardMarkup(tiptap)
    expect(markupDoc.source).toContain('user\\@example.com')
    expect(markupDoc.source).toContain('\\{ a && b < 10 \\}')
    expect(markupDoc.source).toContain('C:\\\\temp')

    // Converting back to tiptap recovers exact original string
    const roundtripTiptap = cardMarkupToTiptap(markupDoc.source)
    expect(roundtripTiptap.content![0]!.content![0]!.text).toBe(textWithSpecials)
  })
})

describe('tiptapBridge Adversarial: Malformed Inputs & Edge Cases', () => {
  it('handles missing or partial attrs on atom nodes safely', () => {
    const docWithEmptyAttrs: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'binding' } as any, // Missing attrs
          { type: 'binding', attrs: {} }, // Empty attrs
          { type: 'projectIcon' } as any, // Missing attrs
          { type: 'projectIcon', attrs: {} }, // Empty attrs
          { type: 'image' } as any, // Missing attrs
        ],
      }],
    }

    const restored = tiptapToCardMarkup(docWithEmptyAttrs)
    expect(restored.blocks).toHaveLength(1)
    const inlines = (restored.blocks[0] as any).children
    expect(inlines[0]).toEqual({ type: 'binding', expression: '' })
    expect(inlines[1]).toEqual({ type: 'binding', expression: '' })
    expect(inlines[2]).toEqual({ type: 'icon', key: '' })
    expect(inlines[3]).toEqual({ type: 'icon', key: '' })
    expect(inlines[4]).toEqual({ type: 'img', src: '' })
  })

  it('handles unknown mark types and malformed mark objects without throwing', () => {
    const docWithUnknownMarks: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hello',
            marks: [
              { type: 'unknown_custom_mark', attrs: { x: 1 } },
              { type: 'another_weird_mark' },
              { type: 'bold' },
            ],
          },
        ],
      }],
    }

    const restored = tiptapToCardMarkup(docWithUnknownMarks)
    const p = restored.blocks[0] as any
    // Only 'bold' should be extracted; unknown marks ignored cleanly
    expect(p.children[0].type).toBe('span')
    expect(p.children[0].style).toEqual({ bold: true })
    expect(p.children[0].children[0].value).toBe('Hello')
  })

  it('handles empty content arrays across docs, paragraphs, and lists', () => {
    const emptyDoc: TiptapBridgeNode = { type: 'doc', content: [] }
    expect(tiptapToCardMarkup(emptyDoc).blocks).toEqual([{ type: 'paragraph', children: [] }])

    const emptyParaDoc: TiptapBridgeNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    }
    expect(tiptapToCardMarkup(emptyParaDoc).blocks).toEqual([{ type: 'paragraph', children: [] }])

    const emptyListDoc: TiptapBridgeNode = {
      type: 'doc',
      content: [{ type: 'bulletList', content: [] }],
    }
    expect(tiptapToCardMarkup(emptyListDoc).blocks).toEqual([{ type: 'list', ordered: false, items: [] }])

    // Empty list in markup provides schema-valid fallback listItem and paragraph
    const emptyMarkupList = cardMarkupToTiptap('@ul{}')
    expect(emptyMarkupList.content![0]!.type).toBe('bulletList')
    expect(emptyMarkupList.content![0]!.content![0]!.type).toBe('listItem')
    expect(emptyMarkupList.content![0]!.content![0]!.content![0]!.type).toBe('paragraph')

    // Empty list item provides schema-valid fallback paragraph
    const emptyItemMarkup = cardMarkupToTiptap('@ul{@li{}}')
    expect(emptyItemMarkup.content![0]!.content![0]!.content![0]!.type).toBe('paragraph')
  })

  it('handles malformed markup strings gracefully through the bridge', () => {
    // Unclosed tags
    const unclosedTag = '@b{bold text without closing brace'
    const tiptap1 = cardMarkupToTiptap(unclosedTag)
    expect(tiptap1.content![0]!.content![0]!.text).toBe('bold text without closing brace')
    expect(tiptap1.content![0]!.content![0]!.marks).toEqual([{ type: 'bold' }])

    // Unclosed binding
    const unclosedBinding = 'Prefix {{broken_expr'
    const tiptap2 = cardMarkupToTiptap(unclosedBinding)
    expect(tiptap2.content![0]!.content![0]!.text).toContain('broken_expr')

    // Unknown tags in markup fall back to literal text
    const unknownTag = '@unsupportedTag(arg=1){some text}'
    const tiptap3 = cardMarkupToTiptap(unknownTag)
    expect(tiptap3.type).toBe('doc')
    expect(tiptap3.content![0]!.content![0]!.text).toContain('@unsupportedTag')
  })

  it('handles non-standard paragraph alignments gracefully', () => {
    const alignments = [
      { input: 'CENTER', expectedAlign: 'center' },
      { input: 'Start', expectedAlign: undefined },
      { input: 'LEFT', expectedAlign: undefined },
      { input: 'Right', expectedAlign: 'end' },
      { input: 'JuStIfY', expectedAlign: 'justify' },
      { input: 'invalid_align_value', expectedAlign: undefined },
    ]

    for (const { input, expectedAlign } of alignments) {
      const doc: TiptapBridgeNode = {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { textAlign: input },
          content: [{ type: 'text', text: 'Text' }],
        }],
      }
      const restored = tiptapToCardMarkup(doc)
      expect(restored.blocks[0]!.type).toBe('paragraph')
      expect((restored.blocks[0] as any).align).toBe(expectedAlign)
    }
  })

  it('handles numeric font sizes from ProseMirror JSON', () => {
    // If TipTap passes attrs.fontSize as a string like "24px"
    const docWithString: TiptapBridgeNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'big', marks: [{ type: 'textStyle', attrs: { fontSize: '24px' } }] }],
      }],
    }
    const markupWithString = tiptapToCardMarkup(docWithString)
    expect(markupWithString.source).toBe('@size(24px){big}')
  })
})

describe('tiptapBridge Stress Test: High Volume & Scale', () => {
  it('processes a 500-paragraph document with alternating styles within 500ms', () => {
    const paragraphs: string[] = []
    for (let i = 0; i < 500; i++) {
      if (i % 3 === 0) {
        paragraphs.push(`@b{Paragraph ${i}} with @color(#ff0000){red} and {{stats.value_${i}}}`)
      } else if (i % 3 === 1) {
        paragraphs.push(`@align(center){@i{Centered ${i}} @icon(key=icon_${i})}`)
      } else {
        paragraphs.push(`@style(stroke=#000 1,shadow=#111 1 1 1){Styled line ${i}}`)
      }
    }
    const fullMarkup = paragraphs.join('\n')

    const start = performance.now()
    const tiptap = cardMarkupToTiptap(fullMarkup)
    expect(tiptap.content).toHaveLength(500)

    const reserialized = serializeTiptapMarkup(tiptap)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(500)
    // Check line count preserved
    expect(reserialized.split('\n')).toHaveLength(500)
  })

  it('processes 1,000 inline items in a single paragraph without stack overflow or performance degradation', () => {
    const items: string[] = []
    for (let i = 0; i < 1000; i++) {
      if (i % 4 === 0) items.push(`@b{b${i}}`)
      else if (i % 4 === 1) items.push(`{{v${i}}}`)
      else if (i % 4 === 2) items.push(`@icon(key=k${i})`)
      else items.push(`plain${i}`)
    }
    const singleLineMarkup = items.join('')

    const start = performance.now()
    const tiptap = cardMarkupToTiptap(singleLineMarkup)
    expect(tiptap.content![0]!.content!.length).toBeGreaterThan(500)

    const reserialized = serializeTiptapMarkup(tiptap)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(500)
    expect(reserialized).toBe(singleLineMarkup)
  })
})
