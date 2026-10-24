// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  findActiveBindingToken,
  isBindingStartEscaped,
  parseBindingScopeToken,
  parseFieldReference,
} from './bindingExpression'

describe('binding expression grammar', () => {
  it('parses fixed and arbitrary parent scopes', () => {
    expect(parseBindingScopeToken('SELF')).toEqual({ kind: 'current-block' })
    expect(parseBindingScopeToken('project')).toEqual({ kind: 'project' })
    expect(parseFieldReference('title')).toEqual({ kind: 'current-block', fieldKey: 'title' })
    expect(parseFieldReference('')).toBeNull()
    expect(parseFieldReference('dictionary:title')).toEqual({ kind: 'dictionary', fieldKey: 'title' })
    expect(parseBindingScopeToken('globalvariables')).toBeNull()
    expect(parseFieldReference('globalpalettes.brand:accent')).toBeNull()
    expect(parseBindingScopeToken('face')).toEqual({ kind: 'current-face' })
    expect(parseBindingScopeToken('OPPOSITE')).toEqual({ kind: 'opposite-face' })
    expect(parseBindingScopeToken('parent.parent.parent')).toEqual({ kind: 'parent', parentDepth: 3 })
    expect(parseFieldReference('parent.parent:width')).toEqual({
      kind: 'parent',
      parentDepth: 2,
      fieldKey: 'width',
    })
  })

  it('finds only the binding token containing the cursor', () => {
    expect(findActiveBindingToken('Value {{parent.parent:wi}}', 24)).toEqual({
      body: 'parent.parent:wi',
      bodyStart: 8,
      cursor: 24,
    })
    expect(findActiveBindingToken('Value {{done}} tail', 19)).toBeNull()
    expect(findActiveBindingToken('Value \\{{literal', 16)).toBeNull()
    expect(findActiveBindingToken('Value \\\\{{name', 14)).toEqual({
      body: 'name',
      bodyStart: 10,
      cursor: 14,
    })
    expect(isBindingStartEscaped('\\{{literal}}', 1)).toBe(true)
    expect(isBindingStartEscaped('\\\\{{name}}', 2)).toBe(false)
  })
})
