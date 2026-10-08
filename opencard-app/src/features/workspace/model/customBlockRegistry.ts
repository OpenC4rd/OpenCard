import { isRecord } from '../../../shared/model/record'
import { normalizeKeySlug } from '../../../shared/model/keySlug'
import { referenceSyntaxIsValid } from './scopedResourcePath'

export const customBlockKeyPattern = /^[a-z0-9][a-z0-9._-]*$/
export const customBlockSourcePattern = /\.ocblock$/i

export type CustomBlockRegistryEntry = { key: string; source: string }
export type CustomBlockCollection = { key: string; name: string; blocks: readonly CustomBlockRegistryEntry[] }
export type CustomBlockRegistryDocument = { collections?: readonly CustomBlockCollection[] }
export type CustomBlockRegistry = Readonly<Record<string, Readonly<Record<string, CustomBlockRegistryEntry>>>>

function normalizeSource(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const source = value.trim().replace(/\\/g, '/')
  return customBlockSourcePattern.test(source) && referenceSyntaxIsValid(source) ? source : null
}

function normalizeEntry(value: unknown): CustomBlockRegistryEntry | null {
  if (!isRecord(value)) return null
  const key = typeof value.key === 'string' ? normalizeKeySlug(value.key) : null
  const source = normalizeSource(value.source)
  return key && customBlockKeyPattern.test(key) && source ? { key, source } : null
}

function normalizeCollection(value: unknown): CustomBlockCollection | null {
  if (!isRecord(value)) return null
  const key = typeof value.key === 'string' ? normalizeKeySlug(value.key) : null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!key || !customBlockKeyPattern.test(key) || !name || !Array.isArray(value.blocks)) return null
  const seen = new Set<string>()
  const blocks = value.blocks.map(normalizeEntry).filter((entry): entry is CustomBlockRegistryEntry => {
    if (!entry || seen.has(entry.key.toLocaleLowerCase())) return false
    seen.add(entry.key.toLocaleLowerCase())
    return true
  })
  return { key, name, blocks }
}

export function parseCustomBlockRegistry(value: unknown): CustomBlockRegistryDocument | null {
  if (!isRecord(value)) return null
  if (Array.isArray(value.collections)) {
    const seen = new Set<string>()
    const collections = value.collections.map(normalizeCollection).filter((collection): collection is CustomBlockCollection => {
      if (!collection || seen.has(collection.key.toLocaleLowerCase())) return false
      seen.add(collection.key.toLocaleLowerCase())
      return true
    })
    return collections.length > 0 ? { collections } : {}
  }
  if (Array.isArray(value.blocks)) {
    const blocks = value.blocks.map(candidate => {
      if (!isRecord(candidate)) return null
      return normalizeEntry({ key: candidate.key, source: candidate.source })
    }).filter((entry): entry is CustomBlockRegistryEntry => Boolean(entry))
    return blocks.length > 0 ? { collections: [{ key: 'default', name: 'Custom Blocks', blocks }] } : {}
  }
  return {}
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

export function customBlockIdentity(collectionKey: string, blockKey: string): string {
  return `${collectionKey}/${blockKey}`
}

export function buildCustomBlockRegistry(document: CustomBlockRegistryDocument): CustomBlockRegistry {
  return Object.fromEntries((document.collections ?? []).map(collection => [
    collection.key,
    Object.fromEntries(collection.blocks.map(entry => [entry.key, entry])),
  ]))
}

export function flattenCustomBlockRegistry(document: CustomBlockRegistryDocument): Array<CustomBlockRegistryEntry & { collectionKey: string; collectionName: string }> {
  return (document.collections ?? []).flatMap(collection => collection.blocks.map(entry => ({
    ...entry,
    collectionKey: collection.key,
    collectionName: collection.name,
  })))
}
