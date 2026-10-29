import QRCode from 'qrcode'
import type {
  RenderReadyCardFace,
  RenderReadyImageBlock,
  RenderReadyQrCodeBlock,
  RenderReadyShapeBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { resolveCardResource, type CardRenderResourceContext } from '../cardRenderResources'
import {
  computeSceneLayout,
  evaluateRenderLength,
  type CardSceneGraph,
  type SceneNodeLayout,
} from '../geometry'
import { parseCardMarkup } from '../markup'
import {
  createCanvasTextMeasurer,
  createMockTextMeasurer,
  layoutTextBlock,
  type PositionedGlyphRun,
  type PositionedIconRun,
  type PositionedImageRun,
} from '../text-layout'
import { parsePaintStyle, roundRectPath } from './paintStyle'
import type { CanvasAssetStore, LoadedAsset } from './canvasAssetStore'
import { formatProjectIconPath } from '../../../shared/rich-text/projectIconReference'

export type PaintSceneOptions = {
  onlyBlockId?: string
  diffHighlights?: readonly { blockId: string; kind: 'added' | 'removed' | 'changed' }[]
  debug?: { showLayoutBoxes?: boolean; showTextBaselines?: boolean }
  resourceContext?: CardRenderResourceContext
}

export function paintCardScene(
  ctx: CanvasRenderingContext2D,
  sceneOrFace: CardSceneGraph | RenderReadyCardFace,
  assets: CanvasAssetStore,
  options: PaintSceneOptions = {},
): void {
  const scene: CardSceneGraph = 'rootNodes' in sceneOrFace
    ? sceneOrFace
    : computeSceneLayout(sceneOrFace)

  const { width, height, face } = scene

  // 1. 如果不是单块切片绘制，清空画布并绘制卡面背景
  ctx.imageSmoothingEnabled = true
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high'
  }
  if (!options.onlyBlockId) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = parsePaintStyle(face.background, ctx, { x: 0, y: 0, width, height })
    ctx.fillRect(0, 0, width, height)
  }

  // 2. 遍历渲染树中的绘制节点（已经按 z-index 排序）
  for (const node of scene.paintOrderNodes) {
    if (options.onlyBlockId && options.onlyBlockId !== node.id) {
      continue
    }
    paintSceneNode(ctx, node, scene, assets, options)
  }
}

function paintSceneNode(
  ctx: CanvasRenderingContext2D,
  node: SceneNodeLayout,
  scene: CardSceneGraph,
  assets: CanvasAssetStore,
  options: PaintSceneOptions,
): void {
  const { block, localRect, worldMatrix } = node
  const w = localRect.width
  const h = localRect.height
  if (w <= 0 || h <= 0 || !block.visible) return

  ctx.save()

  // 1. 如果有祖先设置了 clip，在世界坐标下对祖先的多边形（OBB）施加裁剪
  applyAncestorClips(ctx, node, scene)

  // 2. 应用节点的仿射世界矩阵
  const [a, b, c, d, e, f] = worldMatrix
  ctx.transform(a, b, c, d, e, f)

  // 3. 应用不透明度
  const opacity = Math.max(0, Math.min(1, block.opacity ?? 1))
  ctx.globalAlpha *= opacity

  // 4. 通用盒模型背景与内描边
  const borderRadius = evaluateRenderLength(block.borderRadius, Math.min(w, h))
  if (block.background) {
    roundRectPath(ctx, 0, 0, w, h, borderRadius)
    ctx.fillStyle = parsePaintStyle(block.background, ctx, { x: 0, y: 0, width: w, height: h })
    ctx.fill()
  }

  // 5. 按类型分发具体绘制
  switch (block.type) {
    case 'shape-block':
      paintShapeBlock(ctx, block as RenderReadyShapeBlock, w, h, borderRadius)
      break
    case 'qrcode-block':
      paintQrCodeBlock(ctx, block as RenderReadyQrCodeBlock, w, h)
      break
    case 'image-block':
      paintImageBlock(ctx, block as RenderReadyImageBlock, w, h, borderRadius, assets, options.resourceContext)
      break
    case 'text-block':
      paintTextBlock(ctx, block as RenderReadyTextBlock, w, h, assets, options)
      break
  }

  // 6. 内描边（Inside Border）：通过 roundRectPath 裁剪后以双倍线宽描边
  if (block.borderWidth > 0 && block.borderColor) {
    ctx.save()
    roundRectPath(ctx, 0, 0, w, h, borderRadius)
    ctx.clip()
    ctx.lineWidth = block.borderWidth * 2
    ctx.strokeStyle = parsePaintStyle(block.borderColor, ctx, { x: 0, y: 0, width: w, height: h })
    if (block.borderStyle === 'dashed') {
      ctx.setLineDash([block.borderWidth * 3, block.borderWidth * 2])
    } else if (block.borderStyle === 'dotted') {
      ctx.setLineDash([block.borderWidth, block.borderWidth])
    }
    ctx.stroke()
    ctx.restore()
  }

  // 7. Diff 高亮框
  if (options.diffHighlights?.some(item => item.blockId === block.id)) {
    ctx.save()
    ctx.strokeStyle = '#ffb020'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, w, h)
    ctx.restore()
  }

  // 8. Debug 布局框
  if (options.debug?.showLayoutBoxes) {
    ctx.save()
    ctx.strokeStyle = '#55aaff'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, w, h)
    ctx.restore()
  }

  ctx.restore()
}

