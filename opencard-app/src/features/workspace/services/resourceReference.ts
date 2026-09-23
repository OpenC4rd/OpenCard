import { normalizeKeySlug } from '../../../shared/model/keySlug'
import {
  formatPackageCoordinate,
  formatPackageQualifier,
  parsePackageQualifier,
  type PackageQualifier,
} from '../model/packageCoordinate'
import {
  findProjectIcon,
  type ProjectIconCatalogEntry,
} from './projectIconCatalog'
import type { ProjectFontRegistryEntry } from '../model/projectFontRegistry'
import { resolveProjectEnvironmentFontFamily, resolveProjectResourcePackageCoordinate, type ProjectResourceEnvironment, type ProjectResourcePackage } from './projectResourceEnvironment'
import { toCssFontFamily, type FontCatalogEntry } from '../model/projectFonts'

export type ResourceReferenceScope = 'current' | 'host' | 'package'
export type ResourceReferenceKind = 'font' | 'icon'

export type ResourceReference = {
  scope: ResourceReferenceScope
  /** `scope: 'package'` 时是引用里写的限定符：`作者/包名`（用最新版）或 `作者/包名@版本`。 */
  qualifier?: PackageQualifier
  kind: ResourceReferenceKind
  key: string
}

export type ResourceReferenceDiagnosticCode =
  | 'syntax-error'
  | 'scope-unavailable'
  | 'package-unavailable'
  | 'resource-unavailable'

export type ResourceReferenceDiagnostic = {
  code: ResourceReferenceDiagnosticCode
  reference: string
  message: string
}

export type ParsedResourceReference = {
  reference: ResourceReference | null
  diagnostics: readonly ResourceReferenceDiagnostic[]
}

export type ResolvedResource<T> = {
  reference: ResourceReference | null
  environment: ProjectResourceEnvironment | null
  value: T | null
  diagnostics: readonly ResourceReferenceDiagnostic[]
  /**
   * 这个包正在解开，所以现在还画不出东西 —— 但它不是缺包。真正的缺包会带诊断出来，
   * `pending` 只是"再等一下"。
   */
  pending?: true
}

export type ResourceReferenceResolutionOptions = {
  environment: ProjectResourceEnvironment
  hostEnvironment?: ProjectResourceEnvironment
  packageEnvironments?: ReadonlyMap<string, ProjectResourceEnvironment>
}

function diagnostic(
  code: ResourceReferenceDiagnosticCode,
  source: string,
  message: string,
): ResourceReferenceDiagnostic {
  return { code, reference: source, message }
}

/**
 * 引用写成 `限定符#正文`，取**第一个** `#`：`#` 之前是限定符，之后是正文。
 * 没有 `#` 就没有限定符（当前作用域）；限定符为空字符串表示宿主项目；
 * 非空限定符是 `作者/包名` 或 `作者/包名@版本` —— 坐标里的 `@` 与分段符 `#` 各司其职，
 * 正文里不会出现 `#`。
 */
function splitReference(source: string): { qualifier: string | null, body: string } {
  const hash = source.indexOf('#')
  if (hash < 0) return { qualifier: null, body: source }
  return { qualifier: source.slice(0, hash), body: source.slice(hash + 1) }
}

function normalizeKind(value: string): ResourceReferenceKind | null {
  return value === 'font' || value === 'icon'
    ? value
    : null
}

function normalizeTypedKey(kind: ResourceReferenceKind, value: string): string | null {
  if (kind === 'icon') {
    const segments = value.split('/')
    if (segments.length !== 2) return null
    const seriesKey = normalizeKeySlug(segments[0] ?? '')
    const iconKey = normalizeKeySlug(segments[1] ?? '')
    return seriesKey && iconKey ? `${seriesKey}/${iconKey}` : null
  }
  return normalizeKeySlug(value)
}

