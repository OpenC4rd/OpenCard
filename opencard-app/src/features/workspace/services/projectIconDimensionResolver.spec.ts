import { afterEach, expect, it, vi } from 'vitest'
import { createIconDimensionReader } from './projectIconDimensionResolver'
import type { ProjectIconCatalogEntry } from './projectIconCatalog'
afterEach(() => vi.unstubAllGlobals())
it('isolates identical relative sources and ignores a measurement after invalidation', async () => {
  const images: { onload: () => void, naturalWidth: number, naturalHeight: number }[] = []
  vi.stubGlobal('Image', class { onload = () => {}; naturalWidth = 10; naturalHeight = 20; constructor() { images.push(this) } })
  const first = createIconDimensionReader()
  const second = createIconDimensionReader()
  const entry = (src: string): ProjectIconCatalogEntry => ({ iconKey: 'x', name: 'X', seriesKey: 's', tint: 'original', source: 'same.svg', src })
  const a = entry('first/same.svg'), b = entry('second/same.svg')
  first.read(a); second.read(b)
  first.clear()
  images[0]!.onload(); images[1]!.naturalWidth = 30; images[1]!.onload()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(first.read(a)).toBeUndefined()
  expect(second.read(b)).toEqual({ width: 30, height: 20 })
})
