import { resolveFeedbackStatus } from './feedbackStatus'
import { createInstallationToken, createIssue, getIssue, getIssueComments } from './githubClient'
import { createReceipt, findAuthorizedReceipt, type FeedbackReceipt } from './receiptStore'

type FeedbackKind = 'bug' | 'suggestion'

type FeedbackSubmission = {
  schemaVersion: 1
  reportId: string
  submittedAt: string
  kind: FeedbackKind
  message: string
  reproduction?: string
  expected?: string
  actual?: string
  contact?: string
  environment: {
    appVersion: string
    locale: string
    platform: string
  }
  diagnostics?: {
    errorName?: string
    errorMessage?: string
    stack?: string
    logs?: string[]
  }
}

const LIMITS = {
  requestBytes: 80_000,
  message: 8_000,
  detail: 6_000,
  contact: 320,
  diagnostic: 12_000,
  logLine: 1_000,
  logLines: 50,
} as const
const MAX_BATCH_RECEIPTS = 20

const reportIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGINS)

    if (request.method === 'OPTIONS') {
      return origin && corsHeaders
        ? new Response(null, { status: 204, headers: corsHeaders })
        : json({ error: 'origin_not_allowed' }, 403)
    }

    try {
      if (!origin || !corsHeaders) throw new HttpError(403, 'origin_not_allowed')
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/feedback/status') {
        return await handleFeedbackStatusBatch(request, env, corsHeaders)
      }
      if (request.method === 'POST' && url.pathname === '/feedback') {
        return await handleFeedbackSubmission(request, env, corsHeaders)
      }

      const reportId = feedbackReportIdFromPath(url.pathname)
      if (request.method === 'GET' && reportId) {
        return await handleFeedbackStatus(request, env, corsHeaders, reportId)
      }

      throw new HttpError(404, 'not_found')
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 502
      const code = error instanceof HttpError ? error.message : 'upstream_error'
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({
          event: 'feedback_relay_failure',
          code,
          message: error instanceof Error ? error.message : 'Unknown relay error',
        }))
      }
      return json({ error: code }, status, corsHeaders ?? undefined)
    }
  },
} satisfies ExportedHandler<Env>

async function handleFeedbackSubmission(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  requireJsonContentType(request)
  await enforceRateLimit(env.FEEDBACK_RATE_LIMIT, request)
  const submission = validateSubmission(await parseJsonRequest(request))
  const installationToken = await createInstallationToken(env)
  const issue = await createIssue(env, installationToken, {
    title: issueTitle(submission),
    body: issueBody(submission),
  })
  const receiptToken = await createReceipt(env.RECEIPTS_DB, {
    reportId: submission.reportId,
    issueNumber: issue.number,
    submittedAt: submission.submittedAt,
  })
  console.info(JSON.stringify({ event: 'feedback_created', reportId: submission.reportId, issue: issue.number }))

  return json({
    reportId: submission.reportId,
    receiptToken,
    status: 'received',
    submittedAt: submission.submittedAt,
  }, 201, corsHeaders)
}

async function handleFeedbackStatus(
  request: Request,
  env: Env,
  corsHeaders: Headers,
  reportId: string,
): Promise<Response> {
  await enforceRateLimit(env.FEEDBACK_RATE_LIMIT, request)
  const receiptToken = readBearerToken(request.headers.get('Authorization'))
  const receipt = receiptToken
    ? await findAuthorizedReceipt(env.RECEIPTS_DB, reportId, receiptToken)
    : null
  if (!receipt) throw new HttpError(401, 'invalid_receipt')

  const installationToken = await createInstallationToken(env)
  return json(await loadFeedbackStatus(env, installationToken, receipt), 200, corsHeaders)
}

