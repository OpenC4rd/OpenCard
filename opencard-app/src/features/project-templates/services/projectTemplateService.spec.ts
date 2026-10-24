// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { FileSystemService } from '../../workspace/services/fileSystemService'
import type {
  CreateUserTemplateRequest,
  ExportProjectTemplateRequest,
  ProjectTemplate,
} from '../model/projectTemplate'
import { ProjectTemplateService, type ProjectTemplatePathService } from './projectTemplateService'

vi.mock('@tauri-apps/api/path', () => ({ basename: vi.fn(), join: vi.fn(), resolveResource: vi.fn() }))
vi.mock('../../workspace/services/fileSystemService', () => ({ fileSystemService: {} }))

type FileContent = string | Uint8Array

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/')
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized
}

function parentPath(value: string): string {
  const normalized = normalizePath(value)
  const separator = normalized.lastIndexOf('/')
  return separator <= 0 ? '/' : normalized.slice(0, separator)
}

function baseName(value: string): string {
  return normalizePath(value).split('/').filter(Boolean).pop() ?? ''
}

/**
 * In-memory filesystem covering only what the template service calls. The service is a filesystem
 * client, so every decision below is observed through the files left behind, not through mock calls.
 */
function memoryFileSystem() {
  const directories = new Set<string>(['/'])
  const files = new Map<string, FileContent>()
  const symlinks = new Set<string>()

  const fs = {
    failCopyFrom: null as string | null,
    failDeletePath: null as string | null,
    failBinaryReadFrom: null as string | null,

    putDirectory(path: string): void {
      const normalized = normalizePath(path)
      if (normalized !== '/') fs.putDirectory(parentPath(normalized))
      directories.add(normalized)
    },
    putFile(path: string, content: FileContent): void {
      fs.putDirectory(parentPath(path))
      files.set(normalizePath(path), content)
    },
    putSymlink(path: string, isDirectory = false): void {
      if (isDirectory) fs.putDirectory(path)
      else fs.putFile(path, '')
      symlinks.add(normalizePath(path))
    },
    rawFile(path: string): FileContent | undefined { return files.get(normalizePath(path)) },
    allPaths(): string[] { return [...directories, ...files.keys()].sort() },

    async readFile(path: string): Promise<string> {
      const content = files.get(normalizePath(path))
      if (content === undefined) throw new Error(`Missing file: ${path}`)
      return typeof content === 'string' ? content : new TextDecoder().decode(content)
    },
    async readBinaryFile(path: string): Promise<Uint8Array> {
      const normalized = normalizePath(path)
      if (fs.failBinaryReadFrom === normalized) throw new Error(`Injected read failure: ${normalized}`)
      const content = files.get(normalized)
      if (content === undefined) throw new Error(`Missing file: ${path}`)
      return content instanceof Uint8Array ? content.slice() : new TextEncoder().encode(content)
    },
    async writeFile(path: string, content: string): Promise<void> { fs.putFile(path, content) },
    async writeBinaryFile(path: string, content: Uint8Array): Promise<void> { fs.putFile(path, content.slice()) },
    async copyFile(sourcePath: string, targetPath: string): Promise<void> {
      const source = normalizePath(sourcePath)
      if (fs.failCopyFrom === source) throw new Error(`Injected copy failure: ${source}`)
      const content = files.get(source)
      if (content === undefined) throw new Error(`Missing copy source: ${source}`)
      fs.putFile(targetPath, content instanceof Uint8Array ? content.slice() : content)
    },
    async deleteFile(path: string): Promise<void> {
      const normalized = normalizePath(path)
      if (fs.failDeletePath === normalized) throw new Error(`Injected delete failure: ${normalized}`)
      const nested = `${normalized}/`
      for (const target of [new Set(files.keys()), directories, symlinks]) {
        for (const candidate of target) {
          if (candidate === normalized || candidate.startsWith(nested)) {
            target.delete(candidate)
            files.delete(candidate)
          }
        }
      }
    },
    async renameFile(oldPath: string, newPath: string): Promise<void> {
      const source = normalizePath(oldPath)
      const target = normalizePath(newPath)
      if (!directories.has(source)) throw new Error(`Missing rename source: ${source}`)
      if (directories.has(target) || files.has(target)) throw new Error(`Rename target exists: ${target}`)
      fs.putDirectory(parentPath(target))
      const movedDirectories = [...directories].filter(path => path === source || path.startsWith(`${source}/`))
      const movedFiles = [...files.keys()].filter(path => path.startsWith(`${source}/`))
      for (const path of movedDirectories) directories.delete(path)
      for (const path of movedFiles) {
        const content = files.get(path)
        files.delete(path)
        if (content !== undefined) files.set(`${target}${path.slice(source.length)}`, content)
      }
      for (const path of movedDirectories) directories.add(`${target}${path.slice(source.length)}`)
    },
    async fileExists(path: string): Promise<boolean> {
      const normalized = normalizePath(path)
      return directories.has(normalized) || files.has(normalized)
    },
    async getFileInfo(path: string) {
      const normalized = normalizePath(path)
      if (!directories.has(normalized) && !files.has(normalized)) throw new Error(`Missing path: ${normalized}`)
      return { isFile: files.has(normalized), isDirectory: directories.has(normalized), isSymlink: symlinks.has(normalized) }
    },
    async readDirectory(path: string) {
      const directory = normalizePath(path)
      if (!directories.has(directory)) throw new Error(`Missing directory: ${directory}`)
      const entries = new Map<string, { name: string, isFile: boolean, isDirectory: boolean, isSymlink: boolean }>()
      for (const candidate of [...directories, ...files.keys()]) {
        if (candidate === directory || parentPath(candidate) !== directory) continue
        const name = baseName(candidate)
        const isDirectory = directories.has(candidate)
        entries.set(name, { name, isDirectory, isFile: !isDirectory, isSymlink: symlinks.has(candidate) })
      }
      return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
    /** Recursive walk with project-relative names; the service only ever asks for the full tree. */
    async readDirectoryEntries(path: string) {
      const root = normalizePath(path)
      const prefix = root === '/' ? '/' : `${root}/`
      return [...directories, ...files.keys()]
        .filter(candidate => candidate !== root && candidate.startsWith(prefix))
        .map(candidate => {
          const isDirectory = directories.has(candidate)
          return {
            name: candidate.slice(prefix.length),
            isDirectory,
            isFile: !isDirectory,
            isSymlink: symlinks.has(candidate),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },
    async createDirectory(path: string): Promise<void> { fs.putDirectory(path) },
  }

  return fs
}

type MemoryFileSystem = ReturnType<typeof memoryFileSystem>

const paths: ProjectTemplatePathService = {
  async appStorageDir() { return '/appdata' },
  async basename(path) { return baseName(path) },
  async join(...parts) { return normalizePath(parts.filter(Boolean).join('/')) },
  async resolveResource(path) { return normalizePath(`/resources/${path}`) },
}

function createService(fs: MemoryFileSystem, id = 'test-id'): ProjectTemplateService {
  return new ProjectTemplateService(fs as unknown as FileSystemService, paths, () => id)
}

function addTemplatePackage(fs: MemoryFileSystem, root: string, options: { id: string, name: string }): void {
  fs.putFile(`${root}/template.json`, JSON.stringify({
    schemaVersion: 1, id: options.id, name: options.name, description: '', entry: 'main.ocdocument',
  }))
  fs.putFile(`${root}/content/.opencard/project.json`, projectFile(options.name))
  fs.putFile(`${root}/content/main.ocdocument`, cardDocument())
}

function projectFile(name = 'Project'): string {
  return JSON.stringify({ name })
}

function cardDocument(name = ''): string {
  return JSON.stringify({
    type: 'card-document', id: 'card-document-fixture', name, version: '1.0.0', width: '540', height: '850',
    faces: {
      front: { type: 'card-face', id: 'card-face-fixture-front', background: '#FFFFFF', children: [] },
      back: { type: 'card-face', id: 'card-face-fixture-back', background: '#FFFFFF', children: [] },
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
    schemaVersion: 1, id: 'blank', key: 'builtin:blank', source: 'builtin', name: 'Blank',
    description: '', entry, rootPath: '/template', contentPath, coverPaths: [],
  }
}

function exportRequest(overrides: Partial<ExportProjectTemplateRequest> = {}): ExportProjectTemplateRequest {
  return {
    sourcePath: '/source', outputPath: '/exports/Portable.octemplate', name: 'Portable', description: '',
    entry: 'main.ocdocument', covers: [], excludedPaths: [], ...overrides,
  }
}

function userTemplateRequest(overrides: Partial<CreateUserTemplateRequest> = {}): CreateUserTemplateRequest {
  return { sourcePath: '/source', name: 'Imported', description: '', entry: 'main.ocdocument', covers: [], ...overrides }
}

describe('ProjectTemplateService catalog', () => {
  it('preserves built-in order, sorts user templates, and warns instead of failing on a bad user package', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: ['tactical', 'blank'] }))
    addTemplatePackage(fs, '/resources/templates/tactical', { id: 'tactical', name: 'Tactical' })
    addTemplatePackage(fs, '/resources/templates/blank', { id: 'blank', name: 'Blank' })
    addTemplatePackage(fs, '/appdata/templates/zulu', { id: 'zulu', name: 'Zulu' })
    addTemplatePackage(fs, '/appdata/templates/alpha', { id: 'alpha', name: 'Alpha' })
    fs.putFile('/appdata/templates/broken/template.json', '{not-json')

    const catalog = await createService(fs).loadCatalog()

    expect(catalog.templates.map(({ key }) => key))
      .toEqual(['builtin:tactical', 'builtin:blank', 'user:alpha', 'user:zulu'])
    expect(catalog.warnings).toEqual([expect.objectContaining({ path: '/appdata/templates/broken' })])
  })

  it('treats an invalid built-in manifest as a fatal installation error', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: ['broken'] }))
    fs.putFile('/resources/templates/broken/template.json', '{not-json')

    await expect(createService(fs).loadCatalog()).rejects.toMatchObject({ code: 'invalid-manifest' })
  })

  it('cleans stale temporary user packages and reports the ones it cannot delete', async () => {
    const fs = memoryFileSystem()
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
  it('installs manifest metadata and cover images from the archive', async () => {
    const fs = memoryFileSystem()
    const manifest = JSON.stringify({
      schemaVersion: 1, id: 'prepared', name: 'Prepared Template', description: 'Ready to install',
      entry: 'main.ocdocument', covers: ['assets/cover-a.png', 'assets/cover-b.webp'],
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
    expect(fs.rawFile('/appdata/templates/prepared/content/assets/cover-b.webp')).toEqual(new Uint8Array([3, 4]))
    expect(await fs.fileExists('/appdata/templates/prepared/content/.opencard/project.json')).toBe(true)
  })

  it('rejects archive entries outside content and unsupported package extensions', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/unsafe.zip', zipSync({
      'template.json': strToU8(JSON.stringify({
        schemaVersion: 1, id: 'unsafe', name: 'Unsafe', description: '', entry: 'main.ocdocument',
      })),
      'content/main.ocdocument': strToU8(cardDocument()),
      'outside.txt': strToU8('no'),
    }))

    await expect(createService(fs).importUserTemplate('/unsafe.zip')).rejects.toMatchObject({ code: 'invalid-package' })
    await expect(createService(fs).importUserTemplate('/unsafe.rar')).rejects.toMatchObject({ code: 'invalid-package' })
  })
})

