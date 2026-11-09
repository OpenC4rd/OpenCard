import { describe, expect, it } from 'vitest'
import {
  customGitignoreRule,
  ineffectiveKeepLines,
  formatGitignoreRule,
  joinGitignoreLines,
  parseGitignoreRule,
  readGitignoreRules,
  retargetGitignoreRule,
  splitGitignoreLines,
} from './gitignoreRules'

describe('gitignore rules', () => {
  it.each([
    ['*.md', { match: 'extension', value: 'md', scope: '', deep: true }],
    ['.DS_Store', { match: 'name', value: '.DS_Store', scope: '', deep: true }],
    ['start*.*', { match: 'name', value: 'start*.*', scope: '', deep: true }],
    ['dist/', { match: 'folder', value: 'dist', scope: '', deep: true }],
    ['/dist/', { match: 'folder', value: 'dist', scope: '', deep: false }],
    ['/a/b/', { match: 'folder', value: 'b', scope: 'a', deep: false }],
    ['/a/b.txt', { match: 'name', value: 'b.txt', scope: 'a', deep: false }],
    ['/a/**/*.txt', { match: 'extension', value: 'txt', scope: 'a', deep: true }],
    ['!/a/keep.txt', { keep: true, match: 'name', value: 'keep.txt', scope: 'a', deep: false }],
  ])('round-trips %s', (line, expected) => {
    const rule = parseGitignoreRule(line)
    expect(rule).toMatchObject(expected)
    expect(formatGitignoreRule(rule)).toBe(line)
  })

  it('reads a slash in the middle as anchored, the way git does', () => {
    expect(parseGitignoreRule('a/*.txt')).toMatchObject({ match: 'extension', scope: 'a', deep: false })
    expect(parseGitignoreRule('**/foo')).toMatchObject({ match: 'name', value: 'foo', scope: '', deep: true })
  })

  it.each(['src/*/x.txt', '/a\\[b\\].txt', '/a/**/b/', 'build-*/', '**'])('keeps %s as a custom rule', line => {
    const rule = parseGitignoreRule(line)
    expect(rule.match).toBe('custom')
    expect(formatGitignoreRule(rule)).toBe(line)
  })

  it('escapes names that would otherwise turn into syntax', () => {
    expect(formatGitignoreRule({ keep: false, match: 'name', value: '#draft', scope: '', deep: true })).toBe('\\#draft')
  })

  it('keeps what was typed when the match changes', () => {
    const extension = parseGitignoreRule('/a/**/*.txt')
    expect(retargetGitignoreRule(extension, 'name')).toMatchObject({ match: 'name', value: 'txt', scope: 'a' })
    expect(retargetGitignoreRule(parseGitignoreRule('src/*/x.log'), 'name')).toMatchObject({ value: 'x.log' })
  })

  it('can treat a parsable line as a custom rule without changing its text', () => {
    const rule = customGitignoreRule('!/a/*.txt')
    expect(rule).toMatchObject({ keep: true, match: 'custom', value: '/a/*.txt' })
    expect(formatGitignoreRule(rule)).toBe('!/a/*.txt')
  })

  it('skips comments and blanks while keeping their line numbers', () => {
    const lines = splitGitignoreLines('# top\r\n\r\n*.log\n')
    expect(lines).toEqual(['# top', '', '*.log'])
    expect(readGitignoreRules(lines).map(entry => entry.line)).toEqual([2])
    expect(joinGitignoreLines(lines)).toBe('# top\n\n*.log\n')
    expect(joinGitignoreLines([])).toBe('')
  })

  it('flags exceptions inside an ignored folder, which git cannot honour', () => {
    const entries = readGitignoreRules(['dist/', '!/dist/keep.txt', '!root.txt', '!/dist/sub/x.txt'])
    expect([...ineffectiveKeepLines(entries)]).toEqual([1, 3])
  })
})