/**
 * 遍历祖先节点，为所有设置了 clip === true 的祖先在世界坐标下创建裁剪路径。
 */
function applyAncestorClips(
  ctx: CanvasRenderingContext2D,
  node: SceneNodeLayout,
  scene: CardSceneGraph,
): void {
  let parentId = node.parentId
  while (parentId) {
    const ancestor = scene.nodeMap.get(parentId)
    if (!ancestor) break
    if (ancestor.clip) {
      ctx.beginPath()
      const [p0, p1, p2, p3] = ancestor.obbCorners
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.lineTo(p3.x, p3.y)
      ctx.closePath()
      ctx.clip()
    }
    parentId = ancestor.parentId
  }
  ctx.beginPath()
}

/**
 * 绘制基础图形块（矩形、椭圆、三角形、菱形、直线）。
 */
function paintShapeBlock(
  ctx: CanvasRenderingContext2D,
  block: RenderReadyShapeBlock,
  w: number,
  h: number,
  borderRadius: number,
): void {
  ctx.save()
  const shape = block.shape ?? 'rectangle'

  ctx.beginPath()
  if (shape === 'ellipse') {
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (shape === 'triangle') {
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
  } else if (shape === 'diamond') {
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, h / 2)
    ctx.lineTo(w / 2, h)
    ctx.lineTo(0, h / 2)
    ctx.closePath()
  } else if (shape === 'line') {
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
  } else {
    // rectangle
    roundRectPath(ctx, 0, 0, w, h, borderRadius)
  }

  // 填充
  if (block.fill && shape !== 'line') {
    ctx.fillStyle = parsePaintStyle(block.fill, ctx, { x: 0, y: 0, width: w, height: h })
    ctx.fill()
  }

  // 描边与对齐方式 (inside / center / outside)
  if (block.strokeWidth > 0 && block.stroke) {
    ctx.strokeStyle = parsePaintStyle(block.stroke, ctx, { x: 0, y: 0, width: w, height: h })
    ctx.lineCap = block.strokeCap ?? 'butt'
    ctx.lineJoin = block.strokeJoin ?? 'miter'
    ctx.miterLimit = block.strokeMiterLimit ?? 4

    if (block.strokeStyle === 'dashed') {
      ctx.setLineDash([block.strokeWidth * 3, block.strokeWidth * 2])
    } else if (block.strokeStyle === 'dotted') {
      ctx.setLineDash([block.strokeWidth, block.strokeWidth])
    }

    const alignment = block.strokeAlignment ?? 'center'
    if (alignment === 'inside' && shape !== 'line') {
      ctx.save()
      ctx.clip()
      ctx.lineWidth = block.strokeWidth * 2
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.lineWidth = block.strokeWidth
      ctx.stroke()
    }
  }

  ctx.restore()
}

/**
 * 绘制真实二维码矩阵。
 */
