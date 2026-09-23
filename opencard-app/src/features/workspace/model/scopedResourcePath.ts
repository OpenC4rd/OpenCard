import {
  formatPackageQualifier,
  parsePackageQualifier,
  resolvePackageQualifier,
  type PackageQualifier,
} from './packageCoordinate'
import {
  PROJECT_INTERNAL_DIRECTORY_NAME,
  PROJECT_PACKAGE_DIRECTORY,
} from './projectStructure'

export type ScopedResourcePathIssueCode =
  | 'invalid-reference'
  | 'unsafe-path'
  | 'reserved-path'
  | 'package-unavailable'
  | 'target-outside-scope'

export type ScopedResourcePathResult =
  | { ok: true, value: string }
  | { ok: false, code: ScopedResourcePathIssueCode, message: string }

type ScopedResourcePathFailure = Extract<ScopedResourcePathResult, { ok: false }>

type ResourceReference =
  | { anchor: 'scope', path: string }
  | { anchor: 'project', path: string }
  | { anchor: 'package', qualifier: PackageQualifier, path: string }

/** 坐标 → 解开目录。一个包解开在哪里由它的内容指纹决定，与项目无关。 */
export type PackageScopeRoots = ReadonlyMap<string, string>

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

function failure(code: ScopedResourcePathIssueCode, message: string): ScopedResourcePathFailure {
  return { ok: false, code, message }
}

/**
 * 作用域是**调用方给的**，不再从路径反推。
 *
 * 从前一个包解开在项目里的 `.opencard/packages/作者/包名/版本/`，所以"这个文件属于哪个作用域"
 * 可以靠路径前缀猜出来。现在包解开在软件存储的缓存里，与项目根毫无关系，只有环境知道
 * 每个坐标落在哪。把根直接传进来，"反推"这一整套就不需要了。
 */
export type ResolveResourcePathOptions = {
  /** 当前作用域的根：项目根，或某个包解开后的目录。 */
  scopeRootPath: string
  /** `#` 锚点指向哪 —— 永远是宿主项目的根。 */
  projectRootPath: string
  reference: string
  /** 已知的包。缺失或写错坐标都按"这个包没装"处理。 */
  packageRoots?: PackageScopeRoots
}

export type RelativizeResourcePathOptions = {
  scopeRootPath: string
  projectRootPath: string
  targetPath: string
  packageRoots?: PackageScopeRoots
}

function normalizeAbsolutePath(value: string): string | null {
  const path = value.replace(/\\/g, '/')
  const drive = path.match(/^([a-z]):\//i)?.[1]
  const isPosix = path.startsWith('/') && !path.startsWith('//')
  const unc = path.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/)
  if (!drive && !isPosix && !unc) return null

  const root = drive ? `${drive.toLocaleUpperCase()}:` : unc ? `//${unc[1]}/${unc[2]}` : ''
  const remainder = drive
    ? path.slice(3)
    : unc
      ? path.slice(unc[0].length)
      : path.slice(1)
  const segments: string[] = []
  for (const segment of remainder.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    if (/[\u0000-\u001f\u007f]/.test(segment)) return null
    segments.push(segment)
  }
  if (drive) return segments.length > 0 ? `${root}/${segments.join('/')}` : `${root}/`
  if (unc) return segments.length > 0 ? `${root}/${segments.join('/')}` : root
  return `/${segments.join('/')}`
}

function usesCaseInsensitivePaths(path: string): boolean {
  return /^[a-z]:\//i.test(path) || path.startsWith('//')
}

function relativeInside(rootPath: string, targetPath: string): string | null {
  const insensitive = usesCaseInsensitivePaths(rootPath)
  const root = rootPath.replace(/\/+$/, '')
  const target = targetPath.replace(/\/+$/, '')
  const comparableRoot = insensitive ? root.toLocaleLowerCase() : root
  const comparableTarget = insensitive ? target.toLocaleLowerCase() : target
  if (comparableTarget === comparableRoot) return ''
  return comparableTarget.startsWith(`${comparableRoot}/`)
    ? target.slice(root.length + 1)
    : null
}

function normalizeReferencePath(value: string): ScopedResourcePathResult {
  if (!value || value.startsWith('//') || value.includes('\\')) {
    return failure('unsafe-path', 'Resource paths must use non-empty forward-slash relative paths')
  }
  const path = value.startsWith('/') ? value.slice(1) : value
  const segments = path.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..'
    || segment.normalize('NFC') !== segment
    // `#` 是引用分段符，正文里不允许出现，否则引用就不再有一个确定的切分点。
    || /[<>:"|?*#\u0000-\u001f\u007f]/.test(segment)
    || /[. ]$/.test(segment)
    || WINDOWS_RESERVED_NAME.test(segment))) {
    return failure('unsafe-path', 'Resource path contains an unsafe or non-portable segment')
  }
  // 归档住在 `.opencard/packages/` 里，而不是解开后的资源；引用必须写坐标。
  if (segments[0]?.toLocaleLowerCase() === PROJECT_INTERNAL_DIRECTORY_NAME
    && segments[1]?.toLocaleLowerCase() === PROJECT_PACKAGE_DIRECTORY) {
    return failure('reserved-path', 'Package storage must be addressed through a package coordinate')
  }
  return { ok: true, value: segments.join('/') }
}

