/**
 * 图标静态守卫：
 * - 禁止 icon 类型退化为 string
 * - 只允许共享图标注册模块引入图标库
 * - 禁止业务层直接引入图标库
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const projectRoot = process.cwd()
const srcRoot = join(projectRoot, 'src')

const allowedMdiImportDirs = [join('src', 'shared', 'ui', 'icon')]
const fileExtensions = new Set(['.ts', '.vue'])
const violations = []

function walk(dir) {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath)
      continue
    }

    const ext = fullPath.slice(fullPath.lastIndexOf('.'))
    if (!fileExtensions.has(ext)) {
      continue
    }

    inspectFile(fullPath)
  }
}

function addViolation(path, message) {
  violations.push(`${path}: ${message}`)
}

function inspectFile(fullPath) {
  const relativePath = relative(projectRoot, fullPath).split(sep).join('/')
  const content = readFileSync(fullPath, 'utf8')

  if (/(?:^|\W)icon\??\s*:\s*string(?:\W|$)/m.test(content)) {
    addViolation(relativePath, 'icon type must use IconToken, not string')
  }

  if (content.includes("@mdi/js")) {
    const allowed = allowedMdiImportDirs.some((prefix) =>
      relativePath.startsWith(prefix.split(sep).join('/'))
    )
    if (!allowed) {
      addViolation(relativePath, 'direct @mdi/js import is not allowed outside src/shared/ui/icon')
    }
  }

  if (content.includes("@vscode/codicons")) {
    addViolation(relativePath, 'direct @vscode/codicons import is not allowed')
  }
}

walk(srcRoot)

if (violations.length > 0) {
  console.error('[lint:icons] violations found:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('[lint:icons] pass')
