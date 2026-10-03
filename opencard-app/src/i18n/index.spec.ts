import { describe, expect, it, vi, type Mock } from 'vitest'
import { fileSystemService } from '../features/workspace/services/fileSystemService'
import { titleBarNotices } from '../features/notifications/titlebarNotices'
import zhCN from '../locales/zh-CN'
import { appLocaleOptions, i18n, reloadUserLocales, setAppLocale } from './index'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@tauri-apps/api/path', () => ({
  homeDir: async () => 'C:/Users/Test',
  join: async (...segments: string[]) => segments.join('/'),
}))
vi.mock('../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    createDirectory: vi.fn(async () => {}),
    readDirectory: vi.fn(async () => []),
    getFileInfo: vi.fn(async () => ({ size: 128 })),
    readFile: vi.fn(async () => ''),
  },
}))

const LOCALE_DIRECTORY = 'C:/Users/Test/.opencard/locales'
const fs = fileSystemService as unknown as Record<
  'createDirectory' | 'readDirectory' | 'getFileInfo' | 'readFile',
  Mock
>

/** 让这次扫描看到这几份语言文件（键是文件名）。 */
function serveLocaleFiles(files: Record<string, string>): void {
  fs.readDirectory.mockResolvedValue(Object.keys(files).map(name => ({
    name,
    isFile: true,
    isDirectory: false,
    isSymlink: false,
  })))
  fs.readFile.mockImplementation(async (path: string) => {
    const name = path.slice(`${LOCALE_DIRECTORY}/`.length)
    if (!(name in files)) throw new Error(`no such file: ${path}`)
    return files[name]!
  })
}

function noticesSince(count: number) {
  return titleBarNotices.value.slice(count)
}

describe('app locales', () => {
  it('registers a language file, offers it in the picker, and keeps the base for keys it omits', async () => {
    serveLocaleFiles({
      'fr-FR.json': JSON.stringify({
        base: 'zh-CN',
        messages: { app: { shell: { back: 'Retour', close: '值 {count' } } },
      }),
    })

    await reloadUserLocales('system')

    expect(appLocaleOptions.value).toEqual([
      { id: 'zh-CN', label: '简体中文' },
      { id: 'en-US', label: 'English' },
      { id: 'fr-FR.json', label: 'fr-FR' },
    ])
    expect(setAppLocale('fr-FR.json').missingFile).toBeNull()
    expect(i18n.global.locale.value).toBe('fr-FR.json')
    expect(i18n.global.t('app.shell.back')).toBe('Retour')
    // 文件里没写的 key、以及写坏编译不过的那条，都沿用基底语言的说法。
    expect(i18n.global.t('app.shell.close')).toBe(zhCN.app.shell.close)
    expect(i18n.global.t('app.shell.minimize')).toBe(zhCN.app.shell.minimize)
  })

  it('falls back to the default language and says so once when the selected file is gone', async () => {
    serveLocaleFiles({})
    const before = titleBarNotices.value.length

    await reloadUserLocales('fr-FR.json')
    await reloadUserLocales('fr-FR.json')

    expect(i18n.global.locale.value).not.toBe('fr-FR.json')
    expect(appLocaleOptions.value.map(option => option.id)).toEqual(['zh-CN', 'en-US'])
    const notices = noticesSince(before)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ tone: 'warning' })
    expect(notices[0]!.message).toContain('fr-FR.json')
  })

  it('still becomes usable again once the file is put back', async () => {
    serveLocaleFiles({})
    await reloadUserLocales('fr-FR.json')

    serveLocaleFiles({ 'fr-FR.json': JSON.stringify({ base: 'zh-CN', messages: { app: { shell: { back: 'Retour' } } } }) })
    await reloadUserLocales('fr-FR.json')

    expect(i18n.global.locale.value).toBe('fr-FR.json')
    expect(i18n.global.t('app.shell.back')).toBe('Retour')
  })

  it('names a language file it cannot read instead of failing silently', async () => {
    serveLocaleFiles({ 'broken.json': '{"base":"ja-JP"}' })
    const before = titleBarNotices.value.length

    await reloadUserLocales('system')

    expect(appLocaleOptions.value.map(option => option.id)).toEqual(['zh-CN', 'en-US'])
    const notices = noticesSince(before)
    expect(notices).toHaveLength(1)
    expect(notices[0]!.message).toContain('broken.json')
  })
})
