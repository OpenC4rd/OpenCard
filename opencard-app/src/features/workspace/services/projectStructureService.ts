import type { FileSystemService } from './fileSystemService'
import {
  PROJECT_INTERNAL_FILE_DEFAULTS,
} from '../model/projectStructure'

function joinPath(root: string, relativePath: string): string {
  return `${root.replace(/[\\/]+$/, '')}/${relativePath}`
}

async function assertExistingPathKind(
  fs: FileSystemService,
  path: string,
  expected: 'file' | 'directory',
): Promise<void> {
  if (!await fs.fileExists(path)) return
  const info = await fs.getFileInfo(path)
  const matches = expected === 'file' ? info.isFile : info.isDirectory
  if (info.isSymlink || !matches) throw new Error(`Invalid OpenCard project ${expected}: ${path}`)
}

export async function writeProjectManagementFile(
  fs: FileSystemService,
  projectRoot: string,
  relativePath: keyof typeof PROJECT_INTERNAL_FILE_DEFAULTS,
  content: string,
): Promise<void> {
  const segments = relativePath.split('/')
  for (let length = 1; length < segments.length; length++) {
    await assertExistingPathKind(fs, joinPath(projectRoot, segments.slice(0, length).join('/')), 'directory')
  }
  const path = joinPath(projectRoot, relativePath)
  await assertExistingPathKind(fs, path, 'file')
  await fs.createDirectory(joinPath(projectRoot, segments.slice(0, -1).join('/')))
  await fs.writeFile(path, content)
}
