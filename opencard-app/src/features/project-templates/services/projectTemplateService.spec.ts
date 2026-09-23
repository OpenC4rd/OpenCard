import type { DirEntry } from '@tauri-apps/plugin-fs'
import { describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { FileSystemService } from '../../workspace/services/fileSystemService'
import type { ProjectTemplate } from '../model/projectTemplate'
import {
  ProjectTemplateService,
  type ProjectTemplatePathService,
} from './projectTemplateService'

vi.mock('@tauri-apps/api/path', () => ({
  basename: vi.fn(),
  join: vi.fn(),
  resolveResource: vi.fn(),
}))

vi.mock('../../workspace/services/fileSystemService', () => ({
  fileSystemService: {},
}))

type FileContent = string | Uint8Array

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/')
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'))
}

function parentPath(value: string): string {
  const normalized = normalizePath(value)
  const separator = normalized.lastIndexOf('/')
  return separator <= 0 ? '/' : normalized.slice(0, separator)
}

function baseName(value: string): string {
  const segments = normalizePath(value).split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

class MemoryFileSystem implements FileSystemService {
  private readonly directories = new Set<string>(['/'])
  private readonly files = new Map<string, FileContent>()
  private readonly symlinks = new Set<string>()
  failCopyFrom: string | null = null
  failDeletePath: string | null = null
  failBinaryReadFrom: string | null = null

  putDirectory(path: string): void {
    const normalized = normalizePath(path)
    if (normalized !== '/') this.putDirectory(parentPath(normalized))
    this.directories.add(normalized)
  }

  putFile(path: string, content: FileContent): void {
    const normalized = normalizePath(path)
    this.putDirectory(parentPath(normalized))
    this.files.set(normalized, content)
  }

  putSymlink(path: string, isDirectory = false): void {
    if (isDirectory) this.putDirectory(path)
    else this.putFile(path, '')
    this.symlinks.add(normalizePath(path))
  }

  rawFile(path: string): FileContent | undefined {
    return this.files.get(normalizePath(path))
  }

  allPaths(): string[] {
    return [...this.directories, ...this.files.keys()].sort()
  }

  async openProject(): Promise<string | null> {
    return null
  }

  async pickDirectory(_title: string): Promise<string | null> {
    return null
  }

  async pickFile(_options: { title: string; fileTypeName: string; extensions: string[] }): Promise<string | null> {
    return null
  }

  async pickSavePath(_options: {
    defaultPath: string
    fileTypeName?: string
    extensions?: string[]
    title?: string
  }): Promise<string | null> {
    return null
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(normalizePath(path))
    if (content === undefined) throw new Error(`Missing file: ${path}`)
    return typeof content === 'string' ? content : new TextDecoder().decode(content)
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.putFile(path, content)
  }

  async readBinaryFile(path: string): Promise<Uint8Array> {
    const normalized = normalizePath(path)
    if (this.failBinaryReadFrom === normalized) throw new Error(`Injected binary read failure: ${normalized}`)
    const content = this.files.get(normalized)
    if (content === undefined) throw new Error(`Missing file: ${path}`)
    return content instanceof Uint8Array ? content.slice() : new TextEncoder().encode(content)
  }

  async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
    this.putFile(path, content.slice())
  }

  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    const source = normalizePath(sourcePath)
    if (this.failCopyFrom === source) throw new Error(`Injected copy failure: ${source}`)
    const content = this.files.get(source)
    if (content === undefined) throw new Error(`Missing copy source: ${source}`)
    this.putFile(targetPath, content instanceof Uint8Array ? content.slice() : content)
  }

  async deleteFile(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (this.failDeletePath === normalized) throw new Error(`Injected delete failure: ${normalized}`)
    const nestedPrefix = `${normalized}/`
    for (const filePath of [...this.files.keys()]) {
      if (filePath === normalized || filePath.startsWith(nestedPrefix)) this.files.delete(filePath)
    }
    for (const directoryPath of [...this.directories]) {
      if (directoryPath === normalized || directoryPath.startsWith(nestedPrefix)) {
        this.directories.delete(directoryPath)
      }
    }
    for (const symlinkPath of [...this.symlinks]) {
      if (symlinkPath === normalized || symlinkPath.startsWith(nestedPrefix)) this.symlinks.delete(symlinkPath)
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const source = normalizePath(oldPath)
    const target = normalizePath(newPath)
    if (!this.directories.has(source) && !this.files.has(source)) throw new Error(`Missing rename source: ${source}`)
    if (this.directories.has(target) || this.files.has(target)) throw new Error(`Rename target exists: ${target}`)
    this.putDirectory(parentPath(target))

    if (this.files.has(source)) {
      const content = this.files.get(source)
      this.files.delete(source)
      if (content !== undefined) this.files.set(target, content)
      return
    }

    const directoryPaths = [...this.directories]
      .filter((path) => path === source || path.startsWith(`${source}/`))
      .sort((a, b) => a.length - b.length)
    const filePaths = [...this.files.keys()]
      .filter((path) => path.startsWith(`${source}/`))

    for (const path of directoryPaths) this.directories.delete(path)
    for (const path of filePaths) {
      const content = this.files.get(path)
      this.files.delete(path)
      if (content !== undefined) this.files.set(`${target}${path.slice(source.length)}`, content)
    }
    for (const path of directoryPaths) this.directories.add(`${target}${path.slice(source.length)}`)
  }

  async trashFile(path: string): Promise<void> {
    await this.deleteFile(path)
  }

  async revealInFileManager(_path: string): Promise<void> {}

  async openWithDefaultApp(_path: string): Promise<void> {}

  async fileExists(path: string): Promise<boolean> {
    const normalized = normalizePath(path)
    return this.directories.has(normalized) || this.files.has(normalized)
  }

  async getFileInfo(path: string): ReturnType<FileSystemService['getFileInfo']> {
    const normalized = normalizePath(path)
    if (!this.directories.has(normalized) && !this.files.has(normalized)) {
      throw new Error(`Missing path: ${normalized}`)
    }
    return {
      isFile: this.files.has(normalized),
      isDirectory: this.directories.has(normalized),
      isSymlink: this.symlinks.has(normalized),
      size: 0,
      mtime: null,
      atime: null,
      birthtime: null,
      dev: null,
      ino: null,
      mode: null,
      nlink: null,
      uid: null,
      gid: null,
      rdev: null,
      blksize: null,
      blocks: null,
      readonly: false,
      fileAttributes: null,
    }
  }

  async readDirectory(path: string, recursive = false): Promise<DirEntry[]> {
    return recursive
      ? await this.readDirectoryEntries(path, Number.POSITIVE_INFINITY)
      : this.immediateEntries(path)
  }

  async readDirectoryEntries(path: string, depth = 1, basePath = ''): Promise<DirEntry[]> {
    const result: DirEntry[] = []
    const maxDepth = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : Number.POSITIVE_INFINITY

    const visit = (directory: string, relativeBase: string, currentDepth: number): void => {
      for (const entry of this.immediateEntries(directory)) {
        const name = relativeBase ? `${relativeBase}/${entry.name}` : entry.name
        result.push({ ...entry, name })
        if (entry.isDirectory && currentDepth < maxDepth) {
          visit(joinPath(directory, entry.name), name, currentDepth + 1)
        }
      }
    }

    visit(normalizePath(path), basePath, 1)
    return result
  }

  async createDirectory(path: string): Promise<void> {
    this.putDirectory(path)
  }

  async startWatching(_path: string): Promise<void> {}

  async stopWatching(): Promise<void> {}

  private immediateEntries(path: string): DirEntry[] {
    const directory = normalizePath(path)
    if (!this.directories.has(directory)) throw new Error(`Missing directory: ${directory}`)
    const entries = new Map<string, DirEntry>()

    for (const childPath of this.directories) {
      if (childPath !== directory && parentPath(childPath) === directory) {
        const name = baseName(childPath)
        entries.set(name, {
          name,
          isDirectory: true,
          isFile: false,
          isSymlink: this.symlinks.has(childPath),
        })
      }
    }
    for (const childPath of this.files.keys()) {
      if (parentPath(childPath) === directory) {
        const name = baseName(childPath)
        entries.set(name, {
          name,
          isDirectory: false,
          isFile: true,
          isSymlink: this.symlinks.has(childPath),
        })
      }
    }
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}

const paths: ProjectTemplatePathService = {
  async appStorageDir() {
    return '/appdata'
  },
  async basename(path) {
    return baseName(path)
  },
  async join(...parts) {
    return joinPath(...parts)
  },
  async resolveResource(path) {
    return joinPath('/resources', path)
  },
}

function createService(fs: MemoryFileSystem, id = 'test-id'): ProjectTemplateService {
  return new ProjectTemplateService(fs, paths, () => id)
}

function addTemplatePackage(
  fs: MemoryFileSystem,
  root: string,
  options: { id: string; name: string; entry?: string },
): void {
  const entry = options.entry ?? 'main.ocdocument'
  fs.putFile(`${root}/template.json`, JSON.stringify({
    schemaVersion: 1,
    id: options.id,
    name: options.name,
    description: '',
    entry,
  }))
  fs.putFile(`${root}/content/.opencard/project.json`, projectFile(options.name))
  fs.putFile(`${root}/content/${entry}`, cardDocument())
}

function projectFile(name = 'Project'): string {
  return JSON.stringify({
    name,
  })
}

function cardDocument(name = ''): string {
  return JSON.stringify({
    type: 'card-document',
    id: 'card-document-fixture',
    name,
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'card-face-fixture-front',
        background: '#FFFFFF',
        children: [],
      },
      back: {
        type: 'card-face',
        id: 'card-face-fixture-back',
        background: '#FFFFFF',
        children: [],
      },
    },
    instances: [],
  })
}

