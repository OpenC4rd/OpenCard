import type { FilePathDirectoryProvider, FilePathScope } from '../../../shared/model/filePath'
import type { FileSystemService } from './fileSystemService'
import { formatPackageCoordinate } from '../model/packageCoordinate'
import { resolveResourcePath } from '../model/scopedResourcePath'
import type { ProjectResourceEnvironment } from './projectResourceEnvironment'

export function createScopeDirectoryProvider(
  scopeRootPath: string,
  fs: Pick<FileSystemService, 'readDirectoryEntries' | 'fileExists'>,
  options: { hideDotFiles?: boolean } = {},
): FilePathDirectoryProvider {
  return async directory => {
    const prefix = directory.replace(/\/+$/, '')
    const resolved = resolveResourcePath({
      scopeRootPath,
      projectRootPath: scopeRootPath,
      reference: `${prefix ? `${prefix}/` : ''}__oc_browse__`,
    })
    if (!resolved.ok) return []
    const directoryPath = resolved.value.slice(0, -'/__oc_browse__'.length)
    let directoryEntries: Awaited<ReturnType<FileSystemService['readDirectoryEntries']>>
    try {
      directoryEntries = await fs.readDirectoryEntries(directoryPath, 1)
    } catch (error) {
      if (await fs.fileExists(directoryPath)) throw error
      return []
    }
    return directoryEntries.filter(
      entry => !options.hideDotFiles || !entry.name.split(/[\\/]/).some(segment => segment.startsWith('.')),
    )
  }
}

export function createResourceFilePathScopes(
  rootPath: string,
  environment: ProjectResourceEnvironment,
  fs: Pick<FileSystemService, 'readDirectoryEntries' | 'fileExists'>,
  options: { hideDotFiles?: boolean; projectLabel?: string } = {},
): readonly FilePathScope[] {
  const projectScopeRoot = environment.rootPath ?? rootPath
  const scopes: FilePathScope[] = [
    {
      key: 'project',
      label: options.projectLabel ?? 'Project',
      prefix: '',
      readDirectory: createScopeDirectoryProvider(projectScopeRoot, fs, options),
    },
  ]
  for (const [, pkg] of environment.packages ?? []) {
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    const packageRootPath = pkg.rootPath
    scopes.push({
      key: coordinate,
      label: pkg.manifest.title || coordinate,
      prefix: `${coordinate}#`,
      readDirectory: packageRootPath
        ? createScopeDirectoryProvider(packageRootPath, fs, options)
        : async () => [],
    })
  }
  return scopes
}
