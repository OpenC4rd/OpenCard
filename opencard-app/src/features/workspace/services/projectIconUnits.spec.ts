import { describe, expect, it, vi } from 'vitest'
import { readProjectIconRegistry, writeProjectIconRegistry } from './projectIconUnits'

function createFs(files: Record<string, string>, symlinks: string[] = []) {
  const entries = new Map(Object.entries(files))
  const has = (path: string) => entries.has(path) || [...entries.keys()].some(key => key.startsWith(`${path}/`))
  return {
    entries,
    fileExists: vi.fn(async (path: string) => has(path)),
    readFile: vi.fn(async (path: string) => entries.get(path) ?? ''),
    readDirectory: vi.fn(async (path: string) => {
      const names = new Set([...entries.keys()].filter(key => key.startsWith(`${path}/`)).map(key => key.slice(path.length + 1).split('/')[0]!))
      return [...names].map(name => ({ name, isFile: entries.has(`${path}/${name}`), isDirectory: !entries.has(`${path}/${name}`), isSymlink: symlinks.includes(name) }))
    }),
    deleteFile: vi.fn(async (path: string) => void entries.delete(path)),
  }
}

const manifest = (name: string, source = 'a.svg') => JSON.stringify({ name, icons: [{ key: 'a', name: 'A', source, tint: 'context' }] })

describe('readProjectIconRegistry', () => {
  it('reads every set folder in name order and ignores folders that are not sets', async () => {
    const fs = createFs({
      '/p/.opencard/icons/zeta/icon-set.json': manifest('Zeta'),
      '/p/.opencard/icons/alpha/icon-set.json': manifest('Alpha'),
      '/p/.opencard/icons/loose/readme.txt': 'not a set',
      '/p/.opencard/icons/Bad Name/icon-set.json': manifest('Bad'),
      '/p/.opencard/icons/linked/icon-set.json': manifest('Linked'),
    }, ['linked'])
    const { document, errors } = await readProjectIconRegistry(fs, '/p')
    expect(document.iconSeries?.map(series => series.key)).toEqual(['alpha', 'zeta'])
    expect(document.iconSeries?.[0]?.icons[0]?.source).toBe('.opencard/icons/alpha/a.svg')
    expect(errors).toEqual([])
  })

  it('skips a broken set with an error naming its manifest, and keeps the others', async () => {
    const fs = createFs({
      '/p/.opencard/icons/good/icon-set.json': manifest('Good'),
      '/p/.opencard/icons/bad/icon-set.json': '{broken',
      '/p/.opencard/icons/nameless/icon-set.json': '{"icons":[]}',
    })
    const { document, errors } = await readProjectIconRegistry(fs, '/p')
    expect(document.iconSeries?.map(series => series.key)).toEqual(['good'])
    expect(errors).toHaveLength(2)
    expect(errors.join('\n')).toContain('.opencard/icons/bad/icon-set.json')
  })

  it('is empty without an icons folder', async () => {
    expect((await readProjectIconRegistry(createFs({}), '/p')).document).toEqual({})
  })

  it('hands back the same objects when nothing changed, so the catalog is not rebuilt', async () => {
    const fs = createFs({
      '/p/.opencard/icons/a/icon-set.json': manifest('A'),
      '/p/.opencard/icons/b/icon-set.json': manifest('B'),
    })
    const first = (await readProjectIconRegistry(fs, '/p')).document
    expect((await readProjectIconRegistry(fs, '/p', first)).document).toBe(first)

    fs.entries.set('/p/.opencard/icons/b/icon-set.json', manifest('B renamed'))
    const second = (await readProjectIconRegistry(fs, '/p', first)).document
    expect(second).not.toBe(first)
    expect(second.iconSeries?.[0]).toBe(first.iconSeries?.[0])
    expect(second.iconSeries?.[1]?.name).toBe('B renamed')
  })
})

describe('writeProjectIconRegistry', () => {
  it('writes only the manifests that changed and deletes only manifests of dropped sets', async () => {
    const fs = createFs({
      '/p/.opencard/icons/keep/icon-set.json': `${JSON.stringify({ name: 'Keep', icons: [] }, null, 2)}\n`,
      '/p/.opencard/icons/drop/icon-set.json': manifest('Drop'),
      '/p/.opencard/icons/drop/a.svg': '<svg/>',
    })
    const write = vi.fn(async () => undefined)
    await writeProjectIconRegistry(fs, '/p', {
      iconSeries: [
        { name: 'Keep', key: 'keep', icons: [] },
        { name: 'New', key: 'fresh', icons: [] },
      ],
    }, write)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('.opencard/icons/fresh/icon-set.json', expect.stringContaining('"name": "New"'))
    expect(fs.deleteFile).toHaveBeenCalledTimes(1)
    expect(fs.deleteFile).toHaveBeenCalledWith('/p/.opencard/icons/drop/icon-set.json')
    expect(fs.entries.has('/p/.opencard/icons/drop/a.svg')).toBe(true)
  })
})
