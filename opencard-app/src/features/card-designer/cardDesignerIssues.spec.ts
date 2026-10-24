import { describe, expect, it } from 'vitest'
import { createTextBlock, type CardDocument, type CardInstanceRecord } from '../../entities/card/model'
import type { RenderPipelineResult } from '../card-rendering/renderPipeline'
import { createCardDesignerIssueSnapshot, createCardDesignerIssues } from './cardDesignerIssues'

const translate = (key: string, parameters: Readonly<Record<string, string | number>> = {}) => (
  `${key}${Object.keys(parameters).length > 0 ? `:${Object.values(parameters).join(',')}` : ''}`
)
const resolveFieldLabel = (key: string) => key

function createDocument(): CardDocument {
  return {
    type: 'card-document',
    id: 'card-doc',
    name: 'Card',
    version: '1.0.0',
    width: '540',
    height: '850',
    instances: [{ type: 'card-instance', id: 'instance-1', name: 'Instance 1', amount: '1', data: {} }],
    faces: {
      front: {
        type: 'card-face', id: 'front', background: '#fff',
        children: [{
          block: createTextBlock({ id: 'title', name: 'Title' }),
          location: { id: 'location-1', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#fff', children: [] },
    },
  }
}

function createResult(): RenderPipelineResult {
  const document = createDocument()
  return {
    document: document as never,
    issues: [{
      id: 'issue-1',
      type: 'card-designer.render-parse.out-of-range',
      severity: 'warning',
      parameters: { defaultValue: '1' },
      location: {
        documentId: document.id,
        instanceId: 'instance-1',
        faceKey: 'front',
        owner: { kind: 'block', id: 'title' },
        blockId: 'title',
        blockPath: 'Container.Title',
        fieldKey: 'opacity',
      },
    }],
  }
}

describe('cardDesignerIssues', () => {
  it('reports an ordered per-card snapshot and clears all scopes without a document', () => {
    const document = createDocument()
    expect(createCardDesignerIssueSnapshot({
      document,
      instance: document.instances[0]!,
      result: createResult(),
      translate,
      resolveFieldLabel,
    })).toMatchObject({
      scopeKey: 'card:instance:instance-1',
      scopeOrder: ['card:blueprint', 'card:instance:instance-1'],
    })

    expect(createCardDesignerIssueSnapshot({
      document: null,
      instance: null,
      result: null,
      translate,
      resolveFieldLabel,
    })).toEqual({ scopeKey: 'card:blueprint', scopeOrder: [], issues: [] })
  })

  it('builds an opaque navigation token for a block-owned issue', () => {
    const instance: CardInstanceRecord = {
      type: 'card-instance', id: 'instance-1', name: 'Instance 1', amount: '1', data: {},
    }
    expect(createCardDesignerIssues(createResult(), instance, translate, resolveFieldLabel)).toEqual([
      expect.objectContaining({
        id: 'issue-1',
        type: 'card-designer.render-parse.out-of-range',
        severity: 'warning',
        navigationToken: {
          protocol: 'card-designer',
          version: 2,
          target: {
            kind: 'property',
            instanceId: 'instance-1',
            faceKey: 'front',
            blockId: 'title',
            owner: 'block',
            fieldKey: 'opacity',
          },
        },
      }),
    ])
  })

  it('routes document-owned issues to the blueprint property projection', () => {
    const result = createResult()
    result.issues[0] = {
      ...result.issues[0]!,
      location: {
        documentId: 'card-doc',
        instanceId: 'instance-1',
        faceKey: null,
        owner: { kind: 'document', id: 'card-doc' },
        fieldKey: 'width',
      },
    }
    const issue = createCardDesignerIssues(
      result,
      createDocument().instances[0]!,
      translate,
      resolveFieldLabel,
    )[0]!

    expect(issue.navigationToken).toMatchObject({
      target: { instanceId: null, owner: 'document', fieldKey: 'width' },
    })
  })

  it('does not expose a navigation token without a stable block id', () => {
    const result = createResult()
    result.issues[0] = {
      ...result.issues[0]!,
      location: {
        documentId: 'card-doc',
        instanceId: null,
        faceKey: 'front',
        owner: { kind: 'block', id: '' },
        fieldKey: 'id',
      },
    }

    expect(createCardDesignerIssues(result, null, translate, resolveFieldLabel)[0])
      .not.toHaveProperty('navigationToken')
  })

  it('keeps the character offset of the failing binding token', () => {
    const result = createResult()
    result.issues[0] = {
      id: 'binding-issue',
      type: 'card-designer.binding.field-not-found',
      severity: 'warning',
      token: '{{self:score}}',
      parameters: { referencedFieldKey: 'score' },
      location: {
        documentId: 'card-doc',
        instanceId: null,
        faceKey: 'front',
        owner: { kind: 'block', id: 'text-block-1234567890' },
        blockId: 'text-block-1234567890',
        blockPath: 'Container.Title',
        fieldKey: 'content',
        characterOffset: 6,
      },
    }

    const issue = createCardDesignerIssues(result, null, translate, resolveFieldLabel)[0]!
    expect(issue.navigationToken).toEqual(expect.objectContaining({
      target: expect.objectContaining({ characterOffset: 6 }),
    }))
  })
})
