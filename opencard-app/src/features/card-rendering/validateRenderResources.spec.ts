import { describe, expect, it } from 'vitest'
import { createImageBlock, createTextBlock, type CardDocument } from '../../entities/card/model'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import { normalizeResourcePackageManifest } from '../workspace/model/resourcePackage'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { createCardRenderResourceContext } from './cardRenderResources'
import { parseRenderDocument } from './renderParser'
import { prepareCardRender } from './renderPipeline'
import { validateRenderResources } from './validateRenderResources'

function documentWithImage(url: string): CardDocument {
  return {
    type: 'card-document', id: 'document', name: 'Document', version: '1.0.0',
    description: '', notes: '', width: '540', height: '850', instances: [],
    faces: {
      front: {
        type: 'card-face', id: 'front', background: '#fff',
        children: [{
          block: createImageBlock({ id: 'image', name: 'Portrait', source: url }),
          location: { id: 'location', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#fff', children: [] },
    },
  }
}

function readyImage(url: string) {
  return parseRenderDocument(documentWithImage(url), { instanceId: 'instance' }).document
}

function documentWithFont(fontFamily: string): CardDocument {
  const document = documentWithImage('assets/portrait.png')
  document.faces.front.children = [{
    block: createTextBlock({ id: 'text', name: 'Title', fontFamily }),
    location: { id: 'location', type: 'simple-container-location', anchor: 'lt' },
  }]
  return document
}

describe('validateRenderResources', () => {
  it('reports an allowed-format remote image blocked by the project policy', () => {
    const issues = validateRenderResources(
      readyImage('https://images.example.com/portrait.png'),
      { mode: 'deny' },
      'instance',
    )

    expect(issues).toEqual([expect.objectContaining({
      type: 'card-designer.resource.remote-blocked',
      location: expect.objectContaining({
        documentId: 'document', instanceId: 'instance', faceKey: 'front',
        owner: { kind: 'block', id: 'image' }, blockId: 'image', blockPath: 'Portrait', fieldKey: 'source',
      }),
      parameters: { fieldName: 'source' },
      details: { url: 'https://images.example.com/portrait.png' },
    })])
  })

  it('does not report an allowed host or a local project image', () => {
    const policy = { mode: 'allowlist', allowedHosts: ['images.example.com'] } as const
    expect(validateRenderResources(readyImage('https://images.example.com/portrait.png'), policy, null)).toEqual([])
    expect(validateRenderResources(readyImage('assets/portrait.png'), { mode: 'deny' }, null)).toEqual([])
  })

  it('warns for named system fonts while allowing portable and scoped font families', () => {
    const ready = parseRenderDocument(
      documentWithFont('Arial; "Microsoft YaHei"; sans-serif; system-ui; font:body; alice/theme@1.0.0#font:title; Arial'),
      { instanceId: 'instance' },
    ).document

    expect(validateRenderResources(ready, undefined, 'instance')).toEqual([
      expect.objectContaining({
        type: 'card-designer.resource.system-font',
        location: expect.objectContaining({
          owner: { kind: 'block', id: 'text' }, blockId: 'text', fieldKey: 'fontFamily',
        }),
        parameters: { fieldName: 'fontFamily', fontName: 'Arial' },
        details: { fontName: 'Arial' },
      }),
      expect.objectContaining({
        type: 'card-designer.resource.system-font',
        parameters: { fieldName: 'fontFamily', fontName: 'Microsoft YaHei' },
      }),
    ])
  })

  it('adds the resource policy issue to the prepared render result', () => {
    const result = prepareCardRender({
      document: documentWithImage('https://images.example.com/portrait.png'),
      instance: null,
      resourceRootPath: 'D:/Cards',
      sourceFilePath: 'D:/Cards/card.ocdocument',
      environment: {
        remoteResourcePolicy: { mode: 'deny' },
        projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      },
    })

    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'card-designer.resource.remote-blocked',
    }))
  })

  it('reports a missing package separately from a missing package resource file', () => {
    const missingPackage = validateRenderResources(
      readyImage('goblin/missing@1.0.0#icon:status/warning'),
      undefined,
      null,
      createCardRenderResourceContext({}),
    )
    expect(missingPackage).toContainEqual(expect.objectContaining({
      type: 'card-designer.resource.package-missing',
      parameters: expect.objectContaining({ packageKey: 'goblin/missing@1.0.0' }),
    }))

    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package',
      namespace: 'package-alice-theme-1.0.0',
      rootPath: '/project/.opencard/packages/alice/theme/1.0.0',
      fontDocument: {},
      fonts: {},
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,

    }
    const hostEnvironment: ProjectResourceEnvironment = {
      kind: 'project',
      namespace: 'project',
      rootPath: '/project',
      fontDocument: {},
      fonts: {},
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      packages: new Map([['alice/theme@1.0.0', {
        coordinate: { author: 'alice', name: 'theme', version: '1.0.0' },
        manifest: normalizeResourcePackageManifest({
          type: 'opencard-resource-package',
          author: 'alice', name: 'theme', version: '1.0.0', title: 'Theme',
          public: { fonts: [], iconSeries: [] },
        }).manifest,
        archivePath: '/project/.opencard/packages/theme.ocpack',
        fingerprint: 'fp-theme',
        rootPath: packageEnvironment.rootPath!,
        cover: null,
      }]]),
      packageEnvironments: new Map([['alice/theme@1.0.0', packageEnvironment]]),

    }
    const missingFile = validateRenderResources(
      parseRenderDocument(documentWithFont('alice/theme@1.0.0#font:body'), { instanceId: null }).document,
      undefined,
      null,
      createCardRenderResourceContext({
        hostEnvironment,
        packageEnvironments: hostEnvironment.packageEnvironments,
      }),
    )
    expect(missingFile).toContainEqual(expect.objectContaining({
      type: 'card-designer.resource.file-missing',
      parameters: expect.objectContaining({ reference: 'alice/theme@1.0.0#font:body' }),
    }))
  })
})
