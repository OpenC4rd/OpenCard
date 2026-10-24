import { describe, expect, it } from 'vitest'
import { APP_ERROR_CATALOG } from './appErrorCatalog'

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

})
