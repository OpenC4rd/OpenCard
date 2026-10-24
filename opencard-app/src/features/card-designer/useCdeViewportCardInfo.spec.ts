import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
  type CardBlock,
  type CardDocument,
  type CardFaceKey,
  type CardInstanceRecord,
  type RootChild,
} from '../../entities/card/model'
import type {
  RenderReadyCardDocument,
  RenderReadyCardFace,
} from '../card-rendering/render.types'
import { useCdeViewportCardInfo } from './useCdeViewportCardInfo'

type ViewportCardInfoState = ReturnType<typeof useCdeViewportCardInfo>

const BLUEPRINT_CARD_ID = '__blueprint__'

const infoMessages: Record<string, string> = {
  'cardDesigner.info.descriptionValue': 'desc({description})',
  'cardDesigner.info.instanceTotal': 'instances({count})',
  'cardDesigner.info.instancePosition': 'instance({name} {index}/{total})',
  'cardDesigner.info.front': 'Front Face',
  'cardDesigner.info.back': 'Back Face',
  'cardDesigner.info.blockTotal': 'blocks({count})',
  'cardDesigner.info.widthValue': 'width({value})',
  'cardDesigner.info.heightValue': 'height({value})',
}

function translate(messageKey: string, parameters?: Record<string, unknown>): string {
  const template = infoMessages[messageKey] ?? messageKey
  return template.replace(/\{(\w+)\}/g, (token, name: string) => (
    parameters && name in parameters ? String(parameters[name]) : token
  ))
}

function rootChild(block: CardBlock): RootChild {
  return {
    block,
    location: { id: `${block.id}-location`, type: 'simple-container-location', anchor: 'lt' },
  }
}

function createRawDocument(): CardDocument {
  const container = createSimpleContainerBlock({ id: 'container', name: 'Container' })
  container.children.push(rootChild(createTextBlock({ id: 'text-1', name: 'Text 1', content: 'One' })))
  container.children.push(rootChild(createTextBlock({ id: 'text-2', name: 'Text 2', content: 'Two' })))
  return {
    type: 'card-document',

    id: 'document',
    name: 'Document',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: [
          rootChild(container),
          rootChild(createTextBlock({ id: 'front-flat', name: 'Flat', content: 'Flat' })),
        ],
      },
      back: {
        type: 'card-face',
        id: 'back',
        background: '#000',
        children: [rootChild(createTextBlock({ id: 'back-text', name: 'Back', content: 'Back' }))],
      },
    },
    instances: [{
      type: 'card-instance',
      id: 'instance-1',
      name: 'Instance 1',
      amount: '1',
      data: {},
    }],
  }
}

function createViewFace(faceKey: CardFaceKey, width: number, height: number): RenderReadyCardFace {
  return {
    type: 'card-face',
    id: faceKey,
    faceKey,
    width,
    height,
    background: '#fff',
    children: [],
  }
}

function createViewDocument(): RenderReadyCardDocument {
  return {
    type: 'card-document',
    id: 'document',
    name: 'Document',
    version: '1.0.0',
    description: 'Reusable hero\ncard.',
    notes: 'Review print\nmargins.',
    faces: {
      front: createViewFace('front', 540, 850),
      back: createViewFace('back', 500, 800),
    },
  }
}