export function parseResourceReference(source: string): ParsedResourceReference {
  const original = source
  const value = source.trim()
  if (!value) return {
    reference: null,
    diagnostics: [diagnostic('syntax-error', original, 'Resource reference is empty')],
  }

  const split = splitReference(value)
  const separator = split.body.indexOf(':')
  if (separator <= 0) return {
    reference: null,
    diagnostics: [diagnostic('syntax-error', original, 'Resource reference must use kind:key syntax')],
  }
  const kind = normalizeKind(split.body.slice(0, separator).toLocaleLowerCase())
  if (!kind) return {
    reference: null,
    diagnostics: [diagnostic('syntax-error', original, 'Resource reference type is unknown')],
  }

  const keyValue = split.body.slice(separator + 1).trim()
  const key = normalizeTypedKey(kind, keyValue)
  if (!key) return {
    reference: null,
    diagnostics: [diagnostic('syntax-error', original, 'Resource key is invalid')],
  }

  if (split.qualifier === null) return {
    reference: { scope: 'current', kind, key },
    diagnostics: [],
  }
  if (!split.qualifier) return {
    reference: { scope: 'host', kind, key },
    diagnostics: [],
  }
  const qualifier = parsePackageQualifier(split.qualifier)
  if (!qualifier) return {
    reference: null,
    diagnostics: [diagnostic('syntax-error', original, 'Resource reference must name a 作者/包名 or 作者/包名@版本 qualifier')],
  }
  return {
    reference: { scope: 'package', qualifier, kind, key },
    diagnostics: [],
  }
}

function formatResourceReference(reference: ResourceReference): string {
  const qualifier = reference.scope === 'current'
    ? ''
    : reference.scope === 'host'
      ? '#'
      : `${reference.qualifier ? formatPackageQualifier(reference.qualifier) : ''}#`
  return `${qualifier}${reference.kind}:${reference.key}`
}

function lookupPackage(
  environment: ProjectResourceEnvironment,
  qualifier: PackageQualifier,
): ProjectResourcePackage | null {
  const coordinate = resolveProjectResourcePackageCoordinate(environment, qualifier)
  return coordinate ? environment.packages?.get(coordinate) ?? null : null
}

function resolveEnvironment(
  reference: ResourceReference,
  options: ResourceReferenceResolutionOptions,
): { environment: ProjectResourceEnvironment | null, package?: ProjectResourcePackage, diagnostics: ResourceReferenceDiagnostic[], pending?: true } {
  if (reference.scope === 'current') return { environment: options.environment, diagnostics: [] }
  if (reference.scope === 'host') {
    if (!options.hostEnvironment) return {
      environment: null,
      diagnostics: [diagnostic('scope-unavailable', formatResourceReference(reference), 'Host project environment is unavailable')],
    }
    return { environment: options.hostEnvironment, diagnostics: [] }
  }

  const source = formatResourceReference(reference)
  const pkg = reference.qualifier ? lookupPackage(options.environment, reference.qualifier) : null
  if (!pkg) return {
    environment: null,
    diagnostics: [diagnostic('package-unavailable', source, 'Referenced package is not visible from the current environment')],
  }
  // 包在目录里就说明它是好的；只是还没解开，所以现在画不出东西，也不该报缺包。
  if (pkg.rootPath === null) return { environment: null, package: pkg, diagnostics: [], pending: true }
  const packageEnvironment = options.packageEnvironments?.get(formatPackageCoordinate(pkg.coordinate))
  return packageEnvironment
    ? { environment: packageEnvironment, package: pkg, diagnostics: [] }
    : {
      environment: null,
      package: pkg,
      diagnostics: [diagnostic('scope-unavailable', source, 'Referenced package environment is not loaded')],
    }
}

function findFont(environment: ProjectResourceEnvironment, key: string): ProjectFontRegistryEntry | null {
  return Object.entries(environment.fonts).find(([candidate]) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase())?.[1] ?? null
}

function resourceUnavailable<T>(
  reference: ResourceReference,
  environment: ProjectResourceEnvironment | null,
  message: string,
  code: ResourceReferenceDiagnosticCode = 'resource-unavailable',
): ResolvedResource<T> {
  return {
    reference,
    environment,
    value: null,
    diagnostics: [diagnostic(code, formatResourceReference(reference), message)],
  }
}