function addImportSource(fs: MemoryFileSystem): void {
  fs.putFile('/source/.opencard/project.json', projectFile())
  fs.putFile('/source/main.ocdocument', cardDocument())
  fs.putFile('/source/assets/portrait.png', new Uint8Array([0, 127, 255]))
}

function templateFixture(contentPath = '/template/content', entry = 'main.ocdocument'): ProjectTemplate {
  return {
    schemaVersion: 1,
    id: 'blank',
    key: 'builtin:blank',
    source: 'builtin',
    name: 'Blank',
    description: '',
    entry,
    rootPath: '/template',
    contentPath,
    coverPaths: [],
  }
}


describe('ProjectTemplateService catalog', () => {
  it('preserves built-in order, sorts user templates, and reports an invalid user manifest', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({
      schemaVersion: 1,
      templates: ['tactical', 'blank'],
    }))
    addTemplatePackage(fs, '/resources/templates/tactical', { id: 'tactical', name: 'Tactical' })
    addTemplatePackage(fs, '/resources/templates/blank', { id: 'blank', name: 'Blank' })
    addTemplatePackage(fs, '/appdata/templates/zulu', { id: 'zulu', name: 'Zulu' })
    addTemplatePackage(fs, '/appdata/templates/alpha', { id: 'alpha', name: 'Alpha' })
    fs.putFile('/appdata/templates/broken/template.json', '{not-json')

    const catalog = await createService(fs).loadCatalog()

    expect(catalog.templates.map(({ key }) => key)).toEqual([
      'builtin:tactical',
      'builtin:blank',
      'user:alpha',
      'user:zulu',
    ])
    expect(catalog.warnings).toEqual([
      expect.objectContaining({ path: '/appdata/templates/broken' }),
    ])
  })

  it('treats an invalid built-in manifest as a fatal installation error', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: ['broken'] }))
    fs.putFile('/resources/templates/broken/template.json', '{not-json')

    await expect(createService(fs).loadCatalog()).rejects.toMatchObject({ code: 'invalid-manifest' })
  })

  it('cleans stale temporary user packages and reports cleanup failures', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: [] }))
    fs.putFile('/appdata/templates/.tmp-stale/content.bin', 'partial')
    fs.putFile('/appdata/templates/.tmp-locked/content.bin', 'partial')
    fs.failDeletePath = '/appdata/templates/.tmp-locked'

    const catalog = await createService(fs).loadCatalog()

    expect(await fs.fileExists('/appdata/templates/.tmp-stale')).toBe(false)
    expect(await fs.fileExists('/appdata/templates/.tmp-locked')).toBe(true)
    expect(catalog.warnings).toEqual([expect.objectContaining({ path: '/appdata/templates/.tmp-locked' })])
  })
})

