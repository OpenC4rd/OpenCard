// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 0, 1)

  it('formats recent values without a direction suffix', () => {
    expect(formatRelativeTime(now - 2_000, 'zh-CN', now)).toBe('刚刚')
    expect(formatRelativeTime(now - 2 * 60 * 60 * 1000, 'zh-CN', now)).toBe('2小时')
    expect(formatRelativeTime(now - 2 * 7 * 24 * 60 * 60 * 1000, 'zh-CN', now)).toBe('2周')
    expect(formatRelativeTime(now - 30 * 24 * 60 * 60 * 1000, 'zh-CN', now)).toBe('1个月')
  })

  it('uses the requested locale', () => {
    expect(formatRelativeTime(now - 2 * 60 * 60 * 1000, 'en-US', now)).toBe('2 hours')
  })
})
