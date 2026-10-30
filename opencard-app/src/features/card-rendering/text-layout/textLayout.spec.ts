// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCardMarkup } from '../markup'
import { createMockTextMeasurer, layoutTextBlock, type TextLayoutInput } from '.'

/** mock 度量：字号 10 时 CJK 宽 10、西文宽 5、空格宽 3；行高 20。 */
function layout(source: string, overrides: Partial<TextLayoutInput> = {}) {
  return layoutTextBlock(
    {
      document: parseCardMarkup(source).document,
      boxWidth: 100, boxHeight: 100, baseFontFamily: 'Test', baseFontSizePx: 10, baseFontWeight: 'normal',
      baseColor: '#000', textAlign: 'start', verticalAlign: 'top', lineHeightPx: 20, writingMode: 'horizontal-tb',
      ...overrides,
    },
    createMockTextMeasurer(),
  )
}

const texts = (result: ReturnType<typeof layout>) => result.lines.map((line) => line.runs.map((run) => (run.kind === 'glyph' ? run.text : `<${run.kind}>`)).join(''))

describe('layoutTextBlock line breaking', () => {
  it('breaks CJK between any two characters and stacks lines by line height', () => {
    const result = layout('你好世界啊', { boxWidth: 30 })
    expect(texts(result)).toEqual(['你好世', '界啊'])
    expect(result.lines.map((line) => line.y)).toEqual([0, 20])
    expect(result.contentHeight).toBe(40)
  })

  it('breaks Latin text at spaces and drops the spaces at the wrap point', () => {
    const result = layout('aaaa bbbb', { boxWidth: 25 })
    expect(texts(result)).toEqual(['aaaa', 'bbbb'])
    expect(result.lines[1]!.runs[0]).toMatchObject({ x: 0 })
  })

  it('splits a single word longer than the box instead of overflowing', () => {
    expect(texts(layout('abcdefghij', { boxWidth: 20 }))).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('keeps closing punctuation off the start of a line', () => {
    expect(texts(layout('你好，吗', { boxWidth: 20 }))).toEqual(['你好，', '吗'])
  })

  it('keeps an empty paragraph as a blank line and honors @br', () => {
    expect(texts(layout('a\n\nb@br()c'))).toEqual(['a', '', 'b', 'c'])
  })
})

describe('layoutTextBlock alignment', () => {
  it('shifts lines for center and end and lets @align override the block alignment', () => {
    const centered = layout('abcd', { textAlign: 'center' })
    expect(centered.lines[0]!.x).toBe(40)
    const mixed = layout('@align(end){abcd}\nabcd', { textAlign: 'center' })
    expect(mixed.lines.map((line) => line.x)).toEqual([80, 40])
  })

  it('stretches non-last justified lines to the box width but not the last or a forced one', () => {
    const result = layout('aa bb cc dd ee', { boxWidth: 30, textAlign: 'justify' })
    const [first, ...rest] = result.lines
    const end = (line: NonNullable<typeof first>) => Math.max(...line.runs.map((run) => run.x + run.width))
    expect(end(first!)).toBeCloseTo(30)
    expect(end(rest[rest.length - 1]!)).toBeLessThan(30)
  })

  it('places the line block by verticalAlign inside the box', () => {
    expect(layout('a', { verticalAlign: 'center' }).lines[0]!.y).toBe(40)
    expect(layout('a', { verticalAlign: 'bottom' }).lines[0]!.y).toBe(80)
  })
})

describe('layoutTextBlock runs', () => {
  it('merges contiguous same-style glyphs and splits at style boundaries', () => {
    const result = layout('ab cd@b{ef}')
    expect(result.runs).toHaveLength(2)
    expect(result.runs[0]).toMatchObject({ kind: 'glyph', text: 'ab cd', x: 0, width: 23 })
    expect(result.runs[1]).toMatchObject({ text: 'ef', x: 23, style: { fontWeight: 'bold' } })
  })

  it('resolves nested span styles and relative font sizes against the enclosing span', () => {
    const [run] = layout('@size(20px){@size(0.5em){x}}').runs
    expect(run).toMatchObject({ style: { fontSizePx: 10 } })
    const [colored] = layout('@style(b=true,color=red,stroke=#000 2){x}').runs
    expect(colored).toMatchObject({ style: { fontWeight: 'bold', color: 'red', strokeColor: '#000', strokeWidth: 2 } })
  })

  it('grows the line for a tall inline icon and sits it on the baseline', () => {
    const result = layout('a@icon(key=k,size=40px)')
    const icon = result.runs.find((run) => run.kind === 'icon')!
    expect(icon).toMatchObject({ width: 40, height: 40, x: 5 })
    expect(result.lines[0]!.height).toBe(40)
    expect(icon.y + icon.height * 0.85).toBeCloseTo(result.lines[0]!.baselineY)
  })

  it('grows line height for larger font spans and prevents successive lines from overlapping', () => {
    const result = layout('Line 1\n@size(40px){BIG}\nLine 3')
    expect(result.lines.map((l) => [l.y, l.height])).toEqual([
      [0, 20],
      [20, 80],
      [100, 20],
    ])
    expect(result.contentHeight).toBe(120)
    const bigRun = result.lines[1]!.runs[0]!
    expect(bigRun.y).toBeGreaterThanOrEqual(20)
    expect(bigRun.y + bigRun.height).toBeLessThanOrEqual(100)
  })

  it('keeps enlarged line height across wrapped lines when a large text wraps', () => {
    const result = layout('@size(40px){Line 2}') // 112px wide, wraps in 100px box
    expect(result.lines.map((l) => [l.y, l.height])).toEqual([
      [0, 80],
      [80, 80],
    ])
    expect(result.contentHeight).toBe(160)
  })

  it('aligns mixed font sizes on the same line to a common baseline without clipping', () => {
    const result = layout('small@size(40px){BIG}')
    const line = result.lines[0]!
    expect(line.height).toBe(80)
    const [smallRun, bigRun] = line.runs
    expect(smallRun?.kind).toBe('glyph')
    expect(bigRun?.kind).toBe('glyph')
    if (smallRun?.kind === 'glyph' && bigRun?.kind === 'glyph') {
      expect(smallRun.baselineY).toBe(bigRun.baselineY)
      expect(smallRun.baselineY).toBe(line.baselineY)
    }
    expect(smallRun!.y).toBeGreaterThanOrEqual(0)
    expect(bigRun!.y).toBeGreaterThanOrEqual(0)
  })

  it('indents list paragraphs and puts the marker before the text', () => {
    const result = layout('@ol{@li{一二}@li{三}}')
    expect(texts(result)).toEqual(['1.一二', '2.三'])
    expect(result.lines[0]!.runs[1]).toMatchObject({ x: 20 })
  })
})

describe('layoutTextBlock vertical writing', () => {
  it('flows columns right-to-left with upright CJK and quarter-turned Latin', () => {
    const result = layout('你好\nab', { writingMode: 'vertical-rl', boxWidth: 100, boxHeight: 100 })
    expect(result.lines.map((line) => line.x)).toEqual([80, 60])
    expect(result.lines[0]!.runs.map((run) => [run.y, run.angleRad])).toEqual([[0, 0], [10, 0]])
    expect(result.lines[1]!.runs[0]).toMatchObject({ angleRad: Math.PI / 2, y: 0, height: 10, width: 20 })
  })

  it('wraps columns at the box height and flows left-to-right for vertical-lr', () => {
    const result = layout('一二三四五', { writingMode: 'vertical-lr', boxHeight: 30 })
    expect(result.lines.map((line) => [line.x, line.runs.length])).toEqual([[0, 3], [20, 2]])
    expect(result.contentWidth).toBe(40)
  })
})
