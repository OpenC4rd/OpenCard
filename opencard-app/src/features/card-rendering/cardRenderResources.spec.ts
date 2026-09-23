import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import {
  projectResourceScopeIdentity,
  type ProjectResourceEnvironment,
} from '../workspace/services/projectResourceEnvironment'
import {
  createCardRenderResourceContext,
  createCardResourceResolver,
  resolveCardResource,
  type CardRenderResourceContext,
  type CardResourceResolver,
  type ResourceIssueCode,
  type ResolvedResource,
} from './cardRenderResources'
import { setProjectFonts } from '../workspace/model/projectFonts'
import { normalizeResourcePackageManifest } from '../workspace/model/resourcePackage'
import type { PackageCoordinate } from '../workspace/model/packageCoordinate'
import type { ProjectResourcePackage } from '../workspace/services/projectResourceEnvironment'

const { convertFileSrc } = vi.hoisted(() => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}))

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc }))

/** A package the environment can use: everything a reference needs, and nothing about a file. */
function packageEntry(coordinate: PackageCoordinate, rootPath: string): ProjectResourcePackage {
  return {
    coordinate,
    manifest: normalizeResourcePackageManifest({
      type: 'opencard-resource-package',
      author: coordinate.author,
      name: coordinate.name,
      version: coordinate.version,
      title: coordinate.name,
      public: { fonts: [], iconSeries: [] },
    }).manifest,
    archivePath: `/project/.opencard/packages/${coordinate.name}.ocpack`,
    fingerprint: `fp-${coordinate.name}`,
    rootPath,
    cover: null,
  }
}

function unavailable(
  code: ResourceIssueCode,
  message: string,
): Extract<ResolvedResource, { kind: 'unavailable' }> {
  return { kind: 'unavailable', code, message }
}

/** The "give me a font family" view: what TextBlockRenderer and Markdown ask a font field for. */
function resolveFontCssFamily(value: string, context: CardRenderResourceContext): string {
  const resource = resolveCardResource({ value, expect: 'font' }, context)
  return resource.kind === 'font' ? resource.cssFamily : ''
}

/** The "give me an icon entry" view: what the rich-text and Markdown icon call sites ask for. */
function resolveIconEntry(
  value: string,
  resources: CardResourceResolver,
  blockId: string,
  fieldKey: string,
) {
  const resource = resources.resolve({ value, expect: 'asset', blockId, fieldKey })
  return resource.kind === 'icon' ? resource.entry : null
}

