import { pinyin } from 'pinyin-pro'

export function toKeySlug(value: string, fallback = 'item'): string {
  const transliterated = pinyin(value, { toneType: 'none', nonZh: 'consecutive', separator: ' ' })
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
  let candidate = ''

  for (const character of transliterated) {
    if (/[a-z0-9._-]/.test(character)) candidate += character
    else if (/\p{Letter}|\p{Number}/u.test(character)) candidate += `-u${character.codePointAt(0)!.toString(16)}-`
    else candidate += '-'
  }

  const normalized = candidate
    .replace(/-+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  return normalized || fallback
}

export function normalizeKeySlug(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase()
  return normalized && toKeySlug(normalized, '') === normalized ? normalized : null
}


export function createAvailableKey(
  value: string,
  existingKeys: Iterable<string>,
  fallback = 'item',
): string {
  const base = toKeySlug(value, fallback)
  const identities = new Set(Array.from(existingKeys, key => key.toLocaleLowerCase()))
  let candidate = base
  let suffix = 2
  while (identities.has(candidate.toLocaleLowerCase())) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}