describe('ProjectTemplateService prepared package import', () => {
  it('imports manifest metadata and multiple cover images without recreating the package', async () => {
    const fs = new MemoryFileSystem()
    const manifest = JSON.stringify({
      schemaVersion: 1,
      id: 'prepared',
      name: 'Prepared Template',
      description: 'Ready to install',
      entry: 'main.ocdocument',
      covers: ['assets/cover-a.png', 'assets/cover-b.webp'],
    })
    fs.putFile('/prepared.octemplate', zipSync({
      'template.json': strToU8(manifest),
      'content/.opencard/project.json': strToU8(projectFile()),
      'content/main.ocdocument': strToU8(cardDocument('Prepared Blueprint')),
      'content/assets/cover-a.png': new Uint8Array([1, 2]),
      'content/assets/cover-b.webp': new Uint8Array([3, 4]),
    }))

    const imported = await createService(fs).importUserTemplate('/prepared.octemplate')

    expect(imported).toMatchObject({
      key: 'user:prepared',
      name: 'Prepared Template',
      covers: ['assets/cover-a.png', 'assets/cover-b.webp'],
      coverPaths: [
        '/appdata/templates/prepared/content/assets/cover-a.png',
        '/appdata/templates/prepared/content/assets/cover-b.webp',
      ],
      entryNames: { 'main.ocdocument': 'Prepared Blueprint' },
    })
    expect(fs.rawFile('/appdata/templates/prepared/content/assets/cover-b.webp'))
      .toEqual(new Uint8Array([3, 4]))
    expect(await fs.fileExists('/appdata/templates/prepared/content/.opencard/project.json')).toBe(true)
  })

  it('rejects files outside content and unsupported extensions', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/unsafe.zip', zipSync({
      'template.json': strToU8(JSON.stringify({
        schemaVersion: 1,
        id: 'unsafe',
        name: 'Unsafe',
        description: '',
        entry: 'main.ocdocument',
      })),
      'content/main.ocdocument': strToU8(cardDocument()),
      'outside.txt': strToU8('no'),
    }))

    await expect(createService(fs).importUserTemplate('/unsafe.zip')).rejects.toMatchObject({ code: 'invalid-package' })
    await expect(createService(fs).importUserTemplate('/unsafe.rar')).rejects.toMatchObject({ code: 'invalid-package' })
  })

})

