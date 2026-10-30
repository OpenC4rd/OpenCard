import { computed, ref, watch, type Ref } from 'vue'
import type {
  EditorIssue,
  EditorIssueSeverity,
  EditorIssueSnapshot,
  SessionIssue,
  SessionIssueNavigationRequest,
} from '../../editor-runtime/model/editorIssue'
import { resolveFileTypeById } from '../../workspace/model/fileTypes'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
import type { OcNode, OcNodeAction, OcNodeCollection } from '../../../shared/ui/node/node.types'

const SESSION_KEY_PREFIX = 'workspace-issue-session:'
const ISSUE_KEY_PREFIX = 'workspace-issue:'

import { COPY_ISSUE_ACTION_KEY } from '../spacePage'

type SessionIssueScopes = ReadonlyMap<string, readonly EditorIssue[]>

type WorkspaceIssueProjection = {
  treeData: OcNodeCollection
  navigationTargets: ReadonlyMap<string, SessionIssueNavigationRequest>
  issueDetails: ReadonlyMap<string, EditorIssue>
  issueCount: number
  highestSeverity: EditorIssueSeverity | null
}

const ISSUE_SEVERITY_RANK: Readonly<Record<EditorIssueSeverity, number>> = {
  info: 1,
  warning: 2,
  error: 3,
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value)
}

function sessionNodeKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${encodeKeyPart(sessionId)}`
}

function issueNodeKey(sessionId: string, scopeKey: string, issueId: string): string {
  return `${ISSUE_KEY_PREFIX}${encodeKeyPart(sessionId)}:${encodeKeyPart(scopeKey)}:${encodeKeyPart(issueId)}`
}

function issueLabel(issue: EditorIssue): string {
  return issue.locationText
    ? `${issue.locationText}: ${issue.description}`
    : issue.description
}

function issueTreeItem(issue: EditorIssue, copyAction: OcNodeAction): OcNode {
  if (issue.severity === 'error') {
    return { label: issueLabel(issue), visual: { type: 'icon', icon: 'mdiAlertCircleOutline', iconTone: 'danger' }, tail: [copyAction] }
  }
  if (issue.severity === 'warning') {
    return { label: issueLabel(issue), visual: { type: 'icon', icon: 'mdiAlertOutline', iconTone: 'warning' }, tail: [copyAction] }
  }
  return { label: issueLabel(issue), visual: { type: 'icon', icon: 'mdiHelpCircleOutline', iconTone: 'muted' }, tail: [copyAction] }
}

function dedupeIssues(issues: readonly EditorIssue[]): readonly EditorIssue[] {
  const byId = new Map<string, EditorIssue>()
  for (const issue of issues) byId.set(issue.id, issue)
  return [...byId.values()]
}

function sameIssueLists(a: readonly EditorIssue[] | undefined, b: readonly EditorIssue[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((issue, index) => JSON.stringify(issue) === JSON.stringify(b[index]))
}

function normalizeScopeOrder(snapshot: EditorIssueSnapshot): readonly string[] {
  if (snapshot.scopeOrder.length === 0) return []
  const order = [...new Set(snapshot.scopeOrder)]
  if (!order.includes(snapshot.scopeKey)) order.push(snapshot.scopeKey)
  return order
}

export function buildWorkspaceIssueProjection(
  sessions: readonly EditorSession[],
  issuesBySession: ReadonlyMap<string, SessionIssueScopes>,
  copyIssueLabel = 'copy-issue',
): WorkspaceIssueProjection {
  const copyAction: OcNodeAction = {
    key: COPY_ISSUE_ACTION_KEY,
    title: copyIssueLabel,
    icon: 'mdiContentCopy',
    iconTone: 'muted',
  }
  const rootKeys: string[] = []
  const items = new Map<string, OcNode>()
  const children = new Map<string, readonly string[]>()
  const navigationTargets = new Map<string, SessionIssueNavigationRequest>()
  const issueDetails = new Map<string, EditorIssue>()
  let issueCount = 0
  let highestSeverity: EditorIssueSeverity | null = null

  for (const session of sessions) {
    const scopes = issuesBySession.get(session.state.id)
    if (!scopes) continue

    const sessionIssues: Array<{ scopeKey: string; issue: SessionIssue }> = []
    for (const [scopeKey, issues] of scopes) {
      for (const issue of issues) {
        sessionIssues.push({ scopeKey, issue: { ...issue, sessionId: session.state.id } })
      }
    }
    if (sessionIssues.length === 0) continue

    const rootKey = sessionNodeKey(session.state.id)
    const fileType = resolveFileTypeById(session.state.fileTypeId)
    const addIssue = (scopeKey: string, issue: SessionIssue, path: readonly number[]): string => {
      const key = `${issueNodeKey(session.state.id, scopeKey, issue.id)}:${path.join('.')}`
      items.set(key, issueTreeItem(issue, copyAction))
      issueDetails.set(key, issue)
      if (issue.navigationToken !== undefined) {
        navigationTargets.set(key, {
          sessionId: session.state.id,
          token: issue.navigationToken,
        })
      }
      issueCount += 1
      if (highestSeverity === null || ISSUE_SEVERITY_RANK[issue.severity] > ISSUE_SEVERITY_RANK[highestSeverity]) {
        highestSeverity = issue.severity
      }
      const childKeys = (issue.children ?? []).map((child, index) =>
        addIssue(scopeKey, { ...child, sessionId: session.state.id }, [...path, index]),
      )
      if (childKeys.length > 0) children.set(key, childKeys)
      return key
    }
    const issueKeys = sessionIssues.map(({ scopeKey, issue }, index) => addIssue(scopeKey, issue, [index]))

    rootKeys.push(rootKey)
    items.set(rootKey, {
      label: `${session.state.name} (${sessionIssues.length})`,
      visual: { type: 'icon', icon: fileType.icon, iconTone: fileType.iconTone },
    })
    children.set(rootKey, issueKeys)
  }

  return {
    treeData: { rootKeys, items, children },
    navigationTargets,
    issueDetails,
    issueCount,
    highestSeverity,
  }
}

export function useWorkbenchIssues(options: {
  sessions: Readonly<Ref<readonly EditorSession[]>>
  copyIssueLabel: string
}) {
  const issuesBySession = ref<ReadonlyMap<string, SessionIssueScopes>>(new Map())
  const expandedIssueKeys = ref<string[]>([])

  const projection = computed(() => buildWorkspaceIssueProjection(
    options.sessions.value,
    issuesBySession.value,
    options.copyIssueLabel,
  ))

  function reportSessionIssueSnapshot(sessionId: string, snapshot: EditorIssueSnapshot): void {
    const nextBySession = new Map(issuesBySession.value)
    const currentScopes = nextBySession.get(sessionId) ?? new Map()
    const nextScopes = new Map<string, readonly EditorIssue[]>()
    const scopeOrder = normalizeScopeOrder(snapshot)
    const snapshotIssues = dedupeIssues(snapshot.issues)

    for (const scopeKey of scopeOrder) {
      if (scopeKey === snapshot.scopeKey) {
        nextScopes.set(scopeKey, snapshotIssues)
        continue
      }
      const cached = currentScopes.get(scopeKey)
      if (cached) nextScopes.set(scopeKey, cached)
    }

    if (
      currentScopes.size === nextScopes.size
      && [...nextScopes].every(([scopeKey, issues]) => sameIssueLists(currentScopes.get(scopeKey), issues))
    ) return

    nextBySession.set(sessionId, nextScopes)
    issuesBySession.value = nextBySession
  }

  function clearSessionIssues(sessionId: string): void {
    if (!issuesBySession.value.has(sessionId)) return
    const next = new Map(issuesBySession.value)
    next.delete(sessionId)
    issuesBySession.value = next
  }

  function clearAllSessionIssues(): void {
    issuesBySession.value = new Map()
    expandedIssueKeys.value = []
  }

  function setIssueNodeExpanded(key: string, expanded: boolean): void {
    const next = new Set(expandedIssueKeys.value)
    if (expanded) next.add(key)
    else next.delete(key)
    expandedIssueKeys.value = [...next]
  }

  watch(
    () => options.sessions.value.map((session) => session.state.id),
    (sessionIds) => {
      const activeIds = new Set(sessionIds)
      issuesBySession.value = new Map(
        [...issuesBySession.value].filter(([sessionId]) => activeIds.has(sessionId)),
      )
      expandedIssueKeys.value = expandedIssueKeys.value.filter((key) => {
        if (!key.startsWith(SESSION_KEY_PREFIX)) return false
        return activeIds.has(decodeURIComponent(key.slice(SESSION_KEY_PREFIX.length)))
      })
    },
  )

  return {
    issueTreeData: computed(() => projection.value.treeData),
    issueNavigationTargets: computed(() => projection.value.navigationTargets),
    issueDetails: computed(() => projection.value.issueDetails),
    issueCount: computed(() => projection.value.issueCount),
    highestIssueSeverity: computed(() => projection.value.highestSeverity),
    expandedIssueKeys,
    reportSessionIssueSnapshot,
    clearSessionIssues,
    clearAllSessionIssues,
    setIssueNodeExpanded,
  }
}
