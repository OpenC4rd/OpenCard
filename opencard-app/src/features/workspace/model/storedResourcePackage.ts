/**
 * 模块说明：
 * - 描述软件存储里的包：沿用项目的 `.ocpack` 归档格式（见 model/resourcePackage），
 *   但不属于任何项目，创建项目时按需复制进项目。
 * 职责边界：
 * - 只有数据类型；存储目录名在 shared/storage/appStoragePaths，读写、校验和归档命名都在
 *   services/storedResourcePackageLibrary。
 */
export type StoredResourcePackage = {
  /** 归档在软件存储中的完整路径，同时作为列表与“是否已附加”的标识。 */
  path: string
  /** 包自述的坐标：作者/包名@版本。 */
  coordinate: string
  /** 给人看的名字。 */
  title: string
  fingerprint: string
}

export type StoredResourcePackageWarning = {
  path: string
  reason: string
}

export type StoredResourcePackageSnapshot = {
  packs: StoredResourcePackage[]
  warnings: StoredResourcePackageWarning[]
}
