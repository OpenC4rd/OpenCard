import type { PropertyCompletionItem, PropertyCompletionProvider } from '../../../shared/ui/property-editor/propertyEditor.types'
import type { ProjectResourceEnvironment } from './projectResourceEnvironment'

type CustomBlockChoice = PropertyCompletionItem & { searchKey: string }

export function createCustomBlockCompletionProvider(
  environment: ProjectResourceEnvironment,
): PropertyCompletionProvider {
  const choices: CustomBlockChoice[] = []
  const addScope = (scope: ProjectResourceEnvironment, prefix: string) => {
    for (const [path] of scope.customBlockSources ?? []) {
      const value = `${prefix}${path}`
      choices.push({ key: `custom-block-source:${value}`, label: path, detail: prefix || undefined, insertText: value, searchKey: value })
    }
    for (const entry of Object.values(scope.customBlockRegistry ?? {})) {
      const value = `${prefix}block:${entry.key}`
      choices.push({ key: `custom-block-key:${value}`, label: entry.name, detail: value, insertText: value, searchKey: `${value} ${entry.name}` })
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
