import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { normalizeNodeTail } from '../../../shared/ui/node/node.types'
import type { EditorIssue } from '../../editor-runtime/model/editorIssue'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import {
  buildWorkspaceIssueProjection,
  useWorkbenchIssues,
} from './useWorkbenchIssues'

function createSession(id: string, name: string): EditorSession {
  return {
    id,
    resourceKind: 'workspace',
    path: `/project/${name}.ocdocument`,
    fileTypeId: 'opencard',
    name,
    editorId: 'card-designer',
    savedContent: '',
    draftContent: '',
    isDirty: false,
    isPreview: false,
  }
}

function createIssue(id: string, severity: EditorIssue['severity'] = 'warning'): EditorIssue {
  return {
    id,
    type: `test.${id}`,
    severity,
    locationText: 'Card A / title',
    description: `${id} issue`,
    navigationToken: { protocol: 'test', id },
  }
}

describe('workspace issue projection', () => {
  const COPY_ISSUE_LABEL = 'Copy error information'

  it('projects severity presentation and opaque navigation targets', () => {
    const session = createSession('a', 'Card A')
    const projection = buildWorkspaceIssueProjection(
      [session],
      new Map([[session.id, new Map([
        ['blueprint', [createIssue('invalid', 'error')]],
      ])]]),
      COPY_ISSUE_LABEL,
    )

    expect(projection.issueCount).toBe(1)
    expect(projection.highestSeverity).toBe('error')
    expect(projection.treeData.rootKeys).toEqual(['workspace-issue-session:a'])
    const issueKey = projection.treeData.children.get('workspace-issue-session:a')?.[0]
    expect(projection.treeData.items.get(issueKey!)).toMatchObject({
      label: 'Card A / title: invalid issue',
      visual: { type: 'icon', icon: 'status.error', iconTone: 'danger' },
    })
    expect(normalizeNodeTail(projection.treeData.items.get(issueKey!)?.tail)).toEqual([{
      key: 'copy-issue',
      title: COPY_ISSUE_LABEL,
      icon: 'action.copy',
      iconTone: 'muted',
    }])
    expect(projection.navigationTargets.get(issueKey!)).toEqual({
      sessionId: 'a',
      token: { protocol: 'test', id: 'invalid' },
    })
    expect(projection.navigationTargets.has('workspace-issue-session:a')).toBe(false)
  })

  it('replaces one scope, deduplicates ids, preserves ordered cached scopes, and prunes invalid scopes', () => {
    const session = createSession('a', 'Card A')
    const sessions = ref<EditorSession[]>([session])
    const issues = useWorkbenchIssues({ sessions, copyIssueLabel: COPY_ISSUE_LABEL })

    issues.reportSessionIssueSnapshot(session.id, {
      scopeKey: 'instance-a',
      scopeOrder: ['blueprint', 'instance-a', 'instance-b'],
      issues: [createIssue('a-old')],
    })
    issues.reportSessionIssueSnapshot(session.id, {
      scopeKey: 'instance-b',
      scopeOrder: ['blueprint', 'instance-a', 'instance-b'],
      issues: [createIssue('b')],
    })
    issues.reportSessionIssueSnapshot(session.id, {
      scopeKey: 'instance-a',
      scopeOrder: ['instance-b', 'instance-a'],
      issues: [createIssue('a-new'), createIssue('a-new', 'error')],
    })

    const rootKey = issues.issueTreeData.value.rootKeys[0]
    const labels = issues.issueTreeData.value.children.get(rootKey!)?.map((key) => (
      issues.issueTreeData.value.items.get(key)?.label
    ))
    expect(labels).toEqual([
      'Card A / title: b issue',
      'Card A / title: a-new issue',
    ])
    expect(issues.issueCount.value).toBe(2)
    expect(issues.highestIssueSeverity.value).toBe('error')
  })

  it('clears cached scopes and expansion when a session closes', async () => {
    const first = createSession('a', 'Card A')
    const second = createSession('b', 'Card B')
    const sessions = ref<EditorSession[]>([first, second])
    const issues = useWorkbenchIssues({ sessions, copyIssueLabel: COPY_ISSUE_LABEL })

    issues.reportSessionIssueSnapshot(first.id, {
      scopeKey: 'blueprint',
      scopeOrder: ['blueprint'],
      issues: [createIssue('a')],
    })
    issues.reportSessionIssueSnapshot(second.id, {
      scopeKey: 'blueprint',
      scopeOrder: ['blueprint'],
      issues: [createIssue('b')],
    })
    issues.setIssueNodeExpanded('workspace-issue-session:a', true)
    sessions.value = [second]
    await nextTick()

    expect(issues.issueTreeData.value.rootKeys).toEqual(['workspace-issue-session:b'])
    expect(issues.issueCount.value).toBe(1)
    expect(issues.expandedIssueKeys.value).toEqual([])
  })

  it('clears every cached scope when the producer reports an empty scope order', () => {
    const session = createSession('a', 'Card A')
    const sessions = ref<EditorSession[]>([session])
    const issues = useWorkbenchIssues({ sessions, copyIssueLabel: COPY_ISSUE_LABEL })

    issues.reportSessionIssueSnapshot(session.id, {
      scopeKey: 'blueprint',
      scopeOrder: ['blueprint', 'instance-a'],
      issues: [createIssue('blueprint')],
    })
    issues.reportSessionIssueSnapshot(session.id, {
      scopeKey: 'blueprint',
      scopeOrder: [],
      issues: [],
    })

    expect(issues.issueCount.value).toBe(0)
    expect(issues.highestIssueSeverity.value).toBeNull()
    expect(issues.issueTreeData.value.rootKeys).toEqual([])
  })

  it('does not republish an unchanged issue snapshot', () => {
    const session = createSession('a', 'Card A')
    const sessions = ref<EditorSession[]>([session])
    const issues = useWorkbenchIssues({ sessions, copyIssueLabel: COPY_ISSUE_LABEL })
    const snapshot = {
      scopeKey: 'blueprint',
      scopeOrder: ['blueprint'],
      issues: [createIssue('same')],
    }

    issues.reportSessionIssueSnapshot(session.id, snapshot)
    const projection = issues.issueTreeData.value
    issues.reportSessionIssueSnapshot(session.id, snapshot)

    expect(issues.issueTreeData.value).toBe(projection)
  })
})
