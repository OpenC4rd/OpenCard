/**
 * 模块说明：
 * - 把"忽略这条改动"翻译成 `.gitignore` 里的一行，并把这一行安全地并进现有文本。
 * 职责边界：
 * - 只处理文本：不认识项目、不读写文件，也不判断某条路径是否已被跟踪。
 */

/** `.gitignore` 里有含义的字符：出现在路径里必须转义，否则这一行会匹配到别的东西。 */
const PATTERN_SPECIAL_CHARACTERS = /[\\*?[\]]/g

function escapePatternSegment(segment: string): string {
  return segment
    .replace(PATTERN_SPECIAL_CHARACTERS, character => `\\${character}`)
    // 行尾空格会被 git 吃掉，写成 `\ ` 才是空格本身。
    .replace(/\s+$/, match => match.replace(/ /g, '\\ '))
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/**
 * 一条路径的忽略模式：锚定到项目根（`/a/b.txt`），目录再补尾部 `/`，
 * 这样忽略某一层目录时不会连带忽略别处的同名目录；行首的 `/` 也顺带挡掉了注释与取反语法。
 */
export function gitignorePatternForPath(path: string, kind: 'file' | 'folder'): string {
  const segments = normalizeRelativePath(path).split('/').filter(Boolean).map(escapePatternSegment)
  const pattern = `/${segments.join('/')}`
  return kind === 'folder' ? `${pattern}/` : pattern
}

/** 某一类扩展名的忽略模式（`*.ocpack`）；没有扩展名就没有这一类可忽略。 */
export function gitignorePatternForExtension(path: string): string | null {
  const name = normalizeRelativePath(path).split('/').pop() ?? ''
  const separator = name.lastIndexOf('.')
  if (separator <= 0 || separator === name.length - 1) return null
  return `*${escapePatternSegment(name.slice(separator))}`
}

/**
 * 忽略文件夹的候选层级：目录自身（若这条路径就是目录）与每一级上级目录，从最近的一级往外排，
 * 不含项目根。多条路径（分组行下面的整棵子树）按出现顺序去重。
 */
export function ignoreFolderLevelsFor(paths: readonly string[]): string[] {
  const levels: string[] = []
  for (const path of paths) {
    const isFolder = /[\\/]$/.test(path)
    const segments = normalizeRelativePath(path).split('/').filter(Boolean)
    for (let depth = isFolder ? segments.length : segments.length - 1; depth >= 1; depth -= 1) {
      const level = `${segments.slice(0, depth).join('/')}/`
      if (!levels.includes(level)) levels.push(level)
    }
  }
  return levels
}

/** 按 git 的规则比较两行模式：行尾空格不参与比较，其余原样。 */
function samePattern(left: string, right: string): boolean {
  return left.replace(/\s+$/, '') === right.replace(/\s+$/, '')
}

/**
 * 把一行模式并进现有文本：已经有了就原样返回，否则另起一行追加。
 * 追加前保证上一行以换行结束，否则新行会和旧行拼成同一条模式。
 */
export function appendGitignorePattern(existing: string, pattern: string): string {
  if (existing.split('\n').some(line => samePattern(line, pattern))) return existing
  if (existing === '') return `${pattern}\n`
  return `${existing.replace(/\n*$/, '')}\n${pattern}\n`
}
