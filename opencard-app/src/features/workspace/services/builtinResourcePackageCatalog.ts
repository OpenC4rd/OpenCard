/**
 * 模块说明：
 * - 读取随应用发布的内置包（<resource>/packages/*.ocpack），供「新建项目」页把它们和软件存储里的包一起列出
 * 职责边界：
 * - 只负责扫描与投影 不写入任何位置、不处理装入项目（预装仍走软件存储那套安装流程）
 */
import { join, resolveResource } from '@tauri-apps/api/path'
import { RESOURCE_PACKAGE_SUFFIX } from '../model/resourcePackage'
import type { StoredResourcePackage, StoredResourcePackageWarning } from '../model/storedResourcePackage'
import { fileSystemService, type FileSystemService } from './fileSystemService'
import { previewResourcePackage } from './resourcePackageInstaller'

/** 内置包所在的资源目录，对应 src-tauri/resources/packages。 */
const BUILTIN_RESOURCE_PACKAGE_DIRECTORY = 'packages'

export type BuiltinResourcePackageSnapshot = {
  packs: readonly StoredResourcePackage[]
  warnings: readonly StoredResourcePackageWarning[]
}

/**
 * 扫描内置包目录并校验每个归档；校验只借用该目录自身作为"已经装过哪些包"的检查根，
 * 该根下不会有安装好的包目录，因此和软件存储一样是纯粹的归档检查。
 * 目录缺失（例如开发环境没有复制资源）不算失败：只是没有内置包。
 */
export async function loadBuiltinResourcePackages(
  fs: FileSystemService = fileSystemService,
  resolve: (path: string) => Promise<string> = resolveResource,
): Promise<BuiltinResourcePackageSnapshot> {
  const root = await resolve(BUILTIN_RESOURCE_PACKAGE_DIRECTORY)
  const packs: StoredResourcePackage[] = []
  const warnings: StoredResourcePackageWarning[] = []

  let entries
  try {
    entries = await fs.readDirectory(root)
  } catch {
    return { packs, warnings }
  }

  for (const entry of entries) {
    if (!entry.isFile || !entry.name.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)) continue
    const path = await join(root, entry.name)
    try {
      const preview = await previewResourcePackage({ projectRootPath: root, sourcePath: path })
      packs.push({ path, key: preview.manifest.key, name: preview.manifest.name, version: preview.manifest.version })
    } catch (cause) {
      warnings.push({ path, reason: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  return { packs: packs.sort((left, right) => left.name.localeCompare(right.name)), warnings }
}
