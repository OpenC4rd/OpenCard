import { describe, expect, it } from 'vitest'
import {
  isProjectIndexSkippedPath,
  isProjectInternalRelativePath,
  PROJECT_DICTIONARY_FILE_NAME,
  PROJECT_FONT_REGISTRY_FILE_NAME,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  PROJECT_INTERNAL_DIRECTORIES,
  PROJECT_PROFILE_FILE_NAME,
  resolveProjectInternalRelativePath,
} from './projectStructure'

describe('projectStructure', () => {
  it('keeps every managed document and asset directory under .opencard', () => {
    expect([
      PROJECT_PROFILE_FILE_NAME,
      PROJECT_FONT_REGISTRY_FILE_NAME,
      PROJECT_ICON_REGISTRY_FILE_NAME,
      PROJECT_DICTIONARY_FILE_NAME,
      ...PROJECT_INTERNAL_DIRECTORIES,
    ]).toEqual([
      '.opencard/project.json',
      '.opencard/fonts/fonts.json',
      '.opencard/icons/icons.json',
      '.opencard/locale.json',
      '.opencard/fonts',
      '.opencard/icons',
      '.opencard/blocks',
      '.opencard/packages',
    ])
  })

  it('resolves registry asset paths relative to the internal directory', () => {
    expect(resolveProjectInternalRelativePath('fonts\\Body.ttf')).toBe('.opencard/fonts/Body.ttf')
    expect(resolveProjectInternalRelativePath()).toBe('.opencard')
  })

  it('recognizes the internal directory and its descendants, except the packages the user owns', () => {
    expect(isProjectInternalRelativePath('.opencard')).toBe(true)
    expect(isProjectInternalRelativePath('.opencard/fonts/Body.ttf')).toBe(true)
    expect(isProjectInternalRelativePath('.opencard-cache')).toBe(false)
    expect(isProjectInternalRelativePath('cards/.opencard/file')).toBe(false)
    // 包归档是用户自己的文件：能删、能改名、能拖，和其它文件一样。
    expect(isProjectInternalRelativePath('.opencard/packages/alice.ocpack')).toBe(false)
    expect(isProjectInternalRelativePath('.opencard/packages/nested/alice.ocpack')).toBe(false)
    expect(isProjectInternalRelativePath('.opencard/packages')).toBe(true)
  })

  it('indexes the package folder but not the one-file-per-asset folders', () => {
    // 项目里装了哪些包就是那个文件夹里有哪几个 `.ocpack`，所以它必须进索引。
    expect(isProjectIndexSkippedPath('.opencard/packages')).toBe(false)
    expect(isProjectIndexSkippedPath('.opencard/packages/alice-theme-1.0.0.ocpack')).toBe(false)
    // 一个资源一个文件、又没有读索引的地方需要它们。
    expect(isProjectIndexSkippedPath('.opencard/fonts')).toBe(true)
    expect(isProjectIndexSkippedPath('.opencard/fonts/Body.ttf')).toBe(true)
    expect(isProjectIndexSkippedPath('.opencard/icons/outline/warn.svg')).toBe(true)
    // 版本控制自己读仓库；大仓库递归列一次要好几秒。
    expect(isProjectIndexSkippedPath('.git')).toBe(true)
    expect(isProjectIndexSkippedPath('.git/objects')).toBe(true)
    // 别的目录一概照常走。
    expect(isProjectIndexSkippedPath('')).toBe(false)
    expect(isProjectIndexSkippedPath('cards')).toBe(false)
    expect(isProjectIndexSkippedPath('cards/.opencard/fonts')).toBe(false)
  })
})
