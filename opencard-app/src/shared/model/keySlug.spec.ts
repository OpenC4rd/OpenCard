import { describe, expect, it } from 'vitest'
import { createAvailableKey, toKeySlug } from './keySlug'

describe('keySlug', () => {
  it('creates readable keys for Chinese and normalized Latin text', () => {
    expect(toKeySlug('虚怀若谷')).toBe('xu-huai-ruo-gu')
    expect(toKeySlug('Résumé Display')).toBe('resume-display')
  })

  it('keeps other writing systems stable without producing an empty key', () => {
    expect(toKeySlug('Привет')).toMatch(/^u[0-9a-f]+(?:-u[0-9a-f]+)+$/)
    expect(toKeySlug('---', 'family')).toBe('family')
  })

  it('resolves collisions without regard to key casing', () => {
    expect(createAvailableKey('Brand Sans', ['brand-sans', 'BRAND-SANS-2'], 'font'))
      .toBe('brand-sans-3')
  })
})
