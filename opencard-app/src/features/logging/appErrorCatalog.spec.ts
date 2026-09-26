import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_ERROR_CATALOG,
  createAppErrorReport,
  getAppErrorMeaning,
} from './appErrorCatalog'

/**
 * Read the query document from disk rather than importing it as `?raw`.
 * The document lives outside the Vite root, and an import of it was refused with a
 * "Denied ID" error in some environments, which failed this whole file to load and
 * silently retired the guard below. Walking up from the working directory instead keeps
 * the guard independent of the bundler and of the test environment's URL scheme.
 */
function readErrorCodeDocument(): string {
  let directory = process.cwd()
  for (let depth = 0; depth < 3; depth += 1) {
    const candidate = resolve(directory, 'docs/错误码.md')
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
    directory = resolve(directory, '..')
  }
  throw new Error('Could not locate docs/错误码.md from the working directory')
}

const errorCodeDocument = readErrorCodeDocument()

describe('appErrorCatalog', () => {
  it('uses searchable codes with complete localized meanings and solutions', () => {
    for (const [code, definition] of Object.entries(APP_ERROR_CATALOG)) {
      expect(code).toMatch(/^OC-E[1-6]\d{3}$/)
      expect(definition.area.trim()).not.toBe('')
      expect(definition.meaning['zh-CN'].trim()).not.toBe('')
      expect(definition.meaning['en-US'].trim()).not.toBe('')
      expect(definition.solution.trim()).not.toBe('')
    }
  })

  it('keeps the query document synchronized with every runtime definition', () => {
    for (const [code, definition] of Object.entries(APP_ERROR_CATALOG)) {
      expect(errorCodeDocument).toContain(`\`${code}\``)
      expect(errorCodeDocument).toContain(definition.meaning['zh-CN'])
      expect(errorCodeDocument).toContain(definition.solution)
    }
  })

  it('resolves localized meanings and builds structured reports', () => {
    expect(getAppErrorMeaning('OC-E2003', 'zh-CN')).toBe('无法打开文件')
    expect(getAppErrorMeaning('OC-E2003', 'en-US')).toBe('Could not open the file')

    const report = createAppErrorReport('OC-E2003', { path: 'missing.ocdocument' })
    expect(report).toMatchObject({ code: 'OC-E2003', details: { path: 'missing.ocdocument' } })
  })
})
