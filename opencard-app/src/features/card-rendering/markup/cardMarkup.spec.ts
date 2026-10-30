// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCardMarkup, serializeCardMarkup, type CardMarkupDocument } from '.'

const blocks = (source: string) => parseCardMarkup(source).document.blocks
const firstChildren = (source: string) => {
  const [first] = blocks(source)
  if (first?.type !== 'paragraph') throw new Error('expected paragraph')
  return first.children
}

describe('parseCardMarkup', () => {
  it('lets {{binding}} win over braces so @b{{{damage}}} bolds a binding', () => {
    const result = parseCardMarkup('@b{{{damage}}}')
    expect(result.valid).toBe(true)
    expect(firstChildren('@b{{{damage}}}')).toEqual([
      { type: 'span', style: { bold: true }, children: [{ type: 'binding', expression: 'damage' }] },
    ])
  })

  it('splits paragraphs on newlines but turns newlines inside a tag into breaks', () => {
    expect(blocks('a\nb')).toHaveLength(2)
    expect(firstChildren('@b{x\ny}')).toEqual([
      { type: 'span', style: { bold: true }, children: [{ type: 'text', value: 'x' }, { type: 'br' }, { type: 'text', value: 'y' }] },
    ])
  })

  it('reads escapes and stray braces as literal text', () => {
    expect(firstChildren('\\@b \\{x\\} a}b')).toEqual([{ type: 'text', value: '@b {x} a' }, { type: 'text', value: '}' }, { type: 'text', value: 'b' }])
  })

  it('maps @style arguments onto the style spec', () => {
    const [span] = firstChildren('@style(b=true,color=rgb(1,2,3),bg=#fff,size=18mm,stroke=#000 2,shadow=rgba(0,0,0,.5) 1 2 3,fill=image:art/x.png){hi}')
    expect(span).toMatchObject({
      type: 'span',
      style: {
        bold: true, color: 'rgb(1,2,3)', backgroundColor: '#fff', fontSize: '18mm',
        strokeColor: '#000', strokeWidth: 2,
        shadowColor: 'rgba(0,0,0,.5)', shadowOffsetX: 1, shadowOffsetY: 2, shadowBlur: 3,
        fillType: 'image', fillSource: 'art/x.png',
      },
    })
  })

  it('parses icons and images with positional and named arguments', () => {
    expect(firstChildren('@icon(mana/fire)@icon(key=a,pkg=p,version=1.0,scope=package,size=20mm)@img(src=x.png,w=10,h=20,fit=cover,align=center)')).toEqual([
      { type: 'icon', key: 'mana/fire' },
      { type: 'icon', key: 'a', pkg: 'p', version: '1.0', scope: 'package', size: '20mm' },
      { type: 'img', src: 'x.png', width: '10', height: '20', fit: 'cover', align: 'center' },
    ])
  })

  it('applies @align to every paragraph it wraps and swallows the newline after a block', () => {
    const parsed = blocks('@align(center){a\nb}\nc')
    expect(parsed.map((block) => block.type === 'paragraph' && block.align)).toEqual(['center', 'center', undefined])
  })

  it('parses ordered and unordered lists into items of paragraphs', () => {
    const [list] = blocks('@ol{@li{one}@li{two\nthree}}')
    expect(list).toMatchObject({ type: 'list', ordered: true })
    expect(list!.type === 'list' && list!.items.map((item) => item.length)).toEqual([1, 2])
  })

  it('reports unclosed tags, bad arguments and misplaced block tags without throwing', () => {
    expect(parseCardMarkup('@b{open').diagnostics.map((d) => d.code)).toEqual(['unclosed-tag'])
    expect(parseCardMarkup('@align(diagonal){x}').diagnostics.map((d) => d.code)).toEqual(['invalid-argument'])
    expect(new Set(parseCardMarkup('@b{@ul{@li{x}}}').diagnostics.map((d) => d.code))).toEqual(new Set(['invalid-structure']))
    expect(parseCardMarkup('@nope{x}').valid).toBe(false)
  })

  it('parses markup with styles, alignment, and lists into document model', () => {
    const { document, valid } = parseCardMarkup('@align(center){a @b{b} & c}\n@ul{@li{x}}')
    expect(valid).toBe(true)
    expect(document.blocks[0]).toMatchObject({ type: 'paragraph', align: 'center' })
    expect(document.blocks[0]!.type === 'paragraph' && document.blocks[0]!.children).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'span', style: { bold: true }, children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' & c' },
    ])
    expect(document.blocks[1]).toMatchObject({ type: 'list', ordered: false })
  })

  it('parses @p and @paragraph block tags with optional alignment', () => {
    const p1 = blocks('@p{Hello world}')
    expect(p1).toEqual([{ type: 'paragraph', children: [{ type: 'text', value: 'Hello world' }] }])

    const p2 = blocks('@p(center){Centered line}')
    expect(p2).toEqual([{ type: 'paragraph', align: 'center', children: [{ type: 'text', value: 'Centered line' }] }])

    const p3 = blocks('@p(align=right){Right line}')
    expect(p3).toEqual([{ type: 'paragraph', align: 'end', children: [{ type: 'text', value: 'Right line' }] }])

    const p4 = blocks('@p{First paragraph}\n@p{Second paragraph}')
    expect(p4).toHaveLength(2)
    expect(p4.map((b) => b.type === 'paragraph' && b.children[0]?.type === 'text' && b.children[0].value)).toEqual([
      'First paragraph',
      'Second paragraph',
    ])

    const nested = parseCardMarkup('@b{@p{invalid nesting}}')
    expect(nested.diagnostics.some((d) => d.code === 'invalid-structure')).toBe(true)
  })

  it('parses markup line breaks and natural newlines', () => {
    const result = parseCardMarkup('Line 1@br Line 2')
    expect(result.valid).toBe(true)
    expect(result.diagnostics).toHaveLength(0)
    expect(firstChildren('Line 1@br Line 2')).toEqual([
      { type: 'text', value: 'Line 1' },
      { type: 'br' },
      { type: 'text', value: ' Line 2' },
    ])
  })

  it('preserves icon size attribute in @icon tag', () => {
    const input = '@icon(key="shield",scope="host",size="24mm")'
    const result = parseCardMarkup(input)
    expect(result.valid).toBe(true)
    expect(firstChildren(input)).toEqual([
      { type: 'icon', key: 'shield', scope: 'host', size: '24mm' },
    ])
  })

  it('parses emails and social mentions as plain text without diagnostic errors', () => {
    const cases = [
      'user@example.com',
      'contact@color.com',
      'admin@br.com',
      'Hello @alice and @bob',
    ]
    for (const text of cases) {
      const result = parseCardMarkup(text)
      expect(result.valid).toBe(true)
      expect(result.diagnostics).toHaveLength(0)
      expect(result.document.blocks[0]!.type).toBe('paragraph')
      expect((result.document.blocks[0] as any).children[0].value).toBe(text)
    }
  })
})

