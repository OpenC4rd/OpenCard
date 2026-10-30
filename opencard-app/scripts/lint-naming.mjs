/**
 * 项目路径命名审计。
 *
 * 默认只报告；传入 --check 时，明确违规会让进程失败。协议字符串和代码符号
 * 不在这里做文本扫描，避免把普通命名规则误用到持久化与跨语言协议。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import ts from 'typescript'

const projectRoot = process.cwd()
const checkMode = process.argv.includes('--check')
const scanRoots = ['src', 'src-tauri/src', 'src-tauri/resources', 'public', 'scripts', '../docs', '../.github/workflows']
const violations = []
const warnings = []

const ecosystemFileNames = new Set([
  'index.ts',
  'lib.rs',
  'main.rs',
  'main.ts',
  'README.md',
  'vite-env.d.ts',
])

const lowerCamel = /^[a-z][A-Za-z0-9]*$/
const pascal = /^[A-Z][A-Za-z0-9]*$/
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const snake = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const localeModule = /^[a-z]{2}-[A-Z]{2}\.ts$/
const assetExtensions = new Set(['.gif', '.jpeg', '.jpg', '.pdn', '.png', '.svg', '.webp'])
const managedDirectoryNames = new Set(['.opencard'])

function toProjectPath(path) {
  return relative(projectRoot, path).split(sep).join('/')
}

function addViolation(path, message) {
  violations.push(`${toProjectPath(path)}: ${message}`)
}

function addWarning(path, message) {
  warnings.push(`${toProjectPath(path)}: ${message}`)
}

function walk(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      inspectDirectory(fullPath)
      walk(fullPath)
    } else {
      inspectFile(fullPath)
    }
  }
}

function inspectDirectory(path) {
  const name = basename(path)
  if (managedDirectoryNames.has(name)) return
  if (!kebab.test(name)) {
    addViolation(path, 'directory names must use kebab-case')
  }
}

function stripTestSuffix(name) {
  const withoutSpec = name.slice(0, -'.spec.ts'.length)
  return withoutSpec.split('.')[0]
}

function hasMatchingSource(path, sourceBase) {
  const parent = path.slice(0, path.length - basename(path).length)
  return existsSync(join(parent, `${sourceBase}.vue`)) || existsSync(join(parent, `${sourceBase}.ts`))
}

function inspectTypeScript(path, name) {
  if (ecosystemFileNames.has(name) || localeModule.test(name)) return

  if (name.endsWith('.d.ts')) {
    const stem = name.slice(0, -'.d.ts'.length)
    if (!lowerCamel.test(stem) && !kebab.test(stem)) {
      addViolation(path, 'declaration module names must use lowerCamelCase or package-style kebab-case')
    }
    return
  }

  if (name.endsWith('.spec.ts')) {
    const sourceBase = stripTestSuffix(name)
    if (!hasMatchingSource(path, sourceBase) && !lowerCamel.test(sourceBase)) {
      addViolation(path, 'standalone behavior test names must use lowerCamelCase')
    }
    return
  }

  const stem = name.slice(0, -'.ts'.length)
  const moduleName = stem.endsWith('.types') ? stem.slice(0, -'.types'.length) : stem
  if (!lowerCamel.test(moduleName)) {
    addViolation(path, 'TypeScript module names must use lowerCamelCase')
  }
  if (moduleName.endsWith('Types') && isTypeOnlyContainer(path)) {
    addViolation(path, 'type container modules must use the .types.ts suffix instead of an XxxTypes name')
  }
}

function isTypeOnlyContainer(path) {
  const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  return sourceFile.statements.length > 0 && sourceFile.statements.every((statement) => {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true
    if (ts.isExportDeclaration(statement)) return Boolean(statement.isTypeOnly)
    if (!ts.isImportDeclaration(statement)) return false
    const clause = statement.importClause
    if (!clause) return false
    if (clause.isTypeOnly) return true
    if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false
    return clause.namedBindings.elements.every(element => element.isTypeOnly)
  })
}

function inspectCssClasses(path, css) {
  const reported = new Set()
  for (const match of css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    const className = match[1]
    const hasSingleUnderscore = /(^|[^_])_([^_]|$)/.test(className)
    if (!/[A-Z]/.test(className) && !hasSingleUnderscore) continue
    if (reported.has(className)) continue
    reported.add(className)
    addViolation(path, `CSS class names must use kebab-case/BEM: .${className}`)
  }
}

function inspectAsset(path, name) {
  const normalizedPath = toProjectPath(path)
  if (normalizedPath.startsWith('../docs/media/')) return
  const extension = extname(name)
  const stem = name.slice(0, -extension.length)
  if (!kebab.test(stem)) {
    addViolation(path, 'asset names must use lowercase kebab-case')
  }
}

function inspectFile(path) {
  const name = basename(path)
  const normalizedPath = toProjectPath(path)

  if (normalizedPath.startsWith('src-tauri/src/')) {
    if (name.endsWith('.rs') && !ecosystemFileNames.has(name)) {
      const stem = name.slice(0, -'.rs'.length)
      if (!snake.test(stem)) addViolation(path, 'Rust module names must use snake_case')
    }
    return
  }

  if (assetExtensions.has(extname(name).toLowerCase())) {
    inspectAsset(path, name)
    return
  }

  if (normalizedPath.startsWith('scripts/')) {
    const extension = extname(name)
    const stem = name.slice(0, -extension.length)
    if (!kebab.test(stem)) addViolation(path, 'script names must use kebab-case')
    return
  }

  if (name.endsWith('.vue')) {
    const stem = name.slice(0, -'.vue'.length)
    if (!pascal.test(stem)) addViolation(path, 'Vue component names must use PascalCase')
    if (stem.includes('QRCode')) addWarning(path, 'project-owned acronym should be spelled QrCode')
    const source = readFileSync(path, 'utf8')
    for (const style of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) inspectCssClasses(path, style[1])
    return
  }

  if (name.endsWith('.ts')) {
    inspectTypeScript(path, name)
    return
  }

  if (name.endsWith('.css')) {
    const stem = name.slice(0, -'.css'.length)
    if (!lowerCamel.test(stem) && !kebab.test(stem)) {
      addViolation(path, 'stylesheet names must use lowerCamelCase or kebab-case')
    }
    inspectCssClasses(path, readFileSync(path, 'utf8'))
  }
}

for (const root of scanRoots) {
  const absoluteRoot = join(projectRoot, root)
  if (existsSync(absoluteRoot)) walk(absoluteRoot)
}

for (const entry of readdirSync(projectRoot)) {
  const path = join(projectRoot, entry)
  if (statSync(path).isFile() && assetExtensions.has(extname(entry).toLowerCase())) inspectAsset(path, entry)
}

if (violations.length > 0) {
  console.error(`[naming] ${violations.length} violation(s):`)
  for (const violation of violations) console.error(`- ${violation}`)
}

if (warnings.length > 0) {
  console.warn(`[naming] ${warnings.length} review item(s):`)
  for (const warning of warnings) console.warn(`- ${warning}`)
}

if (violations.length === 0 && warnings.length === 0) {
  console.log('[naming] pass')
} else if (!checkMode) {
  console.log('[naming] report complete (non-blocking mode)')
}

if (checkMode && violations.length > 0) process.exit(1)
