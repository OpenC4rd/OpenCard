/**
 * 模块说明：
 * - 界面语言的唯一身份模型：内置语言，加上用户语言文件。
 * 职责边界：
 * - 只回答"某个语言 id 是什么、合不合法、显示成什么"；不读写文件，不碰 vue-i18n。
 */

/** 软件内置、随发布物一起走的两份目录。label 是语言自称，不参与文案翻译。 */
export const BUILTIN_APP_LOCALES = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en-US', label: 'English' },
] as const

export type BuiltinAppLocaleId = (typeof BUILTIN_APP_LOCALES)[number]['id']

/**
 * 用户语言文件的 id 就是它的文件名（含扩展名）。内置 id 不带 `.json`，
 * 所以 `zh-CN` 与 `zh-CN.json` 是两个不同的语言，用户文件永远不会顶掉内置目录。
 */
export type UserLocaleFileId = `${string}.json`
export type AppLocale = 'system' | BuiltinAppLocaleId | UserLocaleFileId

export interface AppLocaleOption {
  id: string
  label: string
}

export const USER_LOCALE_FILE_EXTENSION = '.json'

const MAX_USER_LOCALE_STEM_LENGTH = 64
/** id 只当字典键和提示文本用，从不拼进路径；仍挡掉路径分隔符与控制字符。 */
const FORBIDDEN_IN_LOCALE_STEM = /[\\/:*?"<>|\u0000-\u001F]/

export function isBuiltinAppLocaleId(value: string): value is BuiltinAppLocaleId {
  return BUILTIN_APP_LOCALES.some(locale => locale.id === value)
}

export function builtinAppLocaleLabel(id: BuiltinAppLocaleId): string {
  return BUILTIN_APP_LOCALES.find(locale => locale.id === id)!.label
}

/** 内置 id，或 `<名字>.json`（名字非空、不含路径分隔符与控制字符、不过长）。 */
export function isValidAppLocaleId(value: unknown): value is BuiltinAppLocaleId | UserLocaleFileId {
  if (typeof value !== 'string') return false
  if (isBuiltinAppLocaleId(value)) return true
  if (!value.endsWith(USER_LOCALE_FILE_EXTENSION)) return false
  const stem = value.slice(0, -USER_LOCALE_FILE_EXTENSION.length)
  return stem.length > 0
    && stem.length <= MAX_USER_LOCALE_STEM_LENGTH
    && !FORBIDDEN_IN_LOCALE_STEM.test(stem)
}

/** 目录里能当语言文件用的名字。内置 id 不带扩展名，所以永远不会命中这里。 */
export function isUserLocaleFileId(value: unknown): value is UserLocaleFileId {
  return typeof value === 'string'
    && value.endsWith(USER_LOCALE_FILE_EXTENSION)
    && isValidAppLocaleId(value)
}

/** 语言在下拉里的显示名（用户语言就是文件名去扩展名）与 `<html lang>` 都取这个值。 */
export function appLocaleLanguageTag(id: string): string {
  return id.endsWith(USER_LOCALE_FILE_EXTENSION) ? id.slice(0, -USER_LOCALE_FILE_EXTENSION.length) : id
}

/** 跟随系统时落到哪一种内置语言。 */
export function resolveSystemLocaleId(browserLanguage: string): BuiltinAppLocaleId {
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}