function paintQrCodeBlock(
  ctx: CanvasRenderingContext2D,
  block: RenderReadyQrCodeBlock,
  w: number,
  h: number,
): void {
  if (!block.content) return

  try {
    const qr = QRCode.create(block.content, {
      errorCorrectionLevel: block.errorCorrection ?? 'M',
    })
    const modules = qr.modules
    const size = modules.size
    const quietZone = Math.max(0, block.quietZone ?? 2)
    const totalCount = size + quietZone * 2
    const cell = Math.min(w, h) / totalCount
    const ox = (w - cell * totalCount) / 2 + quietZone * cell
    const oy = (h - cell * totalCount) / 2 + quietZone * cell

    // 背景色
    if (block.backgroundColor && block.backgroundColor !== 'transparent') {
      ctx.fillStyle = parsePaintStyle(block.backgroundColor, ctx)
      ctx.fillRect(0, 0, w, h)
    }

    // 前景色
    ctx.fillStyle = parsePaintStyle(block.foreground || '#000000', ctx)
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (modules.get(r, c)) {
          ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.1, cell + 0.1)
        }
      }
    }
  } catch {
    // 二维码内容错误降级
  }
}

/**
 * 绘制图片块（支持遮罩合成与项目图标）。
 */
function paintImageBlock(
  ctx: CanvasRenderingContext2D,
  block: RenderReadyImageBlock,
  w: number,
  h: number,
  borderRadius: number,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): void {
  const sourceRes = resourceContext
    ? resolveCardResource({
        value: block.source,
        expect: 'asset',
        blockId: block.id,
        fieldKey: 'source',
      }, resourceContext)
    : undefined

  let sourceSrc = ''
  let isContextIcon = false
  if (sourceRes?.kind === 'url') {
    sourceSrc = sourceRes.src
  } else if (sourceRes?.kind === 'icon') {
    sourceSrc = sourceRes.entry.src
    isContextIcon = sourceRes.entry.tint === 'context'
  } else if (!resourceContext) {
    sourceSrc = block.source
  }

  // 检查是否有遮罩（提前发起加载，避免串行等待）
  let maskSrc = ''
  if (block.maskSource) {
    const maskRes = resourceContext
      ? resolveCardResource({
          value: block.maskSource,
          expect: 'asset',
          blockId: block.id,
          fieldKey: 'maskSource',
        }, resourceContext)
      : undefined
    if (maskRes?.kind === 'url') maskSrc = maskRes.src
    else if (maskRes?.kind === 'icon') maskSrc = maskRes.entry.src
    else if (!resourceContext) maskSrc = block.maskSource
  }

  const img = sourceSrc ? assets.getImage(sourceSrc) : null
  const maskImg = maskSrc ? assets.getImage(maskSrc) : null
  if (!img) return

  ctx.save()
  roundRectPath(ctx, 0, 0, w, h, borderRadius)
  ctx.clip()

  if (maskImg) {
    const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
    const scaleX = transform ? (Math.hypot(transform.a, transform.b) || 1) : 1
    const scaleY = transform ? (Math.hypot(transform.c, transform.d) || 1) : 1
    const bufferW = Math.max(1, Math.ceil(w * scaleX))
    const bufferH = Math.max(1, Math.ceil(h * scaleY))

    // 离屏合成遮罩：优先使用 OffscreenCanvas 支持无头导出/Worker，其次降级到 document.createElement
    const offscreen = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bufferW, bufferH)
      : typeof document !== 'undefined'
        ? (() => {
            const c = document.createElement('canvas')
            c.width = bufferW
            c.height = bufferH
            return c
          })()
        : null

    const offCtx = offscreen ? (offscreen.getContext('2d') as CanvasRenderingContext2D | null) : null
    if (offCtx) {
      offCtx.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in offCtx) offCtx.imageSmoothingQuality = 'high'
      if (typeof offCtx.setTransform === 'function') offCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
      drawImageFitted(offCtx, img, 0, 0, w, h, block.fit ?? 'cover', isContextIcon ? block.borderColor || '#000' : undefined)
      offCtx.globalCompositeOperation = 'destination-in'
      drawImageFitted(offCtx, maskImg, 0, 0, w, h, block.maskFit ?? 'cover')
      ctx.drawImage(offscreen as CanvasImageSource, 0, 0, w, h)
      ctx.restore()
      return
    }
  }

  // 无遮罩直接绘制
  drawImageFitted(ctx, img, 0, 0, w, h, block.fit ?? 'cover', isContextIcon ? block.borderColor || '#000' : undefined)
  ctx.restore()
}

