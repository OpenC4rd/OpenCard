// @vitest-environment node
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import { buildParentLookup } from '../../entities/card/tree'
import type { CardPropertyFieldDefinition } from '../card-properties/cardPropertyFieldDefinitions'
import type { CdePropertyProjectContext } from './cdePropertyFieldEnrichment'
import { useCdeDataTableCellProjection } from './useCdeDataTableCellProjection'

function createHarness() {
  const text = createTextBlock({ id: 'text', name: 'Text', content: 'Blueprint content' })
  const parent = createSimpleContainerBlock({ id: 'parent', name: 'Parent' })
  ;(parent as unknown as Record<string, unknown>).tag = 'blueprint-parent'
  parent.additionalFieldDefinition = { tag: { fieldType: 'string', title: 'Tag' } }
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
      data: {
        text: { content: 'Instance content' },
        parent: {
          additionalFieldDefinition: {
            instanceOnly: { fieldType: 'string', title: 'Instance only' },
          },
          instanceOnly: 'instance-parent',
        },
      },
    }],
  }
  const cardDoc = ref<CardDocument | null>(document)
  const documentRevision = ref(0)
  const projectContext = ref<CdePropertyProjectContext>({
    fonts: null,
    information: { name: 'Project', description: '', version: '2.0.0' },
    dictionary: { greeting: 'Hello' },
  })
  const locale = ref('en-US')
  const state = useCdeDataTableCellProjection({
    cardDoc,
    documentRevision,
    parentLookup: ref(buildParentLookup(document)),
    projectContext,
    locale,
    blueprintCardId: '__blueprint__',
    translate: (key, parameters) => parameters?.depth ? `${key}:${parameters.depth}` : key,
    hasMessage: () => false,
  })
  return {
    cardDoc,
    documentRevision,
    locale,
    projectContext,
    state,
  }
}

const contentField = {
  key: 'content',
  definition: { fieldType: 'string', title: 'Content' } satisfies CardPropertyFieldDefinition,
}

async function completionInsertTexts(
  definition: ReturnType<ReturnType<typeof createHarness>['state']['getDataTableCellDefinition']>,
  value: string,
  cursor: number,
) {
  const result = await Promise.resolve(definition.completion?.provider?.({ value, cursor }))
  return result?.items.map(item => item.insertText) ?? []
}

describe('useCdeDataTableCellProjection', () => {
  it('builds binding scopes from each Cell column card instead of current selection', async () => {
    const { state } = createHarness()
    const blueprint = state.getDataTableCellDefinition('text', contentField, {
      cardId: '__blueprint__',
      identity: 'blueprint\0text\0content',
    })
    const instance = state.getDataTableCellDefinition('text', contentField, {
      cardId: 'instance',
      identity: 'instance\0text\0content',
    })

    expect(await completionInsertTexts(blueprint, '{{card:}}', 7)).toContain('card:version')
    expect(await completionInsertTexts(instance, '{{card:}}', 7)).not.toContain('card:version')
    expect(await completionInsertTexts(instance, '{{card:}}', 7)).toContain('card:name')
    expect(await completionInsertTexts(blueprint, '{{parent:}}', 9)).not.toContain('parent:instanceOnly')
    expect(await completionInsertTexts(instance, '{{parent:}}', 9)).toContain('parent:instanceOnly')
  })

  it('makes non-overridable instance fields readonly without changing blueprint fields', () => {
    const { state } = createHarness()
    const nameField = {
      key: 'name',
      definition: { fieldType: 'string', title: 'Name' } satisfies CardPropertyFieldDefinition,
    }
    const blueprint = state.getDataTableCellDefinition('text', nameField, {
      cardId: '__blueprint__',
      identity: 'blueprint\0text\0name',
    })
    const instance = state.getDataTableCellDefinition('text', nameField, {
      cardId: 'instance',
      identity: 'instance\0text\0name',
    })

    expect(blueprint.isReadonly).not.toBe(true)
    expect(instance.isReadonly).toBe(true)
    expect(instance.resettable).toBe(false)
  })

  it('reuses definitions until a cache context dependency changes', () => {
    const { documentRevision, locale, projectContext, state } = createHarness()
    const cell = { cardId: 'instance', identity: 'instance\0text\0content' }
    let previous = state.getDataTableCellDefinition('text', contentField, cell)
    expect(state.getDataTableCellDefinition('text', contentField, cell)).toBe(previous)

    documentRevision.value += 1
    let next = state.getDataTableCellDefinition('text', contentField, cell)
    expect(next).not.toBe(previous)
    previous = next

    locale.value = 'zh-CN'
    next = state.getDataTableCellDefinition('text', contentField, cell)
    expect(next).not.toBe(previous)
    previous = next

    projectContext.value = { ...projectContext.value, dictionary: { farewell: 'Bye' } }
    next = state.getDataTableCellDefinition('text', contentField, cell)
    expect(next).not.toBe(previous)
  })

  it('does no eager work and returns an invalid Block fallback without caching it', () => {
    const { cardDoc, state } = createHarness()
    const definition = { fieldType: 'string', title: 'Missing' } satisfies CardPropertyFieldDefinition

    expect(state.getDataTableCellDefinition('missing', { key: 'content', definition }, {
      cardId: '__blueprint__',
      identity: 'blueprint\0missing\0content',
    })).toBe(definition)

    cardDoc.value = null
    expect(state.getDataTableCellDefinition('missing', { key: 'content', definition }, {
      cardId: '__blueprint__',
      identity: 'blueprint\0missing\0content',
    })).toBe(definition)
  })
})
