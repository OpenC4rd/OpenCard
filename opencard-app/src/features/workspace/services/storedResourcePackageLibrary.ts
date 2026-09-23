import { join } from '@tauri-apps/api/path'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import {
  APP_PACKAGE_DIRECTORY_NAME,
  resolveAppStorageRoot,
} from '../../../shared/storage/appStoragePaths'
import { toKeySlug } from '../../../shared/model/keySlug'
import { fileSystemService, type FileSystemService } from './fileSystemService'
import { readResourcePackageArchive, type ResourcePackageArchive } from './resourcePackageArchive'
import { RESOURCE_PACKAGE_EXTENSION, RESOURCE_PACKAGE_SUFFIX } from '../model/resourcePackage'
import type { StoredResourcePackage, StoredResourcePackageSnapshot } from '../model/storedResourcePackage'

export interface StoredResourcePackagePathService {
  appStorageDir(): Promise<string>
  join(...paths: string[]): Promise<string>
}

const defaultPathService: StoredResourcePackagePathService = {
  appStorageDir: resolveAppStorageRoot,
  join,
}

function describeError(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function isPackageFile(entry: DirEntry): boolean {
  return entry.isFile && entry.name.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)
}

/**
 * 软件存储里的附加包列表：导入时读一遍归档，确认它是个能说出自己是谁的包。
 * 存储里的归档不属于任何项目，所以读它不需要任何项目根 —— 身份来自包自己的清单。
 */
export class StoredResourcePackageLibraryService {
  constructor(
    private readonly fs: FileSystemService = fileSystemService,
    private readonly paths: StoredResourcePackagePathService = defaultPathService,
  ) {}

  async loadLibrary(): Promise<StoredResourcePackageSnapshot> {
    const root = await this.resolveRoot()
    await this.fs.createDirectory(root)
    const packs: StoredResourcePackage[] = []
    const warnings: StoredResourcePackageSnapshot['warnings'] = []
    for (const entry of await this.fs.readDirectory(root)) {
      if (!isPackageFile(entry)) continue
      const path = await this.paths.join(root, entry.name)
      try {
        packs.push(this.describe(path, await readResourcePackageArchive(path)))
      } catch (cause) {
        warnings.push({ path, reason: describeError(cause) })
      }
    }
    return { packs: packs.sort((left, right) => left.title.localeCompare(right.title)), warnings }
  }

  async pickSourceFile(title: string): Promise<string | null> {
    return await this.fs.pickFile({
      title,
      fileTypeName: 'OpenCard package',
      extensions: [RESOURCE_PACKAGE_EXTENSION],
    })
  }

  /** 读得出来才写入存储，因此存进来的包一定可以复制进项目。 */
  async importPackage(sourcePath: string): Promise<StoredResourcePackage> {
    const root = await this.resolveRoot()
    await this.fs.createDirectory(root)
    const archive = await readResourcePackageArchive(sourcePath)
    const targetPath = await this.resolveAvailablePath(root, toKeySlug(archive.coordinate.replace('/', '-'), 'package'))
    // 归档可能很大，直接复制文件，不把整包读进前端内存。
    await this.fs.copyFile(sourcePath, targetPath)
    return this.describe(targetPath, archive)
  }

  async removePackage(path: string): Promise<void> {
    await this.fs.deleteFile(path)
  }

  private describe(path: string, archive: ResourcePackageArchive): StoredResourcePackage {
    return {
      path,
      coordinate: archive.coordinate,
      title: archive.manifest.title,
      fingerprint: archive.fingerprint,
    }
  }

  private async resolveAvailablePath(root: string, key: string): Promise<string> {
    let candidate = await this.paths.join(root, `${key}${RESOURCE_PACKAGE_SUFFIX}`)
    let suffix = 2
    while (await this.fs.fileExists(candidate)) {
      candidate = await this.paths.join(root, `${key}-${suffix}${RESOURCE_PACKAGE_SUFFIX}`)
      suffix += 1
    }
    return candidate
  }

  private async resolveRoot(): Promise<string> {
    return await this.paths.join(
      await this.paths.appStorageDir(),
      APP_PACKAGE_DIRECTORY_NAME,
    )
  }
}

export const storedResourcePackageLibrary = new StoredResourcePackageLibraryService()
