import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { CardDocument } from '../../entities/card/model'
import { useCdeInstanceOps } from './useCdeInstanceOps'

const translate = (messageKey: string) => messageKey

describe('useCdeInstanceOps tree actions', () => {
  it('duplicates and deletes the complete selected instance set', () => {
    const document: CardDocument = {
      type: 'card-document',
      id: 'document',
      version: '1.0.0',
      width: '540',
      height: '850',
      faces: {
        front: { type: 'card-face', id: 'front', background: '#FFFFFF', children: [] },
        back: { type: 'card-face', id: 'back', background: '#FFFFFF', children: [] },
      },
      instances: [
        { type: 'card-instance', id: 'one', name: 'One', amount: '1', data: {} },
        { type: 'card-instance', id: 'two', name: 'Two', amount: '1', data: {} },
      ],
      dataTable: { blocks: {}, exportInstanceIds: ['one', 'two'] },
    }
    const selectedCardId = ref('one')
    const selectedCardKeys = ref(['one', 'two'])
    const state = useCdeInstanceOps({
      cardDoc: ref(document),
      documentRevision: ref(0),
      blueprintCardId: '__blueprint__',
      selectedCardId,
      selectedCardKeys,
      translate,
      refreshDocumentState: vi.fn(),
      markDocumentChanged: vi.fn(),
    })

    state.handleInstanceAction({
      key: 'one', actionKey: 'duplicate-instance', source: 'context',
    })
    expect(document.instances).toHaveLength(4)
    expect(selectedCardKeys.value).toHaveLength(2)
    state.handleInstanceAction({
      key: selectedCardKeys.value[0]!, actionKey: 'delete-instance', source: 'context',
    })
    expect(document.instances).toHaveLength(2)
    expect(document.dataTable?.exportInstanceIds).toEqual(['one', 'two'])
  })

  it('keeps explicit data-table export selection aligned with Instance lifecycle', () => {
    const document: CardDocument = {
      type: 'card-document',

      id: 'document',
      version: '1.0.0',
      width: '540',
      height: '850',
      faces: {
        front: { type: 'card-face', id: 'front', background: '#FFFFFF', children: [] },
        back: { type: 'card-face', id: 'back', background: '#FFFFFF', children: [] },
      },
      instances: [{ type: 'card-instance', id: 'one', name: 'One', amount: '1', data: {} }],
      dataTable: { blocks: {}, exportInstanceIds: [] },
    }
    const state = useCdeInstanceOps({
      cardDoc: ref(document),
      documentRevision: ref(0),
      blueprintCardId: '__blueprint__',
      selectedCardId: ref('__blueprint__'),
      selectedCardKeys: ref(['__blueprint__']),
      translate,
      refreshDocumentState: vi.fn(),
      markDocumentChanged: vi.fn(),
    })

    state.createInstance()
    const createdId = document.instances[document.instances.length - 1]!.id
    expect(document.dataTable?.exportInstanceIds).toContain(createdId)
    state.duplicateInstance('one')
    const duplicatedId = document.instances[1]!.id
    expect(document.dataTable?.exportInstanceIds).toContain(duplicatedId)
    state.deleteInstance(duplicatedId)
    expect(document.dataTable?.exportInstanceIds).not.toContain(duplicatedId)
  })
})
