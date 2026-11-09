import { afterEach, describe, expect, it } from 'vitest'
import * as disk from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planProjectAdaptation, readRecordedProjectVersion, runProjectAdaptation, type AdaptationFs } from './projectAdaptation'
import { PROJECT_ADAPTATION_SCRIPTS } from './projectAdaptationScripts'

const exists = async (path: string) => disk.access(path).then(() => true, () => false)
const fs: AdaptationFs = {
  fileExists: exists,
  readFile: path => disk.readFile(path, 'utf8'),
  writeFile: (path, content) => disk.writeFile(path, content),
  readDirectory: async path => (await disk.readdir(path, { withFileTypes: true }))
    .map(entry => ({ name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory(), isSymlink: entry.isSymbolicLink() })),
  async readDirectoryEntries(path, _depth, base = '', options = {}) {
    const result: Awaited<ReturnType<AdaptationFs['readDirectoryEntries']>> = []
    for (const entry of await disk.readdir(path, { withFileTypes: true })) {
      const name = base ? `${base}/${entry.name}` : entry.name
      result.push({ name, isFile: entry.isFile(), isDirectory: entry.isDirectory(), isSymlink: entry.isSymbolicLink() })
      if (entry.isDirectory() && !options.skipDirectory?.(name)) result.push(...await this.readDirectoryEntries(`${path}/${entry.name}`, Infinity, name, options))
    }
    return result
  },
  createDirectory: path => disk.mkdir(path, { recursive: true }).then(() => undefined),
  copyFile: (from, to) => disk.copyFile(from, to),
  renameFile: (from, to) => disk.rename(from, to),
  deleteFile: path => disk.rm(path, { recursive: true, force: true }),
  getFileInfo: async path => { const info = await disk.lstat(path); return { isFile: info.isFile(), isDirectory: info.isDirectory(), isSymlink: info.isSymbolicLink() } as never },
}

let root = ''
async function project(files: Record<string, string>): Promise<string> {
  root = (await disk.mkdtemp(join(tmpdir(), 'opencard-adapt-'))).replace(/\\/g, '/')
  for (const [path, content] of Object.entries(files)) {
    await disk.mkdir(join(root, path, '..'), { recursive: true })
    await disk.writeFile(join(root, path), content)
  }
  return root
}
const read = (path: string) => disk.readFile(join(root, path), 'utf8')
const json = async (path: string) => JSON.parse(await read(path))
afterEach(async () => { if (root) await disk.rm(root, { recursive: true, force: true }) })

describe('planProjectAdaptation', () => {
  const scripts = [{ version: '0.5.0-beta.1', title: 'a', run: async () => {} }, { version: '0.5.0-beta.2', title: 'b', run: async () => {} }]
  it('runs only the scripts newer than the recorded version, and nothing for a current project', () => {
    expect(planProjectAdaptation('0.5.0-beta.1', scripts, '0.5.0-beta.2')).toMatchObject({ status: 'pending', from: '0.5.0-beta.1', scripts: [scripts[1]] })
    expect(planProjectAdaptation('0.4.9', scripts, '0.5.0-beta.2')).toMatchObject({ status: 'pending', scripts })
    expect(planProjectAdaptation('0.5.0-beta.2', scripts, '0.5.0-beta.2')).toEqual({ status: 'current' })
  })
  it('treats an unrecorded, too old or newer project as outside the design, offering every script', () => {
    expect(planProjectAdaptation(undefined, scripts, '0.5.0-beta.2')).toMatchObject({ status: 'unknown', reason: 'missing', scripts })
    expect(planProjectAdaptation('0.4.7', scripts, '0.5.0-beta.2')).toMatchObject({ status: 'unknown', reason: 'older' })
    expect(planProjectAdaptation('0.6.0', scripts, '0.5.0-beta.2')).toMatchObject({ status: 'unknown', reason: 'newer' })
  })
})

describe('adaptation scripts', () => {
  it('splits the old icon registry into set folders, carrying every file it can into its set', async () => {
    await project({
      '.opencard/project.json': '{"name":"Old"}',
      '.opencard/icons/icons.json': JSON.stringify({ iconSeries: [
        { key: 'outline', name: 'Outline', icons: [
          // An earlier import put this set in a suffixed folder; the app owned it, so the file moves.
          { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline-2/warn.svg', tint: 'theme', rotation: 90 },
          // A file the user keeps elsewhere in the project is copied, never moved.
          { iconKey: 'logo', name: 'Logo', source: 'art/logo.png', tint: 'original', pixelated: true },
          // A file in a package cannot be carried over.
          { iconKey: 'gone', name: 'Gone', source: 'alice/pack@1.0.0#icons/gone.svg', tint: 'context' },
        ] },
      ] }),
      '.opencard/icons/outline-2/warn.svg': '<svg/>',
      'art/logo.png': 'png',
    })
    const notes = await runProjectAdaptation(fs, root, PROJECT_ADAPTATION_SCRIPTS, '0.5.0-beta.2')

    expect(await json('.opencard/icons/outline/icon-set.json')).toEqual({
      name: 'Outline',
      icons: [
        { key: 'warn', name: 'Warn', source: 'warn.svg', tint: 'context' },
        { key: 'logo', name: 'Logo', source: 'logo.png', pixelated: true },
      ],
    })
    expect(await read('.opencard/icons/outline/warn.svg')).toBe('<svg/>')
    expect(await exists(join(root, '.opencard/icons/outline-2'))).toBe(false)
    expect(await read('art/logo.png')).toBe('png')
    expect(await exists(join(root, '.opencard/icons/icons.json'))).toBe(false)
    expect(notes).toEqual(['Icon file could not be carried over: alice/pack@1.0.0#icons/gone.svg'])
    expect(await readRecordedProjectVersion(fs, root)).toBe('0.5.0-beta.2')
    expect((await json('.opencard/project.json')).name).toBe('Old')
  })

  it('groups a flat block registry into a collection and points card references at it', async () => {
    await project({
      '.opencard/blocks/blocks.json': JSON.stringify({ blocks: [{ key: 'badge', name: 'Badge', source: '.opencard/blocks/badge.ocblock' }] }),
      'cards/a.ocdocument': JSON.stringify({ source: 'block:badge', other: 'alice/pack@1.0.0#block:badge', kept: 'block:ui/badge', text: 'a block:badge in prose' }),
    })
    await runProjectAdaptation(fs, root, PROJECT_ADAPTATION_SCRIPTS, '0.5.0-beta.2')

    expect(await json('.opencard/blocks/blocks.json')).toEqual({
      collections: [{ key: 'default', name: 'Custom Blocks', blocks: [{ key: 'badge', source: '.opencard/blocks/badge.ocblock' }] }],
    })
    expect(await json('cards/a.ocdocument')).toEqual({
      source: 'block:default/badge', other: 'alice/pack@1.0.0#block:default/badge', kept: 'block:ui/badge', text: 'a block:badge in prose',
    })
  })

  it('leaves a project already in the current structure exactly as it was, so forcing it is safe', async () => {
    const current = {
      '.opencard/icons/outline/icon-set.json': '{\n  "name": "Outline",\n  "icons": []\n}\n',
      '.opencard/blocks/blocks.json': '{"collections":[{"key":"ui","name":"UI","blocks":[]}]}',
      'cards/a.ocdocument': '{"source":"block:ui/badge"}',
    }
    await project(current)
    await runProjectAdaptation(fs, root, PROJECT_ADAPTATION_SCRIPTS, '0.5.0-beta.2')
    for (const [path, content] of Object.entries(current)) expect(await read(path)).toBe(content)
  })
})