describe('ProjectTemplateService package export', () => {

  it('does not allow an existing project dictionary to be excluded', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    fs.putFile('/source/.opencard/locale.json', '{}')

    await expect(createService(fs).exportProjectTemplate({
      sourcePath: '/source',
      outputPath: '/exports/Portable.octemplate',
      name: 'Portable',
      description: '',
      entry: 'main.ocdocument',
      covers: [],
      excludedPaths: ['.opencard/locale.json'],
    })).rejects.toMatchObject({ code: 'source-not-project' })
  })

  it('reports binary resource failures as archive errors', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    fs.failBinaryReadFrom = '/source/assets/portrait.png'

    await expect(createService(fs).exportProjectTemplate({
      sourcePath: '/source',
      outputPath: '/exports/Portable.octemplate',
      name: 'Portable',
      description: '',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
      excludedPaths: [],
    })).rejects.toMatchObject({ code: 'archive-failed' })
  })
})

describe('ProjectTemplateService user template creation', () => {
  it('copies document and binary assets while excluding runtime cache', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)

    const imported = await createService(fs, 'user-template').createUserTemplate({
      sourcePath: '/source',
      name: ' Imported ',
      description: ' Personal copy ',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
    })

    expect(imported).toMatchObject({
      key: 'user:user-template',
      name: 'Imported',
      description: 'Personal copy',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
    })
    expect(await fs.fileExists('/appdata/templates/user-template/content/main.ocdocument')).toBe(true)
    expect(fs.rawFile('/appdata/templates/user-template/content/assets/portrait.png')).toEqual(
      new Uint8Array([0, 127, 255]),
    )
  })

  it('removes the temporary package when copying fails', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    fs.failCopyFrom = '/source/assets/portrait.png'

    await expect(createService(fs, 'failed').createUserTemplate({
      sourcePath: '/source',
      name: 'Imported',
      description: '',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
    })).rejects.toMatchObject({ code: 'copy-failed' })

    expect(fs.allPaths().some((path) => path.includes('.tmp-failed'))).toBe(false)
    expect(await fs.fileExists('/appdata/templates/failed')).toBe(false)
  })

  it('does not commit the final package when runtime path resolution fails', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    const failingPaths: ProjectTemplatePathService = {
      ...paths,
      async join(...parts) {
        if (parts[0] === '/appdata/templates/path-failure' && parts[1] === 'content') {
          throw new Error('Injected path failure')
        }
        return joinPath(...parts)
      },
    }
    const service = new ProjectTemplateService(fs, failingPaths, () => 'path-failure')

    await expect(service.createUserTemplate({
      sourcePath: '/source',
      name: 'Imported',
      description: '',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
    })).rejects.toMatchObject({ code: 'copy-failed' })

    expect(await fs.fileExists('/appdata/templates/path-failure')).toBe(false)
    expect(await fs.fileExists('/appdata/templates/.tmp-path-failure')).toBe(false)
  })
})

