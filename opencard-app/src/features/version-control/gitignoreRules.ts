/**
 * 模块说明：
 * - `.gitignore` 的一行与"哪个文件夹里的什么东西"这种结构化规则互转，并把规则排成预览树。
 * 职责边界：
 * - 只处理文本与结构：不读写文件，也不判断项目里到底有哪些文件。表达不了的行归为 `custom`，原样保留。
 */

export type GitignoreMatch = 'extension' | 'name' | 'folder' | 'custom'

export interface GitignoreRule {
  /** `!` 开头的例外：匹配到的内容重新纳入版本。 */
  keep: boolean
  match: GitignoreMatch
  /** 扩展名（不含点）、文件名、文件夹名；`custom` 时是整条原始规则。 */
  value: string
  /** 规则所在的文件夹，空串表示项目根。 */
  scope: string
  /** 是否也作用于 `scope` 的各级子文件夹。 */
  deep: boolean
}

export interface GitignoreRuleEntry {
  /** 这条规则在文件里的行号（从 0 开始）；注释和空行也占行。 */
  line: number
  rule: GitignoreRule
}

/** 按行拆开；文件末尾换行产生的空尾行不算一行。 */
export function splitGitignoreLines(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function joinGitignoreLines(lines: readonly string[]): string {
  return lines.length ? `${lines.join('\n')}\n` : ''
}

/** 不解析，整行当作自定义规则。 */
export function customGitignoreRule(line: string): GitignoreRule {
  const keep = line.startsWith('!')
  return { keep, match: 'custom', value: keep ? line.slice(1) : line, scope: '', deep: true }
}

export function parseGitignoreRule(line: string): GitignoreRule {
  const custom = customGitignoreRule(line)
  const { keep, value: raw } = custom
  if (raw.includes('\\')) return custom

  const isFolder = raw.endsWith('/')
  const path = raw.replace(/\/$/, '')
  const segments = path.replace(/^\//, '').split('/')
  const name = segments.pop()!
  const wildcardFolders = segments[segments.length - 1] === '**'
  if (wildcardFolders) segments.pop()
  const scope = segments.join('/')
  if (!name || name === '**' || /[*?[\]]|\/\//.test(scope)) return custom

  const deep = wildcardFolders || !path.includes('/')
  if (isFolder) {
    return /[*?[\]]/.test(name) || (scope && wildcardFolders)
      ? custom
      : { keep, match: 'folder', value: name, scope, deep }
  }
  return /^\*\.[^*?[\]]+$/.test(name)
    ? { keep, match: 'extension', value: name.slice(2), scope, deep }
    : { keep, match: 'name', value: name, scope, deep }
}

export function formatGitignoreRule(rule: GitignoreRule): string {
  const prefix = rule.keep ? '!' : ''
  if (rule.match === 'custom') return `${prefix}${rule.value}`
  const name = rule.match === 'extension' ? `*.${rule.value}` : rule.value
  const body = rule.match === 'folder'
    ? rule.scope ? `/${rule.scope}/${name}/` : `${rule.deep ? '' : '/'}${name}/`
    : rule.scope ? `/${rule.scope}/${rule.deep ? '**/' : ''}${name}` : `${rule.deep ? '' : '/'}${name}`
  // 行首的 `#` 与 `!` 是语法，名字恰好这样开头时要转义，否则这一行就变成注释或例外。
  return `${prefix}${body.replace(/^[#!]/, '\\$&')}`
}

/** 换一种结构化的匹配方式，尽量留住已经填的内容。 */
export function retargetGitignoreRule(rule: GitignoreRule, match: Exclude<GitignoreMatch, 'custom'>): GitignoreRule {
  const value = rule.match === 'custom'
    ? rule.value.replace(/\/$/, '').split('/').pop()!.replace(/^\*\.?/, '')
    : rule.value
  return { ...rule, match, value: value || rule.value }
}

export function readGitignoreRules(lines: readonly string[]): GitignoreRuleEntry[] {
  return lines.flatMap((text, line) => {
    const trimmed = text.trim()
    return trimmed && !trimmed.startsWith('#') ? [{ line, rule: parseGitignoreRule(trimmed) }] : []
  })
}

/**
 * 例外写在已被忽略的文件夹里：git 不会进入这个文件夹，例外不生效。
 * 返回这类例外所在的行号。
 */
export function ineffectiveKeepLines(entries: readonly GitignoreRuleEntry[]): Set<number> {
  const ignoredFolders = entries
    .filter(({ rule }) => rule.match === 'folder' && !rule.keep)
    .map(({ rule }) => (rule.scope ? `${rule.scope}/${rule.value}` : rule.value))
  return new Set(entries
    .filter(({ rule }) => rule.keep && rule.match !== 'custom'
      && ignoredFolders.some(folder => rule.scope === folder || rule.scope.startsWith(`${folder}/`)))
    .map(({ line }) => line))
}
