import { describe, expect, it, vi } from 'vitest'
import type { FileSystemService } from './fileSystemService'
import type { StoredResourcePackagePathService } from './storedResourcePackageLibrary'
import { StoredResourcePackageLibraryService } from './storedResourcePackageLibrary'

const archives = vi.hoisted(() => ({ readResourcePackageArchive: vi.fn() }))

vi.mock('./resourcePackageArchive', () => ({
  readResourcePackageArchive: archives.readResourcePackageArchive,
}))

type DirectoryEntry = { name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }

class MemoryFileSystem implements Pick<FileSystemService,
  'createDirectory' | 'readDirectory' | 'fileExists' | 'copyFile' | 'deleteFile' | 'pickFile'
> {
  readonly directories = new Set<string>()
  readonly files = new Map<string, Uint8Array>()
  readonly pickFile = vi.fn(async () => null as string | null)

  async createDirectory(path: string): Promise<void> { this.directories.add(path) }
  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path)
  }
  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    if (!this.directories.has(path)) throw new Error(`Missing directory: ${path}`)
    const prefix = `${path}/`
    const names = new Set<string>()
    for (const candidate of [...this.files.keys(), ...this.directories]) {
      if (!candidate.startsWith(prefix)) continue
      const name = candidate.slice(prefix.length).split('/')[0]
      if (name) names.add(name)
    }
    return [...names].map((name) => ({
      name,
      isFile: this.files.has(`${prefix}${name}`),
      isDirectory: this.directories.has(`${prefix}${name}`),
      isSymlink: false,
    }))
  }
  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    const value = this.files.get(sourcePath)
    if (!value) throw new Error(`Missing file: ${sourcePath}`)
    this.files.set(targetPath, new Uint8Array(value))
  }
  async deleteFile(path: string): Promise<void> { this.files.delete(path) }
}

const paths: StoredResourcePackagePathService = {
  appStorageDir: async () => '/app',
  join: async (...segments: string[]) => segments.join('/'),
}

/** 读一个归档得到的全部信息：身份与指纹。 */
function archive(coordinate: string, title: string, fingerprint = 'fp') {
  const [author, nameVersion] = coordinate.split('/')
  const [name, version] = nameVersion!.split('@')
  return {
    coordinate,
    manifest: {
      type: 'opencard-resource-package',
      author: author!, name: name!, version: version!, title,
      public: { fonts: [], iconSeries: [] },
    },
    fingerprint,
  }
}

function createLibrary(fs: MemoryFileSystem): StoredResourcePackageLibraryService {
  return new StoredResourcePackageLibraryService(fs as unknown as FileSystemService, paths)
}

