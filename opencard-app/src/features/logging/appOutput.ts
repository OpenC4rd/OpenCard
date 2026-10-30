import { readonly, shallowRef, type ShallowRef } from 'vue'
import type { AppErrorCode } from './appErrorCatalog'

/** 输出通道的级别使用用户视角语义，与标题栏通知保持一致。 */
export const APP_OUTPUT_SEVERITIES = ['info', 'success', 'warning', 'error'] as const
export type AppOutputSeverity = (typeof APP_OUTPUT_SEVERITIES)[number]

export type AppOutputEntry = {
  id: number
  severity: AppOutputSeverity
  timestamp: number
  /** 展示给用户的内容。 */
  message: string
  /** 单行具体明细；没有额外明细时省略。 */
  detail?: string
  /** 失败分类；只由 reportAppError 上报的条目携带。 */
  code?: AppErrorCode
}

type AppOutputInput = Omit<AppOutputEntry, 'id' | 'timestamp'>

const MAX_ENTRY_COUNT = 1_000
const GLOBAL_STATE_KEY = '__OPENCARD_APP_OUTPUT_STATE__'

type AppOutputState = {
  entries: ShallowRef<readonly AppOutputEntry[]>
  nextEntryId: number
}

const globalTarget = globalThis as typeof globalThis & {
  [GLOBAL_STATE_KEY]?: AppOutputState
}
const state = globalTarget[GLOBAL_STATE_KEY] ?? {
  entries: shallowRef<readonly AppOutputEntry[]>([]),
  nextEntryId: 1,
}
globalTarget[GLOBAL_STATE_KEY] = state

/** 模块、编辑器会话和 shell 通过这里把信息交给用户，而不是把控制台镜像进来。 */
export function publishAppOutput(input: AppOutputInput): void {
  const message = input.message.trim()
  if (!message) return
  const detail = input.detail?.trim()
  const entry: AppOutputEntry = {
    id: state.nextEntryId++,
    severity: input.severity,
    timestamp: Date.now(),
    message,
    ...(detail ? { detail } : {}),
    ...(input.code ? { code: input.code } : {}),
  }
  const nextEntries = [...state.entries.value, entry]
  state.entries.value = nextEntries.length > MAX_ENTRY_COUNT
    ? nextEntries.slice(nextEntries.length - MAX_ENTRY_COUNT)
    : nextEntries
}

export function clearAppOutputEntries(): void {
  state.entries.value = []
}

export const appOutputEntries = readonly(state.entries)
