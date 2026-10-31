// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCardMarkup, serializeCardMarkup, type CardMarkupDocument } from '.'

const blocks = (source: string) => parseCardMarkup(source).document.blocks
const firstChildren = (source: string) => {
  const [first] = blocks(source)
  if (first?.type !== 'paragraph') throw new Error('expected paragraph')
  return first.children
}
const diagnostics = (source: string) => parseCardMarkup(source).diagnostics.map((d) => d.code)

describe('parseCardMarkup', () => {
  it('lets {{binding}} win over braces so @bold{{{damage}}} bolds a binding', () => {
    const result = parseCardMarkup('@bold{{{damage}}}')
    expect(result.valid).toBe(true)
    expect(firstChildren('@bold{{{damage}}}')).toEqual([
      { type: 'span', style: { bold: true }, children: [{ type: 'binding', expression: 'damage' }] },
    ])
  })

  it('splits paragraphs on newlines but turns newlines inside a tag into breaks', () => {
    expect(blocks('a\nb')).toHaveLength(2)
    expect(firstChildren('@bold{x\ny}')).toEqual([
      { type: 'span', style: { bold: true }, children: [{ type: 'text', value: 'x' }, { type: 'br' }, { type: 'text', value: 'y' }] },
    ])
  })

  it('reads escapes and stray braces as literal text', () => {
    expect(firstChildren('\\@bold \\{x\\} a}b')).toEqual([
      { type: 'text', value: '@bold {x} a' },
      { type: 'text', value: '}' },
      { type: 'text', value: 'b' },
    ])
  })

  it('maps @style arguments onto the style spec', () => {
    const [span] = firstChildren(
      '@style(b,i,color=rgb(1,2,3),bg=#fff,size=18mm,stroke=#000 2mm,shadow=rgba(0,0,0,.5) 1mm 2mm 3mm,fill=art/x.png){hi}',
    )
    expect(span).toMatchObject({
      type: 'span',
      style: {
        bold: true, italic: true, color: 'rgb(1,2,3)', backgroundColor: '#fff', fontSize: '18mm',
        strokeColor: '#000', strokeWidth: 2,
        shadowColor: 'rgba(0,0,0,.5)', shadowOffsetX: 1, shadowOffsetY: 2, shadowBlur: 3,
        fillSource: 'art/x.png',
      },
    })
  })

  it('treats short flag tags as sugar for their full names', () => {
    expect(firstChildren('@b{粗}@i{斜}@u{下}@s{删}')).toMatchObject([
      { type: 'span', style: { bold: true } },
      { type: 'span', style: { italic: true } },
      { type: 'span', style: { underline: true } },
      { type: 'span', style: { strikethrough: true } },
    ])
    expect(firstChildren('@bold{粗}@italic{斜}')).toMatchObject([
      { type: 'span', style: { bold: true } },
      { type: 'span', style: { italic: true } },
    ])
  })

  it('parses icons and images with named arguments only', () => {
    expect(firstChildren(
      '@icon(key=a,pkg=p,version=1.0,scope=package,size=20mm)@img(src=x.png,w=10mm,h=20mm,fit=cover,align=center)',
    )).toEqual([
      { type: 'icon', key: 'a', pkg: 'p', version: '1.0', scope: 'package', size: '20mm' },
      { type: 'img', src: 'x.png', width: '10mm', height: '20mm', fit: 'cover', align: 'center' },
    ])

    // 位置参数不再是合法输入
    expect(diagnostics('@icon(mana/fire)')).toContain('invalid-argument')
    expect(diagnostics('@img(x.png,w=10mm)')).toContain('invalid-argument')
    // 长度必须带单位
    expect(diagnostics('@img(src=x.png,w=10)')).toContain('invalid-argument')
  })

  it('applies @align to every paragraph it wraps and swallows the newline after a block', () => {
    const parsed = blocks('@align(center){a\nb}\nc')
    expect(parsed.map((block) => block.type === 'paragraph' && block.align)).toEqual(['center', 'center', undefined])
  })

  it('parses @list / @item into items of paragraphs', () => {
    const [list] = blocks('@list(ordered){@item{one}@item{two\nthree}}')
    expect(list).toMatchObject({ type: 'list', ordered: true })
    expect(list!.type === 'list' && list!.items.map((item) => item.length)).toEqual([1, 2])
    expect(blocks('@list{@item{x}}')[0]).toMatchObject({ type: 'list', ordered: false })
  })

  it('reports unclosed tags, bad arguments and misplaced block tags without throwing', () => {
    expect(diagnostics('@bold{open')).toEqual(['unclosed-tag'])
    expect(diagnostics('@align(diagonal){x}')).toEqual(['invalid-argument'])
    expect(new Set(diagnostics('@bold{@list{@item{x}}}'))).toEqual(new Set(['invalid-structure']))
    expect(parseCardMarkup('@nope{x}').valid).toBe(false)
  })

  it('removes the legacy tags and aliases', () => {
    for (const source of ['@p{Hello}', '@ul{@li{x}}', '@ol{@li{x}}', '@color(red){c}', '@size(12mm){s}', '@font(serif){f}', '@mark(color=#ff0){m}', '@strong{x}', '@em{x}', '@strike{x}', '@del{x}']) {
      expect(parseCardMarkup(source).valid).toBe(false)
    }
  })

  it('rejects boolean literals and unitless lengths in @style', () => {
    expect(diagnostics('@style(b=true){x}')).toEqual(['invalid-argument'])
    expect(parseCardMarkup('@style(b=true){x}').document.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'span', style: {}, children: [{ type: 'text', value: 'x' }] }],
    })
    expect(diagnostics('@style(size=12){x}')).toEqual(['invalid-argument'])
    expect(parseCardMarkup('@style(size=12mm){x}').valid).toBe(true)
    expect(parseCardMarkup('@style(size=0mm){x}').valid).toBe(true)
  })

  it('requires absolute units for stroke and accepts space-separated shadow parts', () => {
    expect(diagnostics('@style(stroke=#000 2){x}')).toEqual(['invalid-argument'])
    expect(diagnostics('@style(stroke=#000){x}')).toEqual(['invalid-argument'])
    expect(diagnostics('@style(shadow=#000 1mm 2mm){x}')).toEqual(['invalid-argument'])
    expect(parseCardMarkup('@style(stroke=#000 0.5pt){x}').valid).toBe(true)
  })

  it('parses line breaks with the strict bare @br form and the canonical @br()', () => {
    expect(firstChildren('Line 1@br Line 2')).toEqual([
      { type: 'text', value: 'Line 1' },
      { type: 'br' },
      { type: 'text', value: ' Line 2' },
    ])
    expect(firstChildren('Line 1@br()Line 2')).toEqual([
      { type: 'text', value: 'Line 1' },
      { type: 'br' },
      { type: 'text', value: 'Line 2' },
    ])
    // 裸 @br 后面紧跟非分隔符时按字面量处理
    expect(firstChildren('文字@br第二行')).toEqual([{ type: 'text', value: '文字@br第二行' }])
    expect(firstChildren('admin@br.com')).toEqual([{ type: 'text', value: 'admin@br.com' }])
  })

  it('preserves icon size attribute in @icon tag', () => {
    const input = '@icon(key="shield",scope="host",size="24mm")'
    expect(parseCardMarkup(input).valid).toBe(true)
    expect(firstChildren(input)).toEqual([{ type: 'icon', key: 'shield', scope: 'host', size: '24mm' }])
  })

  it('parses emails and social mentions as plain text without diagnostic errors', () => {
    for (const text of ['user@example.com', 'contact@color.com', 'admin@br.com', 'Hello @alice and @bob']) {
      const result = parseCardMarkup(text)
      expect(result.valid).toBe(true)
      expect(result.diagnostics).toHaveLength(0)
      expect(result.document.blocks[0]!.type).toBe('paragraph')
      expect((result.document.blocks[0] as unknown as { children: { value: string }[] }).children[0]!.value).toBe(text)
    }
  })
})

