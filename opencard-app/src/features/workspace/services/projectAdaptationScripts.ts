/**
 * 模块说明：
 * - 项目结构的每一次变化各写一个适配脚本，按版本排好
 * 职责边界：
 * - 这里是唯一认识旧结构的地方；每个脚本都必须对已经是新结构的项目什么也不做
 */
import { getPathBasename, normalizePath } from '../../../shared/model/filePath'
import { isRecord } from '../../../shared/model/record'
import { CARD_DOCUMENT_SUFFIX } from '../model/fileTypes'
import {
  parseProjectIconSetManifest,
  projectIconKeyPattern,
  serializeProjectIconSetManifest,
} from '../model/projectIcons'
import {
  PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  PROJECT_ICON_SET_FILE_NAME,
  PROJECT_INTERNAL_DIRECTORY_NAME,
  projectIconSetDirectory,
} from '../model/projectStructure'
import { findAvailableName, isSameOrDescendantIdentity } from './copyIntoDirectory'
import type { FileSystemService } from './fileSystemService'

export type AdaptationFs = Pick<FileSystemService,
  'fileExists' | 'readFile' | 'writeFile' | 'readDirectory' | 'readDirectoryEntries'
  | 'createDirectory' | 'copyFile' | 'renameFile' | 'deleteFile' | 'getFileInfo'>

export type ProjectAdaptationContext = {
  fs: AdaptationFs
  /** Project root, absolute, without a trailing slash. */
  root: string
  /** Something the user should know about: a file that could not be carried over, for example. */
  note(message: string): void
}

/**
 * One step of the project structure's history. `version` is the OpenCard release whose structure the
 * script produces; a project recorded at an older version needs it. Every script must be safe to run on
 * a project that already has the new structure, which is what makes a forced adaptation safe.
 */
export type ProjectAdaptationScript = {
  version: string
  title: string
  run(context: ProjectAdaptationContext): Promise<void>
}


/** The collection a flat 0.4.9 block registry becomes, and that `block:<key>` references now name. */
const LEGACY_BLOCK_COLLECTION = { key: 'default', name: 'Custom Blocks' }

async function readJson(context: ProjectAdaptationContext, relativePath: string): Promise<unknown> {
  const path = `${context.root}/${relativePath}`
  if (!await context.fs.fileExists(path)) return undefined
  try { return JSON.parse(await context.fs.readFile(path)) } catch { return undefined }
}

/**
 * 0.5.0-beta.1: custom blocks moved into collections. A flat `{ blocks: [...] }` registry becomes one
 * collection, and every card document's `block:<key>` (bare or behind a qualifier) becomes
 * `block:default/<key>`, the reference form that names a collection.
 */
