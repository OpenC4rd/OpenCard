import type { RenderReadyCardFace } from '../render.types'
import { computeSceneLayout, type CardSceneGraph } from '../geometry'
import { createCanvasAssetStore, type CanvasAssetStore } from '../painter/canvasAssetStore'
import { paintCardScene, type PaintSceneOptions } from '../painter/paintCardScene'

export type RenderFaceToPngOptions = PaintSceneOptions & {
  dpi?: number
  scale?: number
  assets?: CanvasAssetStore
  signal?: AbortSignal
}

export async function renderFaceToPng(
  sceneOrFace: CardSceneGraph | RenderReadyCardFace,
  options: RenderFaceToPngOptions = {},
): Promise<Uint8Array> {
  if (options.signal?.aborted) {
    throw new DOMException('Export cancelled', 'AbortError')
  }

  const scene: CardSceneGraph = 'rootNodes' in sceneOrFace
    ? sceneOrFace
    : computeSceneLayout(sceneOrFace)

  const assets = options.assets ?? createCanvasAssetStore()
  await assets.preloadSceneAssets(scene, options.resourceContext)

  if (options.signal?.aborted) {
    throw new DOMException('Export cancelled', 'AbortError')
  }

  let scale = 1
  if (typeof options.dpi === 'number' && Number.isFinite(options.dpi) && options.dpi > 0) {
    const multiplier = typeof options.scale === 'number' && Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1
    scale = (options.dpi / 25.4) * multiplier
  } else if ('dpi' in sceneOrFace && typeof sceneOrFace.dpi === 'number' && sceneOrFace.dpi > 0) {
    const multiplier = typeof options.scale === 'number' && Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1
    scale = (sceneOrFace.dpi / 25.4) * multiplier
  } else {
    const rawScale = options.scale ?? 1
    scale = typeof rawScale === 'number' && Number.isFinite(rawScale) ? rawScale : 1
  }
  const width = Math.max(1, Math.round(scene.width * scale))
  const height = Math.max(1, Math.round(scene.height * scale))

  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height)
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
    }
  } catch {
    return new Uint8Array(0)
  }

  if (!canvas) return new Uint8Array(0)

  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = (canvas.getContext('2d') as CanvasRenderingContext2D | null) ?? null
  } catch {
    return new Uint8Array(0)
  }
  if (!ctx) return new Uint8Array(0)

  ctx.scale(scale, scale)
  paintCardScene(ctx, scene, assets, options)

  try {
    if ('convertToBlob' in canvas && typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
      return new Uint8Array(await blob.arrayBuffer())
    }
    if ('toDataURL' in canvas && typeof (canvas as HTMLCanvasElement).toDataURL === 'function') {
      const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png')
      const commaIdx = dataUrl.indexOf(',')
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }
  } catch {
    return new Uint8Array(0)
  }

  return new Uint8Array(0)
}

