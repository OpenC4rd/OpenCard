import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardRenderResourceContext } from '../cardRenderResources'
import { createCardRenderResourceContext } from '../cardRenderResources'
import type { CardSceneGraph } from '../geometry'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'
import { createCanvasAssetStore } from './canvasAssetStore'

class LoadedImage {
  onload: (() => void) | null = null
  set src(_: string) { queueMicrotask(() => this.onload?.()) }
}

const scene = {
  paintOrderNodes: [{ block: { type: 'image-block', id: 'image', source: 'art.png' } }],
} as unknown as CardSceneGraph

function contextWith(hostOverrides: Record<string, unknown>): CardRenderResourceContext {
  const context = createCardRenderResourceContext({ resourceRootPath: '/project', projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG } as never)
  return { ...context, hostEnvironment: { ...context.hostEnvironment, ...hostOverrides } }
}

describe('preloadSceneAssets', () => {
  beforeEach(() => vi.stubGlobal('Image', LoadedImage))
  afterEach(() => vi.unstubAllGlobals())

  it('waits for an asset the project has not checked yet', async () => {
    let checked = false
    const assets = createCanvasAssetStore()
    const context = contextWith({
      asset: () => checked ? { status: 'ready', src: 'asset://art.png' } : { status: 'pending' },
      waitForResources: async () => { checked = true },
    })

    await assets.preloadSceneAssets(scene, context)

    expect(assets.getImage('asset://art.png')).not.toBeNull()
  })

  it('gives up on an asset that never leaves pending', async () => {
    const wait = vi.fn(async () => undefined)
    const context = contextWith({ asset: () => ({ status: 'pending' }), waitForResources: wait })

    await createCanvasAssetStore().preloadSceneAssets(scene, context)

    expect(wait.mock.calls.length).toBeGreaterThan(0)
    expect(wait.mock.calls.length).toBeLessThan(10)
  })
})

describe('decoded images', () => {
  beforeEach(() => vi.stubGlobal('Image', LoadedImage))
  afterEach(() => vi.unstubAllGlobals())

  it('are decoded once for every user and only announced to the one that waited', async () => {
    const first = createCanvasAssetStore()
    const second = createCanvasAssetStore()
    const heard = vi.fn()
    second.onAssetLoaded(heard)

    const image = await first.loadImage('shared.png')

    expect(second.getImage('shared.png')).toBe(image)
    expect(heard).not.toHaveBeenCalled()
  })

  it('drop the least recently used one when the cache is full', async () => {
    const assets = createCanvasAssetStore()
    await assets.loadImage('stale.png?oc-revision=0')
    await assets.loadImage('kept.png')
    for (let index = 0; index < 256; index += 1) {
      assets.getImage('kept.png')
      await assets.loadImage(`filler-${index}.png`)
    }

    expect(assets.getImage('kept.png')).not.toBeNull()
    expect(assets.getImage('stale.png?oc-revision=0')).toBeNull()
  })
})
