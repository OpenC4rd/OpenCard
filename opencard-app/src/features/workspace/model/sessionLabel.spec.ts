import { describe, expect, it } from 'vitest'
import { resolveSessionLabel } from './sessionLabel'

const texts = { external: (name: string) => `external:${name}`, draft: (name: string) => `draft:${name}` }
const session = { name: 'icons.json', presentation: { title: 'Icons' }, isDirty: false, resourceKind: 'workspace' as const }

describe('resolveSessionLabel', () => {
  it('marks unsaved work that asks something of the user', () => {
    expect(resolveSessionLabel(session, texts)).toBe('Icons')
    expect(resolveSessionLabel({ ...session, isDirty: true }, texts)).toBe('Icons *')
  })

  it('does not mark an edit that an immediate save is already writing', () => {
    expect(resolveSessionLabel({ ...session, isDirty: true, autoSavePending: true }, texts)).toBe('Icons')
  })
})
