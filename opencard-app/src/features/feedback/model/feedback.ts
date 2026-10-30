export type FeedbackKind = 'bug' | 'suggestion'
export type FeedbackPage = 'submit' | 'history'

export type FeedbackEnvironment = {
  appVersion: string
  locale: string
  platform: string
}

type FeedbackDraft = {
  kind: FeedbackKind
  message: string
  reproduction?: string
  expected?: string
  actual?: string
  contact?: string
  includeDiagnostics: boolean
}

export type FeedbackDiagnosticInput = {
  errorName?: string
  errorMessage?: string
  stack?: string
  logs?: readonly string[]
}

type FeedbackDiagnostics = {
  errorName?: string
  errorMessage?: string
  stack?: string
  logs?: string[]
}

export type FeedbackSubmission = {
  schemaVersion: 1
  reportId: string
  submittedAt: string
  kind: FeedbackKind
  message: string
  reproduction?: string
  expected?: string
  actual?: string
  contact?: string
  environment: FeedbackEnvironment
  diagnostics?: FeedbackDiagnostics
}

export const FEEDBACK_LIMITS = {
  message: 8_000,
  detail: 6_000,
  contact: 320,
  diagnostic: 12_000,
  logLine: 1_000,
  logLines: 50,
} as const

const sensitiveQueryValue = /([?&](?:access_?token|api_?key|auth|key|password|secret|token)=)[^&#\s]*/gi
const credentialedUrl = /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const windowsAbsolutePath = /\b[A-Za-z]:\\[^\r\n\t"'<>|]*/g
const unixHomePath = /\/(?:Users|home)\/[^/\s]+(?:\/[^\r\n\t"'<>]*)?/g
const emailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const disallowedControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function compactText(value: string, maxLength: number): string {
  return value
    .replace(disallowedControlCharacters, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength)
}

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined
  const normalized = compactText(value, maxLength)
  return normalized || undefined
}

export function sanitizeDiagnosticText(value: string, maxLength: number = FEEDBACK_LIMITS.diagnostic): string {
  return compactText(value, maxLength)
    .replace(credentialedUrl, '$1<credentials>@')
    .replace(sensitiveQueryValue, '$1<redacted>')
    .replace(windowsAbsolutePath, '<local-path>')
    .replace(unixHomePath, '<local-path>')
    .replace(emailAddress, '<email>')
}

function buildDiagnostics(input: FeedbackDiagnosticInput): FeedbackDiagnostics | undefined {
  const diagnostics: FeedbackDiagnostics = {
    errorName: optionalText(input.errorName, 200),
    errorMessage: input.errorMessage
      ? sanitizeDiagnosticText(input.errorMessage, FEEDBACK_LIMITS.diagnostic)
      : undefined,
    stack: input.stack ? sanitizeDiagnosticText(input.stack, FEEDBACK_LIMITS.diagnostic) : undefined,
    logs: input.logs
      ?.slice(-FEEDBACK_LIMITS.logLines)
      .map(line => sanitizeDiagnosticText(line, FEEDBACK_LIMITS.logLine))
      .filter(Boolean),
  }
  if (diagnostics.logs?.length === 0) delete diagnostics.logs
  return Object.values(diagnostics).some(value => value !== undefined) ? diagnostics : undefined
}

export function createFeedbackSubmission(
  draft: FeedbackDraft,
  environment: FeedbackEnvironment,
  diagnosticsInput: FeedbackDiagnosticInput = {},
  options: { reportId?: string; submittedAt?: string } = {},
): FeedbackSubmission {
  const message = compactText(draft.message, FEEDBACK_LIMITS.message)
  if (!message) throw new Error('feedback message is required')

  return {
    schemaVersion: 1,
    reportId: options.reportId ?? crypto.randomUUID(),
    submittedAt: options.submittedAt ?? new Date().toISOString(),
    kind: draft.kind,
    message,
    reproduction: optionalText(draft.reproduction, FEEDBACK_LIMITS.detail),
    expected: optionalText(draft.expected, FEEDBACK_LIMITS.detail),
    actual: optionalText(draft.actual, FEEDBACK_LIMITS.detail),
    contact: optionalText(draft.contact, FEEDBACK_LIMITS.contact),
    environment: {
      appVersion: compactText(environment.appVersion, 64),
      locale: compactText(environment.locale, 32),
      platform: compactText(environment.platform, 160),
    },
    diagnostics: draft.includeDiagnostics ? buildDiagnostics(diagnosticsInput) : undefined,
  }
}
