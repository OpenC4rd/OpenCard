// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { matchesFilePathFilter, matchesFilePathPattern } from './filePath'

describe('filePath filter matching', () => {
  it('matches brace-expanded wildcard extensions case-insensitively against basename', () => {
    const pattern = '*.{png,jpg,svg}'
    expect(matchesFilePathPattern('assets/cards/hero.PNG', pattern)).toBe(true)
    expect(matchesFilePathPattern('icon.svg', pattern)).toBe(true)
    expect(matchesFilePathPattern('assets/cards/data.json', pattern)).toBe(false)
  })

  it('enforces target kind alongside pattern filter', () => {
    expect(
      matchesFilePathFilter({ name: 'assets', isDirectory: true }, { target: 'file', pattern: '*' }),
    ).toBe(false)
    expect(
      matchesFilePathFilter({ name: 'assets', isDirectory: true }, { target: 'directory' }),
    ).toBe(true)
    expect(
      matchesFilePathFilter({ name: 'cards/frame.ocblock', isDirectory: false }, { target: 'file', pattern: '*.ocblock' }),
    ).toBe(true)
  })
})