describe('serializeCardMarkup', () => {
  const samples = [
    'plain {{name}} text',
    '@bold{bold @italic{and italic}}',
    '@style(b,i,color=rgb(1,2,3),size=12mm,stroke=#000 2mm,shadow=#111 1mm 2mm 3mm,fill=art/a.png){x}',
    '@align(end){right}\n\nlast',
    '@list{@item{a}@item{b\n@align(center){c}}}\n@list(ordered){@item{x}}',
    'esc \\@ \\{ \\} \\\\ @icon(key=a/b,size=2em)@img(src=p.png)@br() tail',
    '@style(b){b}@style(font="Noto Sans, serif"){f}@style(size=12mm){s}',
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

  it('normalizes short tags and positional input to the canonical form', () => {
    const canonical = serializeCardMarkup(parseCardMarkup('@b{粗}@style(  color = red ){x}').document)
    expect(canonical).toBe('@bold{粗}@style(color=red){x}')
  })

  it('never lets user text be read back as syntax', () => {
    const document: CardMarkupDocument = {
      source: '',
      blocks: [{ type: 'paragraph', children: [{ type: 'text', value: '@bold{x} {{y}} \\ line\nbreak' }] }],
    }
    const reparsed = parseCardMarkup(serializeCardMarkup(document))
    expect(reparsed.valid).toBe(true)
    const [paragraph] = reparsed.document.blocks
    const text = paragraph!.type === 'paragraph' ? paragraph.children.map((n) => (n.type === 'text' ? n.value : '\n')).join('') : ''
    expect(text).toBe('@bold{x} {{y}} \\ line\nbreak')
  })
})
