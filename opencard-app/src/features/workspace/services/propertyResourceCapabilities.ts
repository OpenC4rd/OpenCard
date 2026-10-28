import { getBlockProperty } from '../../../entities/card/model'
import type {
  PropertyCustomBlockCollectionGroup,
  PropertyCustomBlockScope,
  PropertyFieldCapabilities,
  PropertyFontScope,
  PropertyIconScope,
} from '../../../shared/ui/property-editor/propertyEditor.types'
import { formatPackageCoordinate, parsePackageQualifier } from '../model/packageCoordinate'
import { toCssFontFamily, type FontCatalogEntry } from '../model/projectFonts'
import type { FileSystemService } from './fileSystemService'
import {
  createProjectIconPreviewStyle,
  createProjectIconStyle,
  EMPTY_PROJECT_ICON_CATALOG,
  type ProjectIconCatalog,
  type ProjectIconDimensionReader,
} from './projectIconCatalog'
import { readProjectIconSize } from './projectIconDimensionResolver'
import {
  resolveProjectEnvironmentFontFamily,
  resolveProjectResourcePackage,
  type ProjectResourceEnvironment,
} from './projectResourceEnvironment'
import { createResourceFilePathScopes, createScopeDirectoryProvider } from './resourceDirectoryProvider'

export type CreateResourcePropertyCapabilitiesOptions = {
  projectLabel: string
  rootPath?: string | null
  fs?: Pick<FileSystemService, 'readDirectoryEntries' | 'fileExists'>
  resourceEnvironment?: ProjectResourceEnvironment | null
  fontCatalog?: readonly FontCatalogEntry[]
  projectIconCatalog?: ProjectIconCatalog | null
  readIconDimensions?: ProjectIconDimensionReader
}

function buildIconScope(
  key: string,
  packageKey: string | null,
  label: string,
  catalog: ProjectIconCatalog,
  readDimensions: ProjectIconDimensionReader,
): PropertyIconScope {
  const prefix = packageKey ? `${packageKey}#` : ''
  const entriesBySeries = new Map<string, ProjectIconCatalog['entries'][number][]>()
  for (const entry of catalog.entries) {
    const seriesKey = entry.seriesKey.toLocaleLowerCase()
    let list = entriesBySeries.get(seriesKey)
    if (!list) {
      list = []
      entriesBySeries.set(seriesKey, list)
    }
    list.push(entry)
  }

  return {
    key,
    packageKey,
    label,
    series: catalog.series.map(series => ({
      key: series.key,
      name: series.name,
      entries: (entriesBySeries.get(series.key.toLocaleLowerCase()) ?? []).map(entry => ({
        key: `${entry.seriesKey}/${entry.iconKey}`,
        value: `${prefix}icon:${entry.seriesKey}/${entry.iconKey}`,
        iconPath: `${prefix}${entry.seriesKey}/${entry.iconKey}`,
        seriesKey: entry.seriesKey,
        iconKey: entry.iconKey,
        name: entry.name,
        get inlineStyle() {
          return createProjectIconStyle(entry, readDimensions)
        },
        get previewStyle() {
          return createProjectIconPreviewStyle(entry, readDimensions)
        },
      })),
    })),
  }
}

function buildCustomBlockScope(
  key: string,
  packageKey: string | null,
  label: string,
  prefix: string,
  scopeEnvironment: ProjectResourceEnvironment,
): PropertyCustomBlockScope {
  const collections: PropertyCustomBlockCollectionGroup[] = Object.entries(
    scopeEnvironment.customBlockRegistry ?? {},
  ).map(([collectionKey, collection]) => ({
    key: collectionKey,
    name: collectionKey,
    entries: Object.entries(collection).map(([blockKey, entry]) => {
      const value = `${prefix}block:${collectionKey}/${blockKey}`
      const relative = entry.source.replace(/\\/g, '/')
      const document = scopeEnvironment.customBlockSources?.get(relative)
      const blockLabel = getBlockProperty<string>(document?.block, 'name')?.trim() || blockKey
      return {
        key: `${collectionKey}/${blockKey}`,
        name: blockLabel,
        collectionKey,
        blockKey,
        value,
        source: entry.source,
      }
    }),
  }))
  return { key, packageKey, label, collections }
}