async function handleFeedbackStatusBatch(
  request: Request,
  env: Env,
  corsHeaders: Headers,
): Promise<Response> {
  requireJsonContentType(request)
  await enforceRateLimit(env.FEEDBACK_RATE_LIMIT, request)
  const raw = requireRecord(await parseJsonRequest(request), 'status_batch')
  if (!Array.isArray(raw.receipts) || raw.receipts.length === 0 || raw.receipts.length > MAX_BATCH_RECEIPTS) {
    throw new HttpError(400, 'invalid_receipts')
  }

  const requests = raw.receipts.map((value) => {
    const receipt = requireRecord(value, 'receipt')
    const reportId = requireSingleLineText(receipt.reportId, 'report_id', 64)
    const receiptToken = requireSingleLineText(receipt.receiptToken, 'receipt_token', 128)
    if (!reportIdPattern.test(reportId)) throw new HttpError(400, 'invalid_report_id')
    return { reportId, receiptToken }
  })
  if (new Set(requests.map(item => item.reportId)).size !== requests.length) {
    throw new HttpError(400, 'duplicate_report_id')
  }

  const receipts = await Promise.all(requests.map(item => (
    findAuthorizedReceipt(env.RECEIPTS_DB, item.reportId, item.receiptToken)
  )))
  if (receipts.some(receipt => receipt === null)) throw new HttpError(401, 'invalid_receipt')
  const authorizedReceipts = receipts.filter((receipt): receipt is FeedbackReceipt => receipt !== null)

  const installationToken = await createInstallationToken(env)
  const statuses = await Promise.all(authorizedReceipts.map(receipt => (
    loadFeedbackStatus(env, installationToken, receipt)
  )))
  return json({ statuses }, 200, corsHeaders)
}

async function loadFeedbackStatus(
  env: Env,
  installationToken: string,
  receipt: FeedbackReceipt,
): Promise<Record<string, unknown>> {
  const issue = await getIssue(env, installationToken, receipt.issueNumber)
  const comments = issue.commentCount > 0
    ? await getIssueComments(env, installationToken, receipt.issueNumber, issue.commentCount)
    : []
  const status = resolveFeedbackStatus(issue, comments)
  return {
    reportId: receipt.reportId,
    status: status.status,
    submittedAt: receipt.submittedAt,
    updatedAt: status.updatedAt,
    ...(status.officialResponse ? { officialResponse: status.officialResponse } : {}),
  }
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpError(415, 'unsupported_media_type')
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > LIMITS.requestBytes) throw new HttpError(413, 'payload_too_large')
}

async function parseJsonRequest(request: Request): Promise<unknown> {
  const rawBody = await readBoundedBody(request, LIMITS.requestBytes)
  try {
    return JSON.parse(rawBody)
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
}

async function enforceRateLimit(rateLimit: RateLimit, request: Request): Promise<void> {
  const rateKey = request.headers.get('CF-Connecting-IP') || 'unknown'
  const result = await rateLimit.limit({ key: rateKey })
  if (!result.success) throw new HttpError(429, 'rate_limited')
}

function feedbackReportIdFromPath(pathname: string): string | null {
  const match = /^\/feedback\/([^/]+)$/.exec(pathname)
  if (!match || !reportIdPattern.test(match[1]!)) return null
  return match[1]!
}

function readBearerToken(authorization: string | null): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization ?? '')
  return match?.[1] ?? null
}

function getCorsHeaders(origin: string | null, allowedOrigins: string): Headers | null {
  if (!origin) return null
  const allowed = allowedOrigins.split(',').map(value => value.trim()).filter(Boolean)
  if (!allowed.includes(origin)) return null
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  })
}

function json(body: unknown, status: number, extraHeaders?: Headers): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('payload_too_large')
        throw new HttpError(413, 'payload_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `invalid_${field}`)
  }
  return value as Record<string, unknown>
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `invalid_${field}`)
  const text = value.trim()
  if (!text || text.length > maxLength) throw new HttpError(400, `invalid_${field}`)
  return text
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maxLength) throw new HttpError(400, `invalid_${field}`)
  return value.trim() || undefined
}

function requireSingleLineText(value: unknown, field: string, maxLength: number): string {
  const text = requireText(value, field, maxLength)
  if (/[\r\n]/.test(text)) throw new HttpError(400, `invalid_${field}`)
  return text
}

