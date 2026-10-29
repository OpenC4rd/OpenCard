import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardDocument } from '../../entities/card/model'
import { stringifyCardDocument } from '../../entities/card/storage'
import { useCdeDocumentState } from './useCdeDocumentState'

function createDocument(): CardDocument {
  return {
    type: 'card-document',

    id: 'document',
    name: 'Before typing',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: { type: 'card-face', id: 'front', background: '#FFFFFF', children: [] },
      back: { type: 'card-face', id: 'back', background: '#FFFFFF', children: [] },
    },
    instances: [],
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useCdeDocumentState lifecycle', () => {
  it('publishes typing immediately with a stable merge identity for session history', () => {
    vi.useFakeTimers()
    const updateContent = vi.fn()
    const state = useCdeDocumentState({
      updateContent,
      resetSelection: vi.fn(),
    })
    state.loadRawDoc(stringifyCardDocument(createDocument()))
    updateContent.mockClear()

    state.cardDoc.value!.name = 'Latest typing'
    state.markDocumentChanged('typing', 'document:name')
    expect(updateContent).toHaveBeenCalledTimes(1)
    expect(JSON.parse(updateContent.mock.calls[0]![0])).toMatchObject({
      name: 'Latest typing',
    })
    expect(updateContent.mock.calls[0]![1]).toEqual({
      mode: 'debounced',
      merge: { family: 'card-edit', target: 'document:name' },
      structural: false,
    })
    expect(vi.getTimerCount()).toBe(0)
  })
})
