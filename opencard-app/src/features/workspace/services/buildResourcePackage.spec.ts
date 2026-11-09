import { describe, expect, it, vi } from 'vitest'
import { PROJECT_FONT_REGISTRY_FILE_NAME, PROJECT_PROFILE_FILE_NAME } from '../model/projectStructure'
import type { FileSystemService } from './fileSystemService'
import { buildResourcePackageFromProject, type ResourcePackageBuildRequest } from './buildResourcePackage'

const invoke = vi.hoisted(() => vi.fn(async (_command: string, args: { request: ResourcePackageBuildRequest }) => ({
  outputPath: args.request.outputPath,
  fingerprint: 'fp-built',
})))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

class MemoryFileSystem implements Pick<FileSystemService,
  'readFile' | 'fileExists' | 'readDirectory'
> {
  private readonly values = new Map<string, string>()

  putText(path: string, value: unknown): void {
    this.values.set(path, typeof value === 'string' ? value : JSON.stringify(value))
  }

  async fileExists(path: string): Promise<boolean> {
    const prefix = `${path}/`
    return this.values.has(path) || [...this.values.keys()].some(value => value.startsWith(prefix))
  }
  async readDirectory(path: string): ReturnType<FileSystemService['readDirectory']> {
    const prefix = `${path}/`
    const names = new Set<string>()
    for (const candidate of this.values.keys()) {
      if (candidate.startsWith(prefix)) names.add(candidate.slice(prefix.length).split('/')[0]!)
    }
    return [...names].map(name => ({
      name,
      isFile: this.values.has(`${prefix}${name}`),
      isDirectory: !this.values.has(`${prefix}${name}`),
      isSymlink: false,
    }))
  }
  async readFile(path: string): Promise<string> {
    const value = this.values.get(path)
    if (value === undefined) throw new Error(`Missing text file: ${path}`)
    return value
  }
}

/** 装着 alice/support 的那个包解开在哪。包在项目外面，所以只有环境知道这个位置。 */
const SUPPORT_ROOT = '/cache/snapshots/aa11'
const packageRoots = new Map([['alice/support@1.2.0', SUPPORT_ROOT]])

const IDENTITY = { author: 'alice', name: 'theme', version: '1.0.0', title: 'Theme' }

function createFileSystem(): MemoryFileSystem {
  const fs = new MemoryFileSystem()
  fs.putText(`/project/${PROJECT_FONT_REGISTRY_FILE_NAME}`, {
    families: [
      { key: 'latin', name: 'Latin', files: { normal: { upright: 'alice/support@1.2.0#fonts/shared.ttf' } } },
      { key: 'cjk', name: 'CJK', files: { normal: { upright: '.opencard/fonts/cjk-bold.otf' } } },
      { key: 'unused', name: 'Unused', files: { normal: { upright: '.opencard/fonts/unused.ttf' } } },
    ],
    compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'latin' }, { fontKey: 'cjk' }] }],
  })
  // 每套图标一个文件夹：清单与图标文件同夹，清单里的路径相对这个文件夹。
  fs.putText('/project/.opencard/icons/status/icon-set.json', {
    name: 'Status', icons: [{ key: 'ok', name: 'OK', source: 'ok.svg', tint: 'context' }],
  })
  fs.putText('/project/.opencard/icons/unused/icon-set.json', {
    name: 'Unused', icons: [{ key: 'idle', name: 'Idle', source: 'idle.svg', tint: 'context' }],
  })
  fs.putText(`/project/${PROJECT_PROFILE_FILE_NAME}`, { name: 'Demo', cover: 'images/cover.png' })
  fs.putText('/project/.opencard/fonts/cjk-bold.otf', 'bold')
  fs.putText('/project/.opencard/fonts/unused.ttf', 'unused')
  fs.putText('/project/.opencard/icons/status/ok.svg', 'ok')
  fs.putText('/project/.opencard/icons/unused/idle.svg', 'idle')
  fs.putText('/project/.opencard/locale.json', '{"entries":[]}')
  fs.putText('/project/images/cover.png', 'cover')
  fs.putText('/project/images/card.png', 'card')
  fs.putText(`${SUPPORT_ROOT}/fonts/shared.ttf`, 'shared')
  return fs
}

function lastRequest(): ResourcePackageBuildRequest {
  return invoke.mock.calls[invoke.mock.calls.length - 1]![1].request
}