export function validateSubmission(value: unknown): FeedbackSubmission {
  const raw = requireRecord(value, 'submission')
  if (raw.schemaVersion !== 1) throw new HttpError(400, 'invalid_schema_version')
  if (raw.kind !== 'bug' && raw.kind !== 'suggestion') throw new HttpError(400, 'invalid_kind')

  const environment = requireRecord(raw.environment, 'environment')
  const diagnostics = raw.diagnostics === undefined
    ? undefined
    : validateDiagnostics(raw.diagnostics)
  if (raw.kind === 'suggestion' && diagnostics) throw new HttpError(400, 'unexpected_diagnostics')

  const reportId = requireSingleLineText(raw.reportId, 'report_id', 64)
  if (!reportIdPattern.test(reportId)) throw new HttpError(400, 'invalid_report_id')
  const submittedAt = requireSingleLineText(raw.submittedAt, 'submitted_at', 40)
  if (!isoTimestampPattern.test(submittedAt) || Number.isNaN(Date.parse(submittedAt))) {
    throw new HttpError(400, 'invalid_submitted_at')
  }

  return {
    schemaVersion: 1,
    reportId,
    submittedAt,
    kind: raw.kind,
    message: requireText(raw.message, 'message', LIMITS.message),
    reproduction: optionalText(raw.reproduction, 'reproduction', LIMITS.detail),
    expected: optionalText(raw.expected, 'expected', LIMITS.detail),
    actual: optionalText(raw.actual, 'actual', LIMITS.detail),
    contact: optionalText(raw.contact, 'contact', LIMITS.contact),
    environment: {
      appVersion: requireSingleLineText(environment.appVersion, 'app_version', 64),
      locale: requireSingleLineText(environment.locale, 'locale', 32),
      platform: requireSingleLineText(environment.platform, 'platform', 160),
    },
    diagnostics,
  }
}

function validateDiagnostics(value: unknown): FeedbackSubmission['diagnostics'] {
  const raw = requireRecord(value, 'diagnostics')
  let logs: string[] | undefined
  if (raw.logs !== undefined) {
    if (!Array.isArray(raw.logs) || raw.logs.length > LIMITS.logLines) {
      throw new HttpError(400, 'invalid_logs')
    }
    logs = raw.logs.map(line => requireText(line, 'log_line', LIMITS.logLine))
  }
  return {
    errorName: optionalText(raw.errorName, 'error_name', 200),
    errorMessage: optionalText(raw.errorMessage, 'error_message', LIMITS.diagnostic),
    stack: optionalText(raw.stack, 'stack', LIMITS.diagnostic),
    logs,
  }
}

function issueTitle(submission: FeedbackSubmission): string {
  const prefix = submission.kind === 'bug' ? '[Bug]' : '[Suggestion]'
  const summary = submission.message.split('\n', 1)[0]!.trim().replace(/@/g, '＠')
  return `${prefix} ${summary}`.slice(0, 120)
}

export function issueBody(submission: FeedbackSubmission): string {
  const sections = [
    `<!-- OpenCard feedback ${submission.reportId} -->`,
    markdownSection('Description', submission.message),
    markdownSection('Reproduction', submission.reproduction),
    markdownSection('Expected', submission.expected),
    markdownSection('Actual', submission.actual),
    markdownSection('Contact', submission.contact),
    [
      '## Environment',
      `- OpenCard: ${inlineCode(submission.environment.appVersion)}`,
      `- Locale: ${inlineCode(submission.environment.locale)}`,
      `- Platform: ${inlineCode(submission.environment.platform)}`,
      `- Submitted: ${inlineCode(submission.submittedAt)}`,
      `- Report ID: ${inlineCode(submission.reportId)}`,
    ].join('\n'),
    submission.diagnostics
      ? `<details>\n<summary>Redacted diagnostics</summary>\n\n<pre>${escapeHtml(JSON.stringify(submission.diagnostics, null, 2))}</pre>\n</details>`
      : '',
  ]
  return sections.filter(Boolean).join('\n\n')
}

function markdownSection(title: string, value?: string): string {
  return value ? `## ${title}\n<pre>${escapeHtml(value)}</pre>` : ''
}

function inlineCode(value: string): string {
  return `<code>${escapeHtml(value)}</code>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!)
}