/**
 * 引用取**第一个** `#`：之前是限定符，之后是文件路径。
 * 没有 `#` 是当前作用域；`#` 在开头是宿主项目；否则限定符是 `作者/包名` 或 `作者/包名@版本`。
 */
function parseReference(value: string): ResourceReference | ScopedResourcePathFailure {
  const reference = value.trim()
  const hash = reference.indexOf('#')

  if (hash < 0) {
    const path = normalizeReferencePath(reference)
    return path.ok ? { anchor: 'scope', path: path.value } : path
  }
  if (hash === 0) {
    const path = normalizeReferencePath(reference.slice(1))
    return path.ok ? { anchor: 'project', path: path.value } : path
  }
  const qualifier = parsePackageQualifier(reference.slice(0, hash))
  if (!qualifier) return failure('invalid-reference', 'Resource reference must name a 作者/包名 or 作者/包名@版本 qualifier')
  const path = normalizeReferencePath(reference.slice(hash + 1))
  return path.ok ? { anchor: 'package', qualifier, path: path.value } : path
}

function isFailure(value: ResourceReference | ScopedResourcePathFailure): value is ScopedResourcePathFailure {
  return 'ok' in value && !value.ok
}

function packageRoot(roots: PackageScopeRoots | undefined, qualifier: PackageQualifier): string | null {
  if (!roots) return null
  const coordinate = resolvePackageQualifier(roots.keys(), qualifier)
  const root = coordinate ? roots.get(coordinate) : undefined
  return root ? normalizeAbsolutePath(root) : null
}

/**
 * 只回答"这条引用写对没有"：限定符与正文路径都合法就够了。
 *
 * 注册表在解析阶段用它 —— 那时候还不知道这个项目装了哪些包，也不该知道：一个包还没解开、
 * 或者换台机器上没装，都不该让注册表变成一份读不出来的文件。指得到指不到是使用的时候的事。
 */
export function resolveReferenceSyntax(reference: string): ScopedResourcePathResult {
  const parsed = parseReference(reference)
  return isFailure(parsed) ? parsed : { ok: true, value: parsed.path }
}

export function resolveResourcePath(options: ResolveResourcePathOptions): ScopedResourcePathResult {
  const scopeRoot = normalizeAbsolutePath(options.scopeRootPath)
  const projectRoot = normalizeAbsolutePath(options.projectRootPath)
  if (!scopeRoot || !projectRoot) return failure('unsafe-path', 'Scope root and project root must be absolute paths')

  const parsed = parseReference(options.reference)
  if (isFailure(parsed)) return parsed
  if (parsed.anchor === 'scope') return { ok: true, value: `${scopeRoot}/${parsed.path}` }
  if (parsed.anchor === 'project') return { ok: true, value: `${projectRoot}/${parsed.path}` }

  const root = packageRoot(options.packageRoots, parsed.qualifier)
  if (!root) {
    return failure('package-unavailable', `Package is not installed: ${formatPackageQualifier(parsed.qualifier)}`)
  }
  return { ok: true, value: `${root}/${parsed.path}` }
}

/**
 * 把一条绝对路径写成"从这个作用域看过去"的引用：同一个作用域里就是相对路径，
 * 项目里别处加 `#`，某个包里就是 `<坐标>#`。
 */
export function relativizeResourcePath(options: RelativizeResourcePathOptions): ScopedResourcePathResult {
  const scopeRoot = normalizeAbsolutePath(options.scopeRootPath)
  const projectRoot = normalizeAbsolutePath(options.projectRootPath)
  const target = normalizeAbsolutePath(options.targetPath)
  if (!scopeRoot || !projectRoot || !target) return failure('unsafe-path', 'Scope root, project root, and target must be absolute paths')

  const scopeRelative = relativeInside(scopeRoot, target)
  if (scopeRelative !== null) return normalizeReferencePath(scopeRelative)

  const projectRelative = relativeInside(projectRoot, target)
  if (projectRelative !== null) {
    const normalized = normalizeReferencePath(projectRelative)
    return normalized.ok ? { ok: true, value: `#${normalized.value}` } : normalized
  }

  for (const [coordinate, root] of options.packageRoots ?? []) {
    const normalizedRoot = normalizeAbsolutePath(root)
    if (!normalizedRoot) continue
    const packageRelative = relativeInside(normalizedRoot, target)
    if (packageRelative === null) continue
    const normalized = normalizeReferencePath(packageRelative)
    return normalized.ok ? { ok: true, value: `${coordinate}#${normalized.value}` } : normalized
  }
  return failure('target-outside-scope', 'Target is outside the project and every installed package')
}
