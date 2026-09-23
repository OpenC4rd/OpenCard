/**
 * 模块说明：
 * - 读取随应用发布的内置包（<resource>/packages/*.ocpack），供「新建项目」页把它们和软件存储里的包一起列出
 * 职责边界：
 * - 只负责扫描与投影 不写入任何位置、不处理复制进项目（预装仍走项目自己的加包流程）
 */
import { join, resolveResource } from '@tauri-apps/api/path'
import type { StoredResourcePackage, StoredResourcePackageWarning } from '../model/storedResourcePackage'
import { fileSystemService, type FileSystemService } from './fileSystemService'
import { readResourcePackageArchive, scanResourcePackageDirectory } from './resourcePackageArchive'

/** 内置包所在的资源目录，对应 src-tauri/resources/packages。 */
const BUILTIN_RESOURCE_PACKAGE_DIRECTORY = 'packages'

export type BuiltinResourcePackageSnapshot = {
  packs: readonly StoredResourcePackage[]
  warnings: readonly StoredResourcePackageWarning[]
}

/**
 * 扫描内置包目录并读一遍每个归档。身份来自包自己的清单，所以这里不需要任何项目根。
 * 目录缺失（例如开发环境没有复制资源）不算失败：只是没有内置包。
 */
export async function loadBuiltinResourcePackages(
  fs: FileSystemService = fileSystemService,
  resolve: (path: string) => Promise<string> = resolveResource,
): Promise<BuiltinResourcePackageSnapshot> {
  const root = await resolve(BUILTIN_RESOURCE_PACKAGE_DIRECTORY)
  try {
    return await scanResourcePackageDirectory({ fs, root, join, read: readResourcePackageArchive })
  } catch {
    return { packs: [], warnings: [] }
  }
}
