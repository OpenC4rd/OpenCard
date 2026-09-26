import packageMetadata from '../../../../package.json'
import type { FeedbackEnvironment, FeedbackSubmission } from '../model/feedback'

export type FeedbackSubmitResult = {
  reportId: string
  receiptToken: string
  status: 'received'
  submittedAt: string
}

export type FeedbackStatus = 'received' | 'answered' | 'closed'

export type FeedbackStatusResult = {
  reportId: string
  status: FeedbackStatus
  submittedAt: string
  updatedAt: string
  officialResponse?: {
    text: string
    updatedAt: string
  }
}

export type FeedbackReceiptCredential = {
  reportId: string
  receiptToken: string
}

export type FeedbackServiceErrorCode = 'unavailable' | 'network' | 'rejected'

export class FeedbackServiceError extends Error {
  readonly code: FeedbackServiceErrorCode
  readonly cause?: unknown

  constructor(code: FeedbackServiceErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'FeedbackServiceError'
    this.code = code
    this.cause = cause
  }
}

type SubmitFeedbackOptions = {
  endpoint?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

type GetFeedbackStatusOptions = SubmitFeedbackOptions

const DEFAULT_TIMEOUT_MS = 12_000

export function getFeedbackEndpoint(): string | undefined {
  const endpoint = import.meta.env.VITE_OPENCARD_FEEDBACK_ENDPOINT?.trim()
  return endpoint || undefined
}

export function isFeedbackServiceConfigured(endpoint = getFeedbackEndpoint()): boolean {
  if (!endpoint) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
  } catch {
    return false
  }
}

export function createFeedbackEnvironment(locale: string): FeedbackEnvironment {
  return {
    appVersion: packageMetadata.version,
    locale,
    platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform || 'unknown',
  }
}

export async function submitFeedback(
  submission: FeedbackSubmission,
  options: SubmitFeedbackOptions = {},
): Promise<FeedbackSubmitResult> {
  const endpoint = options.endpoint ?? getFeedbackEndpoint()
  if (!isFeedbackServiceConfigured(endpoint)) {
    throw new FeedbackServiceError('unavailable', 'feedback service is not configured')
  }
  const requestEndpoint = endpoint as string

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await (options.fetch ?? fetch)(requestEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submission),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new FeedbackServiceError('rejected', `feedback service rejected the request (${response.status})`)
    }

    const result = parseSubmitResult(await response.json())
    if (result.reportId !== submission.reportId || result.submittedAt !== submission.submittedAt) {
      throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
    }
    return result
  } catch (error) {
    if (error instanceof FeedbackServiceError) throw error
    throw new FeedbackServiceError('network', 'feedback service could not be reached', error)
  } finally {
    clearTimeout(timeout)
  }
}

export async function getFeedbackStatuses(
  receipts: FeedbackReceiptCredential[],
  options: GetFeedbackStatusOptions = {},
): Promise<FeedbackStatusResult[]> {
  if (receipts.length === 0) return []
  const endpoint = options.endpoint ?? getFeedbackEndpoint()
  if (!isFeedbackServiceConfigured(endpoint)) {
    throw new FeedbackServiceError('unavailable', 'feedback service is not configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await (options.fetch ?? fetch)(feedbackBatchEndpoint(endpoint as string), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipts }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new FeedbackServiceError('rejected', `feedback service rejected the request (${response.status})`)
    }

    const body = requireRecord(await response.json())
    if (!Array.isArray(body.statuses)) {
      throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
    }
    const statuses = body.statuses.map(parseStatusResult)
    const expectedIds = new Set(receipts.map(receipt => receipt.reportId))
    if (statuses.length !== expectedIds.size
      || statuses.some(status => !expectedIds.delete(status.reportId))
      || expectedIds.size > 0) {
      throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
    }
    return statuses
  } catch (error) {
    if (error instanceof FeedbackServiceError) throw error
    throw new FeedbackServiceError('network', 'feedback service could not be reached', error)
  } finally {
    clearTimeout(timeout)
  }
}

function feedbackBatchEndpoint(endpoint: string): string {
  const url = new URL(endpoint)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/status`
  return url.toString()
}

function parseSubmitResult(value: unknown): FeedbackSubmitResult {
  const result = requireRecord(value)
  if (
    typeof result.reportId !== 'string'
    || typeof result.receiptToken !== 'string'
    || result.status !== 'received'
    || typeof result.submittedAt !== 'string'
  ) {
    throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
  }
  return {
    reportId: result.reportId,
    receiptToken: result.receiptToken,
    status: result.status,
    submittedAt: result.submittedAt,
  }
}

function parseStatusResult(value: unknown): FeedbackStatusResult {
  const result = requireRecord(value)
  if (
    typeof result.reportId !== 'string'
    || !isFeedbackStatus(result.status)
    || typeof result.submittedAt !== 'string'
    || typeof result.updatedAt !== 'string'
  ) {
    throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
  }

  let officialResponse: FeedbackStatusResult['officialResponse']
  if (result.officialResponse !== undefined) {
    const response = requireRecord(result.officialResponse)
    if (typeof response.text !== 'string' || typeof response.updatedAt !== 'string') {
      throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
    }
    officialResponse = { text: response.text, updatedAt: response.updatedAt }
  }

  return {
    reportId: result.reportId,
    status: result.status,
    submittedAt: result.submittedAt,
    updatedAt: result.updatedAt,
    ...(officialResponse ? { officialResponse } : {}),
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FeedbackServiceError('rejected', 'feedback service returned an invalid response')
  }
  return value as Record<string, unknown>
}

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return value === 'received' || value === 'answered' || value === 'closed'
}
