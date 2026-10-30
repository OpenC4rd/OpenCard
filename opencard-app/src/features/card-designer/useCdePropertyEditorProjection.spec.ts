// @vitest-environment node
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import { buildParentLookup } from '../../entities/card/tree'
import type { CardPropertyEditorInput } from '../card-properties/cardPropertyFieldDefinitions'
import { useCdePropertyEditorProjection } from './useCdePropertyEditorProjection'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'

function createHarness(resourceEnvironment = ref<ProjectResourceEnvironment>()) {
  const text = createTextBlock({
    id: 'text',
    name: 'Text',
    content: 'Instance content',
    fontFamily: 'font:body; Arial; sans-serif',
    fontSize: '4mm',
  })
  const parent = createSimpleContainerBlock({ id: 'parent', name: 'Parent' })
  parent.children.push({
    block: text,
    location: { id: 'text-location', type: 'simple-container-location', anchor: 'lt' },
  })
  const document: CardDocument = {
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
          block: parent,
          location: { id: 'parent-location', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [{
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: { text: { content: 'Instance content' } },
    }],
  }
  const rawPropertyInputs = ref<readonly CardPropertyEditorInput[]>([{
    key: text.id,
    record: { ...text, source: '' } as unknown as Record<string, unknown>,
    fields: {
      content: { fieldType: 'richText', title: 'Content' },
      fontFamily: { fieldType: 'fontFamily', title: 'Font family' },
      source: { fieldType: 'imageSource', title: 'Source' },
      optional: { fieldType: 'string', title: 'Optional' },
    },
  }])
  const documentRevision = ref(0)
  const state = useCdePropertyEditorProjection({
    cardDoc: ref(document),
    documentRevision,
    activeFaceKey: ref('front'),
    selectedCardId: ref('instance'),
    selectedBlock: ref(text),
    parentLookup: ref(buildParentLookup(document)),
    rawPropertyInputs,
    projectContext: computed(() => ({
      resourceEnvironment: resourceEnvironment.value,
      fonts: {
        body: {
          kind: 'family' as const,
          name: 'Body Font',
          family: {
            key: 'body',
            name: 'Body Font',
            files: { normal: { upright: 'fonts/body.woff2' } },
          },
        },
      },
      information: { name: 'Project', description: 'Description', version: '2.0.0' },
      dictionary: { greeting: 'Hello' },
    })),
    blueprintCardId: '__blueprint__',
    translate: (key, parameters) => parameters?.depth ? `${key}:${parameters.depth}` : key,
    hasMessage: () => false,
  })
  return { state, documentRevision, rawPropertyInputs }
}

async function completionItems(
  provider: ((request: { value: string; cursor: number }) => unknown) | undefined,
  value: string,
  cursor: number,
) {
  const result = await Promise.resolve(provider?.({ value, cursor })) as {
    items: Array<{ insertText: string; value?: unknown }>
  } | null
  return result?.items ?? []
}

describe('useCdePropertyEditorProjection', () => {
  it('builds instance, parent, project, and dictionary binding scopes', async () => {
    const { state } = createHarness()
    const definition = state.propertyEditorInputs.value[0]!.fields.content!
    const provider = definition.completion?.provider

    expect((await completionItems(provider, '{{card:}}', 7)).map(item => item.insertText))
      .toContain('card:name')
    expect((await completionItems(provider, '{{card:}}', 7)).map(item => item.insertText))
      .not.toContain('card:version')
    expect((await completionItems(provider, '{{parent:}}', 9)).map(item => item.insertText))
      .toContain('parent:name')
    expect((await completionItems(provider, '{{project:}}', 10)).map(item => item.insertText))
      .toContain('project:version')
    expect((await completionItems(provider, '{{dictionary:}}', 13)).map(item => item.insertText))
      .toContain('dictionary:greeting')
  })

  it('computes rich-text base styles from the record without embedding resource catalogs on fields', () => {
    const { state } = createHarness()
    const fields = state.propertyEditorInputs.value[0]!.fields
    expect(fields.content).toMatchObject({
      fieldType: 'richText',
      richTextBaseStyle: {
        fontFamily: '"OpenCardProjectFont-body", Arial, sans-serif',
        fontSize: '4mm',
      },
    })
  })

  it('does not invent binding context for schema fields absent from the record', () => {
    const { state } = createHarness()
    const definition = state.propertyEditorInputs.value[0]!.fields.optional

    expect(definition?.binding).toBeUndefined()
    expect(definition?.completion).toBeUndefined()
  })
})
