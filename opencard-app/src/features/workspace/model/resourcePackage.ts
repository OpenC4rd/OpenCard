import { normalizeKeySlug } from '../../../shared/model/keySlug'
import { isRecord } from '../../../shared/model/record'
import { normalizeProjectRelativeCoverPath } from './projectCover'
import { PROJECT_INTERNAL_DIRECTORY_NAME, PROJECT_PACKAGE_DIRECTORY } from './projectStructure'

export const RESOURCE_PACKAGE_TYPE = 'opencard-resource-package' as const
export const RESOURCE_PACKAGE_MANIFEST_FILE_NAME = '.opencard/manifest.json'
export const INSTALLED_RESOURCE_PACKAGE_MANIFEST_GLOB = `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}/*/${RESOURCE_PACKAGE_MANIFEST_FILE_NAME}`
export const RESOURCE_PACKAGE_EXTENSION = 'ocpack'
export const RESOURCE_PACKAGE_SUFFIX = `.${RESOURCE_PACKAGE_EXTENSION}`

export function resolveInstalledResourcePackageRootPath(projectRootPath: string, packageKey: string): string {
  const root = projectRootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  return `${root}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}/${packageKey}`
}

export function resolveInstalledResourcePackageManifestPath(projectRootPath: string, packageKey: string): string {
  return `${resolveInstalledResourcePackageRootPath(projectRootPath, packageKey)}/${RESOURCE_PACKAGE_MANIFEST_FILE_NAME}`
}

