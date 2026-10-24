// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import zhCN from './zh-CN'

/**
 * A key the source asks for and the catalogue does not have is not a silent fallback: vue-i18n
 * renders the key path itself, so the user reads text like `projectConfig.cover.empty`. Nothing
 * else checks this — `localeParity` only compares the two catalogues with each other.
 */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, nested]) => keyPaths(nested, prefix ? `${prefix}.${key}` : key))
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(vue|ts)$/.test(entry) && !entry.endsWith('.spec.ts') ? [path] : []
  })
}

/** Literal keys only; a key assembled at runtime cannot be checked from the source text. */
const reference = /(?<![\w.])(?:t|tr|te)\(\s*['"]([A-Za-z0-9_.-]+)['"]/g

describe('locale references', () => {
  it('resolves every key the source asks for', () => {
    const catalogue = new Set(keyPaths(zhCN))
    const root = process.cwd()
    const missing = new Map<string, Set<string>>()

    for (const file of sourceFiles(join(root, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(reference)) {
        const key = match[1]!
        if (catalogue.has(key)) continue
        if (!missing.has(key)) missing.set(key, new Set())
        missing.get(key)!.add(file.slice(root.length + 1).replace(/\\/g, '/'))
      }
    }

    expect([...missing].map(([key, files]) => `${key} <- ${[...files].join(', ')}`)).toEqual([])
  })
})
