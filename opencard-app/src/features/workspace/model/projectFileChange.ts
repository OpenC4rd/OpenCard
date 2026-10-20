export type ProjectFileChange = {
  path: string
  kind: 'content' | 'structure' | 'unknown'
  oldPath?: string
}

export function projectChangePaths(changes: readonly ProjectFileChange[]): string[] {
  const paths = new Set<string>()
  for (const change of changes) {
    paths.add(change.path)
    if (change.oldPath) paths.add(change.oldPath)
  }
  return [...paths]
}
