/**
 * 模块说明：
 * - 判断一个项目要跑哪些适配脚本，并按顺序把它的文件改写成当前结构
 * 职责边界：
 * - 只改写磁盘上的项目文件；快照、询问与还原由外层流程负责。读取代码从不调用这里，
 *   旧结构的知识只存在于适配脚本里，所以读取永远只认当前结构
 */
import { APP_VERSION } from '../../../shared/appVersion'
import { comparePackageVersions, normalizePackageVersion } from '../model/packageCoordinate'
import { parseProjectMetadataText, serializeProjectMetadata } from '../model/projectMetadata'
import { PROJECT_PROFILE_FILE_NAME } from '../model/projectStructure'
import type { FileSystemService } from './fileSystemService'
import { PROJECT_ADAPTATION_SCRIPTS, type AdaptationFs, type ProjectAdaptationContext, type ProjectAdaptationScript } from './projectAdaptationScripts'

export type { AdaptationFs, ProjectAdaptationContext, ProjectAdaptationScript }

/** The oldest structure the scripts were written against. Anything older is adapted on a best-effort basis. */
export const PROJECT_ADAPTATION_BASELINE = '0.4.9'

export type ProjectAdaptationPlan =
  /** Nothing to do. */
  | { status: 'current' }
  /** A designed path from the recorded version to this one. */
  | { status: 'pending', from: string, scripts: readonly ProjectAdaptationScript[] }
  /** Not a version the scripts were designed for; adapting means trying every script. */
  | { status: 'unknown', reason: 'missing' | 'older' | 'newer', from?: string, scripts: readonly ProjectAdaptationScript[] }

export function planProjectAdaptation(
  recorded: string | undefined,
  scripts: readonly ProjectAdaptationScript[] = PROJECT_ADAPTATION_SCRIPTS,
  appVersion: string = APP_VERSION,
): ProjectAdaptationPlan {
  const from = normalizePackageVersion(recorded)
  if (!from) return { status: 'unknown', reason: 'missing', scripts }
  if (comparePackageVersions(from, appVersion) > 0) return { status: 'unknown', reason: 'newer', from, scripts }
  if (comparePackageVersions(from, PROJECT_ADAPTATION_BASELINE) < 0) return { status: 'unknown', reason: 'older', from, scripts }
  const pending = scripts.filter(script => comparePackageVersions(script.version, from) > 0)
  return pending.length > 0 ? { status: 'pending', from, scripts: pending } : { status: 'current' }
}

export async function readRecordedProjectVersion(fs: Pick<FileSystemService, 'fileExists' | 'readFile'>, root: string): Promise<string | undefined> {
  const path = `${root}/${PROJECT_PROFILE_FILE_NAME}`
  if (!await fs.fileExists(path)) return undefined
  return parseProjectMetadataText(await fs.readFile(path))?.openCardVersion
}

/**
 * Runs the scripts in order and records this version in the project file. Returns what the user should
 * know about. A script that throws stops the run; the caller restores the snapshot it took.
 */
export async function runProjectAdaptation(
  fs: AdaptationFs,
  root: string,
  scripts: readonly ProjectAdaptationScript[],
  appVersion: string = APP_VERSION,
): Promise<string[]> {
  const notes: string[] = []
  const context: ProjectAdaptationContext = { fs, root, note: message => notes.push(message) }
  for (const script of scripts) await script.run(context)

  const profilePath = `${root}/${PROJECT_PROFILE_FILE_NAME}`
  const profile = await fs.fileExists(profilePath) ? parseProjectMetadataText(await fs.readFile(profilePath)) ?? {} : {}
  await fs.createDirectory(profilePath.slice(0, profilePath.lastIndexOf('/')))
  await fs.writeFile(profilePath, serializeProjectMetadata({ ...profile, openCardVersion: appVersion }))
  return notes
}