function createHarness() {
  const cardDoc = ref<CardDocument | null>(createRawDocument())
  const activeFaceKey = ref<CardFaceKey>('front')
  const selectedCardId = ref<string | null>(BLUEPRINT_CARD_ID)
  const selectedCard = computed<CardInstanceRecord | null>(() => (
    cardDoc.value?.instances.find(instance => instance.id === selectedCardId.value) ?? null
  ))
  const viewDocument = ref<RenderReadyCardDocument | null>(createViewDocument())
  const viewFace = computed<RenderReadyCardFace | null>(() => (
    viewDocument.value?.faces[activeFaceKey.value] ?? null
  ))
  const resourceRootPath = ref<string | null | undefined>(null)
  const filePath = ref('cards/hero.ocdocument')
  const fileName = ref<string | undefined>('hero.ocdocument')

  let state!: ViewportCardInfoState
  const Host = defineComponent({
    setup() {
      state = useCdeViewportCardInfo({
        cardDoc,
        activeFaceKey,
        selectedCardId,
        selectedCard,
        viewDocument,
        viewFace,
        resourceRootPath,
        filePath,
        fileName,
        blueprintCardId: BLUEPRINT_CARD_ID,
        translate,
      })
      return () => h('div')
    },
  })

  const wrapper = mount(Host)
  return {
    activeFaceKey,
    cardDoc,
    filePath,
    fileName,
    resourceRootPath,
    selectedCardId,
    state,
    viewDocument,
    wrapper,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCdeViewportCardInfo', () => {
  it('falls back to the file name and then to the raw path when no relative path resolves', async () => {
    const { fileName, filePath, resourceRootPath, state, wrapper } = createHarness()

    resourceRootPath.value = 'D:/Project'
    filePath.value = 'D:/Project/cards/hero.ocdocument'
    expect(state.viewportCardInfo.value[0]?.value).toBe('cards/hero.ocdocument')

    resourceRootPath.value = null
    filePath.value = 'draft://53e4786d-a867'
    expect(state.viewportCardInfo.value[0]?.value).toBe('hero.ocdocument')

    fileName.value = undefined
    expect(state.viewportCardInfo.value[0]?.value).toBe('53e4786d-a867')

    await nextTick()
    wrapper.unmount()
  })

  it('adds the selected instance row and follows the active face', async () => {
    const { activeFaceKey, selectedCardId, state, wrapper } = createHarness()

    selectedCardId.value = 'instance-1'
    await nextTick()
    expect(state.viewportCardInfo.value.map(item => item.key)).toEqual([
      'fileName',
      'document',
      'description',
      'instanceCount',
      'instance',
      'face',
      'blockCount',
      'notes',
    ])
    expect(state.viewportCardInfo.value[4]).toEqual({
      key: 'instance',
      value: 'instance(Instance 1 1/1)',
      separated: true,
    })

    activeFaceKey.value = 'back'
    await nextTick()
    expect(state.viewportCardInfo.value[5]).toEqual({
      key: 'face',
      value: 'Back Face',
      separated: true,
    })
    expect(state.viewportCardInfo.value[6]).toEqual({ key: 'blockCount', value: 'blocks(1)' })
    expect(state.viewportCardDimensions.value).toEqual({
      width: 'width(500)',
      height: 'height(800)',
    })

    wrapper.unmount()
  })

  it('marks every changed key and clears it when the highlight window elapses', async () => {
    const { activeFaceKey, filePath, state, wrapper } = createHarness()

    expect(state.highlightedInfoKeys.value.size).toBe(0)

    filePath.value = 'cards/other.ocdocument'
    await nextTick()
    expect([...state.highlightedInfoKeys.value]).toEqual(['fileName'])

    vi.advanceTimersByTime(899)
    expect(state.highlightedInfoKeys.value.has('fileName')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(state.highlightedInfoKeys.value.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    activeFaceKey.value = 'back'
    await nextTick()
    expect([...state.highlightedInfoKeys.value].sort()).toEqual([
      'blockCount',
      'face',
      'height',
      'width',
    ])

    vi.advanceTimersByTime(900)
    expect(state.highlightedInfoKeys.value.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    wrapper.unmount()
  })

  it('clears its own highlight timers on unmount so a remount cannot keep them', async () => {
    const first = createHarness()
    first.filePath.value = 'cards/other.ocdocument'
    await nextTick()
    expect(first.state.highlightedInfoKeys.value.has('fileName')).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    first.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    // The cleared timer never fires, so nothing removes the key it had marked.
    vi.advanceTimersByTime(900)
    expect(first.state.highlightedInfoKeys.value.has('fileName')).toBe(true)

    const second = createHarness()
    expect(vi.getTimerCount()).toBe(0)
    second.filePath.value = 'cards/second.ocdocument'
    await nextTick()
    expect(vi.getTimerCount()).toBe(1)
    expect(second.state.highlightedInfoKeys.value.has('fileName')).toBe(true)

    vi.advanceTimersByTime(900)
    expect(second.state.highlightedInfoKeys.value.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    second.wrapper.unmount()
  })
})
