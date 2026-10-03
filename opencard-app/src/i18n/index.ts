/**
 * 模块说明：
 * - 界面语言的运行时：内置目录、用户语言文件的登记、设置里那个选择的解释。
 * 职责边界：
 * - 只碰 vue-i18n 实例和语言目录；设置文档由 settings store 负责，这里从不回写。
 *
 * 语言 id 见 `appLocale.ts`：内置两种不带扩展名，用户语言就是它的文件名（`fr-FR.json`）。
 * 用户语言以某一种内置语言为基底部分覆盖，没写的 key 保留基底的值。
 */
import { isTauri } from '@tauri-apps/api/core'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { notifyWarning } from '../features/notifications/titlebarNotices'
import { fileSystemService } from '../features/workspace/services/fileSystemService'
import enUS from '../locales/en-US'
import zhCN from '../locales/zh-CN'
import { APP_LOCALE_DIRECTORY_NAME, resolveAppStoragePath } from '../shared/storage/appStoragePaths'
import {
  BUILTIN_APP_LOCALES,
  appLocaleLanguageTag,
  builtinAppLocaleLabel,
  isBuiltinAppLocaleId,
  resolveSystemLocaleId,
  type AppLocale,
  type AppLocaleOption,
  type BuiltinAppLocaleId,
} from './appLocale'
import {
  dropUncompilableMessages,
  mergeLocaleMessages,
  readUserLocaleFiles,
  type LocaleMessageObject,
  type UserLocaleProblem,
} from './userLocales'

const builtinMessages = {
  'en-US': enUS,
  'zh-CN': zhCN,
}

function builtinMessagesOf(base: BuiltinAppLocaleId): LocaleMessageObject {
  return base === 'zh-CN' ? zhCN : enUS
}

function browserLanguage(): string {
  return typeof navigator === 'undefined' ? 'zh-CN' : navigator.language
}

/** 当前装进来的用户语言（id 即文件名）。 */
const userLocaleIds = ref<readonly string[]>([])

export const i18n = createI18n({
  legacy: false,
  locale: resolveSystemLocaleId(browserLanguage()) as string,
  fallbackLocale: 'en-US',
  messages: builtinMessages,
})

/**
 * vue-i18n 从内置目录推导出的语言集合是闭合的（只有内置两种），而我们的语言集合是开放的：
 * 用户语言文件随时会加入。这里按运行时的真实形状收窄一次视图，写语言和读当前语言都走它。
 */
interface AppComposer {
  locale: { value: string }
  t: (key: string, named?: Record<string, unknown>) => string
  setLocaleMessage: (locale: string, messages: LocaleMessageObject) => void
}

const composer = i18n.global as unknown as AppComposer

/** 设置页语言下拉的候选：内置两种 + 用户语言文件。`system` 由设置页自己前置。 */
export const appLocaleOptions = computed<readonly AppLocaleOption[]>(() => [
  ...BUILTIN_APP_LOCALES.map(locale => ({ id: locale.id, label: locale.label })),
  ...userLocaleIds.value.map(id => ({ id, label: appLocaleLanguageTag(id) })),
])

export interface AppLocaleResolution {
  locale: string
  /** 设置里选中的语言文件不在了：这里是它的文件名，界面已经退回系统默认语言。 */
  missingFile: string | null
}

/** 把设置里的选择解释成真正可用的语言：认不出来就退回系统默认语言。 */
export function resolveAppLocale(preference: AppLocale): AppLocaleResolution {
  const systemLocale = resolveSystemLocaleId(browserLanguage())
  if (preference === 'system') return { locale: systemLocale, missingFile: null }
  if (isBuiltinAppLocaleId(preference)) return { locale: preference, missingFile: null }
  if (userLocaleIds.value.includes(preference)) return { locale: preference, missingFile: null }
  return { locale: systemLocale, missingFile: preference }
}

export function setAppLocale(preference: AppLocale): AppLocaleResolution {
  const resolution = resolveAppLocale(preference)
  composer.locale.value = resolution.locale
  return resolution
}

let reportedMissingFile: string | null = null

/**
 * 应用设置里的语言选择。语言文件读不到时只退回默认语言并提示一次，
 * 设置里的值原样留着 —— 用户把文件放回来，下次刷新就还是它。
 */
export function applyAppLocalePreference(preference: AppLocale): void {
  const resolution = setAppLocale(preference)
  if (resolution.missingFile === reportedMissingFile) return
  reportedMissingFile = resolution.missingFile
  if (!resolution.missingFile) return
  notifyWarning(composer.t('app.notifications.userLocaleMissing', {
    file: resolution.missingFile,
    language: builtinAppLocaleLabel(resolution.locale as BuiltinAppLocaleId),
  }))
}

/**
 * 重读语言目录，然后按设置里的选择重新应用一次语言。启动时来一次，
 * 用户在设置页点刷新时再来一次：新放进去的文件立刻能选，被删掉的那个立刻退回默认语言。
 * 非 Tauri 环境（浏览器开发）没有这个目录，只重新应用一次语言。
 */
export async function reloadUserLocales(preference: AppLocale): Promise<void> {
  if (!isTauri()) {
    applyAppLocalePreference(preference)
    return
  }
  const directory = await resolveAppStoragePath(APP_LOCALE_DIRECTORY_NAME)
  const scan = await readUserLocaleFiles(fileSystemService, directory)
  const problems: UserLocaleProblem[] = [...scan.problems]
  const ids: string[] = []

  for (const file of scan.locales) {
    // 先丢掉用户写坏的条目，再合并：那条 key 就沿用基底的值。
    const { messages: usable, badKeys } = dropUncompilableMessages(file.messages)
    if (badKeys.length > 0) {
      console.warn(
        `[OpenCard/Locales] ${file.id}: these messages cannot compile, so the base language is used instead.`,
        badKeys,
      )
      problems.push({ file: file.id, reason: `${badKeys.length} message(s) cannot compile` })
    }
    composer.setLocaleMessage(file.id, mergeLocaleMessages(builtinMessagesOf(file.base), usable))
    ids.push(file.id)
  }

  userLocaleIds.value = ids
  applyAppLocalePreference(preference)
  if (problems.length > 0) {
    console.warn('[OpenCard/Locales] Unreadable language files.', problems)
    notifyWarning(composer.t('app.notifications.userLocaleInvalid', {
      files: problems.map(problem => problem.file).join(', '),
    }))
  }
}