describe('buildResourcePackageFromProject', () => {
  it('hands Rust the identity and a plan that keeps project paths, in-package paths, and stored files', async () => {
    invoke.mockClear()
    await buildResourcePackageFromProject({
      fs: createFileSystem(),
      projectRootPath: '/project', ...IDENTITY, packageRoots,
      fontSelection: { familyKeys: ['latin', 'cjk'], compositionKeys: ['body'] },
      iconSelection: { seriesKeys: ['status'] },
      imageSelection: { paths: ['images/card.png'] },
      outputPath: '/out/theme.ocpack',
    })
    const request = lastRequest()

    // 身份由打包的人填：包外面没有任何东西能替它说清楚自己是谁。
    expect(request).toMatchObject({ ...IDENTITY, outputPath: '/out/theme.ocpack' })
    expect(request.publicFonts).toEqual([{ key: 'latin', title: 'Latin' }, { key: 'cjk', title: 'CJK' }, { key: 'body', title: 'Body' }])
    expect(request.publicIconSeries).toEqual([{ key: 'status', title: 'Status', count: 1 }])
    // 选中的字体家族没引用到的字体不进包。
    expect(request.files.some(file => file.sourcePath === '/project/.opencard/fonts/unused.ttf')).toBe(false)
    // 项目文件按它在项目里的位置进包；图片按压缩状态直接存。
    expect(request.files.find(file => file.sourcePath === '/project/.opencard/fonts/cjk-bold.otf'))
      .toMatchObject({ archivePath: '.opencard/fonts/cjk-bold.otf', stored: false })
    expect(request.files.find(file => file.sourcePath === '/project/images/card.png'))
      .toMatchObject({ archivePath: 'images/card.png', stored: true })
    // 别人的包里那个文件按它在来源包里的相对路径进包。
    expect(request.files.find(file => file.sourcePath === `${SUPPORT_ROOT}/fonts/shared.ttf`))
      .toMatchObject({ archivePath: 'fonts/shared.ttf' })
    expect(request.cover).toBe('images/cover.png')
    // 选中的图标集整套进包，没选的集不进。
    expect(request.files.find(file => file.sourcePath === '/project/.opencard/icons/status/ok.svg'))
      .toMatchObject({ archivePath: '.opencard/icons/status/ok.svg' })
    expect(request.files.some(file => file.sourcePath.includes('/icons/unused/'))).toBe(false)
  })

  it('inlines a font that lives in another package and writes each icon set as its own folder', async () => {
    invoke.mockClear()
    await buildResourcePackageFromProject({
      fs: createFileSystem(),
      projectRootPath: '/project', ...IDENTITY, packageRoots,
      fontSelection: { familyKeys: ['latin'], compositionKeys: [] },
      iconSelection: { seriesKeys: ['status'] },
      outputPath: '/out/theme.ocpack',
    })
    const request = lastRequest()

    // 内化：注册表里的引用换成包内相对路径，包里不留任何对别的包的引用。
    const fonts = request.texts.find(text => text.archivePath === PROJECT_FONT_REGISTRY_FILE_NAME)
    expect(JSON.parse(fonts!.text).families[0].files.normal.upright).toBe('fonts/shared.ttf')
    // 图标集在包里仍是同一个布局：每套一个文件夹，清单里的路径相对它。
    const icons = request.texts.find(text => text.archivePath === '.opencard/icons/status/icon-set.json')
    expect(JSON.parse(icons!.text)).toEqual({ name: 'Status', icons: [{ key: 'ok', name: 'OK', source: 'ok.svg', tint: 'context' }] })
    expect(request.texts.some(text => text.archivePath.includes('/icons/unused/'))).toBe(false)
    expect(request.texts.map(text => text.archivePath)).toContain('.opencard/locale.json')
    // 包里没有依赖清单 —— 用到的别人的资源已经是包内的普通文件了。
    expect(request.texts.some(text => text.archivePath.endsWith('packages.json'))).toBe(false)
  })

  it('rejects a selection that is empty or unavailable', async () => {
    const empty = createFileSystem()
    await expect(buildResourcePackageFromProject({
      fs: empty, projectRootPath: '/project', ...IDENTITY, packageRoots,
      outputPath: '/out/theme.ocpack',
    })).rejects.toThrow('Select at least one resource')

    await expect(buildResourcePackageFromProject({
      fs: createFileSystem(), projectRootPath: '/project', ...IDENTITY, packageRoots,
      outputPath: '/out/theme.ocpack',
      fontSelection: { familyKeys: ['missing'], compositionKeys: [] },
    })).rejects.toThrow('Selected project font is unavailable: missing')
  })

  it('fails clearly when a referenced package is not unpacked in this project', async () => {
    await expect(buildResourcePackageFromProject({
      fs: createFileSystem(), projectRootPath: '/project', ...IDENTITY,
      fontSelection: { familyKeys: ['latin'], compositionKeys: [] },
      outputPath: '/out/theme.ocpack',
    })).rejects.toThrow('Project font file path is invalid: alice/support@1.2.0#fonts/shared.ttf')
  })

  it('omits the cover when the project has none and never fails the build for it', async () => {
    const fs = createFileSystem()
    fs.putText(`/project/${PROJECT_PROFILE_FILE_NAME}`, { name: 'Demo', cover: 'images/missing.png' })
    invoke.mockClear()
    const result = await buildResourcePackageFromProject({
      fs, projectRootPath: '/project', ...IDENTITY, packageRoots,
      imageSelection: { paths: ['images/card.png'] },
      outputPath: '/out/theme.ocpack',
    })

    expect(lastRequest().cover).toBeUndefined()
    expect(result.fingerprint).toBe('fp-built')
  })
})
