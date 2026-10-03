/**
 * 模块说明：
 * - 读取并解释用户语言文件：`<名字>.json`，以某一种内置语言为基底做部分覆盖。
 * 职责边界：
 * - 只做"文件内容 → 可用消息集"的纯变换和一次目录扫描；路径由调用方给出，
 *   应用消息、切换语言、提示用户都不属于这里。
 *
 * 覆盖语义：用户文件只能改写基底目录里已经存在的字符串叶子；没写的、基底里没有的、
 * 结构与基底不符的一律保留基底的值。用户文件不能新增 key —— 软件不会去问一个它不认识的名字。
 */
import { createI18n, type I18nOptions } from 'vue-i18n'
import { isRecord } from '../shared/model/record'
import {
  BUILTIN_APP_LOCALES,
  isBuiltinAppLocaleId,
  isUserLocaleFileId,
  type BuiltinAppLocaleId,
} from './appLocale'

/** 单份语言文件的字节上限：界面文案不该有这么大的量。 */
export const MAX_USER_LOCALE_FILE_BYTES = 2 * 1024 * 1024
/** 一次最多认多少种用户语言。 */
export const MAX_USER_LOCALE_FILES = 64

export type LocaleMessageObject = Record<string, unknown>

export interface UserLocaleFile {
  id: string
  base: BuiltinAppLocaleId
  messages: LocaleMessageObject
}

export interface UserLocaleProblem {
  file: string
  reason: string
}

export interface UserLocaleScan {
  locales: UserLocaleFile[]
  problems: UserLocaleProblem[]
}

export type UserLocaleParseResult =
  | { ok: true, locale: UserLocaleFile }
  | { ok: false, reason: string }

/** 语言文件形状：`{ "base": "zh-CN", "messages": { …key 结构… } }`。 */
export function parseUserLocaleFile(id: string, content: string): UserLocaleParseResult {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return { ok: false, reason: 'not valid JSON' }
  }
  if (!isRecord(value)) return { ok: false, reason: 'the root must be an object' }
  const base = value.base
  if (typeof base !== 'string' || !isBuiltinAppLocaleId(base)) {
    return { ok: false, reason: `base must be one of ${BUILTIN_APP_LOCALES.map(locale => locale.id).join(', ')}` }
  }
  if (value.messages !== undefined && !isRecord(value.messages)) {
    return { ok: false, reason: 'messages must be an object' }
  }
  return { ok: true, locale: { id, base, messages: isRecord(value.messages) ? value.messages : {} } }
}

/**
 * 把用户消息合到基底目录上：只有两边都是字符串的路径会被改写，
 * 其余（未定义、基底没有、一边是对象一边是字符串）都保持基底那一份。
 */
export function mergeLocaleMessages(
  base: LocaleMessageObject,
  override: LocaleMessageObject,
): LocaleMessageObject {
  const merged: LocaleMessageObject = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key]
    if (typeof baseValue === 'string') {
      if (typeof value === 'string') merged[key] = value
      continue
    }
    if (isRecord(baseValue) && isRecord(value)) {
      merged[key] = mergeLocaleMessages(baseValue, value)
    }
  }
  return merged
}

/**
 * 文案是渲染期编译的：一条写坏的 `@`、`|`、`{}` 足以让整个界面崩掉。
 * 这里逐条试编译，编不过的条目丢弃，并报出它们的 key 路径。
 *
 * 传进来的是**用户覆盖树**而不是合并结果：丢掉的那条在合并时自然保留基底的值，
 * 也省得把上千条内置文案再编译一遍。
 */
export function dropUncompilableMessages(
  messages: LocaleMessageObject,
): { messages: LocaleMessageObject, badKeys: string[] } {
  const composer = createI18n({
    legacy: false,
    locale: 'candidate',
    messages: { candidate: messages },
  } as unknown as I18nOptions).global
  const badPaths = messageKeyPaths(messages).filter((path) => {
    const key = path.join('.')
    try {
      // 缺 key 或编译不过时 t() 抛错或原样返回 key；能取到别的文案才算可用。
      return composer.t(key) === key
    } catch {
      return true
    }
  })
  if (badPaths.length === 0) return { messages, badKeys: [] }

  const kept = cloneMessages(messages)
  for (const path of badPaths) deleteMessagePath(kept, path)
  return { messages: kept, badKeys: badPaths.map(path => path.join('.')) }
}

function messageKeyPaths(value: LocaleMessageObject, prefix: readonly string[] = []): string[][] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = [...prefix, key]
    return isRecord(nested) ? messageKeyPaths(nested, path) : [path]
  })
}

function cloneMessages(source: LocaleMessageObject): LocaleMessageObject {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => (
    [key, isRecord(value) ? cloneMessages(value) : value]
  )))
}

/** 删掉一条坏文案；空掉的父层级一并收走，别在原地留一个空对象。 */
function deleteMessagePath(root: LocaleMessageObject, path: readonly string[]): void {
  const parents: LocaleMessageObject[] = [root]
  let node = root
  for (const segment of path.slice(0, -1)) {
    const next = node[segment]
    if (!isRecord(next)) return
    node = next
    parents.push(node)
  }
  delete node[path[path.length - 1]!]
  for (let index = parents.length - 1; index > 0; index -= 1) {
    if (Object.keys(parents[index]!).length > 0) break
    delete parents[index - 1]![path[index - 1]!]
  }
}

/** 只用到文件服务的这四件事，`FileSystemService` 结构上满足它。 */
interface UserLocaleFileSystem {
  readFile(path: string): Promise<string>
  readDirectory(path: string): Promise<readonly { name: string, isFile: boolean }[]>
  getFileInfo(path: string): Promise<{ size: number }>
  createDirectory(path: string): Promise<void>
}

/**
 * 扫一遍语言目录。目录不存在就先建出来（用户得找得到它），
 * 每个读不出来的文件进 problems，不影响其余文件。
 */
export async function readUserLocaleFiles(
  fs: UserLocaleFileSystem,
  directory: string,
): Promise<UserLocaleScan> {
  const problems: UserLocaleProblem[] = []
  try {
    await fs.createDirectory(directory)
  } catch (cause) {
    problems.push({ file: directory, reason: `cannot create the directory: ${String(cause)}` })
    return { locales: [], problems }
  }

  let entries: Awaited<ReturnType<UserLocaleFileSystem['readDirectory']>>
  try {
    entries = await fs.readDirectory(directory)
  } catch (cause) {
    problems.push({ file: directory, reason: `cannot read the directory: ${String(cause)}` })
    return { locales: [], problems }
  }

  const names = entries
    .filter(entry => entry.isFile && isUserLocaleFileId(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right))
  if (names.length > MAX_USER_LOCALE_FILES) {
    problems.push({
      file: directory,
      reason: `only the first ${MAX_USER_LOCALE_FILES} language files are read`,
    })
  }

  const locales: UserLocaleFile[] = []
  for (const name of names.slice(0, MAX_USER_LOCALE_FILES)) {
    const path = `${directory}/${name}`
    try {
      const info = await fs.getFileInfo(path)
      if (typeof info.size === 'number' && info.size > MAX_USER_LOCALE_FILE_BYTES) {
        problems.push({ file: name, reason: `larger than ${MAX_USER_LOCALE_FILE_BYTES} bytes` })
        continue
      }
      const parsed = parseUserLocaleFile(name, await fs.readFile(path))
      if (!parsed.ok) {
        problems.push({ file: name, reason: parsed.reason })
        continue
      }
      locales.push(parsed.locale)
    } catch (cause) {
      problems.push({ file: name, reason: String(cause) })
    }
  }
  return { locales, problems }
}
