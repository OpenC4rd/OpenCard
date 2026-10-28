// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ProjectIconSeries } from '../model/projectIcons'
import { buildProjectIconCatalog } from './projectIconCatalog'
import type { ProjectResourceEnvironment } from './projectResourceEnvironment'
import { createResourcePropertyCapabilities } from './propertyResourceCapabilities'

const iconSeries: ProjectIconSeries[] = [{
  name: 'Status icons',
  key: 'status',
  icons: [{ iconKey: 'warning', name: 'Warning', source: 'assets/icons/warning.svg', tint: 'context' }],
}]

describe('createResourcePropertyCapabilities', () => {
  it('projects project and package scopes for fonts, icons, custom blocks, and files', async () => {
    const coordinate = { author: 'demo', name: 'pack', version: '1.0.0' }
    const packageKey = 'demo/pack@1.0.0'
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package',
      namespace: 'demo-pack',
      rootPath: '/cache/pack',
      fontDocument: {},
      fonts: {
        body: {
          kind: 'family',
          name: 'Pack Body',
          family: { key: 'body', name: 'Pack Body', files: { normal: { upright: 'fonts/body.ttf' } } },
        },
      },
      iconDocument: {},
      iconCatalog: buildProjectIconCatalog(iconSeries, source => `asset://${source}`),
      customBlockRegistry: {
        cards: {
          header: { key: 'header', source: 'blocks/header.ocblock' },
        },
      },
    }
    const resourceEnvironment: ProjectResourceEnvironment = {
      kind: 'project',
      namespace: 'project',
      rootPath: '/project',
      fontDocument: {},
      fonts: {
        title: {
          kind: 'family',
          name: 'Project Title',
          family: { key: 'title', name: 'Project Title', files: { normal: { upright: 'fonts/title.ttf' } } },
        },
      },
      iconDocument: {},
      iconCatalog: buildProjectIconCatalog(iconSeries, source => `asset://project/${source}`),
      customBlockRegistry: {
        layout: {
          banner: { key: 'banner', source: 'blocks/banner.ocblock' },
        },
      },
      packages: new Map([['content-fingerprint', {
        coordinate,
        fingerprint: 'content-fingerprint',
        rootPath: '/cache/pack',
        archivePath: '/project/.opencard/packages/pack.ocpack',
        cover: null,
        manifest: {
          type: 'opencard-resource-package',
          ...coordinate,
          title: 'Demo Pack',
          public: { fonts: [{ key: 'body', title: 'Pack Body' }], iconSeries: [{ key: 'status', title: 'Status icons', count: 1 }] },
        },
      }]]),
      packageEnvironments: new Map([[packageKey, packageEnvironment]]),
      asset: reference => ({ status: 'ready', src: `resolved://${reference}` }),
    }

    const capabilities = createResourcePropertyCapabilities({
      projectLabel: 'Current Project',
      rootPath: '/project',
      fs: {
        readDirectoryEntries: async path => [{ name: path.startsWith('/cache/pack') ? 'pack.png' : 'project.png', path: `${path}/file.png`, isDirectory: false, isFile: true, isSymlink: false }],
        fileExists: async () => false,
      },
      resourceEnvironment,
      readIconDimensions: () => ({ width: 24, height: 24 }),
    })

    expect(capabilities.fonts).toEqual([
      {
        key: 'project',
        label: 'Current Project',
        packageKey: null,
        entries: [expect.objectContaining({ key: 'title', value: 'font:title', label: 'Project Title' })],
      },
      {
        key: packageKey,
        label: 'Demo Pack',
        packageKey,
        entries: [expect.objectContaining({ key: `${packageKey}#body`, value: `${packageKey}#font:body`, label: 'Pack Body' })],
      },
    ])

    expect(capabilities.icons?.map(scope => ({
      key: scope.key,
      label: scope.label,
      values: scope.series.flatMap(series => series.entries.map(entry => entry.value)),
    }))).toEqual([
      { key: 'project', label: 'Current Project', values: ['icon:status/warning'] },
      { key: packageKey, label: 'Demo Pack', values: [`${packageKey}#icon:status/warning`] },
    ])

    expect(capabilities.customBlocks).toEqual([
      {
        key: 'project',
        label: 'Current Project',
        packageKey: null,
        collections: [{
          key: 'layout',
          name: 'layout',
          entries: [{
            key: 'layout/banner',
            name: 'banner',
            collectionKey: 'layout',
            blockKey: 'banner',
            value: 'block:layout/banner',
            source: 'blocks/banner.ocblock',
          }],
        }],
      },
      {
        key: packageKey,
        label: 'Demo Pack',
        packageKey,
        collections: [{
          key: 'cards',
          name: 'cards',
          entries: [{
            key: 'cards/header',
            name: 'header',
            collectionKey: 'cards',
            blockKey: 'header',
            value: `${packageKey}#block:cards/header`,
            source: 'blocks/header.ocblock',
          }],
        }],
      },
    ])

    expect(capabilities.files?.map(scope => ({ key: scope.key, prefix: scope.prefix }))).toEqual([
      { key: 'project', prefix: '' },
      { key: packageKey, prefix: `${packageKey}#` },
    ])
    expect(await capabilities.files![0]!.readDirectory('')).toEqual([
      expect.objectContaining({ name: 'project.png' }),
    ])
    expect(await capabilities.files![1]!.readDirectory('')).toEqual([
      expect.objectContaining({ name: 'pack.png' }),
    ])
    expect(capabilities.resolveImagePreview?.('assets/hero.png')).toBe('resolved://assets/hero.png')
  })
})