function drawImageFitted(
  ctx: CanvasRenderingContext2D,
  img: LoadedAsset,
  x: number,
  y: number,
  targetW: number,
  targetH: number,
  fit: 'cover' | 'contain' | 'fill',
  contextColor?: string,
): void {
  const naturalW = 'naturalWidth' in img ? img.naturalWidth : img.width
  const naturalH = 'naturalHeight' in img ? img.naturalHeight : img.height
  if (naturalW <= 0 || naturalH <= 0) return

  let dw = targetW
  let dh = targetH
  let dx = x
  let dy = y

  if (fit === 'fill') {
    dw = targetW
    dh = targetH
  } else {
    const scale = fit === 'cover'
      ? Math.max(targetW / naturalW, targetH / naturalH)
      : Math.min(targetW / naturalW, targetH / naturalH)
    dw = naturalW * scale
    dh = naturalH * scale
    dx = x + (targetW - dw) / 2
    dy = y + (targetH - dh) / 2
  }

  if (contextColor) {
    // context tint 着色：在独立离屏画布上以超采样高分辨率渲染并 source-in 着色
    const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
    const scaleX = transform ? (Math.hypot(transform.a, transform.b) || 1) : 1
    const scaleY = transform ? (Math.hypot(transform.c, transform.d) || 1) : 1
    const bufferW = Math.max(1, Math.ceil(dw * scaleX))
    const bufferH = Math.max(1, Math.ceil(dh * scaleY))

    const offscreen = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bufferW, bufferH)
      : typeof document !== 'undefined'
        ? (() => {
            const c = document.createElement('canvas')
            c.width = bufferW
            c.height = bufferH
            return c
          })()
        : null

    const offCtx = offscreen ? (offscreen.getContext('2d') as CanvasRenderingContext2D | null) : null
    if (offCtx) {
      offCtx.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in offCtx) offCtx.imageSmoothingQuality = 'high'
      if (typeof offCtx.setTransform === 'function') offCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
      offCtx.drawImage(img, 0, 0, dw, dh)
      offCtx.globalCompositeOperation = 'source-in'
      offCtx.fillStyle = contextColor
      offCtx.fillRect(0, 0, dw, dh)
      ctx.drawImage(offscreen as CanvasImageSource, dx, dy, dw, dh)
    } else {
      ctx.save()
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = contextColor
      ctx.fillRect(dx, dy, dw, dh)
      ctx.restore()
    }
  } else {
    ctx.drawImage(img, dx, dy, dw, dh)
  }
}

function resolveBlockFontFamily(
  fontReference: string | undefined,
  blockId: string,
  fieldKey: 'fontFamily' | 'content',
  resourceContext?: CardRenderResourceContext,
): string {
  const raw = (fontReference ?? '').trim()
  if (!raw) return 'sans-serif'
  if (resourceContext) {
    const res = resolveCardResource({
      value: raw,
      expect: 'font',
      blockId,
      fieldKey,
    }, resourceContext)
    if (res.kind === 'font' && res.cssFamily) return res.cssFamily
  }
  return raw
}

function formatMarkupIconReference(icon: PositionedIconRun['icon']): string {
  const packageKey = icon.scope === 'host'
    ? ''
    : icon.pkg
      ? (icon.version ? `${icon.pkg}@${icon.version}` : icon.pkg)
      : null
  return formatProjectIconPath({
    packageKey,
    seriesKey: icon.key.includes('/') ? icon.key.split('/')[0]! : '',
    iconKey: icon.key.includes('/') ? icon.key.split('/')[1]! : icon.key,
  })
}

/**
 * 绘制富文本块（多通道绘制字元与内联元素）。
 */
