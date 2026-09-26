import { readonly, ref } from 'vue'
import type { IconResolvable, IconTone } from '../../shared/ui/icon/iconRegistry'
import { getAppErrorMeaning, reportAppError, type AppErrorCode } from '../logging/appErrorCatalog'
import {
  DEFAULT_APP_SETTINGS,
  MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT,
  MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT,
} from '../settings/model/appSettings'

export type ShellTitleBarNotice = {
  id: number
  tone?: IconTone
  icon?: IconResolvable
  message: string
}

const notices = ref<ShellTitleBarNotice[]>([])
let noticeHistoryLimit = DEFAULT_APP_SETTINGS.shell.titleBarNoticeHistoryLimit
let nextNoticeId = 1

export function addTitleBarNotice(input: Omit<ShellTitleBarNotice, 'id'>): number {
  const notice = { ...input, id: nextNoticeId++ }
  const retained = noticeHistoryLimit > 1
    ? notices.value.slice(-(noticeHistoryLimit - 1))
    : []
  notices.value = [...retained, notice]
  return notice.id
}

export function notifySuccess(message: string, icon: IconResolvable = 'action.check'): number {
  return addTitleBarNotice({ message, tone: 'success', icon })
}

export function notifyWarning(message: string, icon: IconResolvable = 'status.warning'): number {
  return addTitleBarNotice({ message, tone: 'warning', icon })
}

export function notifyError(message: string, icon: IconResolvable = 'status.error'): number {
  return addTitleBarNotice({ message, tone: 'danger', icon })
}

export function notifyAppError(code: AppErrorCode, details?: unknown, locale?: string): number {
  reportAppError(code, details)
  const activeLocale = locale
    ?? (typeof document === 'undefined' ? 'en-US' : document.documentElement.lang)
  return notifyError(getAppErrorMeaning(code, activeLocale))
}

export function setTitleBarNoticeHistoryLimit(value: number): void {
  noticeHistoryLimit = Math.min(
    MAX_TITLE_BAR_NOTICE_HISTORY_LIMIT,
    Math.max(MIN_TITLE_BAR_NOTICE_HISTORY_LIMIT, Math.round(value)),
  )
  if (notices.value.length > noticeHistoryLimit) {
    notices.value = notices.value.slice(-noticeHistoryLimit)
  }
}

export const titleBarNotices = readonly(notices)
