/**
 * 模块说明：
 * - 包身份的唯一定义：**坐标**是 `作者/包名@版本`，**包**是 `作者/包名`。
 * 职责边界：
 * - 只有解析、校验、比较与格式化；不读写文件，不决定安装路径。
 *
 * 身份由包在 `.opencard/manifest.json` 里自述（见 `resourcePackage.ts`）；引用里那个
 * `作者/包名@版本` 就是这份自述的规范写法。**文件名不参与身份。**
 */

import { normalizeKeySlug } from '../../../shared/model/keySlug'

export const PACKAGE_IDENTITY_SEPARATOR = '/'
export const PACKAGE_COORDINATE_SEPARATOR = '@'

export type PackageIdentity = {
  readonly author: string
  readonly name: string
}

export type PackageCoordinate = PackageIdentity & {
  readonly version: string
}

/** 限定符：引用里出现的包身份，可以带版本，也可以不带。 */
export type PackageQualifier = PackageIdentity & {
  readonly version?: string
}

const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** 单个片段：作者名与包名都是小写 slug，不允许空段、`@` 或分隔符。 */
function normalizeSegment(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLocaleLowerCase()
  const slug = normalizeKeySlug(normalized)
  return slug && slug === normalized ? slug : null
}

/**
 * 版本一律不带 `v` 前缀：`v1.1.0` 与 `1.1.0` 是同一个版本，统一成后者。
 * 不做范围解析 —— 依赖与引用只使用精确版本。
 */
export function normalizePackageVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^v/i, '')
  return semanticVersionPattern.test(trimmed) ? trimmed : null
}

export function formatPackageIdentity(identity: PackageIdentity): string {
  return `${identity.author}${PACKAGE_IDENTITY_SEPARATOR}${identity.name}`
}

export function formatPackageCoordinate(coordinate: PackageCoordinate): string {
  return `${formatPackageIdentity(coordinate)}${PACKAGE_COORDINATE_SEPARATOR}${coordinate.version}`
}

/** 限定符的规范写法：带版本就是坐标，不带就是包身份。 */
export function formatPackageQualifier(qualifier: PackageQualifier): string {
  return qualifier.version
    ? formatPackageCoordinate({ author: qualifier.author, name: qualifier.name, version: qualifier.version })
    : formatPackageIdentity(qualifier)
}

/** 解析限定符：带版本得到坐标，不带版本只得到包身份。 */
export function parsePackageQualifier(value: unknown): PackageQualifier | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null

  const separatorIndex = text.lastIndexOf(PACKAGE_COORDINATE_SEPARATOR)
  const identityText = separatorIndex < 0 ? text : text.slice(0, separatorIndex)
  const versionText = separatorIndex < 0 ? '' : text.slice(separatorIndex + 1)

  const segments = identityText.split(PACKAGE_IDENTITY_SEPARATOR)
  if (segments.length !== 2) return null
  const author = normalizeSegment(segments[0])
  const name = normalizeSegment(segments[1])
  if (!author || !name) return null

  if (separatorIndex < 0) return { author, name }
  const version = normalizePackageVersion(versionText)
  return version ? { author, name, version } : null
}

export function parsePackageCoordinate(value: unknown): PackageCoordinate | null {
  const qualifier = parsePackageQualifier(value)
  return qualifier && qualifier.version ? { author: qualifier.author, name: qualifier.name, version: qualifier.version } : null
}

type ParsedVersion = {
  readonly core: readonly number[]
  readonly prerelease: readonly string[]
}

function parseVersion(value: string): ParsedVersion {
  const withoutBuild = value.split('+')[0] ?? value
  const separator = withoutBuild.indexOf('-')
  const core = (separator < 0 ? withoutBuild : withoutBuild.slice(0, separator)).split('.').map(Number)
  return {
    core,
    prerelease: separator < 0 ? [] : withoutBuild.slice(separator + 1).split('.'),
  }
}

/** 预发布标识：数字段按数值比，字母段按 ASCII 比，数字段永远小于字母段；前缀全同则段数多者更大。 */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return right.length === left.length ? 0 : (left.length === 0 ? 1 : -1)
  }
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index]!
    const b = right[index]!
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b)
      if (difference !== 0) return difference < 0 ? -1 : 1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    if (a !== b) return a < b ? -1 : 1
  }
  return left.length === right.length ? 0 : (left.length < right.length ? -1 : 1)
}

/**
 * semver 优先级比较。传进来的必须是 `normalizePackageVersion` 认过的版本；
 * "不写版本时用最新的那个"就是靠它挑出来的。
 */
export function comparePackageVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/** 从完整坐标里取回版本。坐标已经过校验，所以这里只切最后一段 `@`。 */
export function packageVersionOf(coordinate: string): string {
  return coordinate.slice(coordinate.lastIndexOf(PACKAGE_COORDINATE_SEPARATOR) + 1)
}

/**
 * 从"手上有的这些坐标"里挑出限定符指向的那一个。
 *
 * 写了版本就要那一版（没有就是 null）；没写版本就取**最高的那一版**。
 * 所以引用不写版本时不存在"装错版本"这回事，代价是长相会随项目里的包而变。
 */
export function resolvePackageQualifier(
  available: Iterable<string>,
  qualifier: PackageQualifier,
): string | null {
  const prefix = `${formatPackageIdentity(qualifier)}${PACKAGE_COORDINATE_SEPARATOR}`
  let newest: string | null = null
  for (const coordinate of available) {
    if (!coordinate.startsWith(prefix)) continue
    const version = packageVersionOf(coordinate)
    if (qualifier.version) {
      if (version === qualifier.version) return coordinate
      continue
    }
    if (!newest || comparePackageVersions(version, packageVersionOf(newest)) > 0) newest = coordinate
  }
  return qualifier.version ? null : newest
}
