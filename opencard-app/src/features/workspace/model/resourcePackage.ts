import { normalizeKeySlug } from '../../../shared/model/keySlug'
import { isRecord } from '../../../shared/model/record'
import { formatPackageCoordinate, parsePackageCoordinate, type PackageCoordinate } from './packageCoordinate'
import { normalizeProjectRelativeCoverPath } from './projectCover'

export const RESOURCE_PACKAGE_TYPE = 'opencard-resource-package' as const
export const RESOURCE_PACKAGE_EXTENSION = 'ocpack'
export const RESOURCE_PACKAGE_SUFFIX = `.${RESOURCE_PACKAGE_EXTENSION}`

export type ResourcePackagePublicFont = {
  key: string
  title: string
}

export type ResourcePackagePublicIconSeries = {
  key: string
  title: string
  count: number
}

export type ResourcePackagePublicBlock = {
  key: string
  title: string
  source: string
}

export type ResourcePackagePublicResources = {
  fonts: readonly ResourcePackagePublicFont[]
  iconSeries: readonly ResourcePackagePublicIconSeries[]
  blocks?: readonly ResourcePackagePublicBlock[]
}

/**
 * 包对外的全部自述：我是谁，我公开哪些字体与图标。
 *
 * 身份（作者、包名、版本）在这里，不在目录名、也不在文件名里 —— 一个 `.ocpack` 被复制到
 * 哪个项目、改叫什么名字，都不改变它是谁。`title` 只是给人看的，缺省回落成包名。
 */
export type ResourcePackageManifest = {
  type: typeof RESOURCE_PACKAGE_TYPE
  author: string
  name: string
  version: string
  title: string
  /** 包根相对路径；缺失或指向不存在的文件都按“无封面”处理。 */
  cover?: string
  public: ResourcePackagePublicResources
}

export type ResourcePackageManifestIssue = {
  path: string
  message: string
}

export type ResourcePackageManifestNormalization = {
  manifest: ResourcePackageManifest
  issues: readonly ResourcePackageManifestIssue[]
}

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

function normalizePublicBlocks(
  value: unknown,
  issues: ResourcePackageManifestIssue[],
): ResourcePackagePublicBlock[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'public.blocks', 'Expected an array; used an empty list')
    return []
  }
  const result: ResourcePackagePublicBlock[] = []
  const identities = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const path = `public.blocks[${index}]`
    if (!isRecord(candidate)) continue
    const key = typeof candidate.key === 'string' ? normalizeKeySlug(candidate.key) : null
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
    const source = typeof candidate.source === 'string' ? candidate.source.trim() : ''
    if (!key || !title || !source || !source.toLocaleLowerCase().endsWith('.ocblock')) {
      addIssue(issues, path, 'Public block key, title, and .ocblock source are required; ignored the entry')
      continue
    }
    if (identities.has(key)) continue
    identities.add(key)
    result.push({ key, title, source })
  }
  return result
}

/**
 * 身份的三个字段合用一份实现：把它们拼成坐标再交给 `packageCoordinate` 校验，
 * 小写、slug、精确 semver 的规则因此只有一处。
 */
function normalizeIdentity(
  source: Record<string, unknown>,
  issues: ResourcePackageManifestIssue[],
): PackageCoordinate | null {
  const author = typeof source.author === 'string' ? source.author : ''
  const name = typeof source.name === 'string' ? source.name : ''
  const version = typeof source.version === 'string' ? source.version : ''
  const coordinate = parsePackageCoordinate(`${author}/${name}@${version}`)
  if (!coordinate) {
    addIssue(issues, 'author', 'A package must declare 作者/包名@版本 as author, name, and version')
  }
  return coordinate
}

export function normalizeResourcePackageManifest(
  value: unknown,
): ResourcePackageManifestNormalization {
  const issues: ResourcePackageManifestIssue[] = []
  const source = isRecord(value) ? value : {}
  if (source.type !== RESOURCE_PACKAGE_TYPE) addIssue(issues, 'type', 'Invalid package type used the current type')
  const coordinate = normalizeIdentity(source, issues)
  const title = typeof source.title === 'string' && source.title.trim()
    ? source.title.trim()
    : coordinate?.name ?? ''
  const cover = normalizeProjectRelativeCoverPath(source.cover)
  const publicSource = isRecord(source.public) ? source.public : {}
  if (!isRecord(source.public) && source.public !== undefined) addIssue(issues, 'public', 'Expected an object; used empty public indexes')
  return {
    manifest: {
      type: RESOURCE_PACKAGE_TYPE,
      author: coordinate?.author ?? '',
      name: coordinate?.name ?? '',
      version: coordinate?.version ?? '',
      title,
      ...(cover ? { cover } : {}),
      public: {
        fonts: normalizePublicFonts(publicSource.fonts, issues),
        iconSeries: normalizePublicIconSeries(publicSource.iconSeries, issues),
        blocks: normalizePublicBlocks(publicSource.blocks, issues),
      },
    },
    issues,
  }
}

/**
 * 一份自述的坐标。只有在身份三个字段都成立时才有值 —— 调用方拿到 null 就该把它当成坏包，
 * 而不是替它编一个身份。
 */
export function resourcePackageCoordinate(manifest: ResourcePackageManifest): string | null {
  const coordinate = parsePackageCoordinate(`${manifest.author}/${manifest.name}@${manifest.version}`)
  return coordinate ? formatPackageCoordinate(coordinate) : null
}
