import { describe, expect, it } from 'vitest'
import {
  resolveReferenceCompletion,
  type ReferenceCompletionContext,
} from './referenceCompletion'

const parentScopes = [
  { label: '父容器', fields: [{ key: 'width', label: '宽度', valueKind: 'string' as const }] },
  { label: '祖父容器', fields: [{ key: 'width', valueKind: 'string' as const }] },
  { label: '三级祖先', fields: [{ key: 'name', valueKind: 'string' as const }] },
]
const context: ReferenceCompletionContext = {
  targetKind: 'string',
  currentBlock: { label: '当前块', fields: [{ key: 'title', valueKind: 'string' }] },
  currentCard: {
    label: '当前卡片',
    fields: [
      { key: 'name', valueKind: 'string' },
      { key: 'amount', valueKind: 'number' },
    ],
  },
  currentFace: { label: '同面', fields: [{ key: 'background', valueKind: 'string' }] },
  oppositeFace: { label: '异面', fields: [{ key: 'background', valueKind: 'string' }] },
  document: { label: '当前文档', fields: [{ key: 'name', valueKind: 'string' }] },
  project: { label: '当前项目', fields: [{ key: 'author', valueKind: 'string' }] },
  dictionary: { label: '全局字典', fields: [{ key: 'title', valueKind: 'string' }] },
  getAncestor: (depth) => parentScopes[depth - 1],
}

describe('referenceCompletion', () => {
  const cursor = (value: string) => value.indexOf('}}')
  it('suggests root scopes without pre-generating every ancestor token', () => {
    expect(resolveReferenceCompletion('{{}}', 2, context)?.suggestions.map((item) => item.insertText))
      .toEqual(['self:', 'card:', 'face:', 'opposite:', 'document:', 'project:', 'dictionary:', 'parent:'])
  })

  it('offers field selection and continuation for parent chains', () => {
    expect(resolveReferenceCompletion('{{p', 3, context)?.suggestions.map((item) => item.insertText))
      .toEqual(['project:', 'parent:'])
    expect(resolveReferenceCompletion('{{parent}}', cursor('{{parent}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['parent:', 'parent.'])
    expect(resolveReferenceCompletion('{{parent.p', 10, context)?.suggestions.map((item) => item.insertText))
      .toEqual(['parent.parent:'])
    expect(resolveReferenceCompletion('{{parent.}}', cursor('{{parent.}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['parent.parent:', 'parent.parent.'])
    expect(resolveReferenceCompletion('{{parent.parent:wi}}', cursor('{{parent.parent:wi}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['parent.parent:width'])
    expect(resolveReferenceCompletion('{{parent:}}', cursor('{{parent:}}'), context)?.suggestions[0]).toMatchObject({
      label: '宽度',
      detail: 'width',
    })
  })

  it('matches fixed scopes case-insensitively and filters by target kind', () => {
    const numberContext: ReferenceCompletionContext = { ...context, targetKind: 'number' }
    expect(resolveReferenceCompletion('{{CARD:}}', cursor('{{CARD:}}'), numberContext)?.suggestions.map((item) => item.insertText))
      .toEqual(['card:amount'])
  })

  it('offers fields from the project scope', () => {
    expect(resolveReferenceCompletion('{{project:au}}', cursor('{{project:au}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['project:author'])
  })

  it('offers current-block fields through the implicit self shorthand', () => {
    expect(resolveReferenceCompletion('{{ti}}', cursor('{{ti}}'), context)?.suggestions).toContainEqual(
      expect.objectContaining({ insertText: 'title', detail: 'self:title' }),
    )
  })

  it('offers fields from the dictionary scope', () => {
    expect(resolveReferenceCompletion('{{dictionary:ti}}', cursor('{{dictionary:ti}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['dictionary:title'])
  })

  it('restricts completion to explicitly allowed scopes', () => {
    const projectOnlyContext: ReferenceCompletionContext = {
      ...context,
      allowedScopes: ['project'],
    }
    expect(resolveReferenceCompletion('{{}}', 2, projectOnlyContext)?.suggestions.map((item) => item.insertText))
      .toEqual(['project:'])
    expect(resolveReferenceCompletion('{{document:}}', cursor('{{document:}}'), projectOnlyContext)).toBeNull()
    expect(resolveReferenceCompletion('{{project:}}', cursor('{{project:}}'), projectOnlyContext)?.suggestions.map((item) => item.insertText))
      .toEqual(['project:author'])
  })

  it('offers same-face and opposite-face fields', () => {
    expect(resolveReferenceCompletion('{{face:ba}}', cursor('{{face:ba}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['face:background'])
    expect(resolveReferenceCompletion('{{opposite:ba}}', cursor('{{opposite:ba}}'), context)?.suggestions.map((item) => item.insertText))
      .toEqual(['opposite:background'])
  })

})
