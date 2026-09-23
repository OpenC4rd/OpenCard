/**
 * 模块说明：
 * - 一个 `.ocpack` 归档的两件事：**读**（它是谁、指纹是什么）与**解开**（落到缓存）。
 * 职责边界：
 * - 不决定包属于哪个项目，不删任何文件，不写项目里的东西。
 *
 * 项目里的 `.opencard/packages/` 只放归档文件；解开的文件住在软件存储的
 * `cache/packages/<指纹>/` 里，所有项目共用。所以"读"只随机访问归档里两个小条目，**不解开**；
 * "解开"才真正落盘，而且解到哪个目录完全由内容指纹决定 —— 与文件名、与哪个项目都无关。
 *
 * 缓存根由调用方传入：布局只有一个出口（shared/storage/appStoragePaths），这里不拼路径。
 */
import { invoke } from '@tauri-apps/api/core'
import {
  normalizeResourcePackageManifest,
  resourcePackageCoordinate,
  type ResourcePackageManifest,
} from '../model/resourcePackage'

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
  packagesRoot: string,
): Promise<string> {
  const pending = unpacking.get(archive.fingerprint)
  if (pending) return pending
  const started = invoke<{ rootPath: string }>('unpack_resource_package', {
    request: { sourcePath, fingerprint: archive.fingerprint, packagesRoot },
  }).then(result => result.rootPath)
  unpacking.set(archive.fingerprint, started)
  return started.finally(() => unpacking.delete(archive.fingerprint))
}

/** 清掉中断留下的半个解压目录，并把缓存降回大小上限以内。 */
export async function recoverResourcePackageCache(packagesRoot: string): Promise<void> {
  await invoke('recover_resource_package_cache', { packagesRoot })
}
