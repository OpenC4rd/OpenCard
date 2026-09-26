/**
 * 模块说明：
 * - 定义项目与资源包封面的相对路径约定与安全谓词
 * 职责边界：
 * - 只做路径判定与字符串归一化 不访问文件系统 不复制或改写任何文件
 */

export const COVER_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'] as const

export type ProjectCover = {
  readonly relativePath: string
  readonly absolutePath: string
  readonly src: string
}

function stripTrailingSeparators(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function isCaseInsensitivePath(path: string): boolean {
  return /^[a-z]:\//i.test(path) || path.startsWith('//')
}

export function normalizeProjectRelativeCoverPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.some(segment => (
    !segment || segment === '.' || segment === '..' || /[\u0000-\u001f\u007f]/.test(segment)
  ))) return null
  return segments.join('/')
}

/** 返回受支持的封面图片扩展名（不含点号），非图片文件返回 null。 */
export function coverImageExtension(relativePath: string): string | null {
  const fileName = relativePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return null
  const extension = fileName.slice(dot + 1).toLocaleLowerCase()
  return (COVER_IMAGE_EXTENSIONS as readonly string[]).includes(extension) ? extension : null
}

const COVER_MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
} as const satisfies Record<typeof COVER_IMAGE_EXTENSIONS[number], string>

/**
 * 封面字节从归档里取出来时没有文件路径可依，得自己带上类型：SVG 不是靠魔数认的，
 * 没有 `image/svg+xml` 的 blob 在 `<img>` 里根本不画。
 */
export function coverImageMimeType(relativePath: string): string {
  const extension = coverImageExtension(relativePath) as keyof typeof COVER_MIME_BY_EXTENSION | null
  return extension ? COVER_MIME_BY_EXTENSION[extension] : ''
}

/** 封面路径既要是安全的宿主相对路径，也要是可渲染的图片文件。 */
export function isProjectCoverPath(value: string): boolean {
  const normalized = normalizeProjectRelativeCoverPath(value)
  return normalized !== null && coverImageExtension(normalized) !== null
}

export function resolveCoverAbsolutePath(rootPath: string, relativePath: string): string {
  const root = stripTrailingSeparators(rootPath)
  return root ? `${root}/${relativePath}` : relativePath
}

/** 把项目内的绝对路径转成封面用的项目相对路径；位于项目之外时返回 null。 */
export function projectRelativePathFromAbsolute(rootPath: string, absolutePath: string): string | null {
  const root = stripTrailingSeparators(rootPath)
  const absolute = stripTrailingSeparators(absolutePath)
  if (!root || !absolute) return null
  const caseInsensitive = isCaseInsensitivePath(root) || isCaseInsensitivePath(absolute)
  const rootIdentity = caseInsensitive ? root.toLocaleLowerCase() : root
  const absoluteIdentity = caseInsensitive ? absolute.toLocaleLowerCase() : absolute
  if (!absoluteIdentity.startsWith(`${rootIdentity}/`)) return null
  return normalizeProjectRelativeCoverPath(absolute.slice(root.length + 1))
}
