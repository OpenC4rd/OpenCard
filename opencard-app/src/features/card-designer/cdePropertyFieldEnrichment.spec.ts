import { describe, expect, it } from 'vitest'
import type { ProjectIconSeries } from '../workspace/model/projectIcons'
import { buildProjectIconCatalog } from '../workspace/services/projectIconCatalog'
import { enrichCardPropertyFieldDefinition } from './cdePropertyFieldEnrichment'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'

const iconSeries: ProjectIconSeries[] = [{
  name: 'Status icons',
  key: 'status',
  icons: [{ iconKey: 'warning', name: 'Warning', source: 'assets/icons/warning.svg', tint: 'context' }],
}]

/** The image block's `source` field exactly as entities/card/schema.ts declares it. */
const imageSourceDefinition = {
  title: 'Source',
  fieldType: 'filePath' as const,
  allowRemote: true,
  minLength: 0,
  categoryId: 'content' as const,
  filter: { target: 'file' as const, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
}

const translate = (key: string) => key

describe('card property field enrichment', () => {
  it('completes package icons in block content when packages are indexed by fingerprint', async () => {
    const coordinate = { author: 'demo', name: 'icons', version: '1.0.0' }
    const packageKey = 'demo/icons@1.0.0'
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package', namespace: 'demo-icons', rootPath: '/cache/icons',
      fontDocument: {}, fonts: {}, iconDocument: {},
      iconCatalog: buildProjectIconCatalog(iconSeries, source => `asset://${source}`),
    }
    const resourceEnvironment: ProjectResourceEnvironment = {
      ...packageEnvironment, kind: 'project', namespace: 'project', rootPath: '/project',
      packages: new Map([['content-fingerprint', {
        coordinate, fingerprint: 'content-fingerprint', rootPath: '/cache/icons',
        archivePath: '/project/.opencard/packages/icons.ocpack', cover: null,
        manifest: { type: 'opencard-resource-package', ...coordinate, title: 'Package icons',
          public: { fonts: [], iconSeries: [{ key: 'status', title: 'Status icons', count: 1 }] } },
      }]]),
      packageEnvironments: new Map([[packageKey, packageEnvironment]]),
    }
    const definition = enrichCardPropertyFieldDefinition({
      translate, definition: { title: 'Content', fieldType: 'string', multiline: true },
      fieldKey: 'content', record: {}, fontCatalog: [], resourceEnvironment,
    })
    const provider = definition.completion!.provider!
    const packages = await provider({ value: '[[', cursor: 2 })
    expect(packages?.items).toContainEqual(expect.objectContaining({
      label: 'Package icons', insertText: `${packageKey}#icon:`,
    }))
    const collectionPrefix = `[[${packageKey}#icon:`
    const collections = await provider({ value: collectionPrefix, cursor: collectionPrefix.length })
    expect(collections?.items).toContainEqual(expect.objectContaining({ insertText: 'status/' }))
    const iconPrefix = `${collectionPrefix}status/`
    const icons = await provider({ value: iconPrefix, cursor: iconPrefix.length })
    expect(icons?.items).toContainEqual(expect.objectContaining({
      label: 'Warning', insertText: `[[${packageKey}#icon:status/warning]]`,
    }))
  })
  it('offers project icons while an image source holds an icon reference', async () => {
    const definition = enrichCardPropertyFieldDefinition({
      translate,
      definition: imageSourceDefinition,
      fieldKey: 'source',
      record: {},
      fontCatalog: [],
      projectIconCatalog: buildProjectIconCatalog(iconSeries, source => `asset://${source}`),
    })

    const provider = definition.completion?.provider
    expect(provider).toBeTruthy()

    const seriesResult = await provider!({ value: 'icon:', cursor: 5 })
    expect(seriesResult?.items).toContainEqual(expect.objectContaining({
      label: 'Status icons',
      insertText: 'status/',
    }))

    const iconValue = 'icon:status/'
    const iconResult = await provider!({ value: iconValue, cursor: iconValue.length })
    expect(iconResult?.items).toContainEqual(expect.objectContaining({
      label: 'Warning',
      insertText: 'icon:status/warning',
    }))
  })
})
