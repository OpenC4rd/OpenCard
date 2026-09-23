import { isTauri } from '@tauri-apps/api/core'
import { LazyStore } from '@tauri-apps/plugin-store'
import { isRecord } from '../../../shared/model/record'
import { APP_FEEDBACK_RECEIPTS_FILE_NAME, resolveAppStoragePath } from '../../../shared/storage/appStoragePaths'
import type { FeedbackKind, FeedbackSubmission } from '../model/feedback'
import type { FeedbackStatus, FeedbackStatusResult, FeedbackSubmitResult } from './feedbackService'

const RECEIPTS_DOCUMENT_KEY = 'feedback-receipts'
const MINUTE_MS = 60_000
const INITIAL_REFRESH_DELAY_MS = 30 * MINUTE_MS
const RECEIVED_REFRESH_DELAY_MS = 6 * 60 * MINUTE_MS
const ANSWERED_REFRESH_DELAY_MS = 24 * 60 * MINUTE_MS
const MAX_FAILURE_DELAY_MS = 60 * MINUTE_MS

export type FeedbackReceiptRecord = {
  reportId: string
  receiptToken: string
  kind: FeedbackKind
  summary: string
  submittedAt: string
  status: FeedbackStatus
  updatedAt: string
  officialResponse?: {
    text: string
    updatedAt: string
  }
  readResponseUpdatedAt?: string
  lastSyncedAt?: string
  nextCheckAt?: string
  failureCount?: number
}

type FeedbackReceiptsDocument = {
  schemaVersion: 1
  records: FeedbackReceiptRecord[]
}

export interface FeedbackReceiptPersistence {
  load(): Promise<unknown>
  save(document: FeedbackReceiptsDocument): Promise<void>
}

export class MemoryFeedbackReceiptPersistence implements FeedbackReceiptPersistence {
  constructor(private value: unknown = null) {}

  async load(): Promise<unknown> {
    return structuredClone(this.value)
  }

  async save(document: FeedbackReceiptsDocument): Promise<void> {
    this.value = structuredClone(document)
  }
}

class TauriFeedbackReceiptPersistence implements FeedbackReceiptPersistence {
  private storePromise: Promise<LazyStore> | null = null

  private getStore(): Promise<LazyStore> {
    this.storePromise ??= resolveAppStoragePath(APP_FEEDBACK_RECEIPTS_FILE_NAME).then(path => new LazyStore(path))
    return this.storePromise
  }

  async load(): Promise<unknown> {
    return await (await this.getStore()).get(RECEIPTS_DOCUMENT_KEY)
  }

  async save(document: FeedbackReceiptsDocument): Promise<void> {
    const store = await this.getStore()
    await store.set(RECEIPTS_DOCUMENT_KEY, document)
    await store.save()
  }
}

export class FeedbackReceiptStore {
  private documentPromise: Promise<FeedbackReceiptsDocument> | null = null
  private pendingWrite: Promise<void> = Promise.resolve()

  constructor(private readonly persistence: FeedbackReceiptPersistence) {}

  async list(): Promise<FeedbackReceiptRecord[]> {
    return structuredClone((await this.getDocument()).records)
  }

  async add(submission: FeedbackSubmission, result: FeedbackSubmitResult): Promise<void> {
    await this.enqueue(async (document) => {
      const record: FeedbackReceiptRecord = {
        reportId: result.reportId,
        receiptToken: result.receiptToken,
        kind: submission.kind,
        summary: feedbackSummary(submission.message),
        submittedAt: result.submittedAt,
        status: result.status,
        updatedAt: result.submittedAt,
        nextCheckAt: scheduleAt(result.submittedAt, INITIAL_REFRESH_DELAY_MS),
      }
      const existingIndex = document.records.findIndex(item => item.reportId === record.reportId)
      if (existingIndex >= 0) document.records.splice(existingIndex, 1)
      document.records.unshift(record)
    })
  }

  async applyStatus(result: FeedbackStatusResult, syncedAt = new Date().toISOString()): Promise<void> {
    await this.applyStatuses([result], syncedAt)
  }

  async applyStatuses(
    results: FeedbackStatusResult[],
    syncedAt = new Date().toISOString(),
    random: () => number = Math.random,
  ): Promise<void> {
    await this.enqueue(async (document) => {
      for (const result of results) {
        const record = document.records.find(item => item.reportId === result.reportId)
        if (!record) continue
        record.status = result.status
        record.updatedAt = result.updatedAt
        record.lastSyncedAt = syncedAt
        record.failureCount = 0
        if (result.status === 'closed') delete record.nextCheckAt
        else record.nextCheckAt = scheduleAt(
          syncedAt,
          result.status === 'answered' ? ANSWERED_REFRESH_DELAY_MS : RECEIVED_REFRESH_DELAY_MS,
          random,
        )
        if (result.officialResponse) record.officialResponse = result.officialResponse
        else delete record.officialResponse
      }
    })
  }

