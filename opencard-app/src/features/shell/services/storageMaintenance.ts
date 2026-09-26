/**
 * 模块说明：
 * - 应用启动时做一次存储维护：清掉上个进程留下的撤销暂存，把两个缓存降回各自的上限以内。
 * 职责边界：
 * - 只删派生数据；不迁移、不校验、不读用户数据。
 *
 * 只该在没有项目在用时做一次（启动时正好）：`cache/staged` 里的字节是撤销要恢复的内容，
 * 包缓存与网络缓存也假设没有会话正在读它们。
 */
import {
  APP_CACHE_SNAPSHOTS_DIRECTORY_NAME,
  APP_CACHE_STAGED_DIRECTORY_NAME,
  resolveAppCachePath,
} from '../../../shared/storage/appStoragePaths'
import { reportAppError } from '../../logging/appErrorCatalog'
import { networkResourceCacheService } from '../../network-resources/services/networkResourceCacheService'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { recoverResourcePackageCache } from '../../workspace/services/resourcePackageArchive'

/**
 * 三件事互不相干，任何一件失败都不影响另外两件，也不该拦住应用启动：
 * 删不干净只是一次没清完，下一次启动会再来一遍。
 * 两个上限来自设置，由调用方读好传进来 —— 这里不认识设置文档。
 */
export async function runStorageMaintenance(cacheLimits: CacheLimits): Promise<void> {
  await clearStagedAssets()
  await recoverPackages(cacheLimits.packageCacheBytes)
  await pruneNetworkCache(cacheLimits.networkCacheBytes)
}

export type CacheLimits = {
  packageCacheBytes: number
  networkCacheBytes: number
}

/** 重启之后撤销栈本身已经没了，这些字节再没有任何入口能访问。 */
async function clearStagedAssets(): Promise<void> {
  try {
    const stagedRoot = await resolveAppCachePath(APP_CACHE_STAGED_DIRECTORY_NAME)
    if (await fileSystemService.fileExists(stagedRoot)) await fileSystemService.deleteFile(stagedRoot)
  } catch (error) {
    warn('staged assets', error)
  }
}

async function recoverPackages(maxBytes: number): Promise<void> {
  try {
    await recoverResourcePackageCache(
      await resolveAppCachePath(APP_CACHE_SNAPSHOTS_DIRECTORY_NAME),
      maxBytes,
    )
  } catch (error) {
    // 包快照整理不了会让"装好的包用不了"，这是用户能遇到的事，值得报一条。
    reportAppError('OC-E3017', { path: 'package snapshots', error })
  }
}

async function pruneNetworkCache(maxBytes: number): Promise<void> {
  try {
    await networkResourceCacheService.prune(maxBytes)
  } catch (error) {
    warn('network cache', error)
  }
}

function warn(what: string, error: unknown): void {
  console.warn(`[OpenCard/Storage] Could not clean the ${what}.`, error)
}