describe('ProjectTemplateService project creation', () => {
  it('creates an empty project folder when the template has no entry or content directory', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects')
    const template = templateFixture('/template/content')
    delete template.entry

    const created = await createService(fs, 'empty-id').createProject({
      template,
      parentPath: '/projects',
      projectName: 'Empty',
    })

    expect(created).toEqual({ path: '/projects/Empty' })
    expect(fs.allPaths().filter(path => path.startsWith('/projects/Empty'))).toEqual([
      '/projects/Empty',
      '/projects/Empty/.opencard',
      '/projects/Empty/.opencard/fonts',
      '/projects/Empty/.opencard/fonts/fonts.json',
      '/projects/Empty/.opencard/icons',
      '/projects/Empty/.opencard/icons/icons.json',
      '/projects/Empty/.opencard/locale.json',
      '/projects/Empty/.opencard/packages',
      '/projects/Empty/.opencard/project.json',
    ])
  })

  it('copies the selected template atomically and returns its entry', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects')
    fs.putFile('/template/content/.opencard/project.json', projectFile())
    fs.putFile('/template/content/cards/main.ocdocument', cardDocument())
    fs.putFile('/template/content/assets/portrait.png', new Uint8Array([1, 2, 3]))

    const created = await createService(fs, 'create-id').createProject({
      template: templateFixture('/template/content', 'cards/main.ocdocument'),
      parentPath: '/projects',
      projectName: '  Demo',
    })

    expect(created).toEqual({ path: '/projects/Demo', entry: '/projects/Demo/cards/main.ocdocument' })
    expect(await fs.fileExists('/projects/Demo/.opencard/project.json')).toBe(true)
    const projectFileContent = JSON.parse(fs.rawFile('/projects/Demo/.opencard/project.json') as string)
    expect(projectFileContent).toMatchObject({ name: 'Demo' })
    expect(projectFileContent).not.toHaveProperty('entry')
    expect(fs.rawFile('/projects/Demo/assets/portrait.png')).toEqual(new Uint8Array([1, 2, 3]))
    expect(fs.allPaths().some((path) => path.includes('.Demo.opencard-create-'))).toBe(false)
  })

  it('copies template content without opening a page when None is selected', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects')
    fs.putFile('/template/content/.opencard/project.json', projectFile())
    fs.putFile('/template/content/main.ocdocument', cardDocument())

    const created = await createService(fs, 'no-entry').createProject({
      template: templateFixture(),
      parentPath: '/projects',
      projectName: 'Standard',
      entry: '',
    })

    expect(created).toEqual({ path: '/projects/Standard' })
    expect(await fs.fileExists('/projects/Standard/main.ocdocument')).toBe(true)
  })

  it('refuses an existing target without touching it', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects/Demo')
    fs.putFile('/template/content/.opencard/project.json', projectFile())
    fs.putFile('/template/content/main.ocdocument', cardDocument())

    await expect(createService(fs).createProject({
      template: templateFixture(),
      parentPath: '/projects',
      projectName: 'Demo',
    })).rejects.toMatchObject({ code: 'target-exists' })

    expect(fs.allPaths().some((path) => path.includes('.Demo.opencard-create-'))).toBe(false)
  })

  it('returns a selected candidate entry without persisting it as project metadata', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects')
    fs.putFile('/template/content/.opencard/project.json', projectFile())
    fs.putFile('/template/content/main.ocdocument', cardDocument())
    fs.putFile('/template/content/alternate.ocdocument', cardDocument())
    const template = {
      ...templateFixture(),
      entries: ['main.ocdocument', 'alternate.ocdocument'],
    }

    const created = await createService(fs).createProject({
      template,
      parentPath: '/projects',
      projectName: 'Demo',
      entry: 'alternate.ocdocument',
    })

    expect(created.entry).toBe('/projects/Demo/alternate.ocdocument')
    const projectFileContent = JSON.parse(fs.rawFile('/projects/Demo/.opencard/project.json') as string)
    expect(projectFileContent).toMatchObject({ name: 'Demo' })
    expect(projectFileContent).not.toHaveProperty('entry')
  })

  it('rolls back when the template entry is missing', async () => {
    const fs = new MemoryFileSystem()
    fs.putDirectory('/projects')
    fs.putFile('/template/content/.opencard/project.json', projectFile())

    await expect(createService(fs, 'missing-entry').createProject({
      template: templateFixture('/template/content', 'missing.ocdocument'),
      parentPath: '/projects',
      projectName: 'Demo',
    })).rejects.toMatchObject({ code: 'entry-not-found' })

    expect(await fs.fileExists('/projects/Demo')).toBe(false)
    expect(fs.allPaths().some((path) => path.includes('.Demo.opencard-create-missing-entry'))).toBe(false)
  })
})

