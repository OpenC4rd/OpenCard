import type { ProjectRemoteResourcePolicy } from '../workspace/model/projectMetadata'
import {
  EMPTY_PROJECT_ICON_CATALOG,
  type ProjectIconCatalog,
  type ProjectIconDimensionReader,
} from '../workspace/services/projectIconCatalog'
import type { ProjectInformation } from '../workspace/model/projectMetadata'
import type { PreparedRichTextCatalog } from './prepareRichText'
import {
  createProjectResourceNamespace,
  createScopedProjectFontFamily,
  packageScopeRoots,
  projectResourceScopeIdentity,
  type ProjectResourceEnvironment,
  type ProjectResourceScopeMap,
} from '../workspace/services/projectResourceEnvironment'
import {
  parseResourceReference,
  parseResourceReferenceList,
  resolveResourceReferenceText,
  type ResourceReferenceDiagnostic,
  type ResourceReferenceResolutionOptions,
} from '../workspace/services/resourceReference'
import { projectFontSources, type ProjectFontRegistryEntry } from '../workspace/model/projectFontRegistry'
import { toCssFontFamily } from '../workspace/model/projectFonts'
import { convertFileSrc } from '@tauri-apps/api/core'
import { parsePackageQualifier, resolvePackageQualifier } from '../workspace/model/packageCoordinate'
import { isRemoteResourceAllowed } from '../editor-runtime/services/editorResource'
import { resolveResourcePath, type PackageScopeRoots, type ScopedResourcePathIssueCode } from '../workspace/model/scopedResourcePath'

export type CardRenderResourceContext = {
  readonly resourceRootPath: string | null
  readonly sourceFilePath: string | null
  readonly hostEnvironment: ProjectResourceEnvironment
  readonly remoteResourcePolicy?: ProjectRemoteResourcePolicy
  readonly resolveRemoteResource?: (url: string) => string | null
  /** Reads an icon's size, which is what asks for it and re-renders the consumer that read it. */
  readonly resolveIconDimensions?: ProjectIconDimensionReader
  readonly resourceScopes: ProjectResourceScopeMap
  readonly packageEnvironments: ReadonlyMap<string, ProjectResourceEnvironment>
  /** 坐标 → 解开目录，一次渲染只算一次。 */
  readonly packageRoots: PackageScopeRoots
  readonly richText?: PreparedRichTextCatalog
  readonly resolveFontFamily?: (references: string) => string
  readonly bindingProject?: Readonly<ProjectInformation> | null
  readonly bindingDictionary?: Readonly<Record<string, string>> | null
}

export type CardRenderResourceContextSource = CardRenderResourceContext | (() => CardRenderResourceContext)
export type CardRenderResourceScopeSource = ProjectResourceScopeMap | (() => ProjectResourceScopeMap)

/** Why a render-side resource could not be produced. */
export type ResourceIssueCode =
  | 'syntax-error'
  | 'unsafe-path'
  | 'reserved-path'
  | 'scope-unavailable'
  | 'package-unavailable'
  | 'resource-unavailable'
  | 'kind-mismatch'

/** What the field is asking for: one asset reference — a path or an icon — or a font list. */
export type ResourceExpectation = 'asset' | 'font'

export type ResourceRequest = {
  /** The field's raw text: `xx.png` / `作者/包名@版本#xx.png` / `icon:a/b` / `作者/包名@版本#icon:a/b` / `font:x; Arial`. */
  readonly value: string
  readonly expect: ResourceExpectation
  /** Scope lookup: the binding of this block and field. */
  readonly blockId?: string
  readonly fieldKey?: string
}

export type ResolvedResource =
  | { kind: 'empty' }
  | { kind: 'url', src: string }
  | { kind: 'icon', entry: ProjectIconCatalog['entries'][number] }
  | { kind: 'font', cssFamily: string }
  | { kind: 'unavailable', code: ResourceIssueCode, message: string }

export interface CardResourceResolver {
  resolve: (request: ResourceRequest) => ResolvedResource
  /** Reads an icon's size, which is what asks for it. */
  resolveIconDimensions: ProjectIconDimensionReader
  withScopes: (scopes: CardRenderResourceScopeSource) => CardResourceResolver
}

function readSource<T>(source: T | (() => T)): T {
  return typeof source === 'function' ? (source as () => T)() : source
}

/** A render without a project behind it — a fixture, a preview — simply keeps the square default. */
const noopIconDimensionReader: ProjectIconDimensionReader = () => undefined

export function createCardResourceResolver(
  contextSource: CardRenderResourceContextSource,
  scopeSources: readonly CardRenderResourceScopeSource[] = [],
): CardResourceResolver {
  function context(): CardRenderResourceContext {
    const base = readSource(contextSource)
    if (scopeSources.length === 0) return base
    return {
      ...base,
      resourceScopes: new Map([
        ...base.resourceScopes,
        ...scopeSources.flatMap(source => [...readSource(source)]),
      ]),
    }
  }

  return {
    resolve: request => resolveCardResource(request, context()),
    resolveIconDimensions: entry => (context().resolveIconDimensions ?? noopIconDimensionReader)(entry),
    withScopes: scopes => createCardResourceResolver(contextSource, [...scopeSources, scopes]),
  }
}