const customBlockCollections: ProjectAdaptationScript = {
  version: '0.5.0-beta.1',
  title: 'Custom blocks grouped into collections',
  async run(context) {
    const registry = await readJson(context, PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME)
    if (isRecord(registry) && !Array.isArray(registry.collections) && Array.isArray(registry.blocks)) {
      const blocks = registry.blocks.filter(isRecord).map(entry => ({ key: entry.key, source: entry.source }))
      await context.fs.writeFile(`${context.root}/${PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME}`, JSON.stringify({
        collections: [{ ...LEGACY_BLOCK_COLLECTION, blocks }],
      }, null, 2))
    }

    const entries = await context.fs.readDirectoryEntries(context.root, Number.POSITIVE_INFINITY, '', {
      skipDirectory: path => path === '.git' || path === PROJECT_INTERNAL_DIRECTORY_NAME || path.startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/`),
    })
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.toLocaleLowerCase().endsWith(CARD_DOCUMENT_SUFFIX)) continue
      const path = `${context.root}/${entry.name}`
      const text = await context.fs.readFile(path)
      // Inside JSON a reference is a whole string value: a quote or a qualifier's `#`, then the bare key.
      const next = text.replace(/(["#])block:([a-z0-9][a-z0-9._-]*)"/g, `$1block:${LEGACY_BLOCK_COLLECTION.key}/$2"`)
      if (next !== text) await context.fs.writeFile(path, next)
    }
  },
}

/**
 * Where an old registry source lands in the set's folder. A file already there stays; a file in another
 * managed icon folder moves (the app owned it); a file elsewhere in the project is copied, since the user
 * owns it. A source in a package, or one that is missing, cannot be carried over and is reported.
 */
async function carryIconFile(context: ProjectAdaptationContext, setDirectory: string, source: string): Promise<string | null> {
  const relative = normalizePath(source.trim())
  if (relative.toLocaleLowerCase().startsWith(`${setDirectory}/`.toLocaleLowerCase())) return relative.slice(setDirectory.length + 1)
  const from = `${context.root}/${relative}`
  if (relative.includes('#') || relative.split('/').includes('..') || !await context.fs.fileExists(from)) {
    context.note(`Icon file could not be carried over: ${source}`)
    return null
  }
  const directory = `${context.root}/${setDirectory}`
  await context.fs.createDirectory(directory)
  const name = getPathBasename(relative)
  const target = await context.fs.fileExists(`${directory}/${name}`) ? await findAvailableName(context.fs, directory, name) : name
  const managed = isSameOrDescendantIdentity(from, `${context.root}/${PROJECT_INTERNAL_DIRECTORY_NAME}/icons`)
  if (managed) await context.fs.renameFile(from, `${directory}/${target}`)
  else await context.fs.copyFile(from, `${directory}/${target}`)
  return target
}

/** Removes a managed icon folder left empty once its files have moved into their sets. */
async function removeIfEmpty(context: ProjectAdaptationContext, relativeDirectory: string): Promise<void> {
  const path = `${context.root}/${relativeDirectory}`
  if (await context.fs.fileExists(path) && (await context.fs.readDirectory(path)).length === 0) await context.fs.deleteFile(path)
}

/**
 * 0.5.0-beta.2: icon sets became folders. The single `icons/icons.json` registry is split into one
 * `icons/<set>/icon-set.json` per set, each file moves into its set's folder, and the registry is
 * removed. Fields this structure no longer has (`rotation`, the `theme` tint) are dropped on the way.
 */
const iconSetFolders: ProjectAdaptationScript = {
  version: '0.5.0-beta.2',
  title: 'Icon sets stored as folders',
  async run(context) {
    const registry = await readJson(context, PROJECT_ICON_REGISTRY_FILE_NAME)
    if (!isRecord(registry)) return
    const emptied = new Set<string>()
    for (const series of Array.isArray(registry.iconSeries) ? registry.iconSeries : []) {
      if (!isRecord(series) || typeof series.key !== 'string' || !projectIconKeyPattern.test(series.key)) continue
      const setDirectory = projectIconSetDirectory(series.key)
      const manifestPath = `${context.root}/${setDirectory}/${PROJECT_ICON_SET_FILE_NAME}`
      if (await context.fs.fileExists(manifestPath)) continue
      const icons = []
      for (const icon of Array.isArray(series.icons) ? series.icons : []) {
        if (!isRecord(icon) || typeof icon.source !== 'string') continue
        const source = await carryIconFile(context, setDirectory, icon.source)
        if (source === null) continue
        const from = normalizePath(icon.source)
        if (from.includes('/')) emptied.add(from.slice(0, from.lastIndexOf('/')))
        icons.push({ key: icon.iconKey, name: icon.name, source, tint: icon.tint === 'original' ? 'original' : 'context', pixelated: icon.pixelated })
      }
      const name = typeof series.name === 'string' && series.name.trim() ? series.name : series.key
      const parsed = parseProjectIconSetManifest(series.key, { name, icons })
      if (!parsed) continue
      await context.fs.createDirectory(`${context.root}/${setDirectory}`)
      await context.fs.writeFile(manifestPath, `${serializeProjectIconSetManifest(parsed)}\n`)
    }
    await context.fs.deleteFile(`${context.root}/${PROJECT_ICON_REGISTRY_FILE_NAME}`)
    for (const directory of emptied) {
      if (directory.startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/icons/`)) await removeIfEmpty(context, directory)
    }
  },
}

/** Every structure change in release order. A new change appends a script here, never edits an old one. */
export const PROJECT_ADAPTATION_SCRIPTS: readonly ProjectAdaptationScript[] = [
  customBlockCollections,
  iconSetFolders,
]
