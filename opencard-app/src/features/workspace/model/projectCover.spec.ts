import { describe, expect, it } from 'vitest'
import {
  coverImageExtension,
  isProjectCoverPath,
  normalizeProjectRelativeCoverPath,
  projectRelativePathFromAbsolute,
} from './projectCover'

describe('project cover paths', () => {
  it('normalizes safe relative cover paths', () => {
    expect(normalizeProjectRelativeCoverPath('  assets\\cover.png  ')).toBe('assets/cover.png')
    expect(normalizeProjectRelativeCoverPath('.opencard/cover.png')).toBe('.opencard/cover.png')
    expect(normalizeProjectRelativeCoverPath('covers/brand/main.webp')).toBe('covers/brand/main.webp')
  })

  it.each([
    undefined,
    null,
    42,
    '',
    '   ',
    '/cover.png',
    'C:/cover.png',
    'c:\\cover.png',
    '../cover.png',
    'assets/../cover.png',
    'assets//cover.png',
    './cover.png',
    'assets/\u0000cover.png',
  ])('rejects unsafe cover paths %j', (value) => {
    expect(normalizeProjectRelativeCoverPath(value)).toBeNull()
  })

  it('only accepts supported cover image files', () => {
    expect(coverImageExtension('assets/cover.png')).toBe('png')
    expect(coverImageExtension('assets/COVER.JPEG')).toBe('jpeg')
    expect(coverImageExtension('assets/cover.svg')).toBe('svg')
    expect(coverImageExtension('assets/cover.png.txt')).toBeNull()
    expect(coverImageExtension('assets/cover')).toBeNull()
    expect(coverImageExtension('assets/.png')).toBeNull()
    expect(isProjectCoverPath('assets/cover.webp')).toBe(true)
    expect(isProjectCoverPath('assets/cover.svg')).toBe(true)
    expect(isProjectCoverPath('assets/cover.txt')).toBe(false)
    expect(isProjectCoverPath('../cover.png')).toBe(false)
  })

  it('refuses paths outside the project root', () => {
    expect(projectRelativePathFromAbsolute('D:/Cards/Project', 'D:/Downloads/cover.png')).toBeNull()
    expect(projectRelativePathFromAbsolute('D:/Cards/Project', 'D:/Cards/Project-backup/cover.png')).toBeNull()
    expect(projectRelativePathFromAbsolute('D:/Cards/Project', 'D:/Cards/Project')).toBeNull()
    expect(projectRelativePathFromAbsolute('', 'D:/Cards/Project/cover.png')).toBeNull()
  })
})
