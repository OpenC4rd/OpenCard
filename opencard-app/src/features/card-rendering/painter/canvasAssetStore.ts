import { resolveCardResource, type CardRenderResourceContext } from '../cardRenderResources'
import type { CardSceneGraph } from '../geometry'
import type { RenderReadyImageBlock, RenderReadyTextBlock } from '../render.types'
import { parseCardMarkup, type CardMarkupBlockNode, type CardMarkupInlineNode } from '../markup'
import { formatProjectIconPath } from '../../../shared/rich-text/projectIconReference'

export type LoadedAsset = HTMLImageElement | ImageBitmap

export type CanvasAssetStore = {
  loadImage(source: string): Promise<LoadedAsset | null>
  getImage(source: string): LoadedAsset | null
  preloadSceneAssets(scene: CardSceneGraph, resourceContext?: CardRenderResourceContext): Promise<void>
  onAssetLoaded(callback: () => void): () => void
  clear(): void
}

export function createCanvasAssetStore(): CanvasAssetStore {
  const cache = new Map<string, Promise<LoadedAsset | null>>()
  const loadedMap = new Map<string, LoadedAsset>()
  const listeners = new Set<() => void>()
  const createdBlobUrls: string[] = []

  function notify() {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // 忽略监听回调错误
      }
    }
  }

  function loadImage(source: string): Promise<LoadedAsset | null> {
    if (!source || !source.trim()) return Promise.resolve(null)
    const src = source.trim()
    const cached = cache.get(src)
    if (cached) return cached

    const pending = (async (): Promise<LoadedAsset | null> => {
      if (typeof Image === 'undefined') return null
      const actualSrc = await prepareSvgSource(src)
      return new Promise<LoadedAsset | null>(resolve => {
        const image = new Image()
        if (!actualSrc.startsWith('data:')) {
          image.crossOrigin = 'anonymous'
        }
        image.onload = () => {
          loadedMap.set(src, image)
          notify()
          resolve(image)
        }
        image.onerror = () => {
          cache.delete(src)
          resolve(null)
        }
        image.src = actualSrc
      })
    })()

    cache.set(src, pending)
    return pending
  }

  function getImage(source: string): LoadedAsset | null {
    if (!source || !source.trim()) return null
    const src = source.trim()
    const loaded = loadedMap.get(src)
    if (loaded) return loaded
    void loadImage(src)
    return null
  }

  async function preloadSceneAssets(
    scene: CardSceneGraph,
    resourceContext?: CardRenderResourceContext,
  ): Promise<void> {
    const promises: Promise<unknown>[] = []

    // 1. 等待字体加载就绪
    if (typeof document !== 'undefined' && 'fonts' in document && document.fonts.ready) {
      promises.push(document.fonts.ready)
    }

    if (!resourceContext) {
      await Promise.all(promises)
      return
    }

    // 2. 遍历场景图中的图片和文本块内联图标/图片
    for (const node of scene.paintOrderNodes) {
      const block = node.block
      if (block.type === 'image-block') {
        const imageBlock = block as RenderReadyImageBlock
        if (imageBlock.source) {
          const res = resolveCardResource({
            value: imageBlock.source,
            expect: 'asset',
            blockId: imageBlock.id,
            fieldKey: 'source',
          }, resourceContext)
          if (res.kind === 'url') promises.push(loadImage(res.src))
          else if (res.kind === 'icon') promises.push(loadImage(res.entry.src))
        }
        if (imageBlock.maskSource) {
          const maskRes = resolveCardResource({
            value: imageBlock.maskSource,
            expect: 'asset',
            blockId: imageBlock.id,
            fieldKey: 'maskSource',
          }, resourceContext)
          if (maskRes.kind === 'url') promises.push(loadImage(maskRes.src))
          else if (maskRes.kind === 'icon') promises.push(loadImage(maskRes.entry.src))
        }
      } else if (block.type === 'text-block') {
        const textBlock = block as RenderReadyTextBlock
        if (textBlock.content) {
          const parsed = parseCardMarkup(textBlock.content)
          extractInlineAssets(parsed.document.blocks, (ref) => {
            if (ref.type === 'img') {
              const res = resolveCardResource({
                value: ref.src,
                expect: 'asset',
                blockId: textBlock.id,
                fieldKey: 'content',
              }, resourceContext)
              if (res.kind === 'url') promises.push(loadImage(res.src))
              else if (res.kind === 'icon') promises.push(loadImage(res.entry.src))
            } else if (ref.type === 'icon') {
              const iconPath = formatProjectIconPath({
                packageKey: ref.pkg ?? null,
                seriesKey: ref.key.includes('/') ? ref.key.split('/')[0]! : '',
                iconKey: ref.key.includes('/') ? ref.key.split('/')[1]! : ref.key,
              })
              const res = resolveCardResource({
                value: iconPath,
                expect: 'asset',
                blockId: textBlock.id,
                fieldKey: 'content',
              }, resourceContext)
              if (res.kind === 'icon') promises.push(loadImage(res.entry.src))
              else if (res.kind === 'url') promises.push(loadImage(res.src))
            }
          })
        }
      }
    }

    await Promise.all(promises)
  }

  return {
    loadImage,
    getImage,
    preloadSceneAssets,
    onAssetLoaded: (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    clear: () => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        for (const url of createdBlobUrls) {
          try {
            URL.revokeObjectURL(url)
          } catch {
            // 忽略销毁错误
          }
        }
      }
      createdBlobUrls.length = 0
      cache.clear()
      loadedMap.clear()
      listeners.clear()
    },
  }
}

