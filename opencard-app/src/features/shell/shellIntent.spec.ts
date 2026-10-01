import { describe, expect, it } from 'vitest'
import { decodeShellCommand, decodeShellSidebarListIntent, decodeShellWorkspaceIntent } from './shellIntent'

describe('shell intent decoding', () => {
  it('decodes list actions into feature intents', () => {
    expect(decodeShellSidebarListIntent('project-files', 'project.new-file.ocdocument')).toEqual({
      ok: true,
      intent: { type: 'project.create-entry', kind: 'opencard' },
    })
    expect(decodeShellSidebarListIntent('resource-packages', 'resource-package.use-selected')).toEqual({
      ok: true,
      intent: { type: 'resource-package.use-selected' },
    })
  })

  it('returns a typed failure for an unknown action', () => {
    expect(decodeShellSidebarListIntent('project-files', 'project.unknown')).toEqual({
      ok: false,
      code: 'unknown-sidebar-action',
      listKey: 'project-files',
      actionKey: 'project.unknown',
    })
  })

  it('decodes shell and workspace action keys once at the boundary', () => {
    expect(decodeShellCommand('toggle-sidebar')).toEqual({ ok: true, intent: { type: 'sidebar.toggle' } })
    expect(decodeShellWorkspaceIntent('diff.before:current')).toEqual({
      ok: true,
      intent: { type: 'diff.select', side: 'before', revisionId: null },
    })
    expect(decodeShellWorkspaceIntent('card-designer.render-image.both.0.5')).toEqual({
      ok: true,
      intent: { type: 'card.render-image', source: 'both', scale: 0.5 },
    })
  })
})
