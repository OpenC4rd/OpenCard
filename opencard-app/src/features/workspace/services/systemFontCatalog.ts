/**
 * 模块说明：
 * - 读取操作系统已安装的字体字面，并按字系归组，供项目字体从系统导入时挑选
 * 职责边界：
 * - 只负责读取原生命令、归组排序与预览用资源地址 不处理槽位归属与项目内写入
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { projectFontWeightValues, type ProjectFontWeight } from '../model/projectFontRegistry'

/** 系统已安装字体的一个字面；`path` 与 `index` 可直接交给项目字体导入流程。 */
export type SystemFontFace = {
  /** 字体家族名。 */
  family: string
  /** 字面的 PostScript 名称，用于区分同族的字重与斜体。 */
  faceName: string
  /** 字体文件的绝对路径。 */
  path: string
  /** 字体集合内的字面序号；非集合字体为 0。 */
  index: number
  /** 字重数值，取值 100–900。 */
  weight: number
  /** 是否斜体，决定归入 upright 还是 italic 槽位。 */
  italic: boolean
}

/** 一个系统字系及其全部字面；一次导入以字系为单位。 */
export type SystemFontFamily = {
  /** 字系名称，用作新注册字体的默认名称。 */
  name: string
  /** 该字系在系统里拥有的字面，按字重与斜体排序。 */
  faces: readonly SystemFontFace[]
}

let catalog: Promise<readonly SystemFontFamily[]> | null = null

/** 读取按字系归组的系统字体清单。同一会话内复用首次结果，`refresh` 强制重新读取。 */
export function readSystemFontCatalog(options: { refresh?: boolean } = {}): Promise<readonly SystemFontFamily[]> {
  if (options.refresh || !catalog) {
    catalog = invoke<SystemFontFace[]>('list_system_fonts')
      .then(groupSystemFontFamilies)
      .catch(error => {
        catalog = null
        throw error
      })
  }
  return catalog
}

/** 按字系名称归组，并按名称、字重、斜体排序，让选择列表稳定展示。 */
export function groupSystemFontFamilies(faces: readonly SystemFontFace[]): SystemFontFamily[] {
  const grouped = new Map<string, SystemFontFace[]>()
  for (const face of faces) {
    const name = face.family.trim()
    if (!name) continue
    const existing = grouped.get(name)
    if (existing) existing.push(face)
    else grouped.set(name, [face])
  }
  return [...grouped]
    .map(([name, familyFaces]) => ({ name, faces: sortSystemFontFaces(familyFaces) }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/** 一个字面在项目字体里的槽位归属。 */
export type SystemFontSlot = {
  /** 语义字重槽位。 */
  weight: ProjectFontWeight
  /** 是否归入斜体槽位。 */
  italic: boolean
  /** 占用该槽位的字面。 */
  face: SystemFontFace
}

/**
 * 把字系的字面分配到槽位：先按字面与所属档位目标值的距离排序，越贴近档位的字面越先占用槽位，
 * 因此 100–900 全字重的字系拿到的是 Light/Normal/Bold 三个正体，而不是前三个最细的字面。
 */
export function assignSystemFontSlots(faces: readonly SystemFontFace[]): SystemFontSlot[] {
  const assigned = new Map<string, SystemFontSlot>()
  const ordered = [...faces].sort((left, right) => fitDistance(left) - fitDistance(right)
    || left.weight - right.weight
    || Number(left.italic) - Number(right.italic))
  for (const face of ordered) {
    const weight = systemFontFaceWeight(face.weight)
    const key = `${weight}.${face.italic ? 'italic' : 'upright'}`
    if (assigned.has(key)) continue
    assigned.set(key, { weight, italic: face.italic, face })
  }
  return [...assigned.values()]
}

/** 字面所属字体文件在 webview 里的资源地址，供列表用该字体预览自己的名字。 */
export function resolveSystemFontAssetSrc(path: string): string {
  return convertFileSrc(path)
}

/** 按字重数值归入语义字重，阈值与文件导入的归类保持一致。 */
export function systemFontFaceWeight(weight: number): ProjectFontWeight {
  return weight < 375 ? 'light' : weight > 550 ? 'bold' : 'normal'
}

function fitDistance(face: SystemFontFace): number {
  return Math.abs(face.weight - projectFontWeightValues[systemFontFaceWeight(face.weight)])
}

function sortSystemFontFaces(faces: readonly SystemFontFace[]): SystemFontFace[] {
  return [...faces].sort((left, right) => left.weight - right.weight
    || Number(left.italic) - Number(right.italic)
    || left.index - right.index)
}
