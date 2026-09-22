import { describe, expect, it, vi } from 'vitest'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import { PROJECT_FONT_REGISTRY_FILE_NAME, PROJECT_ICON_REGISTRY_FILE_NAME, PROJECT_PROFILE_FILE_NAME } from '../model/projectStructure'
import type { FileSystemService } from './fileSystemService'
import { buildResourcePackageFromProject, type ResourcePackageBuildRequest } from './buildResourcePackage'

const invoke = vi.hoisted(() => vi.fn(async (_command: string, args: { request: ResourcePackageBuildRequest }) => ({
  outputPath: args.request.outputPath,
  contentHash: 'hash',
})))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

class MemoryFileSystem implements Pick<FileSystemService,
  'readFile' | 'fileExists' | 'readDirectoryEntries'
> {
  private readonly values = new Map<string, string>()

  putText(path: string, value: unknown): void {
    this.values.set(path, typeof value === 'string' ? value : JSON.stringify(value))
  }

  async fileExists(path: string): Promise<boolean> {
    const prefix = `${path}/`
    return this.values.has(path) || [...this.values.keys()].some(value => value.startsWith(prefix))
  }
  async readFile(path: string): Promise<string> {
    const value = this.values.get(path)
    if (value === undefined) throw new Error(`Missing text file: ${path}`)
    return value
  }
  async readDirectoryEntries(path: string): Promise<DirEntry[]> {
    const prefix = `${path}/`
    return [...this.values.keys()]
      .filter(value => value.startsWith(prefix))
      .map(value => ({ name: value.slice(prefix.length), isDirectory: false, isFile: true, isSymlink: false }))
  }
}

function createFileSystem(): MemoryFileSystem {
  const fs = new MemoryFileSystem()
  fs.putText(`/project/${PROJECT_FONT_REGISTRY_FILE_NAME}`, {
    families: [
      { key: 'latin', name: 'Latin', files: { normal: { upright: 'support@fonts/shared.ttf' } } },
      { key: 'cjk', name: 'CJK', files: { normal: { upright: '.opencard/fonts/cjk-bold.otf' } } },
      { key: 'unused', name: 'Unused', files: { normal: { upright: '.opencard/fonts/unused.ttf' } } },
    ],
    compositions: [{ key: 'body', name: 'Body', members: [{ fontKey: 'latin' }, { fontKey: 'cjk' }] }],
  })
  fs.putText(`/project/${PROJECT_ICON_REGISTRY_FILE_NAME}`, {
    iconSeries: [
      { key: 'status', name: 'Status', icons: [{ iconKey: 'ok', name: 'OK', source: 'support@icons/ok.svg', tint: 'theme' }] },
      { key: 'unused', name: 'Unused', icons: [{ iconKey: 'idle', name: 'Idle', source: '.opencard/icons/idle.svg', tint: 'theme' }] },
    ],
  })
  fs.putText(`/project/${PROJECT_PROFILE_FILE_NAME}`, { name: 'Demo', cover: 'images/cover.png' })
  fs.putText('/project/.opencard/fonts/cjk-bold.otf', 'bold')
  fs.putText('/project/.opencard/fonts/unused.ttf', 'unused')
  fs.putText('/project/.opencard/icons/idle.svg', 'idle')
  fs.putText('/project/.opencard/locale.json', '{"entries":[]}')
  fs.putText('/project/images/cover.png', 'cover')
  fs.putText('/project/images/card.png', 'card')
  fs.putText('/project/.opencard/packages/support/fonts/shared.ttf', 'shared')
  fs.putText('/project/.opencard/packages/support/icons/ok.svg', 'ok')
  fs.putText('/project/.opencard/packages/support/icons/unused.svg', 'unused-subpackage-icon')
  fs.putText('/project/.opencard/packages/support/.opencard/manifest.json', { key: 'support', name: 'Support', version: '1.2.0' })
  return fs
}

function lastRequest(): ResourcePackageBuildRequest {
  return invoke.mock.calls[invoke.mock.calls.length - 1]![1].request
}

