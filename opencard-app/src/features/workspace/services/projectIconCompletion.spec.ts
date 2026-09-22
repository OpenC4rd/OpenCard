import { describe, expect, it } from 'vitest'
import type { ProjectIconSeries } from '../model/projectIcons'
import { buildProjectIconCatalog } from './projectIconCatalog'
import { createProjectIconCompletionProvider, type ProjectIconSource } from './projectIconCompletion'

const projectSeries: ProjectIconSeries[] = [{
  name: 'Status icons', key: 'status',
  icons: [{ iconKey: 'warning', name: 'Warning badge', source: 'assets/icons/warning.svg', tint: 'theme' }],
}]
const packageSeries: ProjectIconSeries[] = [{
  name: 'Theme marks', key: 'mark',
  icons: [{ iconKey: 'sword', name: 'Sword', source: 'assets/icons/sword.svg', tint: 'original' }],
}]

const projectSource: ProjectIconSource = {
  packageKey: null,
  label: 'This project',
  catalog: buildProjectIconCatalog(projectSeries, source => `asset://${source}`),
}
const packageSource: ProjectIconSource = {
  packageKey: 'theme',
  label: 'Theme Pack',
  catalog: buildProjectIconCatalog(packageSeries, source => `asset://theme/${source}`),
}
const sources = [projectSource, packageSource]
/** Sizes as the resolver reports them once the icon has been painted. */
const readSize = () => ({ width: 16, height: 8 })

describe('project icon completion', () => {
  it('lists collections without repeating their key', async () => {
    const result = await createProjectIconCompletionProvider(sources, { mode: 'reference' })(
      { value: 'icon:', cursor: 5 },
    )
    const collection = result?.items.find(item => item.insertText === 'status/')
    expect(collection).toMatchObject({ label: 'Status icons', keepOpen: true })
    expect(collection).not.toHaveProperty('detail')
  })

  it('lists icons by name without repeating their key', async () => {
    const value = 'icon:status/'
    const result = await createProjectIconCompletionProvider(sources, {
      mode: 'reference',
      readDimensions: readSize,
    })({ value, cursor: value.length })
    const icon = result?.items[0]
    expect(icon).toMatchObject({ label: 'Warning badge', insertText: 'icon:status/warning' })
    expect(icon).not.toHaveProperty('detail')
    expect(icon?.thumbnailStyle?.width).toBe('2em')
  })

  it('replaces the whole reference when a package is chosen, not just the collection slot', async () => {
    const result = await createProjectIconCompletionProvider(sources, { mode: 'reference' })(
      { value: 'icon:', cursor: 5 },
    )
    const pkg = result?.items.find(item => item.insertText === 'theme@icon:')
    expect(pkg).toMatchObject({ label: 'Theme Pack', replaceStart: 0, replaceEnd: 5 })
    // Applying it must yield the package reference, not `icon:theme@icon:`.
    const applied = `icon:`.slice(0, pkg!.replaceStart) + pkg!.insertText + `icon:`.slice(pkg!.replaceEnd!)
    expect(applied).toBe('theme@icon:')
  })

  it('walks up from an icon to its collection and from a package collection to the sources', async () => {
    const provider = createProjectIconCompletionProvider(sources, { mode: 'reference' })

    const iconValue = 'icon:status/'
    const iconResult = await provider({ value: iconValue, cursor: iconValue.length })
    expect(iconResult?.parent).toMatchObject({ label: '..', insertText: 'icon:' })

    const packageIconValue = 'theme@icon:mark/'
    const packageIconResult = await provider({ value: packageIconValue, cursor: packageIconValue.length })
    expect(packageIconResult?.parent).toMatchObject({ insertText: 'theme@icon:' })

    const packageCollectionValue = 'theme@icon:'
    const packageCollectionResult = await provider({
      value: packageCollectionValue,
      cursor: packageCollectionValue.length,
    })
    expect(packageCollectionResult?.parent).toMatchObject({
      label: '..',
      insertText: 'icon:',
      replaceStart: 0,
      replaceEnd: packageCollectionValue.length,
    })
  })

  it('writes the icon: prefix for a collection chosen between double brackets', async () => {
    const provider = createProjectIconCompletionProvider(sources)
    const value = 'Use [[st]] here'
    const result = await provider({ value, cursor: value.indexOf(']]') })
    expect(result).toMatchObject({ replaceStart: 6, replaceEnd: 8 })
    expect(result?.items[0]).toMatchObject({ label: 'Status icons', insertText: 'icon:status/', keepOpen: true })
  })

  it('stops completing once the cursor sits after the closing brackets', async () => {
    const provider = createProjectIconCompletionProvider(sources)
    const value = 'Use [[icon:status/warning]] here'
    const closing = value.indexOf(']]')

    // 光标停在 `]]` 之后：这枚图标已经写完，不再弹补全，回车交还给换行。
    expect(await provider({ value, cursor: closing + 2 })).toBeNull()

    // 光标还在 token 里，照旧给候选，替换范围盖住右侧的 `]]`。
    const inside = await provider({ value, cursor: closing })
    expect(inside?.items[0]).toMatchObject({ insertText: '[[icon:status/warning]]' })
    expect(inside).toMatchObject({ replaceStart: 4, replaceEnd: closing + 2 })
  })

  it('writes the canonical token for a package icon', async () => {
    const provider = createProjectIconCompletionProvider(sources)
    const value = '[[theme@icon:mark/'
    const result = await provider({ value, cursor: value.length })
    expect(result?.items[0]).toMatchObject({
      label: 'Sword',
      insertText: '[[theme@icon:mark/sword]]',
    })
    expect(result?.items[0]).not.toHaveProperty('detail')
  })

  it('prepares thumbnails once per collection and reuses them while filtering', async () => {
    let sourceReads = 0
    const measuredEntry = {
      ...projectSource.catalog.entries[0]!,
      get src() {
        sourceReads += 1
        return 'asset://status'
      },
    }
    const provider = createProjectIconCompletionProvider([
      { ...projectSource, catalog: { ...projectSource.catalog, entries: [measuredEntry] } },
    ], { mode: 'reference' })
    expect(sourceReads).toBe(0)
    await provider({ value: 'icon:st', cursor: 7 })
    expect(sourceReads).toBe(0)
    await provider({ value: 'icon:status/', cursor: 12 })
    expect(sourceReads).toBe(1)
    await provider({ value: 'icon:status/war', cursor: 15 })
    expect(sourceReads).toBe(1)
  })
})
