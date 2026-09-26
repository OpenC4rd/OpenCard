/**
 * 模块说明：
 * - 一个 `.ocpack` 归档的两件事：**读**（它是谁、指纹是什么）与**解开**（落到缓存）。
 * 职责边界：
 * - 不决定包属于哪个项目，不删任何文件，不写项目里的东西。
 *
 * 项目里的 `.opencard/packages/` 只放归档文件；解开的文件住在软件存储的
 * `cache/snapshots/<指纹>/` 里，所有项目共用。所以"读"只随机访问归档里两个小条目，**不解开**；
 * "解开"才真正落盘，而且解到哪个目录完全由内容指纹决定 —— 与文件名、与哪个项目都无关。
 *
 * 缓存根由调用方传入：布局只有一个出口（shared/storage/appStoragePaths），这里不拼路径。
 */
import { invoke } from '@tauri-apps/api/core'
import {
  normalizeResourcePackageManifest,
  RESOURCE_PACKAGE_SUFFIX,
  resourcePackageCoordinate,
  type ResourcePackageManifest,
} from '../model/resourcePackage'
import type { StoredResourcePackage, StoredResourcePackageWarning } from '../model/storedResourcePackage'
import type { FileSystemService } from './fileSystemService'

type NativeInspection = {
  manifestJson: string
  fingerprint: string
}

export type ResourcePackageArchive = {
  /** 包在清单里自述的坐标。文件名不参与身份。 */
  readonly coordinate: string
  readonly manifest: ResourcePackageManifest
  /** 内容指纹：把包内所有文件的真实内容按顺序算出来的 sha256。 */
  readonly fingerprint: string
}

/**
 * 读一个归档。读不出来就是坏包：我们没有别的办法知道它该叫什么，也不会替它编一个身份。
 */
export async function readResourcePackageArchive(sourcePath: string): Promise<ResourcePackageArchive> {
  const native = await invoke<NativeInspection>('read_resource_package', { request: { sourcePath } })
  let value: unknown
  try {
    value = JSON.parse(native.manifestJson)
  } catch {
    throw new Error('Invalid package manifest JSON')
  }
  const normalized = normalizeResourcePackageManifest(value)
  if (normalized.issues.length > 0) {
    throw new Error(`Invalid package manifest: ${normalized.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`)
  }
  const coordinate = resourcePackageCoordinate(normalized.manifest)
  if (!coordinate) throw new Error('Invalid package manifest: package identity is missing')
  return {
    coordinate,
    manifest: normalized.manifest,
    fingerprint: native.fingerprint,
  }
}

/**
 * 同一个指纹同时被两个项目用到时只解一次。解开是幂等的：已经解好的那一份直接返回。
 * 调用方只负责"排队"，不必等它 —— 解开完成后重建环境，画面自己补齐。
 */
const unpacking = new Map<string, Promise<string>>()

export function unpackResourcePackage(
  archive: ResourcePackageArchive,
  sourcePath: string,
  snapshotsRoot: string,
): Promise<string> {
  const pending = unpacking.get(archive.fingerprint)
  if (pending) return pending
  const started = invoke<{ rootPath: string }>('unpack_resource_package', {
    request: { sourcePath, fingerprint: archive.fingerprint, snapshotsRoot },
  }).then(result => result.rootPath)
  unpacking.set(archive.fingerprint, started)
  return started.finally(() => unpacking.delete(archive.fingerprint))
}

/** 清掉中断留下的半个解压目录，并把缓存降回上限以内；上限由调用方按设置给出。 */
export async function recoverResourcePackageCache(snapshotsRoot: string, maxBytes: number): Promise<void> {
  await invoke('recover_resource_package_cache', { snapshotsRoot, maxBytes })
}

/**
 * 读封面那一个条目，返回可直接给 `<img>` 用的 blob 地址；没有封面返回空串。
 * 详情视图展示的是这个文件自己的内容，所以既不查项目包表、也不解开它。
 * 类型由调用方给（封面文件自己的扩展名）：归档里取出的字节没有路径可依，SVG 尤其需要它。
 */
export async function readResourcePackageCover(sourcePath: string, type = ''): Promise<string> {
  const bytes = await invoke<ArrayBuffer>('read_resource_package_cover', { request: { sourcePath } })
  return bytes && bytes.byteLength > 0 ? URL.createObjectURL(new Blob([bytes], { type })) : ''
}

/**
 * 盖"最后用到"印记：淘汰按这个时间排序，而"用到"是项目加载环境那一次 —— 已经解开的包
 * 不会再走 unpack，所以印记得在这里补。没有指纹就什么都不做；写不上只影响淘汰顺序。
 */
export async function markResourcePackagesUsed(
  snapshotsRoot: string,
  fingerprints: readonly string[],
): Promise<void> {
  if (fingerprints.length === 0) return
  await invoke('mark_resource_packages_used', { snapshotsRoot, fingerprints })
}

/**
 * 扫一个目录里的 `.ocpack`：读得出身份的列出来（按显示名排序），读不出的收成警告。
 * 软件存储和随应用发布的内置包用的是同一份目录形状，所以扫描只有这一处。
 *
 * 读取那一步由调用方传进来：同模块内部直接调用是替换不掉的，显式传进来这条接缝才试得动。
 */
export async function scanResourcePackageDirectory(options: {
  fs: Pick<FileSystemService, 'readDirectory'>
  root: string
  join: (...paths: string[]) => Promise<string>
  read: (path: string) => Promise<ResourcePackageArchive>
}): Promise<{ packs: StoredResourcePackage[], warnings: StoredResourcePackageWarning[] }> {
  const packs: StoredResourcePackage[] = []
  const warnings: StoredResourcePackageWarning[] = []
  for (const entry of await options.fs.readDirectory(options.root)) {
    if (!entry.isFile || !entry.name.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)) continue
    const path = await options.join(options.root, entry.name)
    try {
      const archive = await options.read(path)
      packs.push({
        path,
        coordinate: archive.coordinate,
        title: archive.manifest.title,
        fingerprint: archive.fingerprint,
      })
    } catch (cause) {
      warnings.push({ path, reason: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return { packs: packs.sort((left, right) => left.title.localeCompare(right.title)), warnings }
}
