import { describe, expect, it, vi } from 'vitest'
import type { FileSystemService } from '../../workspace/services/fileSystemService'
import { NetworkResourceCacheService } from './networkResourceCacheService'

// 默认项目目录名会问 Tauri 的 basename，这里用纯路径函数替身；join 同时充当默认 joinPath。
vi.mock('@tauri-apps/api/path', () => ({
  basename: async (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '',
  join: async (...segments: string[]) => segments.join('/'),
}))

const ROOT = '/home/user/.opencard/cache/network'
const KEY = 'opencard-1234abcd'
const UID = '00000000-0000-4000-8000-000000000001'

type FakeOptions = {
  files?: Record<string, string>
  directories?: string[]
}

function createFakeFileSystem(options: FakeOptions = {}) {
  const files = new Map<string, string | Uint8Array>(Object.entries(options.files ?? {}))
  const directories = new Set<string>(options.directories ?? [])
  const operations: string[] = []
  const failRenameTo = new Set<string>()
  const all = () => [...files.keys(), ...directories]
  const fs = {
    fileExists: vi.fn(async (path: string) => files.has(path) || directories.has(path)),
    readFile: vi.fn(async (path: string) => {
      const value = files.get(path)
      if (typeof value !== 'string') throw new Error(`Missing text file: ${path}`)
      return value
    }),
    writeFile: vi.fn(async (path: string, value: string) => {
      operations.push(`write:${path}`)
      files.set(path, value)
    }),
    writeBinaryFile: vi.fn(async (path: string, value: Uint8Array) => {
      operations.push(`write-binary:${path}`)
      files.set(path, value)
    }),
    copyFile: vi.fn(async (from: string, to: string) => {
      operations.push(`copy:${from}->${to}`)
      const value = files.get(from)
      if (value === undefined) throw new Error(`Missing source: ${from}`)
      files.set(to, value)
    }),
    renameFile: vi.fn(async (from: string, to: string) => {
      operations.push(`rename:${from}->${to}`)
      if (failRenameTo.has(to)) throw new Error(`Could not rename to: ${to}`)
      const value = files.get(from)
      if (value === undefined) throw new Error(`Missing source: ${from}`)
      files.set(to, value)
      files.delete(from)
    }),
    deleteFile: vi.fn(async (path: string) => {
      operations.push(`delete:${path}`)
      files.delete(path)
      directories.delete(path)
      for (const candidate of [...files.keys()]) {
        if (candidate.startsWith(`${path}/`)) files.delete(candidate)
      }
      for (const candidate of [...directories]) {
        if (candidate.startsWith(`${path}/`)) directories.delete(candidate)
      }
    }),
    createDirectory: vi.fn(async (path: string) => {
      directories.add(path)
    }),
    readDirectory: vi.fn(async (path: string) => {
      const prefix = `${path}/`
      const names = new Set<string>()
      for (const candidate of all()) {
        if (!candidate.startsWith(prefix)) continue
        const name = candidate.slice(prefix.length).split('/')[0]
        if (name) names.add(name)
      }
      return [...names].map(name => {
        const full = `${prefix}${name}`
        const isFile = files.has(full)
        return {
          name,
          isFile,
          isDirectory: directories.has(full) || !isFile,
          isSymlink: false,
        }
      })
    }),
  } as unknown as FileSystemService
  return { fs, files, directories, operations, failRenameTo }
}

function uuidFactory() {
  let index = 0
  return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`
}

function createService(fake: ReturnType<typeof createFakeFileSystem>, overrides: Record<string, unknown> = {}) {
  return new NetworkResourceCacheService({
    fs: fake.fs,
    cacheRoot: async () => ROOT,
    projectKey: async () => KEY,
    joinPath: async (...segments: string[]) => segments.join('/'),
    randomUuid: uuidFactory(),
    download: async (url, destination, _cacheRoot, onProgress) => {
      await fake.fs.writeBinaryFile(destination, new Uint8Array([1, 2, 3]))
      onProgress({ url, receivedBytes: 3, totalBytes: 3, progress: 1 })
      return { contentType: 'image/jpeg', receivedBytes: 3 }
    },
    ...overrides,
  })
}

describe('NetworkResourceCacheService', () => {
  it('keeps one index at the cache root and commits the file before the index', async () => {
    const fake = createFakeFileSystem()
    const timestamps = [new Date('2026-08-29T12:00:00.000Z'), new Date('2026-08-30T12:00:00.000Z')]
    const service = createService(fake, {
      now: () => timestamps.shift() ?? new Date('2026-08-30T12:00:00.000Z'),
    })
    const project = await service.forProject('D:\\Projects\\OpenCard')
    fake.operations.length = 0

    const first = await project.refresh('https://example.com/image.PNG#preview')
    const firstTransaction = [...fake.operations]
    fake.operations.length = 0
    const second = await project.refresh('https://example.com/image.PNG')

    expect(first.path).toBe(`${ROOT}/${KEY}/${UID}.png`)
    expect(second.path).toBe(first.path)
    expect(first.refreshedAt).toBe('2026-08-29T12:00:00.000Z')
    expect(second.refreshedAt).toBe('2026-08-30T12:00:00.000Z')
    expect(await project.listUrls()).toEqual(['https://example.com/image.PNG'])

    const index = JSON.parse(fake.files.get(`${ROOT}/index.json`) as string)
    expect(Object.keys(index.projects)).toEqual([KEY])
    expect(index.projects[KEY].lastUsedAt).toBe('2026-08-30T12:00:00.000Z')
    expect(index.projects[KEY].resources['https://example.com/image.PNG'])
      .toEqual({ uid: UID, extension: '.png', bytes: 3, refreshedAt: '2026-08-30T12:00:00.000Z' })

    // 成品先就位，清单后写：清单是"这个文件能用"的唯一真相。
    const replaceIndex = firstTransaction.findIndex(operation => operation.includes('.download->') && operation.endsWith('.png'))
    const indexWriteIndex = firstTransaction.findIndex(operation => operation.startsWith('write:') && operation.includes('index.json.'))
    expect(replaceIndex).toBeGreaterThanOrEqual(0)
    expect(indexWriteIndex).toBeGreaterThan(replaceIndex)
    // 每个项目一个清单的老布局不再出现。
    expect([...fake.files.keys()].filter(path => path.endsWith('cache.json'))).toEqual([])
  })

  it('names the project directory from the project path alone', async () => {
    const fake = createFakeFileSystem()
    const service = new NetworkResourceCacheService({
      fs: fake.fs,
      cacheRoot: async () => ROOT,
      joinPath: async (...segments: string[]) => segments.join('/'),
      randomUuid: uuidFactory(),
    })

    await service.forProject('D:\\Projects\\OpenCard')
    expect([...fake.directories]).toHaveLength(1)
    expect([...fake.directories][0]).toMatch(/^\/home\/user\/\.opencard\/cache\/network\/opencard-[0-9a-f]{8}$/)

    // 同名不同路径是两个项目：目录名靠路径哈希分开，不需要任何映射表。
    await service.forProject('D:\\Other\\OpenCard')
    expect([...fake.directories]).toHaveLength(2)
  })

  it('treats a damaged index as empty and rewrites it', async () => {
    const fake = createFakeFileSystem({ files: { [`${ROOT}/index.json`]: '{broken' } })
    const service = createService(fake)

    const project = await service.forProject('/home/user/project')
    expect(await project.getCached('https://example.com/image.png')).toBeNull()
    await project.refresh('https://example.com/image.png')

    const index = JSON.parse(fake.files.get(`${ROOT}/index.json`) as string)
    expect(index.projects[KEY].resources['https://example.com/image.png']).toMatchObject({ bytes: 3 })
  })

  it('restores the previous file when the refreshed index cannot commit', async () => {
    const fake = createFakeFileSystem()
    let bytes = new Uint8Array([1])
    const service = createService(fake, {
      download: async (_url: string, destination: string) => {
        await fake.fs.writeBinaryFile(destination, bytes)
        return { contentType: 'image/png', receivedBytes: bytes.length }
      },
      now: () => new Date('2026-08-29T12:00:00.000Z'),
    })
    const project = await service.forProject('/home/user/project')
    const cached = await project.refresh('https://example.com/image.png')
    expect(fake.files.get(cached.path)).toEqual(new Uint8Array([1]))

    bytes = new Uint8Array([2])
    fake.failRenameTo.add(`${ROOT}/index.json`)
    await expect(project.refresh('https://example.com/image.png')).rejects.toThrow('Could not rename')
    expect(fake.files.get(cached.path)).toEqual(new Uint8Array([1]))
    expect(await project.getCached('https://example.com/image.png')).toMatchObject({ path: cached.path })
  })

  it('prunes orphan directories, entries without a directory, and the least recently used ones', async () => {
    const mebibyte = 1024 * 1024
    const entry = (path: string) => [path, {
      uid: UID,
      extension: '.png',
      bytes: 800 * mebibyte,
      refreshedAt: '2026-08-01T00:00:00.000Z',
    }]
    const fake = createFakeFileSystem({
      files: {
        [`${ROOT}/index.json`]: JSON.stringify({
          projects: {
            'old-11111111': { lastUsedAt: '2026-08-01T00:00:00.000Z', resources: Object.fromEntries([entry('https://example.com/old.png')]) },
            'recent-22222222': { lastUsedAt: '2026-09-01T00:00:00.000Z', resources: Object.fromEntries([entry('https://example.com/recent.png')]) },
            'gone-33333333': { lastUsedAt: '2026-07-01T00:00:00.000Z', resources: {} },
          },
        }),
      },
      directories: [
        ROOT,
        `${ROOT}/old-11111111`,
        `${ROOT}/recent-22222222`,
        `${ROOT}/orphan-44444444`,
      ],
    })

    await createService(fake).prune()

    expect(fake.directories.has(`${ROOT}/orphan-44444444`)).toBe(false)
    expect(fake.directories.has(`${ROOT}/old-11111111`)).toBe(false)
    expect(fake.directories.has(`${ROOT}/recent-22222222`)).toBe(true)
    const index = JSON.parse(fake.files.get(`${ROOT}/index.json`) as string)
    expect(Object.keys(index.projects)).toEqual(['recent-22222222'])
  })
})
