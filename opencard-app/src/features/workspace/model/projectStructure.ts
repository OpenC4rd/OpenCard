export const PROJECT_INTERNAL_DIRECTORY_NAME = '.opencard'

export const PROJECT_PROFILE_FILE_NAME = `${PROJECT_INTERNAL_DIRECTORY_NAME}/project.json`
export const PROJECT_FONT_REGISTRY_FILE_NAME = `${PROJECT_INTERNAL_DIRECTORY_NAME}/fonts/fonts.json`
export const PROJECT_ICON_REGISTRY_FILE_NAME = `${PROJECT_INTERNAL_DIRECTORY_NAME}/icons/icons.json`
export const PROJECT_DICTIONARY_FILE_NAME = `${PROJECT_INTERNAL_DIRECTORY_NAME}/locale.json`

export const PROJECT_FONT_DIRECTORY = 'fonts'
export const PROJECT_ICON_DIRECTORY = 'icons'
/** 这个项目装了哪些包，就是看这个目录里有哪几个 `.ocpack` —— 没有清单文件。 */
export const PROJECT_PACKAGE_DIRECTORY = 'packages'

export const PROJECT_INTERNAL_FILE_DEFAULTS = Object.freeze({
  [PROJECT_PROFILE_FILE_NAME]: '{}\n',
  [PROJECT_FONT_REGISTRY_FILE_NAME]: '{}\n',
  [PROJECT_ICON_REGISTRY_FILE_NAME]: '{}\n',
  [PROJECT_DICTIONARY_FILE_NAME]: '{}\n',
})

export const PROJECT_INTERNAL_DIRECTORIES = Object.freeze([
  `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_FONT_DIRECTORY}`,
  `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_ICON_DIRECTORY}`,
  `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}`,
])

export function resolveProjectInternalRelativePath(path = ''): string {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return normalized ? `${PROJECT_INTERNAL_DIRECTORY_NAME}/${normalized}` : PROJECT_INTERNAL_DIRECTORY_NAME
}

/**
 * 这个路径是不是"应用自己管的东西"。管的东西不接受回收站、重命名、拖动、拖入 ——
 * 应用要么按注册表重建它，要么会因此在索引里对不上。
 *
 * `.opencard/packages/` **不是**应用管的：里面放的是用户自己的包归档，和项目里任何别的文件
 * 一样可以改名、可以删、可以拖来拖去。身份来自包里面的清单，文件名换了它还是同一个包。
 */
export function isProjectInternalRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (normalized.startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}/`)) return false
  return normalized === PROJECT_INTERNAL_DIRECTORY_NAME
    || normalized.startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/`)
}

/**
 * 文件索引不去走的目录。
 *
 * - `.opencard/fonts` 与 `.opencard/icons` 里一个资源一个文件，没有任何读索引的地方需要它们：
 *   树默认隐藏点路径，资源本身走注册表渲染。
 * - `.git` 属于版本控制，它自己读仓库；一个大仓库递归列一次要好几秒。
 *
 * `.opencard/packages` **不在这里**：项目里装了哪些包，就是那个文件夹里有哪几个 `.ocpack`，
 * 侧栏要照着它列出来。它只放几个归档文件，列一次很便宜 —— 从前它装的是解开的包目录，
 * 里面有上千个文件，那才是当初把它一起跳过、改成另外维护一份包清单的原因。
 */
const PROJECT_INDEX_SKIPPED_DIRECTORIES = Object.freeze([
  `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_FONT_DIRECTORY}`,
  `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_ICON_DIRECTORY}`,
  '.git',
])

export function isProjectIndexSkippedPath(path: string): boolean {
  const identity = path.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
  return PROJECT_INDEX_SKIPPED_DIRECTORIES.some((directory) => {
    const skipped = directory.toLocaleLowerCase()
    return identity === skipped || identity.startsWith(`${skipped}/`)
  })
}
