import { describe, expect, it } from 'vitest'
import { resolveSessionLabel } from './sessionLabel'

const scopeTexts = {
  external: (name: string) => `[external] ${name}`,
  draft: (name: string) => `[draft] ${name}`,
}

function session(patch: Partial<Parameters<typeof resolveSessionLabel>[0]> = {}) {
  return {
    name: 'card.ocdocument',
    presentation: null,
    isDirty: false,
    resourceKind: 'workspace' as const,
    ...patch,
  }
}

describe('resolveSessionLabel', () => {
  it('shows nothing until an editor has declared a presentation', () => {
    expect(resolveSessionLabel(session({ presentation: undefined }), scopeTexts)).toBe('')
    expect(resolveSessionLabel(session({ presentation: undefined, isDirty: true, resourceKind: 'draft' }), scopeTexts))
      .toBe('')
  })

  it('falls back to the session identity when the editor declares none', () => {
    expect(resolveSessionLabel(session(), scopeTexts)).toBe('card.ocdocument')
  })

  it('shows the declared title and keeps the unsaved marker', () => {
    expect(resolveSessionLabel(session({ presentation: { title: 'Main' } }), scopeTexts)).toBe('Main')
    expect(resolveSessionLabel(session({ presentation: { title: 'Main' }, isDirty: true }), scopeTexts))
      .toBe('Main *')
  })

  it('keeps the scope prefix outside the declared title', () => {
    expect(resolveSessionLabel(session({ resourceKind: 'external' }), scopeTexts))
      .toBe('[external] card.ocdocument')
    expect(resolveSessionLabel(session({ presentation: { title: 'Main' }, resourceKind: 'draft', isDirty: true }), scopeTexts))
      .toBe('[draft] Main *')
  })
})
