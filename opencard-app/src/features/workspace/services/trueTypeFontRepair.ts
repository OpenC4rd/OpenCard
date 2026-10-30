type SfntTable = {
  tag: string
  data: Uint8Array
}

const SFNT_VERSION_TRUE_TYPE = 0x00010000
const SFNT_VERSION_CFF = 0x4f54544f
const TTC_SIGNATURE = 0x74746366

type ExtractedFontCollectionFace = {
  bytes: Uint8Array
  extension: 'ttf' | 'otf'
}

export function extractFontCollectionFaces(source: Uint8Array): ExtractedFontCollectionFace[] {
  if (source.length < 12 || readU32(source, 0) !== TTC_SIGNATURE) {
    throw new Error('Invalid TrueType/OpenType collection')
  }
  const count = readU32(source, 8)
  if (count < 1 || count > 256 || source.length < 12 + count * 4) {
    throw new Error('Invalid font collection directory')
  }
  const faces: ExtractedFontCollectionFace[] = []
  for (let index = 0; index < count; index += 1) {
    const directoryOffset = readU32(source, 12 + index * 4)
    if (directoryOffset + 12 > source.length) throw new Error(`Invalid font collection face ${index + 1}`)
    const version = readU32(source, directoryOffset)
    if (version !== SFNT_VERSION_TRUE_TYPE && version !== SFNT_VERSION_CFF) {
      throw new Error(`Unsupported font collection face ${index + 1}`)
    }
    faces.push({
      bytes: writeSfnt(readSfntTablesAt(source, directoryOffset), version),
      extension: version === SFNT_VERSION_CFF ? 'otf' : 'ttf',
    })
  }
  return faces
}

export async function repairTrueTypeFont(source: Uint8Array): Promise<Uint8Array> {
  const tables = readSfntTables(source)
  const head = requireTable(tables, 'head')
  const maxp = requireTable(tables, 'maxp')
  const hhea = requireTable(tables, 'hhea')
  const hmtx = requireTable(tables, 'hmtx')
  const loca = requireTable(tables, 'loca')
  const glyf = requireTable(tables, 'glyf')
  if (head.data.length < 54 || maxp.data.length < 6 || hhea.data.length < 36) throw new Error('Invalid TrueType tables')

  const longLocations = readI16(head.data, 50) === 1
  const locationSize = longLocations ? 4 : 2
  if (loca.data.length < locationSize * 2 || loca.data.length % locationSize !== 0) {
    throw new Error('Invalid glyph location table')
  }

  const declaredGlyphCount = readU16(maxp.data, 4)
  const locatedGlyphCount = loca.data.length / locationSize - 1
  const repairedGlyphCount = Math.min(declaredGlyphCount, locatedGlyphCount)
  if (repairedGlyphCount < 1) throw new Error('No usable glyphs were found')

  const glyphEnd = readGlyphLocation(loca.data, repairedGlyphCount, longLocations)
  if (glyphEnd > glyf.data.length) throw new Error('Glyph data ends outside the font file')

  const { create } = await import('fontkit')
  const parsed = create(source as never) as unknown as {
    characterSet: number[]
    glyphForCodePoint: (codePoint: number) => { id: number }
  }
  const mappings = parsed.characterSet
    .map(codePoint => [codePoint, parsed.glyphForCodePoint(codePoint).id] as const)
    .filter(([codePoint, glyphId]) => codePoint >= 0 && codePoint <= 0x10ffff
      && glyphId > 0 && glyphId < repairedGlyphCount)

  const nextTables = tables.map(table => {
    if (table.tag === 'maxp') {
      const data = table.data.slice()
      writeU16(data, 4, repairedGlyphCount)
      return { ...table, data }
    }
    if (table.tag === 'hhea') {
      const data = table.data.slice()
      writeU16(data, 34, Math.min(readU16(data, 34), repairedGlyphCount))
      return { ...table, data }
    }
    if (table.tag === 'hmtx') {
      const metricCount = readU16(hhea.data, 34)
      const nextMetricCount = Math.min(metricCount, repairedGlyphCount)
      const requiredLength = nextMetricCount * 4 + Math.max(0, repairedGlyphCount - nextMetricCount) * 2
      if (requiredLength > hmtx.data.length) throw new Error('Horizontal metrics table is truncated')
      return { ...table, data: table.data.slice(0, requiredLength) }
    }
    if (table.tag === 'loca') return { ...table, data: table.data.slice(0, (repairedGlyphCount + 1) * locationSize) }
    if (table.tag === 'glyf') return { ...table, data: table.data.slice(0, glyphEnd) }
    if (table.tag === 'cmap') return { ...table, data: createCmap(mappings) }
    return table
  })
  return writeSfnt(nextTables)
}

export async function ensureLoadableProjectFont(source: Uint8Array, fileName: string): Promise<{
  bytes: Uint8Array
  repaired: boolean
}> {
  if (await canLoadFontBytes(source, fileName)) return { bytes: source, repaired: false }
  try {
    const repaired = await repairTrueTypeFont(source)
    if (!await canLoadFontBytes(repaired, fileName)) {
      throw new Error('The rebuilt font was rejected by the font engine')
    }
    return { bytes: repaired, repaired: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`The font is invalid and could not be repaired automatically: ${message}`)
  }
}

async function canLoadFontBytes(source: Uint8Array, fileName: string): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return true
  const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(source)], { type: fontMimeType(fileName) }))
  try {
    const face = await new FontFace(`OpenCardFontImport-${crypto.randomUUID()}`, `url(${JSON.stringify(objectUrl)})`).load()
    document.fonts.add(face)
    document.fonts.delete(face)
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function fontMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLocaleLowerCase()
  if (extension === 'woff2') return 'font/woff2'
  if (extension === 'woff') return 'font/woff'
  if (extension === 'otf') return 'font/otf'
  return 'font/ttf'
}