function paintTextBlock(
  ctx: CanvasRenderingContext2D,
  block: RenderReadyTextBlock,
  w: number,
  h: number,
  assets: CanvasAssetStore,
  options: PaintSceneOptions,
): void {
  if (!block.content) return

  const parsed = parseCardMarkup(block.content)
  const baseSize = evaluateRenderLength(block.fontSize, h, 3.5)
  const baseFontFamily = resolveBlockFontFamily(block.fontFamily, block.id, 'fontFamily', options.resourceContext)
  const rawMeasurer = typeof document !== 'undefined'
    ? createCanvasTextMeasurer(ctx)
    : createMockTextMeasurer()

  const measurer = {
    measureText(text: string, fontSpec: Parameters<typeof rawMeasurer.measureText>[1]) {
      const resolvedFamily = fontSpec.fontFamily === baseFontFamily
        ? baseFontFamily
        : resolveBlockFontFamily(fontSpec.fontFamily, block.id, 'content', options.resourceContext)
      return rawMeasurer.measureText(text, {
        ...fontSpec,
        fontFamily: resolvedFamily,
      })
    },
    resolveIconAspectRatio(icon: PositionedIconRun['icon']): number {
      if (!options.resourceContext) return 1
      const res = resolveCardResource({
        value: formatMarkupIconReference(icon),
        expect: 'asset',
        blockId: block.id,
        fieldKey: 'content',
      }, options.resourceContext)
      if (res.kind === 'icon') {
        const dims = options.resourceContext.resolveIconDimensions?.(res.entry)
        if (dims && dims.width > 0 && dims.height > 0) {
          return dims.width / dims.height
        }
      }
      return 1
    },
  }

  const textLayout = layoutTextBlock(
    {
      document: parsed.document,
      boxWidth: w,
      boxHeight: h,
      baseFontFamily,
      baseFontSizePx: baseSize,
      baseFontWeight: block.fontWeight ?? 'normal',
      baseColor: block.color || '#000000',
      textAlign: block.textAlign ?? 'start',
      verticalAlign: block.verticalAlign ?? 'top',
      lineHeightPx: evaluateRenderLength(block.lineHeight, baseSize, baseSize * 1.2),
      writingMode: block.writingMode ?? 'horizontal-tb',
    },
    measurer,
  )

  // 1. 通道一：背景高亮（markColor / backgroundColor）
  for (const run of textLayout.runs) {
    if (run.kind === 'glyph' && (run.style.markColor || run.style.backgroundColor)) {
      ctx.save()
      ctx.fillStyle = parsePaintStyle(run.style.markColor || run.style.backgroundColor, ctx)
      ctx.fillRect(run.x, run.y, run.width, run.height)
      ctx.restore()
    }
  }

  // 2. 通道二：阴影与文字圆角外描边
  for (const run of textLayout.runs) {
    if (run.kind === 'glyph' && (run.style.strokeWidth > 0 || run.style.shadowColor)) {
      paintGlyphPass(ctx, run, 'stroke', block.id, baseFontFamily, assets, options.resourceContext)
    }
  }

  // 3. 通道三：文字主填充 / 图片填充 / 内联图标 / 内联图片
  for (const run of textLayout.runs) {
    if (run.kind === 'glyph') {
      paintGlyphPass(ctx, run, 'fill', block.id, baseFontFamily, assets, options.resourceContext)
    } else if (run.kind === 'icon') {
      paintInlineIcon(ctx, run, block.id, assets, options.resourceContext)
    } else if (run.kind === 'img') {
      paintInlineImage(ctx, run, block.id, assets, options.resourceContext)
    }
  }

  // 4. 通道四：下划线与删除线
  for (const run of textLayout.runs) {
    if (run.kind === 'glyph' && (run.style.underline || run.style.strikethrough)) {
      ctx.save()
      ctx.strokeStyle = run.style.color || '#000'
      ctx.lineWidth = Math.max(1, run.style.fontSizePx * 0.07)
      if (run.style.underline) {
        const lineY = run.baselineY + ctx.lineWidth * 1.5
        ctx.beginPath()
        ctx.moveTo(run.x, lineY)
        ctx.lineTo(run.x + run.width, lineY)
        ctx.stroke()
      }
      if (run.style.strikethrough) {
        const lineY = run.y + run.height / 2
        ctx.beginPath()
        ctx.moveTo(run.x, lineY)
        ctx.lineTo(run.x + run.width, lineY)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Debug：展示基线
  if (options.debug?.showTextBaselines) {
    ctx.save()
    ctx.strokeStyle = '#00e5ff'
    ctx.lineWidth = 0.5
    for (const line of textLayout.lines) {
      ctx.beginPath()
      ctx.moveTo(line.x, line.baselineY)
      ctx.lineTo(line.x + line.width, line.baselineY)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function resolveGlyphFillStyle(
  ctx: CanvasRenderingContext2D,
  style: PositionedGlyphRun['style'],
  blockId: string,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): string | CanvasGradient | CanvasPattern {
  if (style.fillType === 'image' && style.fillSource) {
    const res = resourceContext
      ? resolveCardResource({
          value: style.fillSource,
          expect: 'asset',
          blockId,
          fieldKey: 'content',
        }, resourceContext)
      : undefined
    const src = res?.kind === 'url' ? res.src : res?.kind === 'icon' ? res.entry.src : (!resourceContext ? style.fillSource : '')
    const img = src ? assets.getImage(src) : null
    if (img && typeof ctx.createPattern === 'function') {
      const pattern = ctx.createPattern(img, 'repeat')
      if (pattern) return pattern
    }
  }
  return style.color || '#000000'
}

function paintGlyphPass(
  ctx: CanvasRenderingContext2D,
  run: PositionedGlyphRun,
  pass: 'fill' | 'stroke',
  blockId: string,
  baseFontFamily: string,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): void {
  ctx.save()
  const style = run.style
  const weight = style.fontWeight === 'bold' ? '700' : style.fontWeight === 'light' ? '300' : '400'
  const italic = style.italic ? 'italic ' : ''
  const resolvedFont = style.fontFamily === baseFontFamily
    ? baseFontFamily
    : resolveBlockFontFamily(style.fontFamily, blockId, 'content', resourceContext)
  ctx.font = `${italic}${weight} ${style.fontSizePx}px ${resolvedFont}`
  ctx.textBaseline = 'alphabetic'

  if (run.angleRad !== 0) {
    // 竖排旋转西文：绕中心旋转 π/2
    const cx = run.x + run.width / 2
    const cy = run.y + run.height / 2
    ctx.translate(cx, cy)
    ctx.rotate(run.angleRad)
    const drawX = -run.height / 2
    const drawY = -run.width / 2 + (run.baselineY - run.y)

    if (pass === 'stroke') {
      applyShadowAndStroke(ctx, style)
      ctx.strokeText(run.text, drawX, drawY)
    } else {
      ctx.fillStyle = resolveGlyphFillStyle(ctx, style, blockId, assets, resourceContext)
      ctx.fillText(run.text, drawX, drawY)
    }
  } else {
    const drawX = run.x
    const drawY = run.baselineY

    if (pass === 'stroke') {
      applyShadowAndStroke(ctx, style)
      ctx.strokeText(run.text, drawX, drawY)
    } else {
      ctx.fillStyle = resolveGlyphFillStyle(ctx, style, blockId, assets, resourceContext)
      ctx.fillText(run.text, drawX, drawY)
    }
  }

  ctx.restore()
}

function applyShadowAndStroke(ctx: CanvasRenderingContext2D, style: PositionedGlyphRun['style']): void {
  if (style.shadowColor) {
    ctx.shadowColor = style.shadowColor
    ctx.shadowOffsetX = style.shadowOffsetX
    ctx.shadowOffsetY = style.shadowOffsetY
    ctx.shadowBlur = style.shadowBlur
  }
  if (style.strokeWidth > 0 && style.strokeColor) {
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = style.strokeWidth * 2
    ctx.strokeStyle = style.strokeColor
  }
}

function paintInlineIcon(
  ctx: CanvasRenderingContext2D,
  run: PositionedIconRun,
  blockId: string,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): void {
  const iconPath = formatMarkupIconReference(run.icon)

  const res = resourceContext
    ? resolveCardResource({
        value: iconPath,
        expect: 'asset',
        blockId,
        fieldKey: 'content',
      }, resourceContext)
    : undefined
  const src = res?.kind === 'icon' ? res.entry.src : res?.kind === 'url' ? res.src : ''
  const isContextTint = res?.kind === 'icon' ? res.entry.tint === 'context' : true
  const img = src ? assets.getImage(src) : null
  if (img) {
    drawImageFitted(ctx, img, run.x, run.y, run.width, run.height, 'contain', isContextTint ? run.style.color : undefined)
  }
}

function paintInlineImage(
  ctx: CanvasRenderingContext2D,
  run: PositionedImageRun,
  blockId: string,
  assets: CanvasAssetStore,
  resourceContext?: CardRenderResourceContext,
): void {
  const imgRes = resourceContext
    ? resolveCardResource({
        value: run.image.src,
        expect: 'asset',
        blockId,
        fieldKey: 'content',
      }, resourceContext)
    : undefined
  const src = imgRes?.kind === 'url' ? imgRes.src : imgRes?.kind === 'icon' ? imgRes.entry.src : (!resourceContext ? run.image.src : '')
  const img = src ? assets.getImage(src) : null
  if (img) {
    drawImageFitted(ctx, img, run.x, run.y, run.width, run.height, run.image.fit ?? 'contain')
  }
}
