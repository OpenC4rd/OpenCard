// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  getEditorResourceRelativePath,
  isRemoteResourceAllowed,
} from './editorResource'

describe('editorResource', () => {
  it('allows only HTTPS URLs matching the project host allowlist', () => {
    const policy = {
      mode: 'allowlist' as const,
      allowedHosts: ['images.example.com', '*.cdn.example.com'],
    }
    expect(isRemoteResourceAllowed('https://images.example.com/portrait.png', policy)).toBe(true)
    expect(isRemoteResourceAllowed('https://a.cdn.example.com/portrait.png', policy)).toBe(true)
    expect(isRemoteResourceAllowed('https://cdn.example.com/portrait.png', policy)).toBe(false)
    expect(isRemoteResourceAllowed('http://images.example.com/portrait.png', policy)).toBe(false)
    expect(isRemoteResourceAllowed('data:image/png;base64,abc', policy)).toBe(false)
    expect(isRemoteResourceAllowed('https://images.example.com/portrait.png', undefined)).toBe(false)
    expect(isRemoteResourceAllowed('https://any.example.net/portrait.png', { mode: 'allow-all' })).toBe(true)
  })

  it('projects files inside the resource root as relative display paths', () => {
    expect(getEditorResourceRelativePath('D:/Project', 'd:/project/cards/hero.ocdocument'))
      .toBe('cards/hero.ocdocument')
    expect(getEditorResourceRelativePath('D:/Project', 'C:/External/hero.ocdocument')).toBeNull()
    expect(getEditorResourceRelativePath(null, 'draft://card-id')).toBeNull()
  })
})
