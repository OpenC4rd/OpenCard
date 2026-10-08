import type { PropertyCompletionItem, PropertyCompletionProvider } from '../../../shared/ui/property-editor/propertyEditor.types'
import type { ProjectResourceEnvironment } from './projectResourceEnvironment'
import { getBlockProperty } from '../../../entities/card/model'

type CustomBlockChoice = PropertyCompletionItem & { searchKey: string }

export function createCustomBlockCompletionProvider(
  environment: ProjectResourceEnvironment,
): PropertyCompletionProvider {
  const choices: CustomBlockChoice[] = []
  const addScope = (scope: ProjectResourceEnvironment, prefix: string) => {
    for (const [collectionKey, collection] of Object.entries(scope.customBlockRegistry ?? {})) {
      for (const [blockKey, entry] of Object.entries(collection)) {
        const value = `${prefix}block:${collectionKey}/${blockKey}`
        const sourcePath = entry.source.replace(/\\/g, '/').split('/').slice(-1)[0] ?? entry.source
        const relative = entry.source.replace(/\\/g, '/')
        const document = scope.customBlockSources?.get(relative)
        const label = getBlockProperty<string>(document?.block, 'name')?.trim() || blockKey
        choices.push({ key: `custom-block-key:${value}`, label, detail: value, insertText: value, searchKey: `${value} ${label} ${sourcePath}` })
      }
    }
  }

  addScope(environment, '')
  for (const [coordinate, child] of environment.packageEnvironments?.entries() ?? []) {
    addScope(child, `${coordinate}#`)
  }

  return ({ value, cursor }) => {
    const query = value.slice(0, cursor).toLocaleLowerCase()
    const items = choices
      .filter(choice => !query || choice.searchKey.toLocaleLowerCase().includes(query))
      .map(({ searchKey: _searchKey, ...item }) => item)
    return { replaceStart: 0, replaceEnd: cursor, items }
  }
}
