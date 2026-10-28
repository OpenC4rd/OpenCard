import type { IconToken } from '../ui/icon/iconRegistry'

export type FilePathFilter = {
  target?: 'file' | 'directory' | 'both'
  pattern?: string
}

export type FilePathDirectoryEntry = {
  name: string
  label?: string
  isDirectory?: boolean
  icon?: IconToken
}

export type FilePathDirectoryProvider = (
  relativeDirectory: string,
) => Promise<readonly FilePathDirectoryEntry[]>

export type FilePathScope = {
  key: string
  label: string
  prefix: string
  readDirectory: FilePathDirectoryProvider
}

/** Normalizes separators to `/` and drops trailing slashes. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Returns the last segment of `path`, or the normalized path when it has no separator. */
export function getPathBasename(path: string): string {
  const normalizedPath = normalizePath(path)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex === -1 ? normalizedPath : normalizedPath.slice(lastSlashIndex + 1)
}

/** Returns the directory part of `path`, or an empty string when there is no parent directory. */
export function getPathDirectory(path: string): string {
  const normalizedPath = normalizePath(path)
  const separatorIndex = normalizedPath.lastIndexOf('/')
  return separatorIndex > 0 ? normalizedPath.slice(0, separatorIndex) : ''
}

/** Whether `path` is `ancestor` itself or lives inside it, comparing normalized paths. */
export function isSameOrDescendantPath(path: string, ancestor: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedAncestor = normalizePath(ancestor)
  return normalizedPath === normalizedAncestor || normalizedPath.startsWith(`${normalizedAncestor}/`)
}

export function globMatches(value: string, pattern: string, caseInsensitive = true): boolean {
  try {
    const source = pattern
      .replace(/\*\*/g, '___DSTAR___')
      .replace(/\*/g, '___STAR___')
      .replace(/\?/g, '___QMARK___')
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\{([^}]+)\}/g, (_, group) => `(?:${group.split(',').map((c: string) => c.trim()).join('|')})`)
      .replace(/___DSTAR___/g, '.*')
      .replace(/___STAR___/g, '[^/]*')
      .replace(/___QMARK___/g, '[^/]')
    return new RegExp(`^${source}$`, caseInsensitive ? 'i' : '').test(value)
  } catch {
    return false
  }
}

/** Matches a file or directory path against a wildcard or glob pattern. */
export function matchesFilePathPattern(path: string, pattern: string | undefined): boolean {
  if (!pattern?.trim()) return true
  const trimmed = pattern.trim()
  const normalized = normalizePath(path)
  const target = trimmed.includes('/') ? normalized : getPathBasename(normalized)
  return globMatches(target, trimmed, true)
}

/** Whether a directory entry satisfies the target kind and pattern filter for selection. */
export function matchesFilePathFilter(
  entry: { name: string; isDirectory?: boolean },
  filter: FilePathFilter | undefined,
): boolean {
  const target = filter?.target ?? 'both'
  const isDirectory = Boolean(entry.isDirectory)
  if (target === 'file' && isDirectory) return false
  if (target === 'directory' && !isDirectory) return false
  return matchesFilePathPattern(entry.name, filter?.pattern)
}