export function resolveInstalledResourcePackageKey(path: string): string | null {
  const normalized = `/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
  const marker = `/${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}/`
  const suffix = `/${RESOURCE_PACKAGE_MANIFEST_FILE_NAME}`
  const markerIndex = normalized.toLocaleLowerCase().lastIndexOf(marker.toLocaleLowerCase())
  if (markerIndex < 0 || !normalized.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) return null
  const key = normalized.slice(markerIndex + marker.length, -suffix.length)
  return key && !key.includes('/') ? key : null
}

export type ResourcePackagePublicFont = {
  key: string
  title: string
}

export type ResourcePackagePublicIconSeries = {
  key: string
  title: string
  count: number
}

export type ResourcePackagePublicResources = {
  fonts: readonly ResourcePackagePublicFont[]
  iconSeries: readonly ResourcePackagePublicIconSeries[]
}

/** 包里自带的子包（不是依赖）：它们整包躺在包的 `.opencard/packages/<Key>/` 下。 */
export type ResourcePackageIncludedPackage = {
  key: string
  name: string
  version: string
}

export type ResourcePackageManifest = {
  type: typeof RESOURCE_PACKAGE_TYPE
  key: string
  name: string
  version: string
  /** 包根相对路径；缺失或指向不存在的文件都按“无封面”处理。 */
  cover?: string
  contentHash: string
  public: ResourcePackagePublicResources
  packages?: readonly ResourcePackageIncludedPackage[]
}

export type ResourcePackageManifestIssue = {
  path: string
  message: string
}

export type ResourcePackageManifestNormalization = {
  manifest: ResourcePackageManifest
  issues: readonly ResourcePackageManifestIssue[]
}

const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const hashPattern = /^[0-9a-f]{64}$/i

function addIssue(issues: ResourcePackageManifestIssue[], path: string, message: string): void {
  issues.push({ path, message })
}

function normalizePublicFonts(
  value: unknown,
  issues: ResourcePackageManifestIssue[],
): ResourcePackagePublicFont[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'public.fonts', 'Expected an array; used an empty list')
    return []
  }
  const result: ResourcePackagePublicFont[] = []
  const identities = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const path = `public.fonts[${index}]`
    if (!isRecord(candidate)) {
      addIssue(issues, path, 'Expected a public font object; ignored the entry')
      continue
    }
    const key = typeof candidate.key === 'string' ? normalizeKeySlug(candidate.key) : null
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
    if (!key || !title) {
      addIssue(issues, path, 'Public font Key and title are required; ignored the entry')
      continue
    }
    if (identities.has(key)) {
      addIssue(issues, `${path}.key`, 'Duplicate public font Key was ignored')
      continue
    }
    identities.add(key)
    result.push({ key, title })
  }
  return result
}

function normalizePublicIconSeries(
  value: unknown,
  issues: ResourcePackageManifestIssue[],
): ResourcePackagePublicIconSeries[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'public.iconSeries', 'Expected an array; used an empty list')
    return []
  }
  const result: ResourcePackagePublicIconSeries[] = []
  const identities = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const path = `public.iconSeries[${index}]`
    if (!isRecord(candidate)) {
      addIssue(issues, path, 'Expected a public icon series object; ignored the entry')
      continue
    }
    const key = typeof candidate.key === 'string' ? normalizeKeySlug(candidate.key) : null
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
    const count = candidate.count
    if (!key || !title || !Number.isInteger(count) || (count as number) < 0) {
      addIssue(issues, path, 'Public icon series Key, title, and non-negative count are required; ignored the entry')
      continue
    }
    if (identities.has(key)) {
      addIssue(issues, `${path}.key`, 'Duplicate public icon series Key was ignored')
      continue
    }
    identities.add(key)
    result.push({ key, title, count: count as number })
  }
  return result
}

function normalizeIncludedPackages(
  value: unknown,
  issues: ResourcePackageManifestIssue[],
): ResourcePackageIncludedPackage[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'packages', 'Expected an array; used an empty list')
    return []
  }
  const result: ResourcePackageIncludedPackage[] = []
  const keys = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const path = `packages[${index}]`
    if (!isRecord(candidate)) {
      addIssue(issues, path, 'Expected a package object; ignored the entry')
      continue
    }
    const key = typeof candidate.key === 'string' ? normalizeKeySlug(candidate.key) : null
    if (!key) {
      addIssue(issues, path, 'Included package Key is required; ignored the entry')
      continue
    }
    if (keys.has(key)) {
      addIssue(issues, `${path}.key`, 'Duplicate included package Key was ignored')
      continue
    }
    keys.add(key)
    const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : key
    const version = typeof candidate.version === 'string' ? candidate.version.trim() : ''
    result.push({ key, name, version })
  }
  return result
}

function normalizeVersion(
  value: unknown,
  fallback: string,
  issues: ResourcePackageManifestIssue[],
  path: string,
): string {
  if (typeof value === 'string' && semanticVersionPattern.test(value.trim())) return value.trim()
  addIssue(issues, path, `Missing or invalid version used ${fallback}`)
  return fallback
}

function normalizeHash(
  value: unknown,
  issues: ResourcePackageManifestIssue[],
  path: string,
): string {
  if (typeof value === 'string' && hashPattern.test(value.trim())) return value.trim().toLocaleLowerCase()
  addIssue(issues, path, 'Missing or invalid SHA-256 content hash used an empty value')
  return ''
}

export function normalizeResourcePackageManifest(
  value: unknown,
  fallbackKey = 'resource-package',
): ResourcePackageManifestNormalization {
  const issues: ResourcePackageManifestIssue[] = []
  const source = isRecord(value) ? value : {}
  const key = typeof source.key === 'string' ? normalizeKeySlug(source.key) : null
  const resolvedKey = key ?? normalizeKeySlug(fallbackKey) ?? 'resource-package'
  if (!key) addIssue(issues, 'key', `Missing or invalid package Key used ${resolvedKey}`)
  if (source.type !== RESOURCE_PACKAGE_TYPE) addIssue(issues, 'type', 'Invalid package type used the current type')
  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : resolvedKey
  if (name === resolvedKey && source.name !== undefined) addIssue(issues, 'name', 'Missing package name used the package Key')
  const version = normalizeVersion(source.version, '0.0.0', issues, 'version')
  const cover = normalizeProjectRelativeCoverPath(source.cover)
  const packages = normalizeIncludedPackages(source.packages, issues)
  const publicSource = isRecord(source.public) ? source.public : {}
  if (!isRecord(source.public) && source.public !== undefined) addIssue(issues, 'public', 'Expected an object; used empty public indexes')
  return {
    manifest: {
      type: RESOURCE_PACKAGE_TYPE,
      key: resolvedKey,
      name,
      version,
      ...(cover ? { cover } : {}),
      contentHash: normalizeHash(source.contentHash, issues, 'contentHash'),
      public: {
        fonts: normalizePublicFonts(publicSource.fonts, issues),
        iconSeries: normalizePublicIconSeries(publicSource.iconSeries, issues),
      },
      ...(packages.length ? { packages } : {}),
    },
    issues,
  }
}

export function serializeResourcePackageManifest(manifest: ResourcePackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
