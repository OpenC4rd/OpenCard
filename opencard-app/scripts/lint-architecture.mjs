/**
 * 架构守卫：依赖方向、纯层边界、文件体积、循环依赖。
 * 存量问题记录在 scripts/architecture-baseline.json，只允许减少，不允许新增。
 *
 *   node scripts/lint-architecture.mjs --check            # CI / verify 使用
 *   node scripts/lint-architecture.mjs --update-baseline  # 还完债后收紧基线（只会变小）
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const srcRoot = join(root, 'src')
const baselinePath = join(root, 'scripts', 'architecture-baseline.json')
const MAX_LINES = 600

// ---- 规则（按需修改这里）-------------------------------------------------
const CR = 'src/features/card-rendering/'
const FORBIDDEN_PACKAGES = /^(vue|@vue\/|@tauri-apps\/|pinia)/
const rules = [
  {
    id: 'pure-core',
    why: '几何/文法/排版/绘制/导出必须是不依赖 Vue、Tauri、其它 feature 的纯 TS',
    applies: (f) => ['geometry/', 'markup/', 'text-layout/', 'painter/', 'export/'].some((d) => f.startsWith(CR + d)),
    forbids: (spec) => FORBIDDEN_PACKAGES.test(spec.pkg ?? '')
      || (spec.target && spec.target.startsWith('src/features/') && !spec.target.startsWith(CR)),
  },
  {
    id: 'rendering-below-workspace',
    why: 'card-rendering 不得依赖 workspace，资源能力应通过端口接口注入',
    applies: (f) => f.startsWith(CR) && !f.includes('/components/'),
    forbids: (spec) => spec.target?.startsWith('src/features/workspace/'),
  },
  {
    id: 'entities-are-domain-only',
    why: 'entities 是领域模型，不能依赖 UI、feature、组件',
    applies: (f) => f.startsWith('src/entities/'),
    forbids: (spec) => /^src\/(shared\/ui|features|components)\//.test(spec.target ?? '')
      || FORBIDDEN_PACKAGES.test(spec.pkg ?? ''),
  },
  {
    id: 'shared-below-features',
    why: 'shared 与基础组件可被任何层使用，所以不能反过来依赖 features',
    applies: (f) => /^src\/(shared|components\/(base|standard))\//.test(f),
    forbids: (spec) => spec.target?.startsWith('src/features/'),
  },
  {
    id: 'workspace-below-shell',
    why: 'shell 组合 workspace，workspace 不得反过来依赖 shell',
    applies: (f) => f.startsWith('src/features/workspace/'),
    forbids: (spec) => spec.target?.startsWith('src/features/shell/'),
  },
]

// ---- 扫描 ---------------------------------------------------------------
const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|vue)$/.test(name) && !/\.(spec|test)\./.test(name) && !name.endsWith('.d.ts')) files.push(full)
  }
})(srcRoot)

const rel = (p) => relative(root, p).split(sep).join('/')
const fileSet = new Set(files.map(rel))

function resolveImport(fromFile, spec) {
  const base = spec.startsWith('@/') ? join(srcRoot, spec.slice(2)) : resolve(dirname(fromFile), spec)
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, `${base}/index.ts`]) {
    const r = rel(candidate)
    if (fileSet.has(r)) return r
  }
  return null
}

const IMPORT_RE = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const graph = new Map()
const violations = []

for (const file of files) {
  const from = rel(file)
  const text = readFileSync(file, 'utf8')
  const deps = new Set()
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    const isLocal = spec.startsWith('.') || spec.startsWith('@/')
    const target = isLocal ? resolveImport(file, spec) : null
    if (target) deps.add(target)
    for (const rule of rules) {
      if (!rule.applies(from)) continue
      if (rule.forbids({ pkg: isLocal ? null : spec, target })) violations.push(`${rule.id}|${from} -> ${target ?? spec}`)
    }
  }
  graph.set(from, deps)
}

// ---- 循环依赖（Tarjan SCC，按文件）---------------------------------------
const index = new Map(), low = new Map(), onStack = new Set(), stack = []
let counter = 0
const cycles = []
function strong(v) {
  index.set(v, counter); low.set(v, counter); counter += 1
  stack.push(v); onStack.add(v)
  for (const w of graph.get(v) ?? []) {
    if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))) }
    else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
  }
  if (low.get(v) === index.get(v)) {
    const scc = []
    let w
    do { w = stack.pop(); onStack.delete(w); scc.push(w) } while (w !== v)
    if (scc.length > 1) cycles.push(scc.sort())
  }
}
for (const v of graph.keys()) if (!index.has(v)) strong(v)
// 循环以“成员文件”为单位记录：新文件加入任何环都会被发现
const cycleMembers = cycles.flatMap((scc) => scc.map((f) => `cycle|${f}`))

// ---- 体积 ---------------------------------------------------------------
// 语言文件是文案，不是逻辑：条目随功能增长，拆开只会让同一套文案散在几处，所以不受行数限制。
const isCopy = (path) => path.startsWith('src/locales/')
const sizes = Object.fromEntries(files.map((f) => [rel(f), readFileSync(f, 'utf8').split('\n').length]).filter(([f]) => !isCopy(f)))
const oversize = Object.fromEntries(Object.entries(sizes).filter(([, n]) => n > MAX_LINES))

// ---- 对照基线 -----------------------------------------------------------
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : { violations: [], cycleMembers: [], maxLines: {} }
const current = { violations: [...new Set(violations)].sort(), cycleMembers: [...new Set(cycleMembers)].sort(), maxLines: oversize }

if (process.argv.includes('--update-baseline')) {
  const first = !existsSync(baselinePath)
  const grew = []
  if (!first) {
    for (const v of current.violations) if (!baseline.violations.includes(v)) grew.push(v)
    for (const v of current.cycleMembers) if (!baseline.cycleMembers.includes(v)) grew.push(v)
    for (const [f, n] of Object.entries(current.maxLines)) if (n > (baseline.maxLines[f] ?? MAX_LINES)) grew.push(`${f} ${n} lines`)
  }
  if (grew.length) { console.error('基线只能收紧，不能放宽。先修复这些新增项：\n  ' + grew.join('\n  ')); process.exit(1) }
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n')
  console.log(`基线已写入：${current.violations.length} 条边界违规，${current.cycleMembers.length} 个环成员，${Object.keys(current.maxLines).length} 个超长文件`)
  process.exit(0)
}

const errors = []
for (const v of current.violations) if (!baseline.violations.includes(v)) {
  const [id, edge] = v.split('|')
  errors.push(`[${id}] ${edge}\n    ${rules.find((r) => r.id === id).why}`)
}
for (const v of current.cycleMembers) if (!baseline.cycleMembers.includes(v)) errors.push(`[cycle] ${v.slice(6)} 参与了新的循环依赖`)
for (const [f, n] of Object.entries(current.maxLines)) {
  const allowed = baseline.maxLines[f] ?? MAX_LINES
  if (n > allowed) errors.push(`[size] ${f} 有 ${n} 行，上限 ${allowed}${baseline.maxLines[f] ? '（存量文件不许继续变长）' : `（新文件上限 ${MAX_LINES}）`}，请拆分`)
}

const fixed = [
  ...baseline.violations.filter((v) => !current.violations.includes(v)),
  ...baseline.cycleMembers.filter((v) => !current.cycleMembers.includes(v)),
  ...Object.keys(baseline.maxLines).filter((f) => (sizes[f] ?? 0) < baseline.maxLines[f]),
]

if (errors.length) {
  console.error('Architecture lint failed:\n' + errors.map((e) => '  ' + e).join('\n'))
  process.exit(1)
}
console.log(`Architecture lint passed（存量债务：${baseline.violations.length} 违规 / ${baseline.cycleMembers.length} 环成员 / ${Object.keys(baseline.maxLines).length} 超长文件）`)
if (fixed.length) console.log(`已有 ${fixed.length} 项存量被还清或缩短，运行 --update-baseline 收紧基线。`)
