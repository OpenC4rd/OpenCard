import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'
import {
  FeedbackServiceError,
  getFeedbackStatuses,
  type FeedbackServiceErrorCode,
  type FeedbackStatusResult,
  type FeedbackSubmitResult,
} from '../services/feedbackService'
import {
  feedbackReceiptStore,
  type FeedbackReceiptRecord,
  type FeedbackReceiptStore,
} from '../services/feedbackReceiptStore'
import type { FeedbackSubmission } from '../model/feedback'

const MAX_TIMER_DELAY_MS = 2_147_000_000

type FeedbackInboxRefreshResult = { errorCode?: FeedbackServiceErrorCode | 'network' }

type FeedbackInboxDependencies = {
  store: FeedbackReceiptStore
  getStatuses: typeof getFeedbackStatuses
  now: () => number
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
}

type FeedbackInbox = {
  records: Readonly<Ref<readonly FeedbackReceiptRecord[]>>
  unreadReplyCount: ComputedRef<number>
  refreshing: Readonly<Ref<boolean>>
  start: () => Promise<FeedbackInboxRefreshResult>
  dispose: () => void
  refresh: (force?: boolean) => Promise<FeedbackInboxRefreshResult>
  addReceipt: (submission: FeedbackSubmission, result: FeedbackSubmitResult) => Promise<void>
  removeReceipt: (reportId: string) => Promise<void>
  markResponseRead: (reportId: string, responseUpdatedAt: string) => Promise<void>
}

export function createFeedbackInbox(overrides: Partial<FeedbackInboxDependencies> = {}): FeedbackInbox {
  const dependencies: FeedbackInboxDependencies = {
    store: feedbackReceiptStore,
    getStatuses: (...args) => getFeedbackStatuses(...args),
    now: () => Date.now(),
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: timer => clearTimeout(timer),
    ...overrides,
  }
  const records = ref<readonly FeedbackReceiptRecord[]>([])
  const refreshing = ref(false)
  let started = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let refreshPromise: Promise<FeedbackInboxRefreshResult> | null = null

  const unreadReplyCount = computed(() => records.value.filter(record => (
    Boolean(record.officialResponse)
    && record.readResponseUpdatedAt !== record.officialResponse?.updatedAt
  )).length)

  async function reload(): Promise<void> {
    records.value = await dependencies.store.list()
  }

  function clearScheduledRefresh(): void {
    if (timer === null) return
    dependencies.clearTimer(timer)
    timer = null
  }

  function scheduleRefresh(): void {
    clearScheduledRefresh()
    if (!started) return
    const now = dependencies.now()
    const nextCheckAt = records.value
      .filter(record => record.status !== 'closed' && record.nextCheckAt)
      .map(record => Date.parse(record.nextCheckAt as string))
      .filter(timestamp => !Number.isNaN(timestamp))
      .sort((left, right) => left - right)[0]
    if (nextCheckAt === undefined) return
    const delay = Math.min(Math.max(0, nextCheckAt - now), MAX_TIMER_DELAY_MS)
    timer = dependencies.setTimer(() => { void refresh(false) }, delay)
  }

  async function performRefresh(force: boolean): Promise<FeedbackInboxRefreshResult> {
    refreshing.value = true
    try {
      await reload()
      const now = dependencies.now()
      const dueRecords = records.value.filter(record => (
        record.status !== 'closed'
        && (force || !record.nextCheckAt || Number.isNaN(Date.parse(record.nextCheckAt)) || Date.parse(record.nextCheckAt) <= now)
      ))
      if (dueRecords.length === 0) return {}
      try {
        const results: FeedbackStatusResult[] = await dependencies.getStatuses(dueRecords.map(record => ({
          reportId: record.reportId,
          receiptToken: record.receiptToken,
        })))
        await dependencies.store.applyStatuses(results)
        await reload()
        return {}
      } catch (error) {
        try {
          await dependencies.store.markRefreshFailed(dueRecords.map(record => record.reportId))
          await reload()
        } catch {
          // Keep the last successfully loaded records when persistence also fails.
        }
        return { errorCode: error instanceof FeedbackServiceError ? error.code : 'network' }
      }
    } finally {
      refreshing.value = false
      scheduleRefresh()
    }
  }

  function refresh(force = false): Promise<FeedbackInboxRefreshResult> {
    refreshPromise ??= performRefresh(force).finally(() => { refreshPromise = null })
    return refreshPromise
  }

  async function start(): Promise<FeedbackInboxRefreshResult> {
    started = true
    return await refresh(false)
  }

  function dispose(): void {
    started = false
    clearScheduledRefresh()
  }

  async function addReceipt(submission: FeedbackSubmission, result: FeedbackSubmitResult): Promise<void> {
    await dependencies.store.add(submission, result)
    await reload()
    scheduleRefresh()
  }

  async function removeReceipt(reportId: string): Promise<void> {
    await dependencies.store.remove(reportId)
    await reload()
    scheduleRefresh()
  }

  async function markResponseRead(reportId: string, responseUpdatedAt: string): Promise<void> {
    const record = records.value.find(candidate => candidate.reportId === reportId)
    if (record?.readResponseUpdatedAt === responseUpdatedAt) return
    await dependencies.store.markResponseRead(reportId, responseUpdatedAt)
    await reload()
  }

  return {
    records: readonly(records),
    unreadReplyCount,
    refreshing: readonly(refreshing),
    start,
    dispose,
    refresh,
    addReceipt,
    removeReceipt,
    markResponseRead,
  }
}

const feedbackInbox = createFeedbackInbox()

export function useFeedbackInbox(): FeedbackInbox {
  return feedbackInbox
}