describe('ProjectTemplateService package export', () => {
  it('refuses to exclude a project management file', async () => {
    const fs = memoryFileSystem()
    addImportSource(fs)
    fs.putFile('/source/.opencard/locale.json', '{}')

    await expect(createService(fs).exportProjectTemplate(exportRequest({
      excludedPaths: ['.opencard/locale.json'],
    }))).rejects.toMatchObject({ code: 'source-not-project' })
  })

  it('reports binary resource failures as archive errors', async () => {
    const fs = memoryFileSystem()
    addImportSource(fs)
    fs.failBinaryReadFrom = '/source/assets/portrait.png'

    await expect(createService(fs).exportProjectTemplate(exportRequest({
      covers: ['assets/portrait.png'],
    }))).rejects.toMatchObject({ code: 'archive-failed' })
  })
})

describe('ProjectTemplateService user template creation', () => {
  it('copies documents and binary assets under a trimmed manifest', async () => {
    const fs = memoryFileSystem()
    addImportSource(fs)

    const imported = await createService(fs, 'user-template').createUserTemplate(userTemplateRequest({
      name: ' Imported ',
      description: ' Personal copy ',
      covers: ['assets/portrait.png'],
    }))

    expect(imported).toMatchObject({
      key: 'user:user-template', name: 'Imported', description: 'Personal copy',
      entry: 'main.ocdocument', covers: ['assets/portrait.png'],
    })
    expect(await fs.fileExists('/appdata/templates/user-template/content/main.ocdocument')).toBe(true)
    expect(fs.rawFile('/appdata/templates/user-template/content/assets/portrait.png'))
      .toEqual(new Uint8Array([0, 127, 255]))
  })

  it('removes the temporary package when copying fails', async () => {
    const fs = memoryFileSystem()
    addImportSource(fs)
    fs.failCopyFrom = '/source/assets/portrait.png'

    await expect(createService(fs, 'failed').createUserTemplate(userTemplateRequest({
      covers: ['assets/portrait.png'],
    }))).rejects.toMatchObject({ code: 'copy-failed' })

    expect(fs.allPaths().some((path) => path.includes('.tmp-failed'))).toBe(false)
    expect(await fs.fileExists('/appdata/templates/failed')).toBe(false)
  })
})