describe('cardRenderResources', () => {
  beforeEach(() => convertFileSrc.mockClear())
  afterEach(() => setProjectFonts([]))

  it('keeps project font conversion identical after field scopes are derived', () => {
    const font = { key: 'brand', name: 'Brand', files: { normal: { upright: 'fonts/Brand.ttf' } } }
    setProjectFonts([font])
    const environment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project-root', rootPath: '/project',
      fontDocument: {}, fonts: { brand: { kind: 'family', name: 'Brand', family: font } },
      iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const root = createCardResourceResolver(createCardRenderResourceContext({ hostEnvironment: environment }))
    const derived = root.withScopes(new Map([[
      projectResourceScopeIdentity('custom-text', 'fontFamily'),
      environment,
    ]]))

    expect(root.resolve({ value: 'font:brand', expect: 'font', blockId: 'native-text', fieldKey: 'fontFamily' }))
      .toEqual({ kind: 'font', cssFamily: '"OpenCardProjectFont-brand"' })
    expect(derived.resolve({ value: 'font:brand', expect: 'font', blockId: 'custom-text', fieldKey: 'fontFamily' }))
      .toEqual({ kind: 'font', cssFamily: '"OpenCardProjectFont-brand"' })
  })

  it('keeps assets, icons, and missing-resource behavior identical after scopes are derived', () => {
    const icon = {
      seriesKey: 'status', iconKey: 'warning', name: 'Warning',
      source: 'icons/warning.svg', src: 'asset://icons/warning.svg',
      tint: 'theme' as const, imageWidth: 16, imageHeight: 16,
    }
    const environment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project-root', rootPath: '/project', fontDocument: {}, fonts: {},
      iconDocument: {}, iconCatalog: { series: [], entries: [icon], errors: [] },
    }
    const root = createCardResourceResolver(createCardRenderResourceContext({ hostEnvironment: environment }))
    const derived = root.withScopes(new Map([
      [projectResourceScopeIdentity('custom-image', 'source'), environment],
      [projectResourceScopeIdentity('custom-text', 'content'), environment],
    ]))

    expect(derived.resolve({ value: 'assets/a.png', expect: 'asset', blockId: 'custom-image', fieldKey: 'source' }))
      .toEqual(root.resolve({ value: 'assets/a.png', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
    expect(derived.resolve({ value: 'icon:status/warning', expect: 'asset', blockId: 'custom-text', fieldKey: 'content' }))
      .toEqual(root.resolve({ value: 'icon:status/warning', expect: 'asset', blockId: 'native-text', fieldKey: 'content' }))
    expect(root.resolve({ value: 'icon:status/warning', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual({ kind: 'icon', entry: icon })
    expect(derived.resolve({ value: 'icon:status/warning', expect: 'asset', blockId: 'custom-image', fieldKey: 'source' }))
      .toEqual({ kind: 'icon', entry: icon })
    expect(root.resolve({ value: 'assets/a.png', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual({ kind: 'url', src: 'asset:///project/assets/a.png' })
    expect(root.resolve({ value: '', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual({ kind: 'empty' })
    expect(root.resolve({ value: 'icon:status', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual(unavailable('syntax-error', 'Resource key is invalid'))
    expect(root.resolve({ value: 'icon:status/missing', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual(unavailable('resource-unavailable', 'Referenced icon is unavailable'))
    expect(root.resolve({ value: 'font:brand', expect: 'asset', blockId: 'native-image', fieldKey: 'source' }))
      .toEqual(unavailable('kind-mismatch', 'An image field cannot resolve the font reference "font:brand"'))
    expect(resolveIconEntry('icon:status/missing', derived, 'custom-text', 'content')).toBeNull()
    expect(resolveIconEntry('icon:status/missing', root, 'native-text', 'content')).toBeNull()
  })

  it('resolves package-qualified icon references for image blocks', () => {
    const icon = {
      seriesKey: 'status', iconKey: 'warning', name: 'Warning',
      source: 'icons/warning.svg', src: 'asset://icons/warning.svg',
      tint: 'theme' as const, imageWidth: 16, imageHeight: 16,
    }
    const coordinate = { author: 'alice', name: 'theme', version: '1.0.0' }
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package', namespace: 'package-alice-theme-1.0.0',
      rootPath: '/project/.opencard/packages/alice/theme/1.0.0',
      fontDocument: {}, fonts: {}, iconDocument: {}, iconCatalog: { series: [], entries: [icon], errors: [] },
    }
    const hostEnvironment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project', rootPath: '/project', fontDocument: {}, fonts: {},
      iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      packages: new Map([['alice/theme@1.0.0', packageEntry(coordinate, packageEnvironment.rootPath!)]]),
    }
    const resolver = createCardResourceResolver(createCardRenderResourceContext({
      hostEnvironment,
      packageEnvironments: new Map([['alice/theme@1.0.0', packageEnvironment]]),
    }))

    expect(resolver.resolve({ value: 'alice/theme@1.0.0#icon:status/warning', expect: 'asset', blockId: 'image', fieldKey: 'source' }))
      .toEqual({ kind: 'icon', entry: icon })
  })

  it('reports a package reference that the current environment cannot see', () => {
    const context = createCardRenderResourceContext({ resourceRootPath: 'D:/Cards' })

    expect(resolveCardResource({ value: 'goblin/missing@1.0.0#icon:status/warning', expect: 'asset', blockId: 'image', fieldKey: 'source' }, context))
      .toEqual(unavailable('package-unavailable', 'Referenced package is not visible from the current environment'))
  })

  it('resolves package-local paths only through an explicit field scope', () => {
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package',
      namespace: 'package-alice-picture',
      rootPath: 'D:/Cards/.opencard/packages/alice-picture',
      fontDocument: {},
      fonts: {},
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,

    }
    const context = createCardRenderResourceContext({
      resourceScopes: new Map([[
        projectResourceScopeIdentity('package-image', 'source'),
        packageEnvironment,
      ]]),
    })

    expect(resolveCardResource({ value: 'assets/a.png', expect: 'asset', blockId: 'package-image' }, context))
      .toEqual({ kind: 'url', src: 'asset://D:/Cards/.opencard/packages/alice-picture/assets/a.png' })
    expect(resolveCardResource({ value: 'assets/a.png', expect: 'asset' }, context))
      .toEqual(unavailable('scope-unavailable', 'No project root is available to resolve "assets/a.png"'))
  })

  it('resolves local files and applies the remote HTTPS policy', () => {
    const context = createCardRenderResourceContext({
      resourceRootPath: 'D:/Cards',
      sourceFilePath: 'D:/Cards/decks/card.ocdocument',
      remoteResourcePolicy: { mode: 'allowlist', allowedHosts: ['images.example.com'] },
    })

    expect(resolveCardResource({ value: 'assets/portrait.png', expect: 'asset' }, context))
      .toEqual({ kind: 'url', src: 'asset://D:/Cards/assets/portrait.png' })
    expect(resolveCardResource({ value: 'https://images.example.com/portrait.png', expect: 'asset' }, context))
      .toEqual({ kind: 'url', src: 'https://images.example.com/portrait.png' })
    expect(createCardResourceResolver(context)
      .resolve({ value: 'https://images.example.com/portrait.png', expect: 'asset' }))
      .toEqual({ kind: 'url', src: 'https://images.example.com/portrait.png' })
    expect(resolveCardResource({ value: 'https://other.example.com/portrait.png', expect: 'asset' }, context))
      .toEqual(unavailable('unsafe-path', 'Resource scheme is not permitted: https://other.example.com/portrait.png'))
  })

  it('resolves a package path through the host environment and a project path through the # anchor', () => {
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package', namespace: 'package-alice-theme-1.0.0',
      rootPath: '/cache/packages/aa11',
      fontDocument: {}, fonts: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const hostEnvironment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project', rootPath: 'D:/Cards',
      fontDocument: {}, fonts: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      packages: new Map([['alice/theme@1.0.0', packageEntry({ author: 'alice', name: 'theme', version: '1.0.0' }, '/cache/packages/aa11')]]),
    }
    const projectContext = createCardRenderResourceContext({
      resourceRootPath: 'D:/Cards',
      sourceFilePath: 'D:/Cards/decks/card.ocdocument',
      hostEnvironment,
    })
    expect(resolveCardResource({ value: 'alice/theme@1.0.0#images/frame.png', expect: 'asset' }, projectContext))
      .toEqual({ kind: 'url', src: 'asset:///cache/packages/aa11/images/frame.png' })

    // 包里的文件属于包的作用域；要拿项目里的东西就用 `#` 锚点走出去。
    const packageContext = createCardRenderResourceContext({
      resourceRootPath: 'D:/Cards',
      sourceFilePath: 'D:/Cards/.opencard/packages/alice/theme/1.0.0/cards/card.ocdocument',
      hostEnvironment: packageEnvironment,
    })
    expect(resolveCardResource({ value: 'images/frame.png', expect: 'asset' }, packageContext))
      .toEqual({ kind: 'url', src: 'asset:///cache/packages/aa11/images/frame.png' })
    expect(resolveCardResource({ value: '#images/logo.png', expect: 'asset' }, packageContext))
      .toEqual({ kind: 'url', src: 'asset://D:/Cards/images/logo.png' })
  })

  it('resolves an allowed remote asset through the project cache when provided', () => {
    const resolveRemoteResource = vi.fn((url: string) => `asset://cached/${encodeURIComponent(url)}`)
    const context = createCardRenderResourceContext({
      remoteResourcePolicy: { mode: 'allowlist', allowedHosts: ['images.example.com'] },
      resolveRemoteResource,
    })

    expect(resolveCardResource({ value: 'https://images.example.com/portrait.png', expect: 'asset' }, context))
      .toEqual({ kind: 'url', src: 'asset://cached/https%3A%2F%2Fimages.example.com%2Fportrait.png' })
    expect(resolveRemoteResource).toHaveBeenCalledWith('https://images.example.com/portrait.png')
    expect(resolveCardResource({ value: 'https://other.example.com/portrait.png', expect: 'asset' }, context))
      .toEqual(unavailable('unsafe-path', 'Resource scheme is not permitted: https://other.example.com/portrait.png'))
    expect(resolveRemoteResource).toHaveBeenCalledTimes(1)
  })

  it('rejects runtime schemes supplied directly by a document', () => {
    const context = createCardRenderResourceContext({})

    expect(resolveCardResource({ value: 'blob:untrusted', expect: 'asset' }, context))
      .toEqual(unavailable('unsafe-path', 'Resource scheme is not permitted: blob:untrusted'))
    expect(resolveCardResource({ value: 'data:image/png;base64,abc', expect: 'asset' }, context))
      .toEqual(unavailable('unsafe-path', 'Resource scheme is not permitted: data:image/png;base64,abc'))
    expect(convertFileSrc).not.toHaveBeenCalled()
  })

  it('reports unsafe and reserved paths, and a package the project does not have', () => {
    const context = createCardRenderResourceContext({
      resourceRootPath: 'D:/Cards',
      sourceFilePath: 'D:/Cards/decks/card.ocdocument',
    })

    expect(resolveCardResource({ value: 'assets/../escape.png', expect: 'asset' }, context))
      .toEqual(unavailable('unsafe-path', 'Resource path contains an unsafe or non-portable segment'))
    // 归档住在 `.opencard/packages` 里，而不是解开后的资源；引用必须写坐标。
    expect(resolveCardResource({ value: '.opencard/packages/inner.png', expect: 'asset' }, context))
      .toEqual(unavailable('reserved-path', 'Package storage must be addressed through a package coordinate'))
    expect(resolveCardResource({ value: 'alice/theme@1.0.0#images/frame.png', expect: 'asset' }, context))
      .toEqual(unavailable('package-unavailable', 'Package is not installed: alice/theme@1.0.0'))
  })

  it('resolves package-qualified font references with a package namespace', () => {
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package',
      namespace: 'package-alice-theme-1.0.0',
      rootPath: '/project/.opencard/packages/alice/theme/1.0.0',
      fontDocument: {},
      fonts: { body: { kind: 'family', name: 'Body', family: { key: 'body', name: 'Body', files: {} } } },
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,

    }
    const projectEnvironment: ProjectResourceEnvironment = {
      kind: 'project',
      namespace: 'project-root',
      rootPath: '/project',
      fontDocument: {},
      fonts: { body: { kind: 'family', name: 'Body', family: { key: 'body', name: 'Body', files: {} } } },
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      packages: new Map([['alice/theme@1.0.0', packageEntry(
        { author: 'alice', name: 'theme', version: '1.0.0' },
        '/project/.opencard/packages/alice/theme/1.0.0',
      )]]),

    }
    const context = createCardRenderResourceContext({
      hostEnvironment: projectEnvironment,
      packageEnvironments: new Map([['alice/theme@1.0.0', packageEnvironment]]),
    })
    expect(resolveFontCssFamily('alice/theme@1.0.0#font:body; Arial', context)).toContain('OpenCardResource-package-alice-theme-1.0.0-body')
    expect(resolveFontCssFamily('alice/theme@1.0.0#font:body; Arial', context)).toContain('Arial')
  })

  it('keeps the font list join and reports an empty font field as empty', () => {
    const font = { key: 'brand', name: 'Brand', files: { normal: { upright: 'fonts/Brand.ttf' } } }
    setProjectFonts([font])
    const environment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project-root', rootPath: '/project',
      fontDocument: {}, fonts: { brand: { kind: 'family', name: 'Brand', family: font } },
      iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const context = createCardRenderResourceContext({ hostEnvironment: environment })

    expect(resolveCardResource({ value: 'font:brand; Arial', expect: 'font' }, context))
      .toEqual({ kind: 'font', cssFamily: '"OpenCardProjectFont-brand", Arial' })
    expect(resolveCardResource({ value: '   ', expect: 'font' }, context))
      .toEqual({ kind: 'empty' })
  })
})
