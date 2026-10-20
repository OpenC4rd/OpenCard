import { afterEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../locales/en-US'
import zhCN from '../../locales/zh-CN'
import { createTipScheduler } from './tipScheduler'
import { pickTipKey, tipKeys } from './tips'

describe('tips', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // 注册表的 key 就是文案的 key：缺一条，标题栏里就会冒出一个 raw key。
  it('has copy for every registered tip in both built-in languages', () => {
    for (const key of tipKeys) {
      expect(zhCN.tips[key], `zh-CN tips.${key}`).toBeTruthy()
      expect(enUS.tips[key], `en-US tips.${key}`).toBeTruthy()
    }
    const expected = [...tipKeys].sort()
    expect(Object.keys(zhCN.tips).sort()).toEqual(expected)
    expect(Object.keys(enUS.tips).sort()).toEqual(expected)
  })

  it('picks from the registry and never repeats the previous tip', () => {
    const previous = tipKeys[0]
    const picked = new Set<string>()
    // 伪随机源扫过整段区间：除了上一条，其余每一条都应能被取到。
    for (let step = 0; step < tipKeys.length - 1; step += 1) {
      const key = pickTipKey(previous, () => step / (tipKeys.length - 1))
      expect(tipKeys).toContain(key)
      expect(key).not.toBe(previous)
      picked.add(key)
    }
    expect(picked.size).toBe(tipKeys.length - 1)
  })

  it('sends one tip per interval and only while it is on', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const scheduler = createTipScheduler({
      notify: (message) => sent.push(message),
      translate: (key) => `[${key}]`,
      random: () => 0.5,
    })

    scheduler.configure(false, 5)
    vi.advanceTimersByTime(30 * 60_000)
    expect(sent).toEqual([])

    // 打开后第一条也要等满一个间隔，不在启动瞬间冒出来。
    scheduler.configure(true, 5)
    vi.advanceTimersByTime(5 * 60_000 - 1)
    expect(sent).toEqual([])
    vi.advanceTimersByTime(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatch(/^\[tips\.\w+\]$/)

    // 改间隔立即按新间隔重新计时，上一条不会被紧接着再说一遍。
    scheduler.configure(true, 1)
    vi.advanceTimersByTime(60_000)
    expect(sent).toHaveLength(2)
    expect(sent[1]).not.toBe(sent[0])

    scheduler.stop()
    vi.advanceTimersByTime(30 * 60_000)
    expect(sent).toHaveLength(2)
  })

  it('skips a tip whose copy is missing', () => {
    vi.useFakeTimers()
    const sent: string[] = []
    const scheduler = createTipScheduler({
      notify: (message) => sent.push(message),
      translate: () => '',
    })

    scheduler.configure(true, 1)
    vi.advanceTimersByTime(5 * 60_000)
    expect(sent).toEqual([])
  })
})
