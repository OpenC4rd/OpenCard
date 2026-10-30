import { projectIconVectorSourcePattern, type ProjectIconTint } from '../model/projectIcons'

/** Paint declarations that carry a color an imported SVG wants to keep. */
const PAINT_COLOR_PATTERN = /(?:fill|stroke|stop-color|flood-color)\s*[:=]\s*["']?\s*([^"';>)}{<]+)/gi
const NON_COLOR_VALUES = new Set(['none', 'transparent', 'inherit', 'currentcolor'])
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}
/** Rasters at or below this short side are pixel art, which must not be smoothed when scaled up. */
const PIXEL_ART_SHORT_SIDE = 32

/** Everything an imported icon file itself decides, as opposed to what the user chooses. */
type ProjectIconFileFacts = {
  tint: ProjectIconTint
  pixelated?: boolean
}

/**
 * Classifies an imported icon so a set starts from a usable tint instead of a fixed guess.
 *
 * A raster source keeps its own pixels: an artist already chose those colors, and masking a bitmap to
 * one color would discard the art. A vector source is context-tintable when it paints through
 * `currentColor`, embeds no raster, and uses at most one color: that single color is exactly what the
 * surrounding context replaces. Two or more distinct colors, an embedded image, or a foreign-object
 * subtree mean the file carries its own palette, so it keeps its original colors.
 */
export function detectProjectIconTint(source: string, markup: string): ProjectIconTint {
  if (!projectIconVectorSourcePattern.test(source)) return 'original'
  if (/currentcolor/i.test(markup)) return 'context'
  if (/<(?:image|foreignObject)\b/i.test(markup)) return 'original'

  const colors = new Set<string>()
  for (const match of markup.matchAll(PAINT_COLOR_PATTERN)) {
    const color = match[1]!.trim().toLowerCase()
    if (!color || NON_COLOR_VALUES.has(color)) continue
    colors.add(color)
    if (colors.size > 1) return 'original'
  }
  return 'context'
}

/**
 * Derives the per-icon fields an imported file decides: its tint, and whether a raster is small
 * enough to be pixel art. Reading the bytes once is the caller's job, so importing a large set stays
 * a single pass over the files.
 */
export async function inspectProjectIconFile(
  source: string,
  bytes: Uint8Array,
): Promise<ProjectIconFileFacts> {
  const isVector = projectIconVectorSourcePattern.test(source)
  const tint = detectProjectIconTint(source, isVector ? new TextDecoder().decode(bytes) : '')
  // Pixel-art detection applies to rasters only; a vector never needs nearest-neighbour scaling.
  if (isVector) return { tint }

  const dimensions = await loadRasterDimensions(source, bytes)
  return {
    tint,
    ...(dimensions && Math.min(dimensions.width, dimensions.height) <= PIXEL_ART_SHORT_SIDE
      ? { pixelated: true }
      : {}),
  }
}

/** Reads natural dimensions from the file's own bytes, so no project asset URL is needed. */
async function loadRasterDimensions(
  source: string,
  bytes: Uint8Array,
): Promise<{ width: number; height: number } | null> {
  const extension = source.slice(source.lastIndexOf('.') + 1).toLocaleLowerCase()
  const type = MIME_BY_EXTENSION[extension]
  if (!type || typeof URL.createObjectURL !== 'function') return null
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to read raster icon dimensions'))
      image.src = url
    })
    return { width: image.naturalWidth, height: image.naturalHeight }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
