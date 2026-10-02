/**
 * 输入控件静态守卫：业务层只能组合 OpenCard 控件，原生表单语义留在基础组件内部。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const projectRoot = process.cwd()
const srcRoot = join(projectRoot, 'src')
const nativeInputAllowlist = new Set([
  'src/components/base/OcCheckbox.vue',
  'src/components/base/OcSwitch.vue',
])
const visibleTitleComponents = new Set([
  'AdditionalFieldCreateDialog',
  'ComingSoonWorkspace',
  'OcBar',
  'OcCard',
  'OcDialog',
  'ShellWorkspaceFrame',
])
const stateBoundaryRoots = [
  'src/components/base/',
  'src/components/standard/',
]
/**
 * Tooltip policy guardrails: the placement enum lives in shared/ui/tooltip/globalTooltip.ts and is
 * only allowed to name a side; icon-only controls must still carry their accessible name.
 */
const tooltipPlacements = new Set(['top', 'bottom', 'left', 'right'])
const violations = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) walk(fullPath)
    else if (fullPath.endsWith('.vue')) inspectFile(fullPath)
  }
}

function inspectFile(fullPath) {
  const relativePath = relative(projectRoot, fullPath).split(sep).join('/')
  const content = readFileSync(fullPath, 'utf8')
  const checks = [
    [/<select\b/i, 'use OcSelect instead of a native select'],
    [/<textarea\b/i, 'use OcFieldInput/OcTextArea instead of a native textarea'],
    [/\bas=["']select["']/i, 'OcFieldInput must not masquerade as a select'],
    [/\btype=["']color["']/i, 'use OcColorPicker instead of a native color input'],
    [/\btype=["']range["']/i, 'use OcSlider instead of a native range input'],
  ]

  if (!nativeInputAllowlist.has(relativePath) && /<input\b/i.test(content)) {
    violations.push(`${relativePath}: use an OpenCard field component instead of a raw input`)
  }
  for (const [pattern, message] of checks) {
    if (pattern.test(content)) violations.push(`${relativePath}: ${message}`)
  }

  if (stateBoundaryRoots.some((root) => relativePath.startsWith(root))
    && /from\s+['"][^'"]*(?:\/store\/|[Pp]ersistence)[^'"]*['"]/.test(content)) {
    violations.push(`${relativePath}: keep global stores and persistence outside reusable UI controls`)
  }

  for (const match of content.matchAll(/(?<![:-\w])data-tooltip-placement\s*=\s*"([^"]*)"/g)) {
    if (!tooltipPlacements.has(match[1])) {
      violations.push(`${relativePath}: data-tooltip-placement must be one of ${[...tooltipPlacements].join('/')} (found "${match[1]}")`)
    }
  }

  // Attribute values are blanked first so a `>` inside an expression cannot truncate the tag.
  const tagSource = content.replace(/"[^"]*"/g, '""')
  for (const tag of tagSource.matchAll(/<([A-Za-z][\w.-]*)\b[^>]*>/g)) {
    const [, tagName] = tag
    if (/(?:^|\s)icon-only(?:\s|$)/.test(tag[0].replace(/>$/, ''))
      && !/(?:^|\s)(?::|v-bind:)?aria-label\s*=/.test(tag[0])) {
      violations.push(`${relativePath}: icon-only <${tagName}> must declare aria-label`)
    }
    if (visibleTitleComponents.has(tagName)) continue
    if (/(?:^|\s)(?::|v-bind:)?title\s*=/.test(tag[0])) {
      violations.push(`${relativePath}: use data-tooltip instead of a browser-native title tooltip on <${tagName}>`)
    }
  }
}

walk(srcRoot)

if (violations.length > 0) {
  console.error('[lint:controls] violations found:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('[lint:controls] pass')
