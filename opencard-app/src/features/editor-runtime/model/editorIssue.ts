type JsonPrimitive = string | number | boolean | null

type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type SessionNavigationToken = JsonValue

export type EditorIssueSeverity = 'error' | 'warning' | 'info'

export interface EditorIssue {
  id: string
  type: string
  severity: EditorIssueSeverity
  locationText: string
  description: string
  navigationToken?: SessionNavigationToken
  details?: Readonly<Record<string, unknown>>
  children?: readonly EditorIssue[]
}

export interface EditorIssueSnapshot {
  scopeKey: string
  scopeOrder: readonly string[]
  issues: readonly EditorIssue[]
}

export interface SessionIssue extends EditorIssue {
  sessionId: string
}

export interface SessionIssueNavigationRequest {
  sessionId: string
  token: SessionNavigationToken
}

export type EditorNavigationResult = 'success' | 'not-found' | 'invalid-token'