export function isSvgSource(src: string): boolean {
  if (!src) return false
  if (src.startsWith('data:image/svg+xml')) return true
  const clean = src.split(/[?#]/)[0] ?? ''
  return clean.toLowerCase().endsWith('.svg')
}

export function boostSvgResolution(svgText: string, targetMaxDim = 2048): string | null {
  if (!svgText || !svgText.trim()) return null

  // 1. 优先使用 DOMParser 解析与标准化 SVG
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(svgText, 'image/svg+xml')
      if (!doc.querySelector('parsererror')) {
        const svg = doc.documentElement
        if (svg && svg.tagName.toLowerCase() === 'svg') {
          let viewBox = svg.getAttribute('viewBox')
          let vbWidth = 0
          let vbHeight = 0

          if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/).map(Number)
            if (parts.length === 4 && !parts.some(isNaN) && parts[2] > 0 && parts[3] > 0) {
              vbWidth = parts[2]
              vbHeight = parts[3]
            }
          }

          const rawWidth = svg.getAttribute('width')
          const rawHeight = svg.getAttribute('height')
          const attrW = rawWidth ? parseFloat(rawWidth) : 0
          const attrH = rawHeight ? parseFloat(rawHeight) : 0

          // 如果已经具有高分辨率（>= 目标分辨率），无需额外放大
          if (attrW >= targetMaxDim || attrH >= targetMaxDim) {
            return svgText
          }

          if (!viewBox && attrW > 0 && attrH > 0) {
            viewBox = `0 0 ${attrW} ${attrH}`
            svg.setAttribute('viewBox', viewBox)
            vbWidth = attrW
            vbHeight = attrH
          }

          if (vbWidth <= 0 || vbHeight <= 0) {
            vbWidth = attrW > 0 ? attrW : 100
            vbHeight = attrH > 0 ? attrH : 100
            if (!viewBox) {
              svg.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
            }
          }

          const aspect = vbWidth / vbHeight
          let targetW: number
          let targetH: number
          if (aspect >= 1) {
            targetW = targetMaxDim
            targetH = Math.max(1, Math.round(targetMaxDim / aspect))
          } else {
            targetH = targetMaxDim
            targetW = Math.max(1, Math.round(targetMaxDim * aspect))
          }

          svg.setAttribute('width', String(targetW))
          svg.setAttribute('height', String(targetH))

          if (typeof XMLSerializer !== 'undefined') {
            return new XMLSerializer().serializeToString(doc)
          }
        }
      }
    } catch {
      // 降级到正则方案
    }
  }

  // 2. 正则降级方案
  try {
    const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i)
    if (!svgTagMatch) return null
    const attrs = svgTagMatch[1]
    const viewBoxMatch = attrs.match(/viewBox\s*=\s*["']([^"']+)["']/i)
    let vbW = 0
    let vbH = 0
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number)
      if (parts.length === 4 && !parts.some(isNaN) && parts[2] > 0 && parts[3] > 0) {
        vbW = parts[2]
        vbH = parts[3]
      }
    }
    const widthMatch = attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)
    const heightMatch = attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)
    const wVal = widthMatch ? parseFloat(widthMatch[1]) : 0
    const hVal = heightMatch ? parseFloat(heightMatch[1]) : 0

    if (wVal >= targetMaxDim || hVal >= targetMaxDim) {
      return svgText
    }

    if (vbW <= 0 || vbH <= 0) {
      vbW = wVal > 0 ? wVal : 100
      vbH = hVal > 0 ? hVal : 100
    }

    const aspect = vbW / vbH
    const targetW = aspect >= 1 ? targetMaxDim : Math.max(1, Math.round(targetMaxDim * aspect))
    const targetH = aspect >= 1 ? Math.max(1, Math.round(targetMaxDim / aspect)) : targetMaxDim

    let newAttrs = attrs
      .replace(/\bwidth\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\bheight\s*=\s*["'][^"']*["']/gi, '')
    if (!viewBoxMatch) {
      newAttrs += ` viewBox="0 0 ${vbW} ${vbH}"`
    }
    newAttrs += ` width="${targetW}" height="${targetH}"`

    return svgText.replace(svgTagMatch[0], `<svg${newAttrs}>`)
  } catch {
    return null
  }
}

async function prepareSvgSource(src: string): Promise<string> {
  if (!isSvgSource(src)) return src
  try {
    let svgText: string | null = null
    if (src.startsWith('data:image/svg+xml')) {
      const commaIndex = src.indexOf(',')
      if (commaIndex !== -1) {
        const meta = src.slice(0, commaIndex)
        const rawContent = src.slice(commaIndex + 1)
        if (meta.includes('base64')) {
          svgText = typeof atob === 'function' ? atob(rawContent) : null
        } else {
          try {
            svgText = decodeURIComponent(rawContent)
          } catch {
            svgText = rawContent
          }
        }
      }
    } else if (typeof fetch === 'function') {
      const resp = await fetch(src)
      if (resp.ok) {
        svgText = await resp.text()
      }
    }

    if (!svgText) return src

    const boostedSvg = boostSvgResolution(svgText, 2048) ?? svgText
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(boostedSvg)}`
  } catch {
    return src
  }
}

function extractInlineAssets(
  blocks: readonly CardMarkupBlockNode[],
  onAsset: (node: { type: 'icon'; key: string; pkg?: string | null } | { type: 'img'; src: string }) => void,
) {
  function visitInline(node: CardMarkupInlineNode) {
    if (node.type === 'icon') onAsset(node)
    else if (node.type === 'img') onAsset(node)
    else if (node.type === 'span') node.children.forEach(visitInline)
  }

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      block.children.forEach(visitInline)
    } else if (block.type === 'list') {
      for (const item of block.items) {
        for (const p of item) {
          p.children.forEach(visitInline)
        }
      }
    }
  }
}