describe('serializeCardMarkup', () => {
  const samples = [
    'plain {{name}} text',
    '@b{bold @i{and italic}} @color(red){c}',
    '@style(b=true,u=false,color="rgb(1, 2, 3)",stroke=#000 2,shadow=#111 1 2 3,fill=image:a.png){x}',
    '@align(end){right}\n\nlast',
    '@ul{@li{a}@li{b\n@align(center){c}}}\n@ol{@li{x}}',
    'esc \\@ \\{ \\} \\\\ @icon(key=a/b,size=2em)@img(src=p.png)@br tail',
    '@mark(color=#ff0){m}@font("Noto Sans, serif"){f}@size(12mm){s}',
  ]

  it.each(samples)('round-trips %j through parse → serialize → parse', (source) => {
    const first = parseCardMarkup(source)
    expect(first.valid).toBe(true)
    const text = serializeCardMarkup(first.document)
    const second = parseCardMarkup(text)
    expect(second.valid).toBe(true)
    expect(second.document.blocks).toEqual(first.document.blocks)
    expect(serializeCardMarkup(second.document)).toBe(text)
  })

  it('never lets user text be read back as syntax', () => {
    const document: CardMarkupDocument = {
      source: '',
      blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '@b{x} {{y}} \\ line\nbreak' }] }],
    }
    const reparsed = parseCardMarkup(serializeCardMarkup(document))
    expect(reparsed.valid).toBe(true)
    const [paragraph] = reparsed.document.blocks
    const text = paragraph!.type === 'paragraph' ? paragraph.children.map((n) => (n.type === 'text' ? n.value : '\n')).join('') : ''
    expect(text).toBe('@b{x} {{y}} \\ line\nbreak')
  })
})
