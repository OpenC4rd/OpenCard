/**
 * 模块说明：
 * - 在磁盘上的图标集文件夹与图标页编辑的整体文档之间转换
 * 职责边界：
 * - 只读写 `.opencard/icons/<集>/icon-set.json`；图标文件本身由导入与删除流程管理，这里从不动它们
 */
import {
  parseProjectIconSetManifest,
  projectIconKeyPattern,
  serializeProjectIconSetManifest,
  type ProjectIconSeries,
} from '../model/projectIcons'
import type { ProjectIconRegistryDocument } from '../model/projectIconRegistry'
import {
  PROJECT_ICON_DIRECTORY,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  PROJECT_ICON_SET_FILE_NAME,
  PROJECT_INTERNAL_DIRECTORY_NAME,
  projectIconSetDirectory,
} from '../model/projectStructure'
import type { FileSystemService } from './fileSystemService'

type ReadFs = Pick<FileSystemService, 'fileExists' | 'readFile' | 'readDirectory'>
type WriteFs = ReadFs & Pick<FileSystemService, 'deleteFile'>

const iconsDirectory = (root: string) => `${root.replace(/[\\/]+$/, '')}/${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_ICON_DIRECTORY}`

/** 图标目录里只有集文件夹本身和各集的清单会改变图标集；集内的图标文件变化只刷新画面。路径都是规范化后的绝对路径。 */
export function affectsIconSets(iconsRoot: string, changed: string): boolean {
  if (!changed.startsWith(`${iconsRoot}/`)) return false
  const rest = changed.slice(iconsRoot.length + 1)
  return !rest.includes('/') || rest.endsWith(`/${PROJECT_ICON_SET_FILE_NAME}`)
}

/** 每个子文件夹是一套图标，文件夹名按字典序决定集的顺序。 */
async function listIconSetKeys(fs: ReadFs, root: string): Promise<string[]> {
  const directory = iconsDirectory(root)
  if (!await fs.fileExists(directory)) return []
  const entries = await fs.readDirectory(directory)
  return entries
    .filter(entry => entry.isDirectory && !entry.isSymlink && projectIconKeyPattern.test(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

/**
 * 读出作用域里所有图标集。读不动的集记入 `errors` 后跳过，不让一个坏文件夹判死其他集。
 * 与上一次内容相同的集沿用旧对象，所以什么都没变时整个文档仍是同一个引用，图标目录也就不会重建。
 */
export async function readProjectIconRegistry(
  fs: ReadFs,
  root: string,
  previous?: ProjectIconRegistryDocument,
): Promise<{ document: ProjectIconRegistryDocument, errors: string[] }> {
  const errors: string[] = []
  const keys = await listIconSetKeys(fs, root)
  const previousByKey = new Map((previous?.iconSeries ?? []).map(series => [series.key, series]))
  const read = await Promise.all(keys.map(async (key): Promise<ProjectIconSeries | null> => {
    const manifest = `${iconsDirectory(root)}/${key}/${PROJECT_ICON_SET_FILE_NAME}`
    try {
      if (!await fs.fileExists(manifest)) return null
      const series = parseProjectIconSetManifest(key, JSON.parse(await fs.readFile(manifest)))
      if (!series) throw new Error('Not an icon set')
      const prior = previousByKey.get(key)
      return prior && JSON.stringify(prior) === JSON.stringify(series) ? prior : series
    } catch (error) {
      errors.push(`${projectIconSetDirectory(key)}/${PROJECT_ICON_SET_FILE_NAME}: ${String(error)}`)
      return null
    }
  }))
  const iconSeries = read.filter((series): series is ProjectIconSeries => series !== null)
  const unchanged = previous && iconSeries.length === (previous.iconSeries?.length ?? 0)
    && iconSeries.every((series, index) => series === previous.iconSeries![index])
  return { document: unchanged ? previous : iconSeries.length > 0 ? { iconSeries } : {}, errors }
}

/** 读出图标集并把读不动的集记进诊断（键是图标页的地址）；没有作用域根就是空的。 */
export async function loadProjectIconRegistry(
  fs: ReadFs,
  root: string | null,
  previous: ProjectIconRegistryDocument | undefined,
  diagnostics: Record<string, string>,
): Promise<ProjectIconRegistryDocument> {
  const { document, errors } = root ? await readProjectIconRegistry(fs, root, previous) : { document: {}, errors: [] }
  if (errors.length > 0) diagnostics[PROJECT_ICON_REGISTRY_FILE_NAME] = errors.join('\n')
  else delete diagnostics[PROJECT_ICON_REGISTRY_FILE_NAME]
  return document
}

/**
 * 把整体文档拆回各集的清单。清单内容没变就不写，免得无谓地触发文件监听；
 * 文档里已经没有的集只删它的清单（那个文件夹不再是一套图标），图标文件交给删除流程按撤销历史处理。
 * `write` 由调用方提供，这样项目里的写入可以沿用对符号链接和路径类型的检查。
 */
export async function writeProjectIconRegistry(
  fs: WriteFs,
  root: string,
  document: ProjectIconRegistryDocument,
  write: (relativePath: string, content: string) => Promise<void>,
): Promise<void> {
  const series = document.iconSeries ?? []
  for (const item of series) {
    const relativePath = `${projectIconSetDirectory(item.key)}/${PROJECT_ICON_SET_FILE_NAME}`
    const content = `${serializeProjectIconSetManifest(item)}\n`
    const absolutePath = `${root.replace(/[\\/]+$/, '')}/${relativePath}`
    if (await fs.fileExists(absolutePath) && await fs.readFile(absolutePath) === content) continue
    await write(relativePath, content)
  }
  const kept = new Set(series.map(item => item.key.toLocaleLowerCase()))
  for (const key of await listIconSetKeys(fs, root)) {
    const manifest = `${iconsDirectory(root)}/${key}/${PROJECT_ICON_SET_FILE_NAME}`
    if (!kept.has(key.toLocaleLowerCase()) && await fs.fileExists(manifest)) await fs.deleteFile(manifest)
  }
}
