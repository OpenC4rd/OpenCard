import { describe, expect, it } from 'vitest'
import {
  appendGitignorePattern,
  gitignorePatternForExtension,
  gitignorePatternForPath,
  ignoreFolderLevelsFor,
} from './gitignorePatterns'

describe('gitignore patterns', () => {
  it('anchors a path and marks folders', () => {
    expect(gitignorePatternForPath('.opencard/packages/theme', 'folder')).toBe('/.opencard/packages/theme/')
    expect(gitignorePatternForPath('cards\\main.ocdocument', 'file')).toBe('/cards/main.ocdocument')
  })

  it('escapes the characters that carry meaning inside a pattern', () => {
    expect(gitignorePatternForPath('notes/draft [1]*.txt', 'file')).toBe('/notes/draft \\[1\\]\\*.txt')
    expect(gitignorePatternForPath('assets/a b ', 'file')).toBe('/assets/a b\\ ')
  })

  it('only offers a whole-extension pattern for a real extension', () => {
    expect(gitignorePatternForExtension('packs/status.ociconpack')).toBe('*.ociconpack')
    expect(gitignorePatternForExtension('.env')).toBeNull()
    expect(gitignorePatternForExtension('Makefile')).toBeNull()
  })

  it('lists the folder itself and every ancestor level, never the project root', () => {
    expect(ignoreFolderLevelsFor(['a/b/c.txt'])).toEqual(['a/b/', 'a/'])
    expect(ignoreFolderLevelsFor(['a/b/'])).toEqual(['a/b/', 'a/'])
    // 分组行没有自己的路径，层级从它下面每条改动推出来。
    expect(ignoreFolderLevelsFor(['.opencard/packages/x/a.json', '.opencard/icons/b.svg']))
      .toEqual(['.opencard/packages/x/', '.opencard/packages/', '.opencard/', '.opencard/icons/'])
  })

  it('appends one line and never writes the same pattern twice', () => {
    expect(appendGitignorePattern('', '*.ocpack')).toBe('*.ocpack\n')
    expect(appendGitignorePattern('.opencard-init-*', '*.ocpack')).toBe('.opencard-init-*\n*.ocpack\n')
    expect(appendGitignorePattern('.opencard-init-*\n*.ocpack\n', '*.ocpack ')).toBe('.opencard-init-*\n*.ocpack\n')
  })
})