function resolveResourceReference<T extends string | ProjectFontRegistryEntry | ProjectIconCatalogEntry>(
  reference: ResourceReference,
  options: ResourceReferenceResolutionOptions,
): ResolvedResource<T> {
  const selected = resolveEnvironment(reference, options)
  if (!selected.environment) {
    return {
      reference,
      environment: null,
      value: null,
      diagnostics: selected.diagnostics,
      ...(selected.pending ? { pending: true as const } : {}),
    }
  }
  const environment = selected.environment
  if (reference.kind === 'font') {
    const font = findFont(environment, reference.key)
    return font
      ? { reference, environment, value: font as T, diagnostics: [] }
      : resourceUnavailable(reference, environment, 'Referenced font is unavailable')
  }
  if (reference.kind === 'icon') {
    const [seriesKey, iconKey] = reference.key.split('/')
    const icon = findProjectIcon(environment.iconCatalog, seriesKey ?? '', iconKey ?? '')
    return icon
      ? { reference, environment, value: icon as T, diagnostics: [] }
      : resourceUnavailable(reference, environment, 'Referenced icon is unavailable')
  }
  return resourceUnavailable(reference, environment, 'Referenced icon is unavailable')
}

export function resolveResourceReferenceText<T extends string | ProjectFontRegistryEntry | ProjectIconCatalogEntry>(
  source: string,
  options: ResourceReferenceResolutionOptions,
): ResolvedResource<T> {
  const parsed = parseResourceReference(source)
  if (!parsed.reference) return {
    reference: null,
    environment: null,
    value: null,
    diagnostics: parsed.diagnostics,
  }
  const result = resolveResourceReference<T>(parsed.reference, options)
  return parsed.diagnostics.length === 0
    ? result
    : { ...result, diagnostics: [...parsed.diagnostics, ...result.diagnostics] }
}

export type ParsedResourceReferenceToken = {
  source: string
  reference: ResourceReference | null
  diagnostics: readonly ResourceReferenceDiagnostic[]
}

export function parseResourceReferenceList(
  source: string,
  kind: ResourceReferenceKind,
 ): ParsedResourceReferenceToken[] {
  return source.split(';').map(value => {
    const candidate = value.trim()
    if (!candidate) return { source: candidate, reference: null, diagnostics: [] }
    const lower = candidate.toLocaleLowerCase()
    if (!lower.startsWith(`${kind}:`) && !lower.includes(`#${kind}:`)) {
      return { source: candidate, reference: null, diagnostics: [] }
    }
    const parsed = parseResourceReference(candidate)
    return { source: candidate, reference: parsed.reference, diagnostics: parsed.diagnostics }
  }).filter(token => token.source.length > 0)
}

export function buildResourceFontCatalog(
  environment: ProjectResourceEnvironment,
): readonly FontCatalogEntry[] {
  const entries: FontCatalogEntry[] = []
  for (const [key, entry] of Object.entries(environment.fonts)) {
    entries.push({ value: `font:${key}`, label: entry.name, source: 'project', detail: `font:${key}`,
      cssFamily: resolveProjectEnvironmentFontFamily(`font:${key}`, environment, toCssFontFamily) })
  }
  // 环境按坐标索引，引用值就写完整坐标：`作者/包名@版本#font:key`。
  // 挑中的东西写死版本 —— 用户挑的就是这个长相。坐标里的 `@` 与引用分段符 `#` 不同，
  // 所以坐标可以完整写出来。
  for (const [coordinate, packageEnvironment] of environment.packageEnvironments ?? []) {
    const pkg = environment.packages?.get(coordinate)
    if (!pkg) continue
    const qualifier = formatPackageCoordinate(pkg.coordinate)
    for (const [key, entry] of Object.entries(packageEnvironment.fonts)) {
      entries.push({
        value: `${qualifier}#font:${key}`,
        label: entry.name,
        source: 'project',
        detail: `${qualifier}#font:${key}`,
        cssFamily: resolveProjectEnvironmentFontFamily(`font:${key}`, packageEnvironment, toCssFontFamily),
      })
    }
  }
  return entries
}
