// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { enrichCardPropertyFieldDefinition } from './cdePropertyFieldEnrichment'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'

describe('card property field enrichment', () => {
  it('resolves rich-text base style from the block record and resource environment', () => {
    const resourceEnvironment: ProjectResourceEnvironment = {
      kind: 'project',
      namespace: 'project',
      rootPath: '/project',
      fontDocument: {},
      fonts: {
        body: {
          kind: 'family',
          name: 'Body Font',
          family: { key: 'body', name: 'Body Font', files: { normal: { upright: 'fonts/body.ttf' } } },
        },
      },
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const definition = enrichCardPropertyFieldDefinition({
      definition: { title: 'Content', fieldType: 'richText' },
      record: { fontFamily: 'font:body', fontSize: '20px' },
      resourceEnvironment,
    })

    expect(definition).toMatchObject({
      fieldType: 'richText',
      richTextBaseStyle: {
        fontFamily: '"OpenCardResource-project-body"',
        fontSize: '20px',
      },
    })
  })

  it('attaches binding completion and auto-pairs only when a reference context is provided', async () => {
    const definition = enrichCardPropertyFieldDefinition({
      definition: { title: 'Source', fieldType: 'imageSource' },
      record: {},
      referenceContext: {
        currentCard: {
          label: 'Current Card',
          fields: [{ key: 'avatar', label: 'Avatar', valueKind: 'string' }],
        },
        getAncestor: () => undefined,
        targetKind: 'string',
      },
    })

    expect(definition.autoPairs).toEqual([{ open: '{{', close: '}}' }])
    const result = await definition.binding?.provider?.({ value: '{{card:}}', cursor: 7 })
    expect(result?.items).toContainEqual(expect.objectContaining({
      label: 'Avatar',
      insertText: 'card:avatar',
    }))
  })
})
