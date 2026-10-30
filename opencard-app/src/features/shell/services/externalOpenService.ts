import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { CARD_DOCUMENT_SUFFIX, RESOURCE_PACKAGE_SUFFIX } from '../../workspace/model/fileTypes'
import { PROJECT_PROFILE_FILE_NAME } from '../../workspace/model/projectMetadata'
import { PROJECT_FONT_REGISTRY_FILE_NAME } from '../../workspace/model/projectFontRegistry'
import { PROJECT_ICON_REGISTRY_FILE_NAME } from '../../workspace/model/projectIconRegistry'
import { PROJECT_DICTIONARY_FILE_NAME } from '../../workspace/model/projectDictionary'
import { PROJECT_TEMPLATE_PACKAGE_SUFFIX } from '../../project-templates/model/projectTemplate'

const EXTERNAL_OPEN_EVENT = 'external-open-requested'
const TAKE_EXTERNAL_OPEN_REQUESTS_COMMAND = 'take_external_open_requests'

type ExternalOpenPathKind = 'card' | 'project-resource' | 'template' | 'resource-package'

export function classifyExternalOpenPath(path: string): ExternalOpenPathKind | null {
  const normalizedPath = path.replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() ?? normalizedPath
  const windowsPath = /^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith('//')
  const comparableFileName = windowsPath ? fileName.toLocaleLowerCase() : fileName
  const comparablePath = windowsPath ? normalizedPath.toLocaleLowerCase() : normalizedPath
  if ([
    PROJECT_PROFILE_FILE_NAME,
    PROJECT_FONT_REGISTRY_FILE_NAME,
    PROJECT_ICON_REGISTRY_FILE_NAME,
    PROJECT_DICTIONARY_FILE_NAME,
  ].some(resourcePath => comparablePath.endsWith(`/${resourcePath}`))) return 'project-resource'
  if (comparableFileName.toLocaleLowerCase().endsWith(PROJECT_TEMPLATE_PACKAGE_SUFFIX)) return 'template'
  if (comparableFileName.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX)) return 'resource-package'
  if (comparableFileName.toLocaleLowerCase().endsWith(CARD_DOCUMENT_SUFFIX)) return 'card'
  return null
}

export function filterSupportedExternalOpenPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => classifyExternalOpenPath(path) !== null)
}

export async function listenForExternalOpenRequests(
  handlePaths: (paths: readonly string[]) => Promise<void> | void,
): Promise<UnlistenFn> {
  let drainRequested = false
  let draining: Promise<void> | null = null

  const requestDrain = async (): Promise<void> => {
    drainRequested = true
    if (draining) return await draining

    draining = (async () => {
      while (drainRequested) {
        drainRequested = false
        const paths = await invoke<string[]>(TAKE_EXTERNAL_OPEN_REQUESTS_COMMAND)
        if (paths.length > 0) await handlePaths(paths)
      }
    })()

    try {
      await draining
    } finally {
      draining = null
    }
  }

  const unlisten = await listen(EXTERNAL_OPEN_EVENT, () => {
    void requestDrain()
  })
  try {
    await requestDrain()
    return unlisten
  } catch (error) {
    unlisten()
    throw error
  }
}
