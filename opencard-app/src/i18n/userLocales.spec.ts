import { describe, expect, it } from 'vitest'
import {
  MAX_USER_LOCALE_FILE_BYTES,
  dropUncompilableMessages,
  mergeLocaleMessages,
  parseUserLocaleFile,
  readUserLocaleFiles,
} from './userLocales'

function fakeFileSystem(files: Record<string, string>, sizes: Record<string, number> = {}) {
  const created: string[] = []
  return {
    created,
    async readFile(path: string): Promise<string> {
      if (!(path in files)) throw new Error(`no such file: ${path}`)
      return files[path]!
    },
    async readDirectory(path: string): Promise<readonly { name: string, isFile: boolean }[]> {
      const prefix = `${path}/`
      return Object.keys(files)
        .filter(name => name.startsWith(prefix) && !name.slice(prefix.length).includes('/'))
        .map(name => ({ name: name.slice(prefix.length), isFile: true }))
    },
    async getFileInfo(path: string): Promise<{ size: number }> {
      return { size: sizes[path] ?? files[path]?.length ?? 0 }
    },
    async createDirectory(path: string): Promise<void> {
      created.push(path)
    },
  }
}

describe('user locales', () => {
  it('reads a language file that names the base language it overrides', () => {
    const parsed = parseUserLocaleFile('fr-FR.json', '{"base":"zh-CN","messages":{"app":{"back":"Retour"}}}')

    expect(parsed).toEqual({
      ok: true,
      locale: { id: 'fr-FR.json', base: 'zh-CN', messages: { app: { back: 'Retour' } } },
    })
  })

  it('refuses a file that cannot name a usable base language', () => {
    expect(parseUserLocaleFile('x.json', '{')).toMatchObject({ ok: false })
    expect(parseUserLocaleFile('x.json', '["base"]')).toMatchObject({ ok: false })
    expect(parseUserLocaleFile('x.json', '{"base":"ja-JP","messages":{}}')).toMatchObject({ ok: false })
    expect(parseUserLocaleFile('x.json', '{"base":"zh-CN","messages":[]}')).toMatchObject({ ok: false })
    // 一条覆盖都不写等于这份语言完全等同它的基底，是合法的。
    expect(parseUserLocaleFile('x.json', '{"base":"en-US"}')).toMatchObject({ ok: true })
  })

  it('overrides only what the base language already defines as text', () => {
    const merged = mergeLocaleMessages(
      { ns: { kept: 'B', changed: 'B', number: 'B', branch: { leaf: 'B' } }, other: 'B' },
      {
        ns: { changed: 'U', number: 7, branch: 'not a branch', unknown: 'U', deeper: { new: 'U' } },
        unknownNamespace: { value: 'U' },
      },
    )

    expect(merged).toEqual({
      ns: { kept: 'B', changed: 'U', number: 'B', branch: { leaf: 'B' } },
      other: 'B',
    })
  })

  it('drops messages that cannot compile, so one bad line cannot break the UI', () => {
    const { messages, badKeys } = dropUncompilableMessages({
      ns: { good: 'Good', brace: 'Value {count', linked: 'See you @ the office' },
      empty: { only: 'Has } stray' },
    })

    expect(badKeys).toEqual(['ns.brace', 'ns.linked', 'empty.only'])
    // 空掉的父层级一并收走，合并时会自然回落基底的值。
    expect(messages).toEqual({ ns: { good: 'Good' } })
  })

  it('reads the language directory, skipping anything that is not a usable language file', async () => {
    const directory = 'C:/Users/Test/.opencard/locales'
    const fs = fakeFileSystem({
      [`${directory}/ja.json`]: '{"base":"en-US","messages":{"app":{"back":"戻る"}}}',
      [`${directory}/broken.json`]: '{"base":"ja-JP"}',
      [`${directory}/huge.json`]: '{"base":"en-US"}',
      [`${directory}/notes.txt`]: 'not a language file',
      [`${directory}/zh-CN`]: '{"base":"en-US"}',
      [`${directory}/sub/nested.json`]: '{"base":"en-US"}',
    }, { [`${directory}/huge.json`]: MAX_USER_LOCALE_FILE_BYTES + 1 })

    const scan = await readUserLocaleFiles(fs, directory)

    expect(fs.created).toEqual([directory])
    expect(scan.locales).toEqual([
      { id: 'ja.json', base: 'en-US', messages: { app: { back: '戻る' } } },
    ])
    expect(scan.problems).toEqual([
      { file: 'broken.json', reason: 'base must be one of zh-CN, en-US' },
      { file: 'huge.json', reason: `larger than ${MAX_USER_LOCALE_FILE_BYTES} bytes` },
    ])
  })
})