function readSfntTables(source: Uint8Array): SfntTable[] {
  if (source.length < 12 || readU32(source, 0) !== SFNT_VERSION_TRUE_TYPE) {
    throw new Error('Only TrueType .ttf fonts can be repaired automatically')
  }
  return readSfntTablesAt(source, 0)
}

function readSfntTablesAt(source: Uint8Array, directoryOffset: number): SfntTable[] {
  if (directoryOffset < 0 || directoryOffset + 12 > source.length) throw new Error('Invalid font table directory')
  const count = readU16(source, directoryOffset + 4)
  if (source.length < directoryOffset + 12 + count * 16) throw new Error('Invalid TrueType table directory')
  const tables: SfntTable[] = []
  for (let index = 0; index < count; index += 1) {
    const entry = directoryOffset + 12 + index * 16
    const tag = String.fromCharCode(...source.slice(entry, entry + 4))
    const offset = readU32(source, entry + 8)
    const length = readU32(source, entry + 12)
    if (offset + length > source.length) throw new Error(`TrueType table ${tag} is truncated`)
    tables.push({ tag, data: source.slice(offset, offset + length) })
  }
  return tables
}

function requireTable(tables: SfntTable[], tag: string): SfntTable {
  const table = tables.find(candidate => candidate.tag === tag)
  if (!table) throw new Error(`Required TrueType table ${tag} is missing`)
  return table
}

function readGlyphLocation(data: Uint8Array, index: number, longLocations: boolean): number {
  return longLocations ? readU32(data, index * 4) : readU16(data, index * 2) * 2
}

function createCmap(mappings: readonly (readonly [number, number])[]): Uint8Array {
  const groups: Array<[number, number, number]> = []
  for (const [codePoint, glyphId] of [...mappings].sort((a, b) => a[0] - b[0])) {
    const previous = groups[groups.length - 1]
    if (previous && codePoint === previous[1] + 1 && glyphId === previous[2] + codePoint - previous[0]) {
      previous[1] = codePoint
    } else groups.push([codePoint, codePoint, glyphId])
  }
  const subtableLength = 16 + groups.length * 12
  const data = new Uint8Array(20 + subtableLength)
  writeU16(data, 0, 0)
  writeU16(data, 2, 2)
  writeU16(data, 4, 0)
  writeU16(data, 6, 4)
  writeU32(data, 8, 20)
  writeU16(data, 12, 3)
  writeU16(data, 14, 10)
  writeU32(data, 16, 20)
  writeU16(data, 20, 12)
  writeU16(data, 22, 0)
  writeU32(data, 24, subtableLength)
  writeU32(data, 28, 0)
  writeU32(data, 32, groups.length)
  groups.forEach(([start, end, glyph], index) => {
    const offset = 36 + index * 12
    writeU32(data, offset, start)
    writeU32(data, offset + 4, end)
    writeU32(data, offset + 8, glyph)
  })
  return data
}

function writeSfnt(tables: SfntTable[], version = SFNT_VERSION_TRUE_TYPE): Uint8Array {
  const sorted = [...tables].sort((left, right) => (
    left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0
  ))
  const count = sorted.length
  const highestPower = 2 ** Math.floor(Math.log2(count))
  const headerLength = 12 + count * 16
  let totalLength = headerLength
  for (const table of sorted) totalLength += align4(table.data.length)
  const output = new Uint8Array(totalLength)
  writeU32(output, 0, version)
  writeU16(output, 4, count)
  writeU16(output, 6, highestPower * 16)
  writeU16(output, 8, Math.log2(highestPower))
  writeU16(output, 10, count * 16 - highestPower * 16)

  let offset = headerLength
  let headOffset = -1
  sorted.forEach((table, index) => {
    const entry = 12 + index * 16
    for (let cursor = 0; cursor < 4; cursor += 1) output[entry + cursor] = table.tag.charCodeAt(cursor)
    const data = table.data.slice()
    if (table.tag === 'head') {
      writeU32(data, 8, 0)
      headOffset = offset
    }
    writeU32(output, entry + 4, checksum(data))
    writeU32(output, entry + 8, offset)
    writeU32(output, entry + 12, data.length)
    output.set(data, offset)
    offset += align4(data.length)
  })
  if (headOffset < 0) throw new Error('Required TrueType table head is missing')
  writeU32(output, headOffset + 8, (0xb1b0afba - checksum(output)) >>> 0)
  return output
}

function checksum(data: Uint8Array): number {
  let sum = 0
  for (let offset = 0; offset < align4(data.length); offset += 4) {
    sum = (sum + (((data[offset] ?? 0) << 24) | ((data[offset + 1] ?? 0) << 16)
      | ((data[offset + 2] ?? 0) << 8) | (data[offset + 3] ?? 0))) >>> 0
  }
  return sum
}

function align4(value: number): number { return (value + 3) & ~3 }
function readU16(data: Uint8Array, offset: number): number { return (data[offset]! << 8) | data[offset + 1]! }
function readI16(data: Uint8Array, offset: number): number { const value = readU16(data, offset); return value & 0x8000 ? value - 0x10000 : value }
function readU32(data: Uint8Array, offset: number): number { return ((readU16(data, offset) << 16) | readU16(data, offset + 2)) >>> 0 }
function writeU16(data: Uint8Array, offset: number, value: number): void { data[offset] = value >>> 8; data[offset + 1] = value }
function writeU32(data: Uint8Array, offset: number, value: number): void { writeU16(data, offset, value >>> 16); writeU16(data, offset + 2, value) }
