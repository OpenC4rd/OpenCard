import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
  type CardInstanceRecord,
} from '../../entities/card/model'
import { useCdeRenderProjection } from './useCdeRenderProjection'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'

function createDocument(): CardDocument {
  const text = createTextBlock({
    id: 'text',
    name: 'Text',
    content: '{{project:name}} {{dictionary:greeting}}',
  })
  const container = createSimpleContainerBlock({ id: 'container', name: 'Container' })
  container.children.push({
    block: text,
    location: { id: 'text-location', type: 'simple-container-location', anchor: 'lt' },
  })
  return {
    type: 'card-document',

    id: 'document',
    name: 'Blueprint',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: [{
          block: container,
          location: { id: 'container-location', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [],
  }
}

function createHarness(document: CardDocument | null = createDocument()) {
  const cardDoc = ref<CardDocument | null>(document)
  const documentRevision = ref(0)
  const instance = ref<CardInstanceRecord | null>(null)
  const activeFaceKey = ref<'front' | 'back'>('front')
  const renderEnvironment = ref({
    project: { name: 'Project', description: '', version: '2.0.0' },
    dictionary: { greeting: 'Hello' },
    projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
  })
  const state = useCdeRenderProjection({
    cardDoc,
    documentRevision,
    instance,
    activeFaceKey,
    resourceRootPath: ref('D:/Project'),
    sourceFilePath: ref('D:/Project/card.ocdocument'),
    renderEnvironment,
  })
  return {
    activeFaceKey,
    cardDoc,
    documentRevision,
    instance,
    renderEnvironment,
    state,
  }
}

describe('useCdeRenderProjection', () => {
  it('returns empty projections when there is no raw document', () => {
    const { state } = createHarness(null)

    expect(state.renderPipelineResult.value).toBeNull()
    expect(state.viewDocument.value).toBeNull()
    expect(state.viewFace.value).toBeNull()
    expect(state.findViewBlock('text')).toBeNull()
  })

  it('passes project and dictionary context through the single pipeline result', () => {
    const { state } = createHarness()
    const block = state.findViewBlock('text')

    expect(block?.type).toBe('text-block')
    if (block?.type !== 'text-block') return
    expect(block.content).toBe('Project Hello')
    expect(state.viewDocument.value).toBe(state.renderPipelineResult.value?.document)
  })

  it('projects the requested instance and reruns after an in-place document revision', () => {
    const document = createDocument()
    const instance: CardInstanceRecord = {
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: { text: { content: 'Instance content' } },
    }
    document.instances.push(instance)
    const harness = createHarness(document)
    harness.instance.value = instance

    const firstResult = harness.state.renderPipelineResult.value
    const firstBlock = harness.state.findViewBlock('text')
    expect(firstBlock?.type === 'text-block' ? firstBlock.content : null).toBe('Instance content')

    instance.data.text!.content = 'Updated instance content'
    harness.documentRevision.value += 1
    expect(harness.state.renderPipelineResult.value).not.toBe(firstResult)
    const updatedBlock = harness.state.findViewBlock('text')
    expect(updatedBlock?.type === 'text-block' ? updatedBlock.content : null)
      .toBe('Updated instance content')
  })

  it('switches the active Face without rebuilding the pipeline result', () => {
    const { activeFaceKey, state } = createHarness()
    const result = state.renderPipelineResult.value

    expect(state.viewFace.value?.id).toBe('front')
    activeFaceKey.value = 'back'
    expect(state.viewFace.value?.id).toBe('back')
    expect(state.renderPipelineResult.value).toBe(result)
    expect(state.findViewBlock('text')).toBeNull()
  })
})
