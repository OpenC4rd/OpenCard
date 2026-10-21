import { describe, expect, it } from 'vitest'
import {
  clearBlockFieldValue,
  createBlockAdditionalField,
  createTextBlock,
  createSimpleContainerBlock,
  removeBlockAdditionalFieldDefinition,
  type CardDocument,
  type CardBlock,
  type CardInstanceRecord,
} from '../../entities/card/model'
import { applyInstance } from '../../entities/card/instance'
import { resolveReferences } from './resolveCardBindings'

function createDocument(block: CardBlock = createTextBlock({ id: 'text', content: '' })): CardDocument {
  return {
    type: 'card-document',

    id: 'document',
    name: 'Document',
    version: '1.0.0',
    width: '540',
    height: '850',
    instances: [],
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#FFFFFF',
        children: [{
          block,
          location: { id: 'location', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
    },
  }
}

describe('card additional fields and bindings', () => {
  it('resolves a parent custom boolean field into child visibility', () => {
    const child = createTextBlock({
      id: 'child',
      visible: '{{parent:showsuit}}',
    })
    const parent = createSimpleContainerBlock({
      id: 'parent',
      children: [{
        block: child,
        location: { id: 'child-location', type: 'simple-container-location', anchor: 'lt' },
      }],
    })
    parent.additionalFieldDefinition = { showsuit: { fieldType: 'boolean' } }
    ;(parent as unknown as Record<string, unknown>).showsuit = 'true'

    const result = resolveReferences(createDocument(parent))
    const resolvedParent = result.document.faces.front.children[0]!.block
    if (resolvedParent.type !== 'simple-container-block') throw new Error('Expected container')

    expect(result.issues).toEqual([])
    expect(resolvedParent.children[0]!.block).toMatchObject({ visible: 'true' })
  })

  it('resolves rich-text HTML with the ordinary string template path', () => {
    const block = createTextBlock({
      id: 'text', content: '<p><mark style="background-color: {{self:color}}">{{self:label}}</mark></p>',
    })
    ;(block as unknown as Record<string, unknown>).color = '#ff0000'
    ;(block as unknown as Record<string, unknown>).label = 'Ready'
    block.additionalFieldDefinition = { color: { fieldType: 'color' }, label: { fieldType: 'string' } }
    const result = resolveReferences(createDocument(block))
    expect(result.document.faces.front.children[0]?.block).toMatchObject({
      content: '<p><mark style="background-color: #ff0000">Ready</mark></p>',
    })
  })
  it('resolves parent references when runtime owner IDs contain namespace separators', () => {
    const child = createTextBlock({
      id: 'host::block:child::block:label',
      content: '{{parent:title}} / {{parent.parent:title}}',
    })
    const parent = createSimpleContainerBlock({
      id: 'host::block:container',
      children: [{
        block: child,
        location: {
          id: 'host::location:child',
          type: 'simple-container-location',
          anchor: 'lt',
        },
      }],
    })
    parent.additionalFieldDefinition = { title: { fieldType: 'string' } }
    ;(parent as unknown as Record<string, unknown>).title = 'Resolved parent'
    const grandparent = createSimpleContainerBlock({
      id: 'host::block:grandparent',
      children: [{
        block: parent,
        location: {
          id: 'host::location:parent',
          type: 'simple-container-location',
          anchor: 'lt',
        },
      }],
    })
    grandparent.additionalFieldDefinition = { title: { fieldType: 'string' } }
    ;(grandparent as unknown as Record<string, unknown>).title = 'Resolved grandparent'

    const result = resolveReferences(createDocument(grandparent))
    const resolvedGrandparent = result.document.faces.front.children[0]!.block
    if (resolvedGrandparent.type !== 'simple-container-block') throw new Error('Expected container')
    const resolvedParent = resolvedGrandparent.children[0]!.block
    if (resolvedParent.type !== 'simple-container-block') throw new Error('Expected nested container')
    expect(result.issues).toEqual([])
    expect(resolvedParent.children[0]!.block).toMatchObject({
      content: 'Resolved parent / Resolved grandparent',
    })
  })

  it('resolves a parent field into a rich-text icon path attribute', () => {
    const child = createTextBlock({
      id: 'child',
      content: '<p><span data-oc-icon-path="{{parent:suit}}"></span></p>',
    })
    const parent = createSimpleContainerBlock({
      id: 'parent',
      children: [{
        block: child,
        location: { id: 'child-location', type: 'simple-container-location', anchor: 'lt' },
      }],
    })
    parent.additionalFieldDefinition = { suit: { fieldType: 'string' } }
    ;(parent as unknown as Record<string, unknown>).suit = 'hua-se/fang-kuai'

    const result = resolveReferences(createDocument(parent))
    const resolvedParent = result.document.faces.front.children[0]!.block
    if (resolvedParent.type !== 'simple-container-block') throw new Error('Expected container')
    expect(result.issues).toEqual([])
    expect(resolvedParent.children[0]!.block).toMatchObject({
      content: '<p><span data-oc-icon-path="hua-se/fang-kuai"></span></p>',
    })
  })

  it('resolves current-block additional fields into string and number targets', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:label}}' })
    block.additionalFieldDefinition = {
      label: { fieldType: 'string', title: 'Label' },
      strength: { fieldType: 'number' },
    }
    ;(block as unknown as Record<string, unknown>).label = 'Power'
    ;(block as unknown as Record<string, unknown>).strength = '0.5'
    ;(block as unknown as Record<string, unknown>).opacity = '{{self:strength}}'

    const result = resolveReferences(createDocument(block))
    const resolved = result.document.faces.front.children[0]!.block

    expect(result.issues).toEqual([])
    expect(resolved).toMatchObject({ content: 'Power', opacity: '0.5' })
    expect(resolved.additionalFieldDefinition).toEqual(block.additionalFieldDefinition)
    expect(resolved.additionalFieldDefinition).not.toBe(block.additionalFieldDefinition)
  })

  it('preserves rich-text marks while replacing a binding node label', () => {
    const block = createTextBlock({
      id: 'text',
      content: '<p>Score: <span style="color: rgb(255, 0, 0);"><strong><span data-oc-binding="self:label">{{self:label}}</span></strong></span></p>',
    })
    block.additionalFieldDefinition = { label: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).label = 'Power'

    const result = resolveReferences(createDocument(block))
    const resolved = result.document.faces.front.children[0]!.block

    expect(result.issues).toEqual([])
    expect(resolved).toMatchObject({
      content: '<p>Score: <span style="color: rgb(255, 0, 0);"><strong><span data-oc-binding="self:label">Power</span></strong></span></p>',
    })
  })

  it('treats rich-text HTML as an ordinary string template', () => {
    const block = createTextBlock({
      id: 'text',
      content: '<p title="{{self:label}}">Legacy {{self:label}} <strong><span data-oc-binding="self:label">{{self:other}}</span></strong></p>',
    })
    block.additionalFieldDefinition = { label: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).label = 'Power'
    ;(block as unknown as Record<string, unknown>).other = 'Other'
    block.additionalFieldDefinition.other = { fieldType: 'string' }

    const result = resolveReferences(createDocument(block))
    const resolved = result.document.faces.front.children[0]!.block

    expect(result.issues).toEqual([])
    expect(resolved).toMatchObject({
      content: '<p title="Power">Legacy Power <strong><span data-oc-binding="self:label">Other</span></strong></p>',
    })
  })

  it('can preserve selected references while resolving the remaining external values', () => {
    const block = createTextBlock({
      id: 'text',
      width: '{{self:size}}',
      content: '<p><span data-oc-binding="self:label">{{self:label}}</span> / {{project:name}}</p>',
    })
    block.additionalFieldDefinition = {
      size: { fieldType: 'number' },
      label: { fieldType: 'string' },
    }
    ;(block as unknown as Record<string, unknown>).size = '120'
    ;(block as unknown as Record<string, unknown>).label = 'Square'

    const result = resolveReferences(createDocument(block), {
      project: { name: 'Demo', description: '', version: '' },
      preserveReference: ({ reference }) => reference.kind === 'current-block',
    })
    const resolved = result.document.faces.front.children[0]!.block

    expect(result.issues).toEqual([])
    expect(resolved).toMatchObject({
      width: '{{self:size}}',
      content: '<p><span data-oc-binding="self:label">{{self:label}}</span> / Demo</p>',
    })
  })

  it('treats a reference without a colon as a current-block field', () => {
    const block = createTextBlock({ id: 'text', content: '{{label}}' })
    block.additionalFieldDefinition = { label: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).label = 'Short form'

    const result = resolveReferences(createDocument(block))

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({ content: 'Short form' })
  })

  it('fully expands dictionary values in the original block context', () => {
    const block = createTextBlock({ id: 'text', content: '{{dictionary:greeting}}' })
    block.additionalFieldDefinition = { name: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).name = 'OpenCard'

    const result = resolveReferences(createDocument(block), {
      dictionary: { greeting: 'Hello {{name}}' },
    })

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({
      content: 'Hello OpenCard',
    })
  })

  it('renders an escaped binding opener as literal text', () => {
    const block = createTextBlock({
      id: 'text',
      content: '\\{{name}} / {{name}} / {{dictionary:literal}}',
    })
    block.additionalFieldDefinition = { name: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).name = 'OpenCard'

    const result = resolveReferences(createDocument(block), {
      dictionary: { literal: '\\{{name}}' },
    })

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({
      content: '{{name}} / OpenCard / {{name}}',
    })
  })

  it('fully expands nested dictionary and project references', () => {
    const block = createTextBlock({ id: 'text', content: '{{dictionary:heading}}' })

    const result = resolveReferences(createDocument(block), {
      project: { name: 'Demo', description: '', version: '' },
      dictionary: {
        heading: '{{dictionary:prefix}} / {{project:name}}',
        prefix: 'Welcome',
      },
    })

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({
      content: 'Welcome / Demo',
    })
  })

  it('reports dictionary cycles without partially replacing the owner field', () => {
    const block = createTextBlock({ id: 'text', content: '{{dictionary:first}}' })

    const result = resolveReferences(createDocument(block), {
      dictionary: {
        first: '{{dictionary:second}}',
        second: '{{dictionary:first}}',
      },
    })

    expect(result.document.faces.front.children[0]!.block).toMatchObject({
      content: '{{dictionary:first}}',
    })
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'card-designer.binding.cycle',
      token: '{{dictionary:first}}',
      parameters: {
        ownerType: 'dictionary',
        referencedFieldKey: 'first',
      },
    }))
  })

  it('reports explicitly hidden references without binding type diagnostics', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:type}}' })
    block.additionalFieldDefinition = { label: { fieldType: 'string' } }
    ;(block as unknown as Record<string, unknown>).label = 'not-a-number'
    ;(block as unknown as Record<string, unknown>).opacity = '{{self:label}}'

    const result = resolveReferences(createDocument(block))

    expect(result.issues.map((issue) => issue.type)).toEqual(['card-designer.binding.field-not-allowed'])
  })

  it('passes mixed interpolation through and detects additional-field cycles', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:first}}' })
    block.additionalFieldDefinition = {
      first: { fieldType: 'string' },
      second: { fieldType: 'string' },
      strength: { fieldType: 'number' },
    }
    ;(block as unknown as Record<string, unknown>).first = '{{self:second}}'
    ;(block as unknown as Record<string, unknown>).second = '{{self:first}}'
    ;(block as unknown as Record<string, unknown>).strength = '0.5'
    ;(block as unknown as Record<string, unknown>).opacity = '0.{{self:strength}}'

    const result = resolveReferences(createDocument(block))

    expect(result.issues.map((issue) => issue.type)).toEqual(['card-designer.binding.cycle'])
  })

  it('passes ordinary boolean and number literals without binding diagnostics', () => {
    const block = createTextBlock({ id: 'text', visible: 'true', scaleX: '1.25' })

    const result = resolveReferences(createDocument(block))

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({
      visible: 'true',
      scaleX: '1.25',
    })
  })

  it('allows schema-external scalar fields by default', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:externalValue}}' })
    ;(block as unknown as Record<string, unknown>).externalValue = 'External'

    const result = resolveReferences(createDocument(block))

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({ content: 'External' })
  })

  it('projects additional field overrides directly onto the block root', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:score}}' })
    block.additionalFieldDefinition = { score: { fieldType: 'number' } }
    ;(block as unknown as Record<string, unknown>).score = '10'
    const document = createDocument(block)
    const instance: CardInstanceRecord = {
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: { text: { score: '24' } },
    }

    const projected = applyInstance(document, instance)
    const projectedBlock = projected.faces.front.children[0]!.block

    expect((projectedBlock as unknown as Record<string, unknown>).score).toBe('24')
    expect(projectedBlock.additionalFieldDefinition?.score).toEqual({ fieldType: 'number' })
    expect(resolveReferences(projected).document.faces.front.children[0]!.block).toMatchObject({ content: '24' })
  })

  it('validates creation and clears the stored value without deleting the definition', () => {
    const block = createTextBlock({ id: 'text' })
    const document = createDocument(block)
    document.instances = [{
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: { text: { score: '8' } },
    }]

    expect(createBlockAdditionalField(block, '1bad', { fieldType: 'number' })).toBe('invalid')
    expect(createBlockAdditionalField(block, 'content', { fieldType: 'number' })).toBe('duplicate')
    expect(createBlockAdditionalField(block, 'score', { fieldType: 'number', title: 'Score' })).toBeNull()
    expect(block.additionalFieldDefinition?.score).toEqual({ fieldType: 'number', title: 'Score' })
    expect((block as unknown as Record<string, unknown>).score).toBe('0')
    clearBlockFieldValue(block, 'score')
    expect(block.additionalFieldDefinition?.score).toEqual({ fieldType: 'number', title: 'Score' })
    expect((block as unknown as Record<string, unknown>).score).toBeUndefined()
    expect(document.instances[0]!.data.text?.score).toBe('8')
    expect(removeBlockAdditionalFieldDefinition(document, block, 'score')).toBe(true)
    expect(block.additionalFieldDefinition).toBeUndefined()
    expect(document.instances[0]!.data.text).toBeUndefined()
  })

  it('keeps existing expressions diagnostic after removing their custom field definition', () => {
    const block = createTextBlock({ id: 'text', content: '{{self:score}}' })
    block.additionalFieldDefinition = { score: { fieldType: 'number' } }
    ;(block as unknown as Record<string, unknown>).score = '10'
    const document = createDocument(block)

    removeBlockAdditionalFieldDefinition(document, block, 'score')
    const result = resolveReferences(document)

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card-designer.binding.field-not-found',
        severity: 'warning',
        token: '{{self:score}}',
        location: expect.objectContaining({
          documentId: 'document',
          instanceId: null,
          owner: { kind: 'block', id: 'text' },
          blockId: 'text',
          fieldKey: 'content',
        }),
      }),
    ]))
  })

  it('records the zero-based character offset of the failing binding token', () => {
    const block = createTextBlock({ id: 'text', content: '😀 Hello {{self:missing}}!' })
    const result = resolveReferences(createDocument(block))

    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'card-designer.binding.field-not-found',
      token: '{{self:missing}}',
      location: expect.objectContaining({
        fieldKey: 'content',
        characterOffset: 8,
      }),
    }))
  })

  it('resolves same-face and opposite-face properties within each face subtree', () => {
    const document = createDocument(createTextBlock({ id: 'front-text', content: '{{face:background}} / {{opposite:background}}' }))
    document.faces.back.children = [{
      block: createTextBlock({ id: 'back-text', content: '{{face:background}} / {{opposite:background}}' }),
      location: { id: 'back-location', type: 'simple-container-location', anchor: 'lt' },
    }]

    const result = resolveReferences(document)

    expect(result.issues).toEqual([])
    expect(result.document.faces.front.children[0]!.block).toMatchObject({ content: '#FFFFFF / #000000' })
    expect(result.document.faces.back.children[0]!.block).toMatchObject({ content: '#000000 / #FFFFFF' })
  })

  it('rejects face references from project-only document fields and detects cross-face cycles', () => {
    const document = createDocument()
    document.name = '{{face:background}}'
    document.faces.front.background = '{{opposite:background}}'
    document.faces.back.background = '{{opposite:background}}'

    const result = resolveReferences(document)

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card-designer.binding.field-not-allowed',
        location: expect.objectContaining({ owner: { kind: 'document', id: 'document' }, faceKey: null }),
        parameters: { referencedScope: 'current-face' },
      }),
      expect.objectContaining({
        type: 'card-designer.binding.cycle',
        location: expect.objectContaining({ faceKey: expect.stringMatching(/front|back/) }),
      }),
    ]))
  })
})