describe('buildResourcePackageFromProject', () => {
  it('hands Rust a plan that keeps source paths, package paths, and already-compressed files stored', async () => {
    invoke.mockClear()
    await buildResourcePackageFromProject({
      fs: createFileSystem(),
      projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      fontSelection: { familyKeys: ['latin', 'cjk'], compositionKeys: ['body'] },
      iconSelection: { seriesKeys: ['status'] },
      imageSelection: { paths: ['images/card.png'] },
      packageSelection: { keys: ['support'] },
      outputPath: '/out/theme.ocpack',
    })
    const request = lastRequest()

    expect(request.outputPath).toBe('/out/theme.ocpack')
    expect(request.publicFonts).toEqual([{ key: 'latin', title: 'Latin' }, { key: 'cjk', title: 'CJK' }, { key: 'body', title: 'Body' }])
    expect(request.publicIconSeries).toEqual([{ key: 'status', title: 'Status', count: 1 }])
    // 选中的字体家族没引用到的字体不进包。
    expect(request.files.some(file => file.sourcePath === '/project/.opencard/fonts/unused.ttf')).toBe(false)
    // 文件位置原样，包内资源仍指向同一个位置；图片按压缩状态直接存。
    expect(request.files.find(file => file.sourcePath === '/project/.opencard/fonts/cjk-bold.otf'))
      .toMatchObject({ archivePath: '.opencard/fonts/cjk-bold.otf', stored: false })
    expect(request.files.find(file => file.sourcePath === '/project/images/card.png'))
      .toMatchObject({ archivePath: 'images/card.png', stored: true })
    expect(request.cover).toBe('images/cover.png')
    expect(request.packages).toEqual([{ key: 'support', name: 'Support', version: '1.2.0' }])
  })

  it('bundles a referenced sub-package whole and writes its registry references as Key@path', async () => {
    invoke.mockClear()
    await buildResourcePackageFromProject({
      fs: createFileSystem(),
      projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      fontSelection: { familyKeys: ['latin'], compositionKeys: [] },
      iconSelection: { seriesKeys: ['status'] },
      outputPath: '/out/theme.ocpack',
    })
    const request = lastRequest()

    // 被引用的子包整包带上（含没被引用的图标与它自己的清单）。
    expect(request.files.map(file => file.archivePath)).toContain('.opencard/packages/support/icons/unused.svg')
    expect(request.files.map(file => file.archivePath)).toContain('.opencard/packages/support/.opencard/manifest.json')
    // 注册表里的引用换成包 Key 写法，位置仍是同一个。
    const fonts = request.texts.find(text => text.archivePath === PROJECT_FONT_REGISTRY_FILE_NAME)
    expect(JSON.parse(fonts!.text).families[0].files.normal.upright).toBe('support@fonts/shared.ttf')
    const icons = request.texts.find(text => text.archivePath === PROJECT_ICON_REGISTRY_FILE_NAME)
    expect(JSON.parse(icons!.text).iconSeries[0].icons[0].source).toBe('support@icons/ok.svg')
    expect(request.texts.map(text => text.archivePath)).toContain('.opencard/locale.json')
  })

  it('rejects a selection that is empty, unavailable, or missing on disk', async () => {
    const empty = createFileSystem()
    await expect(buildResourcePackageFromProject({
      fs: empty, projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      outputPath: '/out/theme.ocpack',
    })).rejects.toThrow('Select at least one resource')

    await expect(buildResourcePackageFromProject({
      fs: createFileSystem(), projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      outputPath: '/out/theme.ocpack',
      fontSelection: { familyKeys: ['missing'], compositionKeys: [] },
    })).rejects.toThrow('Selected project font is unavailable: missing')

    await expect(buildResourcePackageFromProject({
      fs: createFileSystem(), projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      outputPath: '/out/theme.ocpack',
      packageSelection: { keys: ['absent'] },
    })).rejects.toThrow('Selected resource package is missing: absent')
  })

  it('omits the cover when the project has none and never fails the build for it', async () => {
    const fs = createFileSystem()
    fs.putText(`/project/${PROJECT_PROFILE_FILE_NAME}`, { name: 'Demo', cover: 'images/missing.png' })
    invoke.mockClear()
    const result = await buildResourcePackageFromProject({
      fs, projectRootPath: '/project', key: 'theme', name: 'Theme', version: '1.0.0',
      imageSelection: { paths: ['images/card.png'] },
      outputPath: '/out/theme.ocpack',
    })

    expect(lastRequest().cover).toBeUndefined()
    expect(result.imagePaths).toEqual(['/project/images/card.png'])
  })
})
