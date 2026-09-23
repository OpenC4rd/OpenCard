import { describe, expect, it } from 'vitest'
import { relativizeResourcePath, resolveResourcePath } from './scopedResourcePath'

const PROJECT = 'C:/project'

describe('per-set icon folder round trip', () => {
  it('writes a set-relative reference that resolves back to the same file', () => {
    const target = 'C:/project/.opencard/icons/outline/warn.svg'
    const reference = relativizeResourcePath({
      scopeRootPath: PROJECT, projectRootPath: PROJECT, targetPath: target,
    })
    expect(reference).toEqual({ ok: true, value: '.opencard/icons/outline/warn.svg' })
    expect(resolveResourcePath({
      scopeRootPath: PROJECT, projectRootPath: PROJECT, reference: '.opencard/icons/outline/warn.svg',
    })).toEqual({ ok: true, value: target })
  })

  it('refuses a set folder that escapes the project', () => {
    expect(relativizeResourcePath({
      scopeRootPath: PROJECT, projectRootPath: PROJECT, targetPath: 'C:/elsewhere/warn.svg',
    }).ok).toBe(false)
    expect(resolveResourcePath({
      scopeRootPath: PROJECT, projectRootPath: PROJECT, reference: '.opencard/icons/../../warn.svg',
    }).ok).toBe(false)
  })
})