describe('StoredResourcePackageLibraryService', () => {
  it('ignores files that are not add-on packages', async () => {
    const fs = new MemoryFileSystem()
    fs.directories.add('/app/packages')
    fs.files.set('/app/packages/notes.txt', new Uint8Array([1]))
    archives.readResourcePackageArchive.mockReset()

    const library = await createLibrary(fs).loadLibrary()

    expect(library).toEqual({ packs: [], warnings: [] })
    expect(archives.readResourcePackageArchive).not.toHaveBeenCalled()
  })

  it('lists add-on packages sorted by title and reports unreadable ones as warnings', async () => {
    const fs = new MemoryFileSystem()
    fs.directories.add('/app/packages')
    fs.files.set('/app/packages/zeta.ocpack', new Uint8Array([1]))
    fs.files.set('/app/packages/alpha.ocpack', new Uint8Array([3]))
    fs.files.set('/app/packages/broken.ocpack', new Uint8Array([2]))
    archives.readResourcePackageArchive.mockReset()
    archives.readResourcePackageArchive.mockImplementation(async (sourcePath: string) => {
      if (sourcePath.endsWith('broken.ocpack')) throw new Error('Package manifest is invalid')
      if (sourcePath.endsWith('alpha.ocpack')) return archive('alice/alpha@1.0.0', 'Alpha Pack', 'fp-alpha')
      return archive('zeta/zeta@2.0.0', 'Zeta Pack', 'fp-zeta')
    })

    const library = await createLibrary(fs).loadLibrary()

    expect(library.packs).toEqual([
      { path: '/app/packages/alpha.ocpack', coordinate: 'alice/alpha@1.0.0', title: 'Alpha Pack', fingerprint: 'fp-alpha' },
      { path: '/app/packages/zeta.ocpack', coordinate: 'zeta/zeta@2.0.0', title: 'Zeta Pack', fingerprint: 'fp-zeta' },
    ])
    expect(library.warnings).toEqual([
      { path: '/app/packages/broken.ocpack', reason: 'Package manifest is invalid' },
    ])
  })

  it('reads a package before storing it and names the file after its coordinate', async () => {
    const fs = new MemoryFileSystem()
    fs.files.set('/incoming/Theme.ocpack', new Uint8Array([7, 7]))
    archives.readResourcePackageArchive.mockReset()
    archives.readResourcePackageArchive.mockResolvedValue(archive('alice/theme@1.0.0', 'Theme', 'fp-theme'))

    const imported = await createLibrary(fs).importPackage('/incoming/Theme.ocpack')

    expect(archives.readResourcePackageArchive).toHaveBeenCalledWith('/incoming/Theme.ocpack')
    // 文件名不参与身份，只用来去重；版本进名字，同一个包的多个版本才能并存。
    expect(imported).toEqual({
      path: '/app/packages/alice-theme-1.0.0.ocpack',
      coordinate: 'alice/theme@1.0.0',
      title: 'Theme',
      fingerprint: 'fp-theme',
    })
    expect(fs.files.get('/app/packages/alice-theme-1.0.0.ocpack')).toEqual(new Uint8Array([7, 7]))
  })

  it('keeps an already stored package under the same name and suffixes the new file', async () => {
    const fs = new MemoryFileSystem()
    fs.directories.add('/app/packages')
    fs.files.set('/app/packages/alice-theme-1.0.0.ocpack', new Uint8Array([1]))
    fs.files.set('/incoming/Theme.ocpack', new Uint8Array([2]))
    archives.readResourcePackageArchive.mockReset()
    archives.readResourcePackageArchive.mockResolvedValue(archive('alice/theme@1.0.0', 'Theme', 'fp-theme'))

    const imported = await createLibrary(fs).importPackage('/incoming/Theme.ocpack')

    expect(imported.path).toBe('/app/packages/alice-theme-1.0.0-2.ocpack')
    expect(fs.files.get('/app/packages/alice-theme-1.0.0.ocpack')).toEqual(new Uint8Array([1]))
    expect(fs.files.get('/app/packages/alice-theme-1.0.0-2.ocpack')).toEqual(new Uint8Array([2]))
  })

  it('refuses to store an archive it cannot read', async () => {
    const fs = new MemoryFileSystem()
    fs.files.set('/incoming/Broken.ocpack', new Uint8Array([3]))
    archives.readResourcePackageArchive.mockReset()
    archives.readResourcePackageArchive.mockRejectedValue(new Error('Package fingerprint is missing'))

    await expect(createLibrary(fs).importPackage('/incoming/Broken.ocpack'))
      .rejects.toThrow('Package fingerprint is missing')
    expect(fs.files.has('/app/packages/Broken.ocpack')).toBe(false)
  })

  it('offers only package archives in the file dialog', async () => {
    const fs = new MemoryFileSystem()

    await createLibrary(fs).pickSourceFile('Choose a package')

    expect(fs.pickFile).toHaveBeenCalledWith({
      title: 'Choose a package',
      fileTypeName: 'OpenCard package',
      extensions: ['ocpack'],
    })
  })

  it('removes one stored package', async () => {
    const fs = new MemoryFileSystem()
    fs.directories.add('/app/packages')
    fs.files.set('/app/packages/theme.ocpack', new Uint8Array([1]))

    await createLibrary(fs).removePackage('/app/packages/theme.ocpack')

    expect(fs.files.has('/app/packages/theme.ocpack')).toBe(false)
  })
})
