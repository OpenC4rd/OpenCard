// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorHistoryManager } from './editorHistoryManager'

afterEach(() => {
  editorHistoryManager.releaseMany(['first', 'second'])
  vi.useRealTimers()
})

describe('editor history manager', () => {
  it('keeps independent timelines for inactive open sessions', async () => {
    const first = vi.fn()
    const second = vi.fn()
    editorHistoryManager.initialize('first', 'structured', 'A', first)
    editorHistoryManager.initialize('second', 'structured', 'X', second)
    editorHistoryManager.recordContent('first', 'B')
    editorHistoryManager.recordContent('second', 'Y')

    await editorHistoryManager.undo('first')
    expect(first).toHaveBeenLastCalledWith('A', false)
    expect(editorHistoryManager.state('second').canUndo).toBe(true)
    await editorHistoryManager.undo('second')
    expect(second).toHaveBeenLastCalledWith('X', false)
  })

  it('flushes matching debounced work and releases closed sessions', async () => {
    vi.useFakeTimers()
    const publish = vi.fn()
    editorHistoryManager.initialize('first', 'structured', 'A', publish)
    editorHistoryManager.recordContent('first', 'AB', {
      mode: 'debounced', merge: { family: 'input', target: 'title' },
    })
    editorHistoryManager.recordContent('first', 'ABC', {
      mode: 'debounced', merge: { family: 'input', target: 'title' },
    })
    await editorHistoryManager.flush('first')
    await editorHistoryManager.undo('first')
    expect(publish).toHaveBeenLastCalledWith('A', false)
    editorHistoryManager.release('first')
    expect(editorHistoryManager.state('first')).toMatchObject({ canUndo: false, canRedo: false })
  })
})
