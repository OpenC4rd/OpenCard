import type { TextMeasurePort, TextMetricsSample } from './textLayout.types'

type FontSpec = Parameters<TextMeasurePort['measureText']>[1]

/** 全角 / CJK 字符：竖排时直立，换行时可在任意两字之间断开。 */
export const CJK_CHAR_CLASS = '\\u2E80-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF\\uFF00-\\uFFEF\\u3000-\\u303F'
const CJK = new RegExp(`[${CJK_CHAR_CLASS}]`)

export function isCjkChar(char: string): boolean {
  return CJK.test(char)
}

/** 确定性度量：CJK 一个字号宽，空格 0.3，其余 0.5；ascent 0.8 / descent 0.2。测试和无画布环境用。 */
export function createMockTextMeasurer(): TextMeasurePort {
  return {
    measureText(text, font): TextMetricsSample {
      let width = 0
      for (const char of text) width += (isCjkChar(char) ? 1 : char === ' ' ? 0.3 : 0.5) * font.fontSizePx
      return { width, ascent: font.fontSizePx * 0.8, descent: font.fontSizePx * 0.2 }
    },
    resolveIconAspectRatio: () => 1,
  }
}

const WEIGHTS = { light: 300, normal: 400, bold: 700 } as const

function createDefaultContext(): CanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(1, 1).getContext('2d') as unknown as CanvasRenderingContext2D | null
    }
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d')
  } catch {
    // 无画布环境：落到 mock
  }
  return null
}

/**
 * 基于 Canvas `measureText` 的度量。拿不到 2D 上下文（SSR / node）时退回 mock 度量。
 * ascent / descent 优先取字体级别的包围盒，这样同一字体不同文字得到相同行高。
 */
export function createCanvasTextMeasurer(ctx?: CanvasRenderingContext2D): TextMeasurePort {
  const context = ctx ?? createDefaultContext()
  if (!context) return createMockTextMeasurer()
  const cache = new Map<string, TextMetricsSample>()
  return {
    measureText(text, font: FontSpec) {
      const key = `${font.fontFamily}|${font.fontSizePx}|${font.fontWeight}|${font.italic}|${text}`
      const hit = cache.get(key)
      if (hit) return hit
      context.font = `${font.italic ? 'italic ' : ''}${WEIGHTS[font.fontWeight]} ${font.fontSizePx}px ${font.fontFamily}`
      const metrics = context.measureText(text)
      const sample = {
        width: metrics.width,
        ascent: metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? font.fontSizePx * 0.8,
        descent: metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? font.fontSizePx * 0.2,
      }
      cache.set(key, sample)
      return sample
    },
    resolveIconAspectRatio: () => 1,
  }
}
