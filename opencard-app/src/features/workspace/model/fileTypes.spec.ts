import { describe, expect, it } from 'vitest'
import { resolveDirectoryIcon, resolveEntryIcon, resolveFileType } from './fileTypes'

describe('project metadata file types', () => {
  it('recognizes exact project resource file names', () => {
    expect(resolveFileType('D:/Cards/.opencard/project.json', 'D:/Cards').id).toBe('opencard-project-profile')
    expect(resolveFileType('D:/Cards/.opencard/locale.json', 'D:/Cards').id).toBe('opencard-dictionary')
    expect(resolveFileType('D:/Cards/.opencard/fonts/fonts.json', 'D:/Cards').id).toBe('opencard-font-registry')
    expect(resolveFileType('D:/Cards/.opencard/icons/icons.json', 'D:/Cards').id).toBe('opencard-icon-registry')
    expect(resolveFileType('D:/Cards/en_US.ocproject').id).toBe('unsupported')
    expect(resolveFileType('D:/Cards/notes.oclocale').id).toBe('unsupported')
  })

  it('restricts special files to the managed project directory', () => {
    expect(resolveFileType('D:/Cards/.opencard/fonts/fonts.json', 'D:/Cards').id).toBe('opencard-font-registry')
    expect(resolveFileType('D:/Cards/.opencard/other/blocks/blocks.json', 'D:/Cards').id).toBe('json')
  })

  it('uses Windows-style case-insensitive project path comparison', () => {
    expect(resolveFileType('D:/CARDS/.OPENCARD/LOCALE.JSON', 'd:/cards').id).toBe('opencard-dictionary')
  })

  it('keeps special file names case-sensitive on POSIX paths', () => {
    expect(resolveFileType('/cards/.opencard/locale.json', '/cards').id).toBe('opencard-dictionary')
    expect(resolveFileType('/cards/.opencard/LOCALE.JSON', '/cards').id).toBe('json')
  })

  it('recognizes card documents only by the new extension', () => {
    expect(resolveFileType('D:/Cards/main.ocdocument').id).toBe('opencard')
    expect(resolveFileType('D:/Cards/main.opencard').id).toBe('unsupported')
  })
})

describe('workspace entry icon tokens', () => {
  it('uses closed and open folder glyphs with the same yellow tone', () => {
    expect(resolveDirectoryIcon('D:/Cards/src', false)).toEqual({
      icon: 'folder.generic',
      tone: 'folder-open',
    })
    expect(resolveDirectoryIcon('D:/Cards/src', true)).toEqual({
      icon: 'folder.open',
      tone: 'folder-open',
    })
  })

  it('uses the generic fallback token for unknown folders', () => {
    expect(resolveDirectoryIcon('D:/Cards/custom', false)).toEqual({
      icon: 'folder.generic',
      tone: 'folder-open',
    })
  })

  it('uses the opencard tone for a package archive, wherever it sits', () => {
    expect(resolveEntryIcon('D:/Cards/.opencard/packages/alice-icons-1.0.0.ocpack', false, false, 'D:/Cards')).toEqual({
      icon: 'file.package',
      tone: 'opencard',
    })
    // 文件叫什么名字、放在哪都不改变它是什么。
    expect(resolveEntryIcon('D:/Cards/downloads/whatever.ocpack', false, false, 'D:/Cards')).toEqual({
      icon: 'file.package',
      tone: 'opencard',
    })
  })

  it('uses the project icon glyph for the project icon registry', () => {
    expect(resolveEntryIcon('D:/Cards/.opencard/icons/icons.json', false, false, 'D:/Cards')).toEqual({
      icon: 'file.project-icon',
      tone: 'config',
    })
  })

  it('uses the translate icon for the project dictionary', () => {
    expect(resolveEntryIcon('D:/Cards/.opencard/locale.json', false, false, 'D:/Cards')).toEqual({
      icon: 'file.dictionary',
      tone: 'config',
    })
  })

  it('uses a dedicated icon for project font files', () => {
    expect(resolveFileType('D:/Cards/assets/fonts/Brand.woff2')).toMatchObject({
      id: 'font',
      editorId: 'font-preview',
    })
    expect(resolveEntryIcon('D:/Cards/assets/fonts/Brand.ttf', false)).toEqual({
      icon: 'file.font',
      tone: 'active',
    })
  })

  it('separates registered and unregistered project font files', () => {
    const registeredSources = new Set(['assets/fonts/Brand.woff2'])

    expect(resolveEntryIcon(
      'D:/Cards/assets/fonts/Brand.woff2',
      false,
      false,
      'D:/Cards',
      registeredSources,
    )).toEqual({
      icon: 'file.font',
      tone: 'active',
    })
    expect(resolveEntryIcon(
      'D:/Cards/assets/fonts/Other.woff2',
      false,
      false,
      'D:/Cards',
      registeredSources,
    )).toEqual({
      icon: 'file.font',
      tone: 'muted',
    })
    expect(resolveEntryIcon(
      'd:/cards/assets/fonts/BRAND.WOFF2',
      false,
      false,
      'D:/Cards',
      registeredSources,
    )).toEqual({
      icon: 'file.font',
      tone: 'active',
    })
  })

  it('separates registered and unregistered project icon images', () => {
    const registeredSources = new Set(['.opencard/icons/status.png'])
    expect(resolveEntryIcon(
      'D:/Cards/.opencard/icons/status.png', false, false, 'D:/Cards', undefined, registeredSources,
    ).tone).not.toBe('muted')
    expect(resolveEntryIcon(
      'D:/Cards/.opencard/icons/unused.png', false, false, 'D:/Cards', undefined, registeredSources,
    )).toEqual({ icon: 'file.image', tone: 'muted' })
  })

  it('keeps known text files editable and routes unknown extensions to the unsupported-file session', () => {
    expect(resolveFileType('D:/Cards/notes.txt')).toMatchObject({
      id: 'plaintext',
      editorId: 'monaco',
    })
    expect(resolveFileType('D:/Cards/archive.bin')).toMatchObject({
      id: 'unsupported',
      editorId: 'unsupported-file',
    })
  })
})
