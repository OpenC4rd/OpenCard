import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from './en-US'
import zhCN from './zh-CN'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, nested]) => keyPaths(nested, prefix ? `${prefix}.${key}` : key))
}

describe('locale parity', () => {
  it('keeps every supported language on the same key set', () => {
    const zhKeys = new Set(keyPaths(zhCN))
    const enKeys = new Set(keyPaths(enUS))

    expect([...zhKeys].filter(key => !enKeys.has(key))).toEqual([])
    expect([...enKeys].filter(key => !zhKeys.has(key))).toEqual([])
  })

  /**
   * 文案是运行时编译的：`@`、`|`、`{}` 这些 vue-i18n 的语法字符会让整条消息编译失败，
   * 而编译发生在渲染期——一条写坏的文案足以让整个界面崩掉（`@noreply.example` 就是这么炸的）。
   */
  it('compiles every message in every language', () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const i18n = createI18n({ legacy: false, locale, messages: { [locale]: locale === 'zh-CN' ? zhCN : enUS } })
      for (const key of keyPaths(locale === 'zh-CN' ? zhCN : enUS)) {
        // 缺 key 时 t() 会原样返回 key，所以这里比对"取到了文案"而不是"没抛异常"。
        expect(() => i18n.global.t(key), `${locale}:${key}`).not.toThrow()
        expect(i18n.global.t(key), `${locale}:${key}`).not.toBe(key)
      }
    }
  })
})
