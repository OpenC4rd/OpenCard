/**
 * 模块说明：
 * - 按需解析项目图标的自然尺寸
 * 职责边界：
 * - 只负责解析与缓存尺寸 不定义绘制契约 不决定图标是否渲染
 */

/**
 * An icon's size is resolved when the icon is drawn, not while the catalog is assembled.
 *
 * The only thing ever needed is the aspect ratio, and only by a style function that is about to paint
 * one icon. Measuring the whole registry up front made opening a project cost one file read per icon
 * — 651 reads before the first card was painted, while a session paints a few dozen. So the catalog
 * carries no sizes and the first paint resolves just that icon.
 *
 * Each resource environment owns its reader; the webview decodes the concrete icon URL.
 */

import { shallowRef, triggerRef } from 'vue'
import type { ProjectIconCatalogEntry } from './projectIconCatalog'
import type { ProjectIconDimensions } from './projectIconDimensions'

/** Measures an icon by letting the webview decode it, which covers every raster format. */
export async function loadProjectImageDimensions(src: string): Promise<ProjectIconDimensions> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const complete = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      if (typeof image.decode === 'function') void image.decode().then(complete, reject)
      else complete()
    }
    image.onerror = () => reject(new Error('Unable to load project icon image'))
    image.src = src
  })
}

/** Identity is the catalog entry (including its concrete URL), never a relative path. */
export function createIconDimensionReader() {
  const sizes = shallowRef(new WeakMap<ProjectIconCatalogEntry, ProjectIconDimensions>())
  let pending = new WeakSet<ProjectIconCatalogEntry>()
  let generation = 0
  return {
    clear() { generation++; pending = new WeakSet(); sizes.value = new WeakMap() },
    read(entry: ProjectIconCatalogEntry): ProjectIconDimensions | undefined {
      const known = sizes.value.get(entry)
      if (known || pending.has(entry)) return known
      pending.add(entry)
      const request = generation
      void loadProjectImageDimensions(entry.src).then(value => {
        if (request !== generation) return
        sizes.value.set(entry, value)
        triggerRef(sizes)
      }).catch(() => undefined)
      return undefined
    },
  }
}

export const readProjectIconSize = (entry: ProjectIconCatalogEntry) => entry.readDimensions?.(entry)
