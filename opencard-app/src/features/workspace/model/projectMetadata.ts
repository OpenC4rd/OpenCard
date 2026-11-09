import type { EditorPropertyDefinition } from '../../../entities/card/schema'
import { isRecord } from '../../../shared/model/record'
import { normalizeProjectRelativeCoverPath } from './projectCover'
import { normalizePackageVersion } from './packageCoordinate'
export { PROJECT_PROFILE_FILE_NAME } from './projectStructure'

export type ProjectRemoteResourcePolicy =
  | { mode: 'deny' }
  | { mode: 'allowlist'; allowedHosts: readonly string[] }
  | { mode: 'allow-all' }

export type ProjectProfile = {
  name?: string
  description?: string
  version?: string
  /** 项目作者：制作资源包时的默认作者。 */
  author?: string
  /** 项目根相对路径；缺失、越界或指向不存在的文件都按“无封面”处理。 */
  cover?: string
  remoteResources?: ProjectRemoteResourcePolicy
  /** 默认渲染与导出 DPI，未配置时默认为 300 */
  defaultDpi?: number
  /**
   * 这个项目的文件按哪个 OpenCard 版本的结构写成。新建项目写入当时的版本；适配器据此判断要跑哪些适配脚本，
   * 读取代码从不看它 —— 读取永远只认当前结构。缺失表示不知道，交给适配器尝试强行适配。
   */
  openCardVersion?: string
}

export type ProjectInformation = {
  name: string
  description: string
  version: string
}

const projectPropertySchema = {
  name: { fieldType: 'string', categoryId: 'general', acceptsBinding: false },
  description: { fieldType: 'string', multiline: true, categoryId: 'general', acceptsBinding: false },
  version: { fieldType: 'string', categoryId: 'general', acceptsBinding: false },
} as const satisfies Record<string, EditorPropertyDefinition>

export function normalizeProjectAllowedHost(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.$/, '')
  const baseHost = host.startsWith('*.') ? host.slice(2) : host
  if (!baseHost || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(baseHost)) {
    return null
  }
  return host.startsWith('*.') ? `*.${baseHost}` : baseHost
}

function parseRemoteResourcePolicy(value: unknown): ProjectRemoteResourcePolicy | null {
  if (!isRecord(value) || Object.keys(value).some(key => !['mode', 'allowedHosts'].includes(key))) return null
  if (value.mode === 'deny' || value.mode === 'allow-all') {
    if (value.allowedHosts !== undefined) return null
    return { mode: value.mode }
  }
  if (value.mode !== 'allowlist' || !Array.isArray(value.allowedHosts)) return null

  const allowedHosts: string[] = []
  for (const candidate of value.allowedHosts) {
    if (typeof candidate !== 'string') return null
    const host = normalizeProjectAllowedHost(candidate)
    if (!host) return null
    if (!allowedHosts.includes(host)) allowedHosts.push(host)
  }
  return { mode: 'allowlist', allowedHosts }
}

export function parseProjectMetadata(value: unknown): ProjectProfile | null {
  if (!isRecord(value)) return null

  if (['name', 'description', 'version', 'author'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) return null

  const profile: ProjectProfile = {}
  if (typeof value.name === 'string' && value.name !== '') profile.name = value.name
  if (typeof value.description === 'string' && value.description !== '') profile.description = value.description
  if (typeof value.version === 'string' && value.version !== '') profile.version = value.version
  if (typeof value.author === 'string' && value.author !== '') profile.author = value.author
  const cover = normalizeProjectRelativeCoverPath(value.cover)
  if (cover) profile.cover = cover
  const openCardVersion = normalizePackageVersion(value.openCardVersion)
  if (openCardVersion) profile.openCardVersion = openCardVersion
  if (value.remoteResources !== undefined) {
    const remoteResources = parseRemoteResourcePolicy(value.remoteResources)
    if (!remoteResources) return null
    profile.remoteResources = remoteResources
  }
  return profile
}

export function parseProjectMetadataText(content: string): ProjectProfile | null {
  try {
    return parseProjectMetadata(JSON.parse(content))
  } catch {
    return null
  }
}

export function serializeProjectMetadata(profile: ProjectProfile): string {
  const normalized = parseProjectMetadata(profile)
  if (!normalized) throw new Error('Invalid project profile')
  return JSON.stringify(normalized, null, 2)
}

export function toProjectInformation(profile: ProjectProfile): ProjectInformation {
  return {
    name: profile.name ?? '',
    description: profile.description ?? '',
    version: profile.version ?? '',
  }
}


function getProjectFieldDefinition(fieldKey: string): EditorPropertyDefinition | undefined {
  return projectPropertySchema[fieldKey as keyof typeof projectPropertySchema]
}

export function getProjectFieldKeys(project: Readonly<ProjectInformation>): string[] {
  return ['name', 'description', 'version'].filter(key => Object.prototype.hasOwnProperty.call(project, key))
}

export function getProjectFieldValueKind(_project: Readonly<ProjectInformation>, fieldKey: string) {
  return getProjectFieldDefinition(fieldKey) ? 'string' as const : 'object' as const
}

export function exposesProjectFieldReference(_project: Readonly<ProjectInformation>, fieldKey: string): boolean {
  return Boolean(getProjectFieldDefinition(fieldKey))
}
