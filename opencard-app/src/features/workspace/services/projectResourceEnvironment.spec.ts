import { describe, expect, it, vi } from 'vitest'

type ArchivedPackage = { manifestJson: string, fingerprint: string }

const { archives } = vi.hoisted(() => ({ archives: new Map<string, ArchivedPackage>() }))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  // 读归档是 Rust 的事；这份替身只回放登记过的答案，未登记的就是"读不出来"。
  invoke: async (command: string, args: { request: { sourcePath: string } }) => {
    if (command !== 'read_resource_package') throw new Error(`Unexpected command: ${command}`)
    const found = archives.get(args.request.sourcePath)
    if (!found) throw new Error('Package archive is corrupt')
    return found
  },
}))

import { EMPTY_PROJECT_ICON_CATALOG } from './projectIconCatalog'
import { parsePackageQualifier } from '../model/packageCoordinate'
import {
  createProjectResourceNamespace,
  loadProjectResourceEnvironment,
  packageScopeRoots,
  projectResourceScopeIdentity,
  resolveProjectEnvironmentFontFamily,
  resolveProjectResourcePackage,
  type ProjectResourceEnvironment,
} from './projectResourceEnvironment'

/**
 * 目录按内容指纹存，所以按坐标取一个包要走和引用同一条路 —— 这也是它在生产里唯一的取法。
 */
function packageAt(environment: ProjectResourceEnvironment, coordinate: string) {
  return resolveProjectResourcePackage(environment, parsePackageQualifier(coordinate)!)
}

function packageEnvironment(packageId: string): ProjectResourceEnvironment {
  const namespace = createProjectResourceNamespace('package', packageId)
  return {
    kind: 'package',
    namespace,
    rootPath: `/cache/snapshots/${packageId}`,
    fontDocument: {},
    fonts: { body: { kind: 'family', name: 'Body', family: { key: 'body', name: 'Body', files: {} } } },
    iconDocument: {},
    iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
  }
}

/** 包发现要按目录列举，所以这份内存文件系统也要能从已登记路径前缀推出目录条目。 */
function memoryFileSystem(files: Map<string, string>) {
  return {
    fileExists: async (path: string) => files.has(path),
    readFile: async (path: string) => files.get(path) ?? '',
    readDirectory: async (path: string) => {
      const prefix = `${path}/`
      const names = new Set<string>()
      for (const candidate of files.keys()) {
        if (!candidate.startsWith(prefix)) continue
        const name = candidate.slice(prefix.length).split('/')[0]
        if (name) names.add(name)
      }
      return [...names].map(name => ({
        name,
        isFile: files.has(`${prefix}${name}`),
        isDirectory: !files.has(`${prefix}${name}`),
        isSymlink: false,
      }))
    },
  }
}

const PACKAGES_ROOT = '/project/.opencard/packages'
/** 软件存储里的包快照根：解开目录挂在指纹上，"解开了没有"就是这里有没有那个目录。 */
const SNAPSHOTS_ROOT = '/cache/snapshots'

function manifest(identity: { author: string, name: string, version: string }, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'opencard-resource-package',
    ...identity,
    title: `${identity.name} title`,
    public: { fonts: [], iconSeries: [] },
    ...extra,
  })
}

function registerArchive(archivePath: string, archive: Partial<ArchivedPackage> & { manifestJson: string }) {
  archives.set(archivePath, {
    fingerprint: `fp-${archivePath.split('/').pop()}`,
    ...archive,
  })
}

/** 把一个包标记成"已经解开"：缓存里存在它的指纹目录。 */
function unpacked(files: Map<string, string>, fingerprint: string): Map<string, string> {
  files.set(`${SNAPSHOTS_ROOT}/${fingerprint}`, '')
  return files
}

function projectFiles(...paths: readonly string[]): Map<string, string> {
  return new Map([[PACKAGES_ROOT, ''], ...paths.map(path => [path, ''] as const)])
}