function buildFontScopes(options: CreateResourcePropertyCapabilitiesOptions): readonly PropertyFontScope[] {
  const env = options.resourceEnvironment
  if (env) {
    const scopes: PropertyFontScope[] = [
      {
        key: 'project',
        label: options.projectLabel,
        packageKey: null,
        entries: Object.entries(env.fonts).map(([key, entry]) => ({
          key,
          value: `font:${key}`,
          label: entry.name,
          detail: `font:${key}`,
          cssFamily: resolveProjectEnvironmentFontFamily(`font:${key}`, env),
        })),
      },
    ]
    for (const [coordinate, packageEnvironment] of env.packageEnvironments ?? []) {
      const qualifier = parsePackageQualifier(coordinate)
      const pkg = qualifier ? resolveProjectResourcePackage(env, qualifier) : null
      if (!pkg) continue
      const fullCoordinate = formatPackageCoordinate(pkg.coordinate)
      scopes.push({
        key: fullCoordinate,
        label: pkg.manifest.title || fullCoordinate,
        packageKey: fullCoordinate,
        entries: Object.entries(packageEnvironment.fonts).map(([key, entry]) => ({
          key: `${fullCoordinate}#${key}`,
          value: `${fullCoordinate}#font:${key}`,
          label: entry.name,
          detail: `${fullCoordinate}#font:${key}`,
          cssFamily: resolveProjectEnvironmentFontFamily(`font:${key}`, packageEnvironment),
        })),
      })
    }
    return scopes
  }
  if (options.fontCatalog?.length) {
    return [
      {
        key: 'project',
        label: options.projectLabel,
        packageKey: null,
        entries: options.fontCatalog
          .filter(font => font.source === 'project')
          .map(font => ({
            key: font.value,
            value: font.value,
            label: font.label,
            detail: font.detail,
            cssFamily: font.cssFamily ?? toCssFontFamily(font.value),
          })),
      },
    ]
  }
  return []
}

function buildIconScopes(options: CreateResourcePropertyCapabilitiesOptions): readonly PropertyIconScope[] {
  const readDimensions = options.readIconDimensions ?? readProjectIconSize
  const env = options.resourceEnvironment
  const projectCatalog = options.projectIconCatalog ?? env?.iconCatalog ?? EMPTY_PROJECT_ICON_CATALOG
  const scopes: PropertyIconScope[] = [
    buildIconScope('project', null, options.projectLabel, projectCatalog, readDimensions),
  ]
  for (const [packageKey, packageEnvironment] of env?.packageEnvironments ?? []) {
    const qualifier = parsePackageQualifier(packageKey)
    const pkg = qualifier && env ? resolveProjectResourcePackage(env, qualifier) : null
    if (!pkg || !packageEnvironment.iconCatalog.entries.length) continue
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    scopes.push(
      buildIconScope(
        coordinate,
        coordinate,
        pkg.manifest.title || coordinate,
        packageEnvironment.iconCatalog,
        readDimensions,
      ),
    )
  }
  return scopes
}

function buildCustomBlockScopes(
  options: CreateResourcePropertyCapabilitiesOptions,
): readonly PropertyCustomBlockScope[] {
  const env = options.resourceEnvironment
  if (!env) return []
  const scopes: PropertyCustomBlockScope[] = [
    buildCustomBlockScope('project', null, options.projectLabel, '', env),
  ]
  for (const [coordinate, packageEnvironment] of env.packageEnvironments ?? []) {
    const qualifier = parsePackageQualifier(coordinate)
    const pkg = qualifier ? resolveProjectResourcePackage(env, qualifier) : null
    const fullCoordinate = pkg ? formatPackageCoordinate(pkg.coordinate) : coordinate
    const label = pkg?.manifest.title || fullCoordinate
    scopes.push(buildCustomBlockScope(fullCoordinate, fullCoordinate, label, `${fullCoordinate}#`, packageEnvironment))
  }
  return scopes
}

export function createResourcePropertyCapabilities(
  options: CreateResourcePropertyCapabilitiesOptions,
): PropertyFieldCapabilities {
  const files = options.rootPath && options.fs
    ? options.resourceEnvironment
      ? createResourceFilePathScopes(options.rootPath, options.resourceEnvironment, options.fs, {
          hideDotFiles: true,
          projectLabel: options.projectLabel,
        })
      : [
          {
            key: 'project',
            label: options.projectLabel,
            prefix: '',
            readDirectory: createScopeDirectoryProvider(options.rootPath, options.fs, { hideDotFiles: true }),
          },
        ]
    : undefined
  const fonts = buildFontScopes(options)
  const icons = buildIconScopes(options)
  const customBlocks = buildCustomBlockScopes(options)
  const resolveImagePreview = options.resourceEnvironment?.asset
    ? (reference: string) => {
        const result = options.resourceEnvironment?.asset?.(reference)
        return result?.status === 'ready' ? result.src ?? null : null
      }
    : undefined

  return {
    ...(files ? { files } : {}),
    ...(fonts.length ? { fonts } : {}),
    ...(icons.length ? { icons } : {}),
    ...(customBlocks.length ? { customBlocks } : {}),
    ...(resolveImagePreview ? { resolveImagePreview } : {}),
  }
}