/** The single decision for a render-side field: what its raw text resolves to. */
export function resolveCardResource(
  request: ResourceRequest,
  context: CardRenderResourceContext,
): ResolvedResource {
  switch (request.expect) {
    case 'asset': return resolveImageResource(request, context)
    case 'font': return resolveFontResource(request, context)
  }
}

function resolveImageResource(
  request: ResourceRequest,
  context: CardRenderResourceContext,
): ResolvedResource {
  const fieldKey = request.fieldKey ?? 'source'
  const value = request.value.trim()
  if (!value) return { kind: 'empty' }

  const parsed = parseResourceReference(value)
  if (parsed.reference?.kind === 'icon') {
    const resolved = resolveIconReference(value, context, request.blockId, fieldKey)
    // 包正在解开：现在没有图可画，但它不是缺包 —— 出口与"这个字段是空的"完全一样。
    if (resolved.pending) return { kind: 'empty' }
    return resolved.value
      ? { kind: 'icon', entry: resolved.value }
      : unavailable(resolved.diagnostics, 'Referenced icon is unavailable')
  }
  if (parsed.reference) {
    return {
      kind: 'unavailable',
      code: 'kind-mismatch',
      message: `An image field cannot resolve the ${parsed.reference.kind} reference "${value}"`,
    }
  }
  // A font-or-icon reference that could not even be parsed still names no image.
  if (/^(?:[^#\s]*#)?(?:font|icon):/i.test(value)) {
    return unavailable(parsed.diagnostics, `Image source "${value}" is not a readable resource reference`)
  }

  return resolveAssetResource(value, context, request.blockId, fieldKey)
}

function resolveFontResource(
  request: ResourceRequest,
  context: CardRenderResourceContext,
): ResolvedResource {
  if (!request.value.trim()) return { kind: 'empty' }

  const environment = resolveCardResourceEnvironment(context, request.blockId, request.fieldKey ?? 'fontFamily')
  const fallback = context.resolveFontFamily ?? toCssFontFamily
  const options: ResourceReferenceResolutionOptions = {
    environment,
    hostEnvironment: context.hostEnvironment,
    packageEnvironments: context.packageEnvironments,
  }
  const cssFamily = parseResourceReferenceList(request.value, 'font').map(token => {
    if (token.diagnostics.length > 0) return ''
    if (!token.reference) {
      const direct = Object.values(environment.fonts).find(entry => (
        entry.kind === 'family' && projectFontSources(entry.family).some(source => (
          source.toLocaleLowerCase() === token.source.toLocaleLowerCase()
        ))
      ))
      return direct?.kind === 'family'
        ? JSON.stringify(createScopedProjectFontFamily(environment.namespace, direct.family.key))
        : token.source
    }
    const resolved = resolveResourceReferenceText<ProjectFontRegistryEntry>(token.source, options)
    if (!resolved.value || !resolved.reference) return ''
    const key = resolved.value.kind === 'family'
      ? resolved.value.family.key
      : resolved.value.composition.key
    if (resolved.environment?.kind === 'package') {
      return JSON.stringify(createScopedProjectFontFamily(resolved.environment.namespace, key))
    }
    return fallback(`font:${key}`)
  }).filter(Boolean).join(', ')

  return { kind: 'font', cssFamily }
}

function resolveAssetResource(
  value: string,
  context: CardRenderResourceContext,
  blockId?: string,
  fieldKey?: string,
): ResolvedResource {
  const environment = resolveCardResourceEnvironment(context, blockId, fieldKey)
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
    if (!isRemoteResourceAllowed(value, context.remoteResourcePolicy)) {
      return { kind: 'unavailable', code: 'unsafe-path', message: `Resource scheme is not permitted: ${value}` }
    }
    return { kind: 'url', src: context.resolveRemoteResource?.(value) ?? value }
  }
  const projectRootPath = context.resourceRootPath ?? context.hostEnvironment.rootPath ?? environment.rootPath
  const scopeRootPath = environment.rootPath ?? context.hostEnvironment.rootPath
  if (!projectRootPath || !scopeRootPath) {
    return { kind: 'unavailable', code: 'scope-unavailable', message: `No project root is available to resolve "${value}"` }
  }
  const resolved = resolveResourcePath({
    scopeRootPath,
    projectRootPath,
    reference: value,
    packageRoots: context.packageRoots,
  })
  if (resolved.ok) return { kind: 'url', src: convertFileSrc(resolved.value) }
  // 包正在解开时，它的文件还没有落到磁盘上；这是"再等一下"，不是缺包。
  if (resolved.code === 'package-unavailable' && isMaterializingReference(context, value)) return { kind: 'empty' }
  return { kind: 'unavailable', code: pathIssueCode(resolved.code), message: resolved.message }
}

/** 这条引用的限定符指向的包，是不是正在解开。 */
function isMaterializingReference(context: CardRenderResourceContext, value: string): boolean {
  const hash = value.indexOf('#')
  if (hash <= 0) return false
  const qualifier = parsePackageQualifier(value.slice(0, hash))
  const packages = context.hostEnvironment.packages
  if (!qualifier || !packages) return false
  const coordinate = resolvePackageQualifier(packages.keys(), qualifier)
  return coordinate ? packages.get(coordinate)?.rootPath === null : false
}

/** `resolveResourcePath` carries its own taxonomy; only its syntax name differs here. */
function pathIssueCode(code: ScopedResourcePathIssueCode): ResourceIssueCode {
  switch (code) {
    case 'unsafe-path':
    case 'reserved-path':
    case 'package-unavailable': return code
    case 'invalid-reference': return 'syntax-error'
    case 'target-outside-scope': return 'resource-unavailable'
  }
}

function unavailable(
  diagnostics: readonly ResourceReferenceDiagnostic[],
  fallbackMessage: string,
): Extract<ResolvedResource, { kind: 'unavailable' }> {
  const [diagnostic] = diagnostics
  return diagnostic
    ? { kind: 'unavailable', code: diagnostic.code, message: diagnostic.message }
    : { kind: 'unavailable', code: 'resource-unavailable', message: fallbackMessage }
}

function resolveIconReference(
  source: string,
  context: CardRenderResourceContext,
  blockId?: string,
  fieldKey?: string,
) {
  return resolveResourceReferenceText<ProjectIconCatalog['entries'][number]>(source, {
    environment: resolveCardResourceEnvironment(context, blockId, fieldKey),
    hostEnvironment: context.hostEnvironment,
    packageEnvironments: context.packageEnvironments,
  })
}

function fallbackEnvironment(
  resourceRootPath: string | null,
  projectIconCatalog: ProjectIconCatalog,
): ProjectResourceEnvironment {
  return {
    kind: 'project',
    namespace: createProjectResourceNamespace('project', resourceRootPath ?? 'root'),
    rootPath: resourceRootPath,
    generation: 0,
    fontDocument: {},
    fonts: {},
    iconDocument: {},
    iconCatalog: projectIconCatalog,
    packages: new Map(),
  }
}

export function createCardRenderResourceContext(options: {
  resourceRootPath?: string | null
  sourceFilePath?: string | null
  hostEnvironment?: ProjectResourceEnvironment
  remoteResourcePolicy?: ProjectRemoteResourcePolicy
  resolveRemoteResource?: (url: string) => string | null
  projectIconCatalog?: ProjectIconCatalog
  resolveIconDimensions?: ProjectIconDimensionReader
  resourceScopes?: ProjectResourceScopeMap
  packageEnvironments?: ReadonlyMap<string, ProjectResourceEnvironment>
  packageRoots?: PackageScopeRoots
  richText?: PreparedRichTextCatalog
  resolveFontFamily?: (references: string) => string
  bindingProject?: Readonly<ProjectInformation> | null
  bindingDictionary?: Readonly<Record<string, string>> | null
}): CardRenderResourceContext {
  const projectIconCatalog = options.projectIconCatalog ?? options.hostEnvironment?.iconCatalog
    ?? EMPTY_PROJECT_ICON_CATALOG
  const resourceRootPath = options.resourceRootPath ?? options.hostEnvironment?.rootPath ?? null
  const sourceFilePath = options.sourceFilePath && resourceRootPath
    && !/^[a-z]:[\\/]/i.test(options.sourceFilePath) && !options.sourceFilePath.startsWith('/')
    ? `${resourceRootPath.replace(/[\\/]+$/, '')}/${options.sourceFilePath.replace(/^[\\/]+/, '')}`
    : options.sourceFilePath ?? null
  return {
    resourceRootPath,
    sourceFilePath,
    hostEnvironment: options.hostEnvironment
      ?? fallbackEnvironment(options.resourceRootPath ?? null, projectIconCatalog),
    remoteResourcePolicy: options.remoteResourcePolicy,
    resolveRemoteResource: options.resolveRemoteResource,
    resolveIconDimensions: options.resolveIconDimensions,
    resourceScopes: options.resourceScopes ?? new Map(),
    packageEnvironments: options.packageEnvironments ?? new Map(),
    packageRoots: options.packageRoots ?? packageScopeRoots(options.hostEnvironment?.packages),
    richText: options.richText ?? new Map(),
    resolveFontFamily: options.resolveFontFamily,
    bindingProject: options.bindingProject,
    bindingDictionary: options.bindingDictionary,
  }
}

/**
 * The scoped environment a block field resolves against. It stays exported because the render-side
 * validator asks the same question of the same context.
 */
export function resolveCardResourceEnvironment(
  context: CardRenderResourceContext,
  blockId?: string,
  fieldKey?: string,
): ProjectResourceEnvironment {
  return blockId && fieldKey
    ? context.resourceScopes.get(projectResourceScopeIdentity(blockId, fieldKey)) ?? context.hostEnvironment
    : context.hostEnvironment
}