describe('ProjectResourceEnvironment', () => {
  it('isolates same-key package fonts by Package ID namespace', () => {
    const alice = packageEnvironment('alice/badge')
    const bob = packageEnvironment('bob/badge')
    const fallback = (value: string) => value
    const aliceFamily = resolveProjectEnvironmentFontFamily('font:body', alice, fallback)
    const bobFamily = resolveProjectEnvironmentFontFamily('font:body', bob, fallback)
    expect(aliceFamily).toContain('package-alice-badge')
    expect(bobFamily).toContain('package-bob-badge')
    expect(aliceFamily).not.toBe(bobFamily)
  })

  it('keeps field-level scope identities distinct for the same block', () => {
    expect(projectResourceScopeIdentity('block', 'image')).not.toBe(projectResourceScopeIdentity('block', 'fontFamily'))
    expect(projectResourceScopeIdentity('block', 'image')).not.toBe(projectResourceScopeIdentity('other', 'image'))
  })

  it('assembles the project icon catalog from the registry without reading any icon file', async () => {
    const files = new Map<string, string>([[
      '/project/.opencard/icons/icons.json',
      JSON.stringify({
        iconSeries: [{
          name: 'Outline', key: 'outline',
          icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' }],
        }],
      }),
    ]])
    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(files),
    })

    expect(environment.iconCatalog.entries).toHaveLength(1)
    expect(environment.iconCatalog.entries[0]).toMatchObject({
      iconKey: 'warn', seriesKey: 'outline', src: expect.stringContaining('warn.svg'),
    })
    // No size: it belongs to the file, and is resolved when the icon is painted.
    expect(environment.iconCatalog.entries[0]).not.toHaveProperty('imageWidth')
  })

  it('reuses a catalog the caller already assembled for the same root', async () => {
    const files = new Map<string, string>([[
      '/project/.opencard/icons/icons.json',
      JSON.stringify({
        iconSeries: [{
          name: 'Outline', key: 'outline',
          icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' }],
        }],
      }),
    ]])
    const providedCatalog = {
      series: [{ name: 'Outline', key: 'outline' }],
      entries: [{
        iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg',
        tint: 'theme' as const, seriesKey: 'outline', src: 'asset:///warn.svg',
        imageWidth: 8, imageHeight: 4,
      }],
      errors: [],
    }

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      iconCatalog: providedCatalog,
      fs: memoryFileSystem(files),
    })

    // The caller's catalog is the one carried, so its entries survive intact.
    expect(environment.iconCatalog.entries).toEqual(providedCatalog.entries)
    expect(environment.iconCatalog.entries[0]).toMatchObject({ imageWidth: 8, imageHeight: 4 })
  })

  it('reads identity from each archive and queues the ones that are not unpacked yet', async () => {
    archives.clear()
    const pending: string[] = []
    registerArchive(`${PACKAGES_ROOT}/alice-icons.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
    })
    registerArchive(`${PACKAGES_ROOT}/whatever-the-file-is-called.ocpack`, {
      manifestJson: manifest({ author: 'bob', name: 'fonts', version: '2.0.0' }),
    })
    const files = projectFiles(`${PACKAGES_ROOT}/alice-icons.ocpack`, `${PACKAGES_ROOT}/whatever-the-file-is-called.ocpack`)
    const bobRoot = `${SNAPSHOTS_ROOT}/fp-whatever-the-file-is-called.ocpack`
    unpacked(files, 'fp-whatever-the-file-is-called.ocpack')

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(files),
      onPackagePending: (_archive, archivePath) => pending.push(archivePath),
    })

    // 身份来自包自己的清单，文件名不算数；目录按内容指纹存，所以取一个包要走解析。
    expect(packageAt(environment, 'alice/icons@1.0.0')?.rootPath).toBeNull()
    expect(packageAt(environment, 'bob/fonts@2.0.0')?.rootPath).toBe(bobRoot)
    expect(packageScopeRoots(environment.packages).has('alice/icons@1.0.0')).toBe(false)
    expect(packageScopeRoots(environment.packages).get('bob/fonts@2.0.0')).toBe(bobRoot)
    expect(pending).toEqual([`${PACKAGES_ROOT}/alice-icons.ocpack`])
  })

  it('keeps the packages it can read and reports the archive it cannot', async () => {
    archives.clear()
    registerArchive(`${PACKAGES_ROOT}/good.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
    })

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(projectFiles(`${PACKAGES_ROOT}/broken.ocpack`, `${PACKAGES_ROOT}/good.ocpack`)),
    })

    // 读不出来的归档不是一个包，所以它不进目录；但它也不再凭空消失，而是按文件报出来。
    expect(packageAt(environment, 'alice/icons@1.0.0')?.archivePath).toBe(`${PACKAGES_ROOT}/good.ocpack`)
    expect(environment.unreadablePackages?.map(entry => entry.archivePath)).toEqual([`${PACKAGES_ROOT}/broken.ocpack`])
    expect(environment.unreadablePackages?.[0]?.reason).toBeTruthy()
  })

  it('an unusable fingerprint keeps the package out of the catalog', async () => {
    archives.clear()
    registerArchive(`${PACKAGES_ROOT}/alice.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-alice',
    })

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(projectFiles(`${PACKAGES_ROOT}/alice.ocpack`)),
      unusableFingerprints: new Set(['fp-alice']),
      onPackagePending: () => { throw new Error('a failed package must not be queued again') },
    })

    expect(environment.packages!.size).toBe(0)
  })

  it('keeps one entry per content, and lets the first file win for a coordinate', async () => {
    archives.clear()
    registerArchive(`${PACKAGES_ROOT}/alice-a.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-shared',
    })
    registerArchive(`${PACKAGES_ROOT}/alice-b.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-shared',
    })
    registerArchive(`${PACKAGES_ROOT}/impostor.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-other',
    })

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(projectFiles(
        `${PACKAGES_ROOT}/alice-a.ocpack`,
        `${PACKAGES_ROOT}/alice-b.ocpack`,
        `${PACKAGES_ROOT}/impostor.ocpack`,
      )),
    })

    // 同一份内容放了两个文件名：连解压目录都一样，所以只留先出现的那个文件名。
    expect([...environment.packages!.keys()].sort()).toEqual(['fp-other', 'fp-shared'])
    // 但"文件夹里有哪些包"按文件算：三个归档就是三条，重复的那份也在。
    expect(environment.packageFiles?.map(file => file.archivePath)).toEqual([
      `${PACKAGES_ROOT}/alice-a.ocpack`,
      `${PACKAGES_ROOT}/alice-b.ocpack`,
      `${PACKAGES_ROOT}/impostor.ocpack`,
    ])
    expect(environment.packageFiles?.map(file => file.fingerprint)).toEqual([
      'fp-shared', 'fp-shared', 'fp-other',
    ])
    // 同坐标、内容不同（比如换了一份构建）：两个文件都在，谁也不消失；引用落到文件名靠前的那个。
    expect(packageAt(environment, 'alice/icons@1.0.0')?.archivePath).toBe(`${PACKAGES_ROOT}/alice-a.ocpack`)
    expect(environment.packages!.get('fp-other')?.archivePath).toBe(`${PACKAGES_ROOT}/impostor.ocpack`)
  })

  it('keeps a package even when its registry names a file the package does not ship', async () => {
    archives.clear()
    registerArchive(`${PACKAGES_ROOT}/alice.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-alice',
    })
    registerArchive(`${PACKAGES_ROOT}/bob.ocpack`, {
      manifestJson: manifest({ author: 'bob', name: 'icons', version: '1.0.0' }),
      fingerprint: 'fp-bob',
    })
    const aliceRoot = `${SNAPSHOTS_ROOT}/fp-alice`
    const bobRoot = `${SNAPSHOTS_ROOT}/fp-bob`
    const files = projectFiles(`${PACKAGES_ROOT}/alice.ocpack`, `${PACKAGES_ROOT}/bob.ocpack`)
    unpacked(files, 'fp-alice')
    unpacked(files, 'fp-bob')
    files.set(`${aliceRoot}/.opencard/icons/icons.json`, JSON.stringify({
      iconSeries: [{
        name: 'Outline', key: 'outline',
        icons: [{ iconKey: 'warn', name: 'Warn', source: 'icons/warn.svg', tint: 'theme' }],
      }],
    }))
    files.set(`${aliceRoot}/icons/warn.svg`, 'bytes')
    files.set(`${bobRoot}/.opencard/icons/icons.json`, JSON.stringify({
      iconSeries: [{
        name: 'Outline', key: 'outline',
        icons: [{ iconKey: 'gone', name: 'Gone', source: 'icons/gone.svg', tint: 'theme' }],
      }],
    }))

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(files),
    })

    expect(packageAt(environment, 'alice/icons@1.0.0')?.rootPath).toBe(aliceRoot)
    expect(environment.packageEnvironments?.get('alice/icons@1.0.0')?.iconCatalog.entries[0]?.src)
      .toBe(`asset://${aliceRoot}/icons/warn.svg`)
    // 注册表指到空气不在这里判死：包照旧在目录里，只是那一张画不出来。
    expect(packageAt(environment, 'bob/icons@1.0.0')?.rootPath).toBe(bobRoot)
    expect(environment.packageEnvironments?.get('bob/icons@1.0.0')?.iconCatalog.entries[0]?.src)
      .toBe(`asset://${bobRoot}/icons/gone.svg`)
  })

  it('resolves a package cover from its unpacked root and stays silent when it is missing', async () => {
    archives.clear()
    registerArchive(`${PACKAGES_ROOT}/alice.ocpack`, {
      manifestJson: manifest({ author: 'alice', name: 'icons', version: '1.0.0' }, { cover: 'assets/cover.png' }),
      fingerprint: 'fp-alice',
    })
    registerArchive(`${PACKAGES_ROOT}/bob.ocpack`, {
      manifestJson: manifest({ author: 'bob', name: 'icons', version: '1.0.0' }, { cover: 'assets/missing.png' }),
      fingerprint: 'fp-bob',
    })
    const aliceRoot = `${SNAPSHOTS_ROOT}/fp-alice`
    const files = projectFiles(`${PACKAGES_ROOT}/alice.ocpack`, `${PACKAGES_ROOT}/bob.ocpack`)
    unpacked(files, 'fp-alice')
    unpacked(files, 'fp-bob')
    files.set(`${aliceRoot}/assets/cover.png`, 'bytes')

    const environment = await loadProjectResourceEnvironment({
      rootPath: '/project',
      snapshotsRoot: SNAPSHOTS_ROOT,
      kind: 'project',
      identity: 'project',
      fs: memoryFileSystem(files),
    })

    expect(packageAt(environment, 'alice/icons@1.0.0')?.cover).toEqual({
      relativePath: 'assets/cover.png',
      absolutePath: `${aliceRoot}/assets/cover.png`,
      src: `asset://${aliceRoot}/assets/cover.png`,
    })
    expect(packageAt(environment, 'bob/icons@1.0.0')?.cover).toBeNull()
  })
})
