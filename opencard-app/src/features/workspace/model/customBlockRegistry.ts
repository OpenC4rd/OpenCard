import { isRecord } from '../../../shared/model/record'
import { normalizeKeySlug } from '../../../shared/model/keySlug'
import { referenceSyntaxIsValid } from './scopedResourcePath'

export const customBlockKeyPattern = /^[a-z0-9][a-z0-9._-]*$/
export const customBlockSourcePattern = /\.ocblock$/i

export type CustomBlockRegistryEntry = {
  key: string
  name: string
  source: string
}

export type CustomBlockRegistryDocument = {
  blocks?: readonly CustomBlockRegistryEntry[]
}

export type CustomBlockRegistry = Readonly<Record<string, CustomBlockRegistryEntry>>

function normalizeEntry(value: unknown): CustomBlockRegistryEntry | null {
  if (!isRecord(value)) return null
  const key = typeof value.key === 'string' ? normalizeKeySlug(value.key) : null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const source = typeof value.source === 'string' ? value.source.trim() : ''
  if (!key || !customBlockKeyPattern.test(key) || !name || !source
    || !customBlockSourcePattern.test(source) || !referenceSyntaxIsValid(source)) return null
  return { key, name, source }
}

export function parseCustomBlockRegistry(value: unknown): CustomBlockRegistryDocument | null {
  if (!isRecord(value)) return null
  if (value.blocks !== undefined && !Array.isArray(value.blocks)) return null
  const entries = (value.blocks ?? []).map(normalizeEntry)
    .filter((entry): entry is CustomBlockRegistryEntry => Boolean(entry))
  const keys = new Set<string>()
  const unique = entries.filter(entry => {
    const key = entry.key.toLocaleLowerCase()
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
  return unique.length > 0 ? { blocks: unique } : {}
}

export function parseCustomBlockRegistryText(content: string): CustomBlockRegistryDocument | null {
  try {
    return parseCustomBlockRegistry(JSON.parse(content))
  } catch {
    return null
  }
}

export function serializeCustomBlockRegistry(document: CustomBlockRegistryDocument): string {
  const normalized = parseCustomBlockRegistry(document)
  if (!normalized) throw new Error('Invalid custom block registry')
  return JSON.stringify(normalized, null, 2)
}

export function buildCustomBlockRegistry(document: CustomBlockRegistryDocument): CustomBlockRegistry {
  return Object.fromEntries((document.blocks ?? []).map(entry => [entry.key, entry]))
}
