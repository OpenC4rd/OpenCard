/**
 * 模块说明：
 * - 软件存储在用户机器上的布局，只在这里定义：根名、每个顶层条目名、cache 下的分类名。
 * 职责边界：
 * - 只给路径；不读写任何文件，不知道某个目录里装的是什么格式。
 *
 * 顶层是闭合集合（见 docs/存储布局.md）：除 cache/ 之外都装着用户挣来的东西，
 * cache/ 在软件没运行时可以整个删掉。
 */
import { homeDir, join } from '@tauri-apps/api/path'

export const APP_STORAGE_DIRECTORY_NAME = '.opencard'

export const APP_SETTINGS_FILE_NAME = 'settings.json'
export const APP_UPDATE_STATE_FILE_NAME = 'update-state.json'
export const APP_FEEDBACK_RECEIPTS_FILE_NAME = 'feedback-receipts.json'
/** 用户导入进来的附加包（`.ocpack` 归档）。 */
export const APP_PACKAGE_DIRECTORY_NAME = 'packages'
/** 用户保存的项目模板。 */
export const APP_TEMPLATE_DIRECTORY_NAME = 'templates'

/** 一切可以随手删的派生数据与暂存数据。删掉不会丢东西：派生数据下次用到会重新做一遍。 */
export const APP_CACHE_DIRECTORY_NAME = 'cache'
/** 解开后的包，目录名是内容指纹，所有项目共用。 */
export const APP_CACHE_PACKAGES_DIRECTORY_NAME = 'packages'
/** 网上下载过的图片资源，目录名由项目路径推导。 */
export const APP_CACHE_NETWORK_DIRECTORY_NAME = 'network'
/** 被移出项目、等待撤销的资产字节，随进程生死。 */
export const APP_CACHE_STAGED_DIRECTORY_NAME = 'staged'

/** 顶层条目的闭合集合：新增一项必须同时改这里和 docs/存储布局.md。 */
export const APP_STORAGE_TOP_LEVEL_ENTRIES = [
  APP_SETTINGS_FILE_NAME,
  APP_UPDATE_STATE_FILE_NAME,
  APP_FEEDBACK_RECEIPTS_FILE_NAME,
  APP_PACKAGE_DIRECTORY_NAME,
  APP_TEMPLATE_DIRECTORY_NAME,
  APP_CACHE_DIRECTORY_NAME,
] as const

export async function resolveAppStorageRoot(): Promise<string> {
  return await join(await homeDir(), APP_STORAGE_DIRECTORY_NAME)
}

export async function resolveAppStoragePath(...segments: string[]): Promise<string> {
  return await join(await resolveAppStorageRoot(), ...segments)
}

/** cache/ 下的路径。缓存是唯一可以整个删掉的部分，所以单独给一个入口。 */
export async function resolveAppCachePath(...segments: string[]): Promise<string> {
  return await resolveAppStoragePath(APP_CACHE_DIRECTORY_NAME, ...segments)
}