  async markRefreshFailed(
    reportIds: string[],
    failedAt = new Date().toISOString(),
    random: () => number = Math.random,
  ): Promise<void> {
    const reportIdSet = new Set(reportIds)
    await this.enqueue(async (document) => {
      for (const record of document.records) {
        if (!reportIdSet.has(record.reportId) || record.status === 'closed') continue
        record.failureCount = (record.failureCount ?? 0) + 1
        const delay = Math.min(15 * MINUTE_MS * 2 ** (record.failureCount - 1), MAX_FAILURE_DELAY_MS)
        record.nextCheckAt = scheduleAt(failedAt, delay, random, MAX_FAILURE_DELAY_MS)
      }
    })
  }

  async markResponseRead(reportId: string, responseUpdatedAt: string): Promise<void> {
    await this.enqueue(async (document) => {
      const record = document.records.find(item => item.reportId === reportId)
      if (record?.officialResponse?.updatedAt !== responseUpdatedAt) return
      record.readResponseUpdatedAt = responseUpdatedAt
    })
  }

  async remove(reportId: string): Promise<void> {
    await this.enqueue(async (document) => {
      document.records = document.records.filter(item => item.reportId !== reportId)
    })
  }

  private getDocument(): Promise<FeedbackReceiptsDocument> {
    this.documentPromise ??= this.persistence.load().then(parseDocument)
    return this.documentPromise
  }

  private async enqueue(update: (document: FeedbackReceiptsDocument) => Promise<void>): Promise<void> {
    const write = this.pendingWrite.then(async () => {
      const document = await this.getDocument()
      await update(document)
      await this.persistence.save(document)
    })
    this.pendingWrite = write.catch(() => undefined)
    await write
  }
}

export function createFeedbackReceiptStore(
  persistence: FeedbackReceiptPersistence = isTauri()
    ? new TauriFeedbackReceiptPersistence()
    : new MemoryFeedbackReceiptPersistence(),
): FeedbackReceiptStore {
  return new FeedbackReceiptStore(persistence)
}

export const feedbackReceiptStore = createFeedbackReceiptStore()

function feedbackSummary(message: string): string {
  return message.split('\n').find(line => line.trim())?.trim().slice(0, 160) || message.trim().slice(0, 160)
}

function parseDocument(value: unknown): FeedbackReceiptsDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.records)) {
    return { schemaVersion: 1, records: [] }
  }
  return {
    schemaVersion: 1,
    records: value.records.map(parseRecord).filter((record): record is FeedbackReceiptRecord => record !== null),
  }
}

function parseRecord(value: unknown): FeedbackReceiptRecord | null {
  if (!isRecord(value) || !isFeedbackKind(value.kind) || !isFeedbackStatus(value.status)) return null
  const required = ['reportId', 'receiptToken', 'summary', 'submittedAt', 'updatedAt'] as const
  if (required.some(field => typeof value[field] !== 'string')) return null

  let officialResponse: FeedbackReceiptRecord['officialResponse']
  if (value.officialResponse !== undefined) {
    if (!isRecord(value.officialResponse)
      || typeof value.officialResponse.text !== 'string'
      || typeof value.officialResponse.updatedAt !== 'string') return null
    officialResponse = {
      text: value.officialResponse.text,
      updatedAt: value.officialResponse.updatedAt,
    }
  }

  return {
    reportId: value.reportId as string,
    receiptToken: value.receiptToken as string,
    kind: value.kind,
    summary: value.summary as string,
    submittedAt: value.submittedAt as string,
    status: value.status,
    updatedAt: value.updatedAt as string,
    ...(officialResponse ? { officialResponse } : {}),
    ...(typeof value.readResponseUpdatedAt === 'string'
      ? { readResponseUpdatedAt: value.readResponseUpdatedAt }
      : {}),
    ...(typeof value.lastSyncedAt === 'string' ? { lastSyncedAt: value.lastSyncedAt } : {}),
    ...(typeof value.nextCheckAt === 'string' ? { nextCheckAt: value.nextCheckAt } : {}),
    ...(typeof value.failureCount === 'number' && Number.isInteger(value.failureCount) && value.failureCount >= 0
      ? { failureCount: value.failureCount }
      : {}),
  }
}

function scheduleAt(
  baseTime: string,
  delayMs: number,
  random: () => number = Math.random,
  maximumDelayMs = Number.POSITIVE_INFINITY,
): string {
  const baseTimestamp = Date.parse(baseTime)
  const jitteredDelay = Math.min(delayMs * (0.8 + random() * 0.4), maximumDelayMs)
  return new Date((Number.isNaN(baseTimestamp) ? Date.now() : baseTimestamp) + jitteredDelay).toISOString()
}

function isFeedbackKind(value: unknown): value is FeedbackKind {
  return value === 'bug' || value === 'suggestion'
}

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return value === 'received' || value === 'answered' || value === 'closed'
}
