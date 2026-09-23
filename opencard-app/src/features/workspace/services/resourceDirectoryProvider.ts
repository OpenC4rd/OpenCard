import type { FilePathDirectoryProvider } from '../../../shared/model/filePath'
import type { FileSystemService } from './fileSystemService'
import { parsePackageQualifier } from '../model/packageCoordinate'
import { resolveResourcePath } from '../model/scopedResourcePath'
import { packageScopeRoots, type ProjectResourceEnvironment } from './projectResourceEnvironment'

/**
 * `作者/包名@版本#` with nothing after the separator: the one place inside a package where a
 * resource path or an icon reference can start. The qualifier is the whole text before that
 * separator.
 */
function isPackageRoot(directory: string): boolean {
  const separator = directory.lastIndexOf('#')
  return separator === directory.length - 1
    && parsePackageQualifier(directory.slice(0, separator)) !== null
}

/**
 * 文件选择器在一个作用域里浏览。作用域的根由环境给出 —— 项目就是项目根，包就是它解开后的目录。
 * 所以在包里浏览时，路径前缀是包内的相对路径；在项目里浏览时，`作者/包名#` 还能继续走进某个包。
 */
export function createResourceDirectoryProvider(
  rootPath: string,
  environment: ProjectResourceEnvironment,
  fs: Pick<FileSystemService, 'readDirectoryEntries'>,
  options: { hideDotFiles?: boolean, iconEntryLabel?: string } = {},
): FilePathDirectoryProvider {
  const scopeRootPath = environment.rootPath ?? rootPath
  const current = environment
  const packageRoots = packageScopeRoots(current.packages)
  const resolve = (reference: string) => resolveResourcePath({
    scopeRootPath,
    projectRootPath: rootPath,
    reference,
    packageRoots,
  })
  return async directory => {
    const prefix = directory.replace(/\/+$/, '')
    const resolved = resolve(`${prefix ? `${prefix}/` : ''}__oc_browse__`)
    if (!resolved.ok) return []
    const entries = (await fs.readDirectoryEntries(resolved.value.slice(0, -'/__oc_browse__'.length), 1))
      .filter(entry => !options.hideDotFiles || !entry.name.split(/[\\/]/).some(segment => segment.startsWith('.')))
    // Selecting `icon:` writes the prefix without a separator, and the field's icon completion
    // takes over from there.
    const iconEntry = {
      name: 'icon:',
      label: options.iconEntryLabel,
      isDirectory: true,
      icon: 'file.project-icon' as const,
    }
    // A package root offers it as well, so `作者/包名@版本#` can continue into
    // `作者/包名@版本#icon:` and reach the icons the package ships. Deeper paths inside a package
    // have no icon scope, so they get no entry.
    if (prefix) return isPackageRoot(prefix) ? [...entries, iconEntry] : entries
    return [
      ...entries,
      iconEntry,
      ...[...(current.packages ?? [])].map(([key, pkg]) => ({
        name: `${key}#`, label: pkg.manifest.title, isDirectory: true, icon: 'file.package' as const,
      })),
    ]
  }
}
