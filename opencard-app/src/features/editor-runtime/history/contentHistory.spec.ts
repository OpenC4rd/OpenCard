// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContentHistory } from './contentHistory'

afterEach(() => vi.useRealTimers())

describe('content history', () => {
  it('stores minimal reversible text changes and branches', async () => {
    const updates: Array<[string, boolean]> = []
    const history = createContentHistory({
      content: '{"value":0}',
      entryLimit: 100,
      onChange: (content, dirty) => updates.push([content, dirty]),
    })
    history.record('{"value":1}', { mode: 'immediate' })
    history.record('{"value":2}', { mode: 'immediate' })
    await history.undo()
    expect(history.getContent()).toBe('{"value":1}')
    history.record('{"value":3}', { mode: 'immediate' })
    expect(history.canRedo.value).toBe(false)
    await history.undo()
    await history.undo()
    expect(history.getContent()).toBe('{"value":0}')
    expect(updates[updates.length - 1]).toEqual(['{"value":0}', false])
  })

  it('merges only the same family and target within the debounce window', async () => {
    vi.useFakeTimers()
    const history = createContentHistory({ content: 'A', entryLimit: 100, onChange: vi.fn() })
    history.record('AB', { mode: 'debounced', merge: { family: 'input', target: 'title' } })
    history.record('ABC', { mode: 'debounced', merge: { family: 'input', target: 'title' } })
    history.record('ABCD', { mode: 'debounced', merge: { family: 'input', target: 'description' } })
    history.flush()
    await history.undo()
    expect(history.getContent()).toBe('ABC')
    await history.undo()
    expect(history.getContent()).toBe('A')
  })

  it('uses a saved content baseline during concurrent saves', async () => {
    const history = createContentHistory({ content: 'A', entryLimit: 100, onChange: vi.fn() })
    history.record('B', { mode: 'immediate' })
    history.record('C', { mode: 'immediate' })
    history.markSaved('B')
    expect(history.dirty.value).toBe(true)
    await history.undo()
    expect(history.getContent()).toBe('B')
    expect(history.dirty.value).toBe(false)
  })

  it('keeps resource side effects synchronized and releases them with their entries', async () => {
    const first = { undo: vi.fn(), redo: vi.fn(), release: vi.fn() }
    const second = { undo: vi.fn(), redo: vi.fn(), release: vi.fn() }
    const history = createContentHistory({ content: 'A', entryLimit: 2, onChange: vi.fn() })

    history.record('B', { mode: 'immediate', resource: first })
    history.record('C', { mode: 'immediate', resource: second })
    await history.undo()
    expect(second.undo).toHaveBeenCalledOnce()
    expect(history.getContent()).toBe('B')
    await history.redo()
    expect(second.redo).toHaveBeenCalledOnce()
    expect(history.getContent()).toBe('C')

    history.setEntryLimit(1)
    await vi.waitFor(() => expect(first.release).toHaveBeenCalledOnce())
    history.dispose()
    await vi.waitFor(() => expect(second.release).toHaveBeenCalledOnce())
  })
})