describe('ProjectTemplateService safety boundaries', () => {
  it('accepts a document entry whose missing faces can use current defaults', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/source/.opencard/project.json', projectFile())
    fs.putFile('/source/main.ocdocument', JSON.stringify({
      type: 'card-document',
      id: 'legacy',
      name: 'Legacy',
      version: '1.0.0',
      width: '540',
      height: '850',
      background: '#FFFFFF',
      children: [],
      instances: [],
    }))

    await expect(createService(fs).inspectProjectSource('/source')).resolves.toMatchObject({
      entries: ['main.ocdocument'],
    })
  })

  it('rejects an import source containing a symlink before creating a temporary package', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    fs.putSymlink('/source/assets/linked.png')

    await expect(createService(fs, 'symlinked').createUserTemplate({
      sourcePath: '/source',
      name: 'Unsafe',
      description: '',
      entry: 'main.ocdocument',
      covers: ['assets/portrait.png'],
    })).rejects.toMatchObject({ code: 'source-has-symlink' })

    expect(fs.allPaths().some((path) => path.includes('.tmp-symlinked'))).toBe(false)
    expect(await fs.fileExists('/appdata/templates/symlinked')).toBe(false)
  })

  it('rejects a symlink selected as the import root', async () => {
    const fs = new MemoryFileSystem()
    addImportSource(fs)
    fs.putSymlink('/source', true)

    await expect(createService(fs).inspectProjectSource('/source')).rejects.toMatchObject({
      code: 'source-has-symlink',
    })
  })

  it('sorts valid document entries and imports a selected entry other than the first', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/source/.opencard/project.json', projectFile())
    fs.putFile('/source/z-last.ocdocument', cardDocument('Last Blueprint'))
    fs.putFile('/source/cards/a-first.ocdocument', cardDocument('First Blueprint'))
    fs.putFile('/source/b-middle.ocdocument', cardDocument())
    fs.putFile('/source/invalid.ocdocument', '{not-json')
    const service = createService(fs, 'multi-entry')

    const inspection = await service.inspectProjectSource('/source')
    expect(inspection.entries).toEqual([
      'b-middle.ocdocument',
      'cards/a-first.ocdocument',
      'z-last.ocdocument',
    ])
    expect(inspection.entryNames).toEqual({
      'b-middle.ocdocument': 'b-middle.ocdocument',
      'cards/a-first.ocdocument': 'First Blueprint',
      'z-last.ocdocument': 'Last Blueprint',
    })

    const imported = await service.createUserTemplate({
      sourcePath: '/source',
      name: 'Multiple entries',
      description: '',
      entry: 'z-last.ocdocument',
      covers: [],
    })
    expect(imported.entry).toBe('z-last.ocdocument')
    expect(await fs.fileExists('/appdata/templates/multi-entry/content/z-last.ocdocument')).toBe(true)
  })

  it('deletes a user template and rejects deletion of a built-in template', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/appdata/templates/personal/content/main.ocdocument', cardDocument())
    const service = createService(fs)
    const userTemplate: ProjectTemplate = {
      ...templateFixture('/appdata/templates/personal/content'),
      id: 'personal',
      key: 'user:personal',
      source: 'user',
      rootPath: '/projects/must-not-delete',
    }

    fs.putFile('/projects/must-not-delete/keep.txt', 'keep')
    await service.deleteUserTemplate(userTemplate)
    expect(await fs.fileExists('/appdata/templates/personal')).toBe(false)
    expect(await fs.fileExists('/projects/must-not-delete/keep.txt')).toBe(true)

    const builtin = templateFixture()
    await expect(service.deleteUserTemplate(builtin)).rejects.toMatchObject({
      code: 'builtin-delete-forbidden',
    })
  })

  it('warns for a user package ID mismatch and for symlinked package content', async () => {
    const fs = new MemoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: [] }))
    addTemplatePackage(fs, '/appdata/templates/package-name', { id: 'different-id', name: 'Mismatch' })
    addTemplatePackage(fs, '/appdata/templates/symlinked', { id: 'symlinked', name: 'Symlinked' })
    fs.putSymlink('/appdata/templates/symlinked/content/linked.png')

    const catalog = await createService(fs).loadCatalog()

    expect(catalog.templates).toEqual([])
    expect(catalog.warnings).toHaveLength(2)
    expect(catalog.warnings.map(({ path }) => path)).toEqual([
      '/appdata/templates/package-name',
      '/appdata/templates/symlinked',
    ])
    expect(catalog.warnings.map(({ reason }) => reason).join('\n')).toContain('ID mismatch')
    expect(catalog.warnings.map(({ reason }) => reason).join('\n')).toContain('symbolic links')
  })
})
