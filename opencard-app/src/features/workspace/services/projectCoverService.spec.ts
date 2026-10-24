import { describe, expect, it, vi } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://${path}` }))
import { readProjectCover, resolveProjectCover } from './projectCoverService'

function createFileSystem(files: ReadonlyMap<string, string>, failRead = false) {
  return {
    fileExists: async (path: string) => files.has(path),
    readFile: async (path: string) => {
      if (failRead) throw new Error('unreadable')
      return files.get(path) ?? ''
    },
  }
}

function projectFiles(profile: unknown, coverPath = 'assets/cover.png'): Map<string, string> {
  return new Map<string, string>([
    ['/project/.opencard/project.json', typeof profile === 'string' ? profile : JSON.stringify(profile)],
    [`/project/${coverPath}`, 'binary'],
  ])
}

describe('projectCoverService', () => {
  it('resolves a declared cover when the file exists', async () => {
    const files = projectFiles({ name: 'Demo', cover: 'assets/cover.png' })
    await expect(resolveProjectCover({
      fs: createFileSystem(files),
      rootPath: '/project',
      relativePath: 'assets\\cover.png',
    })).resolves.toMatchObject({ relativePath: 'assets/cover.png' })
  })

  it('treats missing, unsafe, and non-image covers as absent', async () => {
    const files = projectFiles({ name: 'Demo', cover: 'assets/cover.png' })
    const fs = createFileSystem(files)
    await expect(resolveProjectCover({ fs, rootPath: '/project', relativePath: 'assets/missing.png' }))
      .resolves.toBeNull()
    await expect(resolveProjectCover({ fs, rootPath: '/project', relativePath: '../cover.png' }))
      .resolves.toBeNull()
    await expect(resolveProjectCover({ fs, rootPath: '/project', relativePath: 'assets/cover.txt' }))
      .resolves.toBeNull()
    await expect(resolveProjectCover({ fs, rootPath: '/project', relativePath: undefined }))
      .resolves.toBeNull()
  })

  it('reads the project cover from an unopened project', async () => {
    const files = projectFiles({ name: 'Demo', cover: '.opencard/cover.webp' }, '.opencard/cover.webp')
    await expect(readProjectCover({ fs: createFileSystem(files), projectRootPath: '/project/' }))
      .resolves.toMatchObject({ relativePath: '.opencard/cover.webp' })
  })

  it('stays silent when the project profile is missing, broken, or without a cover', async () => {
    await expect(readProjectCover({ fs: createFileSystem(new Map()), projectRootPath: '/project' }))
      .resolves.toBeNull()
    await expect(readProjectCover({
      fs: createFileSystem(projectFiles('{broken')),
      projectRootPath: '/project',
    })).resolves.toBeNull()
    await expect(readProjectCover({
      fs: createFileSystem(projectFiles({ name: 'Demo' })),
      projectRootPath: '/project',
    })).resolves.toBeNull()
    await expect(readProjectCover({
      fs: createFileSystem(projectFiles({ name: 'Demo', cover: 'assets/cover.png' }), true),
      projectRootPath: '/project',
    })).resolves.toBeNull()
    await expect(readProjectCover({
      fs: createFileSystem(projectFiles({ name: 'Demo', cover: 'assets/cover.png' })),
      projectRootPath: '',
    })).resolves.toBeNull()
  })
})
