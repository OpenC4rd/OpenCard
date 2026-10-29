export type PaintStyle = string | CanvasGradient | CanvasPattern

export type RectArea = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 解析并生成 Canvas 绘制样式（当前支持纯色及简单线性渐变）。
 * 若提供 rect，渐变坐标将根据矩形几何真实求值。
 */
export function parsePaintStyle(
  value: unknown,
  ctx?: CanvasRenderingContext2D,
  rect?: RectArea,
): PaintStyle {
  if (typeof value !== 'string' || !value.trim()) return 'transparent'
  const source = value.trim()
  const gradient = source.match(/^linear-gradient\((.+)\)$/i)
  if (!gradient || !ctx) return source

  const inner = gradient[1]!.trim()
  const parts = splitTopLevel(inner, ',')
  if (parts.length < 2) return source

  let angleDeg = 180
  let colorParts = parts
  const first = parts[0]!.trim()

  if (/^-?\d+(?:\.\d+)?(?:deg)?$/i.test(first)) {
    angleDeg = Number.parseFloat(first)
    colorParts = parts.slice(1)
  } else if (/^to\s+(top|bottom|left|right)/i.test(first)) {
    if (/right/i.test(first)) angleDeg = 90
    else if (/left/i.test(first)) angleDeg = 270
    else if (/top/i.test(first)) angleDeg = 0
    else if (/bottom/i.test(first)) angleDeg = 180
    colorParts = parts.slice(1)
  }

  if (colorParts.length < 2) return source

  const box = rect ?? { x: 0, y: 0, width: 100, height: 100 }
  const rad = ((angleDeg - 90) * Math.PI) / 180
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const halfLen = (Math.abs(box.width * Math.cos(rad)) + Math.abs(box.height * Math.sin(rad))) / 2

  const x0 = cx - Math.cos(rad) * halfLen
  const y0 = cy - Math.sin(rad) * halfLen
  const x1 = cx + Math.cos(rad) * halfLen
  const y1 = cy + Math.sin(rad) * halfLen

  const result = ctx.createLinearGradient(x0, y0, x1, y1)
  colorParts.forEach((part, index) => {
    const trimmed = part.trim()
    const match = trimmed.match(/^(.+?)(?:\s+(\d+(?:\.\d+)?%))?$/)
    if (match) {
      const color = match[1]!.trim()
      const stop = match[2] ? Number.parseFloat(match[2]) / 100 : index / (colorParts.length - 1)
      try {
        result.addColorStop(Math.max(0, Math.min(1, stop)), color)
      } catch {
        // 忽略无效颜色 stop
      }
    }
  })
  return result
}

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (depth === 0 && ch === sep) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/**
 * 构造带圆角的矩形闭合路径。
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | string,
): void {
  const parsed = typeof radius === 'number' ? radius : Number.parseFloat(radius)
  const safeRadius = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  const r = Math.min(safeRadius, Math.min(width, height) / 2)

  ctx.beginPath()
  if (r <= 0) {
    ctx.rect(x, y, width, height)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}