describe('ProjectTemplateService project creation', () => {
  it('creates an empty project folder when the template has no entry or content directory', async () => {
    const fs = memoryFileSystem()
    fs.putDirectory('/projects')
    const template = templateFixture('/template/content')
    delete template.entry

    const created = await createService(fs, 'empty-id').createProject({
      template, parentPath: '/projects', projectName: 'Empty',
    })

    expect(created).toEqual({ path: '/projects/Empty' })
    expect(fs.allPaths().filter(path => path.startsWith('/projects/Empty'))).toEqual([
      '/projects/Empty', '/projects/Empty/.opencard', '/projects/Empty/.opencard/project.json',
    ])
  })

  it('copies the selected template atomically and names the project without storing its entry', async () => {
    const fs = memoryFileSystem()
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
    const profile = JSON.parse(fs.rawFile('/projects/Demo/.opencard/project.json') as string)
    expect(profile).toMatchObject({ name: 'Demo' })
    expect(profile).not.toHaveProperty('entry')
    expect(fs.rawFile('/projects/Demo/assets/portrait.png')).toEqual(new Uint8Array([1, 2, 3]))
    expect(fs.allPaths().some((path) => path.includes('.Demo.opencard-create-'))).toBe(false)
  })

  it('refuses an existing target without touching it', async () => {
    const fs = memoryFileSystem()
    fs.putDirectory('/projects/Demo')
    fs.putFile('/template/content/.opencard/project.json', projectFile())
    fs.putFile('/template/content/main.ocdocument', cardDocument())

    await expect(createService(fs).createProject({
      template: templateFixture(), parentPath: '/projects', projectName: 'Demo',
    })).rejects.toMatchObject({ code: 'target-exists' })

    expect(fs.allPaths().some((path) => path.includes('.Demo.opencard-create-'))).toBe(false)
  })

  it('rolls back when the template entry is missing', async () => {
    const fs = memoryFileSystem()
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
    const fs = memoryFileSystem()
    fs.putFile('/source/.opencard/project.json', projectFile())
    fs.putFile('/source/main.ocdocument', JSON.stringify({
      type: 'card-document', id: 'legacy', name: 'Legacy', version: '1.0.0', width: '540', height: '850',
      background: '#FFFFFF', children: [], instances: [],
    }))

    await expect(createService(fs).inspectProjectSource('/source'))
      .resolves.toMatchObject({ entries: ['main.ocdocument'] })
  })

  it('rejects a symlinked import root and symlinked content before installing anything', async () => {
    const root = memoryFileSystem()
    addImportSource(root)
    root.putSymlink('/source', true)
    await expect(createService(root).inspectProjectSource('/source'))
      .rejects.toMatchObject({ code: 'source-has-symlink' })

    const content = memoryFileSystem()
    addImportSource(content)
    content.putSymlink('/source/assets/linked.png')
    await expect(createService(content, 'symlinked').createUserTemplate(userTemplateRequest({
      covers: ['assets/portrait.png'],
    }))).rejects.toMatchObject({ code: 'source-has-symlink' })

    expect(content.allPaths().some((path) => path.includes('.tmp-symlinked'))).toBe(false)
    expect(await content.fileExists('/appdata/templates/symlinked')).toBe(false)
  })

  it('sorts valid document entries and imports a selected entry other than the first', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/source/.opencard/project.json', projectFile())
    fs.putFile('/source/z-last.ocdocument', cardDocument('Last Blueprint'))
    fs.putFile('/source/cards/a-first.ocdocument', cardDocument('First Blueprint'))
    fs.putFile('/source/b-middle.ocdocument', cardDocument())
    fs.putFile('/source/invalid.ocdocument', '{not-json')
    const service = createService(fs, 'multi-entry')

    const inspection = await service.inspectProjectSource('/source')
    expect(inspection.entries)
      .toEqual(['b-middle.ocdocument', 'cards/a-first.ocdocument', 'z-last.ocdocument'])
    expect(inspection.entryNames).toEqual({
      'b-middle.ocdocument': 'b-middle.ocdocument',
      'cards/a-first.ocdocument': 'First Blueprint',
      'z-last.ocdocument': 'Last Blueprint',
    })

    const imported = await service.createUserTemplate(userTemplateRequest({ entry: 'z-last.ocdocument' }))
    expect(imported.entry).toBe('z-last.ocdocument')
    expect(await fs.fileExists('/appdata/templates/multi-entry/content/z-last.ocdocument')).toBe(true)
  })

  it('deletes a user template by path and refuses paths outside the library', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/appdata/templates/Broken Template/template.json', '{')
    fs.putFile('/projects/must-not-delete/keep.txt', 'keep')
    const service = createService(fs)

    await service.deleteUserTemplate('/appdata/templates/Broken Template')
    expect(await fs.fileExists('/appdata/templates/Broken Template')).toBe(false)

    for (const path of [
      '/projects/must-not-delete',
      '/resources/templates/blank',
      '/appdata/templates',
      '/appdata/templates/../other',
      '/appdata/templates/nested/template',
    ]) {
      await expect(service.deleteUserTemplate(path))
        .rejects.toMatchObject({ code: 'builtin-delete-forbidden' })
    }
    expect(await fs.fileExists('/projects/must-not-delete/keep.txt')).toBe(true)
  })

  it('warns for a user package ID mismatch and for symlinked package content', async () => {
    const fs = memoryFileSystem()
    fs.putFile('/resources/templates/index.json', JSON.stringify({ schemaVersion: 1, templates: [] }))
    addTemplatePackage(fs, '/appdata/templates/package-name', { id: 'different-id', name: 'Mismatch' })
    addTemplatePackage(fs, '/appdata/templates/symlinked', { id: 'symlinked', name: 'Symlinked' })
    fs.putSymlink('/appdata/templates/symlinked/content/linked.png')

    const catalog = await createService(fs).loadCatalog()

    expect(catalog.templates).toEqual([])
    expect(catalog.warnings.map(({ path }) => path))
      .toEqual(['/appdata/templates/package-name', '/appdata/templates/symlinked'])
    expect(catalog.warnings.map(({ reason }) => reason).join('\n')).toContain('ID mismatch')
    expect(catalog.warnings.map(({ reason }) => reason).join('\n')).toContain('symbolic links')
  })
})