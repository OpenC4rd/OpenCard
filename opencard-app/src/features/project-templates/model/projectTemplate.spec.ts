// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  parseProjectTemplateManifest,
  resolveProjectTemplateDescription,
  resolveProjectTemplateName,
  validateProjectName,
  validateTemplateDescription,
  validateTemplateName,
} from './projectTemplate'

describe('project template model', () => {
  it('accepts an entryless manifest for a completely empty folder template', () => {
    expect(parseProjectTemplateManifest({
      schemaVersion: 1,
      id: 'blank',
      name: 'Blank Project',
      description: 'Start empty.',
    })).toEqual({
      schemaVersion: 1,
      id: 'blank',
      name: 'Blank Project',
      description: 'Start empty.',
    })
  })

  it('normalizes a valid manifest', () => {
    expect(parseProjectTemplateManifest({
      schemaVersion: 1,
      id: 'sample-project',
      name: '  Sample Project  ',
      description: '  Advanced demo  ',
      entry: 'cards\\main.ocdocument',
      entries: ['cards\\main.ocdocument', 'cards/alternate.ocdocument', 'cards/alternate.ocdocument'],
      covers: ['assets\\cover.png', 'assets/cover.png', 'assets/second.webp'],
    })).toEqual({
      schemaVersion: 1,
      id: 'sample-project',
      name: 'Sample Project',
      description: 'Advanced demo',
      entry: 'cards/main.ocdocument',
      entries: ['cards/main.ocdocument', 'cards/alternate.ocdocument'],
      covers: ['assets/cover.png', 'assets/second.webp'],
    })
  })

  it('keeps localized built-in display text while preserving stable manifest values', () => {
    const template = parseProjectTemplateManifest({
      schemaVersion: 1, id: 'blank', name: 'Blank', description: 'Fallback', entry: 'main.ocdocument',
      i18n: {
        name: { 'zh-CN': '空白项目', 'en-US': 'Blank Project' },
        description: { 'zh-CN': '从空白开始。', 'en-US': 'Start blank.' },
      },
    })!
    expect(resolveProjectTemplateName({ ...template, key: 'builtin:blank', source: 'builtin', rootPath: '', contentPath: '', coverPaths: [] }, 'zh-CN')).toBe('空白项目')
    expect(resolveProjectTemplateDescription({ ...template, key: 'builtin:blank', source: 'builtin', rootPath: '', contentPath: '', coverPaths: [] }, 'en-US')).toBe('Start blank.')
  })

  it.each([
    '',
    '.',
    '..',
    'bad/name',
    'bad:name',
    'CON',
    'lpt1.txt',
    'trailing.',
    'trailing ',
    'Demo\t',
    '\nDemo',
    'x'.repeat(81),
  ])('rejects invalid project name %j', (name) => {
    expect(validateProjectName(name)).toBe('invalid-project-name')
  })

  it('accepts a normalized project name and enforces template text limits', () => {
    expect(validateProjectName('  My Cards')).toBeNull()
    expect(validateTemplateName('  Personal Template  ')).toBeNull()
    expect(validateTemplateName(' '.repeat(4))).toBe('invalid-template-name')
    expect(validateTemplateDescription('x'.repeat(201))).toBe('description-too-long')
  })

  it.each([
    { id: 'valid-id', entry: 'main.ocdocument', covers: ['../cover.png'] },
    { id: 'valid-id', entry: 'main.ocdocument', covers: ['assets/cover.txt'] },
  ])('rejects unsafe cover data %#', ({ id, entry, covers }) => {
    expect(parseProjectTemplateManifest({
      schemaVersion: 1,
      id,
      name: 'Template',
      description: '',
      entry,
      covers,
    })).toBeNull()
  })

  it.each([
    { id: 'Bad_ID', entry: 'main.ocdocument' },
    { id: 'valid-id', entry: '../main.ocdocument' },
    { id: 'valid-id', entry: '/main.ocdocument' },
    { id: 'valid-id', entry: 'C:\\main.ocdocument' },
  ])('rejects unsafe manifest data %#', ({ id, entry }) => {
    expect(parseProjectTemplateManifest({
      schemaVersion: 1,
      id,
      name: 'Template',
      description: '',
      entry,
    })).toBeNull()
  })

  it('rejects candidate entries that omit the default entry', () => {
    expect(parseProjectTemplateManifest({
      schemaVersion: 1,
      id: 'valid-id',
      name: 'Template',
      description: '',
      entry: 'main.ocdocument',
      entries: ['alternate.ocdocument'],
    })).toBeNull()
  })
})
