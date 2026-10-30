import type {
  CardBlock,
  CardFaceKey,
  FlowContainerLocationInfo,
  SimpleContainerLocationInfo,
} from '../../../entities/card/model'
import { parseStoredCardBlock } from '../../../entities/card/storage'
import { isBlockContainer } from '../../../entities/card/tree'
import { isRecord } from '../../../shared/model/record'

export const OC_CLIPBOARD_MIME = 'application/x-opencard-clipboard+json'
const OC_CLIPBOARD_PROTOCOL = 'opencard.clipboard'
const OC_CLIPBOARD_VERSION = 1
const MAX_CLIPBOARD_BYTES = 2 * 1024 * 1024

type OcClipboardKind = 'card-block' | 'card-blocks'
type CardBlockLocation = SimpleContainerLocationInfo | FlowContainerLocationInfo

export type CardBlockPayload = {
  block: CardBlock
  location: CardBlockLocation
}

type CardBlocksPayload = {
  blocks: CardBlockPayload[]
}

export type OcClipboardEnvelope = {
  protocol: typeof OC_CLIPBOARD_PROTOCOL
  version: typeof OC_CLIPBOARD_VERSION
  kind: OcClipboardKind
  source?: { documentId?: string; sessionId?: string; faceKey?: CardFaceKey }
  payload: CardBlockPayload | CardBlocksPayload
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function normalizeLocation(value: unknown): CardBlockLocation | null {
  if (!isRecord(value)) return null
  if (value.type === 'simple-container-location') {
    return {
      id: typeof value.id === 'string' && value.id ? value.id : `simple-location-${crypto.randomUUID()}`,
      type: 'simple-container-location',
      anchor: typeof value.anchor === 'string' ? value.anchor : 'lt',
      x: typeof value.x === 'string' ? value.x : '0',
      y: typeof value.y === 'string' ? value.y : '0',
    } as SimpleContainerLocationInfo
  }
  if (value.type === 'flow-container-location') {
    return {
      id: typeof value.id === 'string' && value.id ? value.id : `flow-location-${crypto.randomUUID()}`,
      type: 'flow-container-location',
      index: typeof value.index === 'string' ? value.index : '0',
      ...(typeof value.align === 'string' ? { align: value.align } : {}),
    } as FlowContainerLocationInfo
  }
  return null
}

function normalizeBlockPayload(value: unknown): CardBlockPayload | null {
  if (!isRecord(value)) return null
  const block = parseStoredCardBlock(value.block)
  const location = normalizeLocation(value.location)
  if (!block || !location) return null
  return { block, location }
}

function normalizeBlocksPayload(value: unknown): CardBlocksPayload | null {
  if (!isRecord(value) || !Array.isArray(value.blocks) || value.blocks.length === 0) return null
  const blocks = value.blocks.map(normalizeBlockPayload)
  return blocks.every((block): block is CardBlockPayload => block !== null) ? { blocks } : null
}

export function createCardBlocksClipboard(
  blocks: readonly CardBlockPayload[],
  source?: OcClipboardEnvelope['source'],
): OcClipboardEnvelope {
  const payload = blocks.length === 1
    ? clone(blocks[0]!)
    : { blocks: [...clone(blocks)] }
  return {
    protocol: OC_CLIPBOARD_PROTOCOL,
    version: OC_CLIPBOARD_VERSION,
    kind: blocks.length === 1 ? 'card-block' : 'card-blocks',
    ...(source ? { source: { ...source } } : {}),
    payload,
  }
}

function parseOcClipboard(value: unknown): OcClipboardEnvelope | null {
  if (!isRecord(value)
    || value.protocol !== OC_CLIPBOARD_PROTOCOL
    || value.version !== OC_CLIPBOARD_VERSION
    || (value.kind !== 'card-block' && value.kind !== 'card-blocks')) return null
  const payload = value.kind === 'card-block'
    ? normalizeBlockPayload(value.payload)
    : normalizeBlocksPayload(value.payload)
  if (!payload) return null
  const source = isRecord(value.source)
    ? Object.fromEntries(Object.entries(value.source).filter(([, item]) => typeof item === 'string'))
    : undefined
  return {
    protocol: OC_CLIPBOARD_PROTOCOL,
    version: OC_CLIPBOARD_VERSION,
    kind: value.kind,
    ...(source ? { source } : {}),
    payload,
  } as OcClipboardEnvelope
}

export function serializeOcClipboard(envelope: OcClipboardEnvelope): string {
  return JSON.stringify(envelope)
}

export function parseOcClipboardText(text: string): OcClipboardEnvelope | null {
  if (text.length > MAX_CLIPBOARD_BYTES) return null
  try {
    return parseOcClipboard(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

export function getClipboardBlockPayloads(envelope: OcClipboardEnvelope): CardBlockPayload[] {
  return envelope.kind === 'card-block' ? [clone(envelope.payload as CardBlockPayload)] : clone((envelope.payload as CardBlocksPayload).blocks)
}

export function cloneClipboardBlocksWithNewIds(payloads: readonly CardBlockPayload[]): CardBlockPayload[] {
  const blockIdMap = new Map<string, string>()
  const locationIdMap = new Map<string, string>()
  const cloneBlock = (source: CardBlock): CardBlock => {
    const block = clone(source)
    const oldId = block.id
    block.id = `${block.type}-${crypto.randomUUID()}`
    blockIdMap.set(oldId, block.id)
    if (isBlockContainer(block)) {
      for (const child of block.children) {
        child.block = cloneBlock(child.block)
        const oldLocationId = child.location.id
        child.location.id = `${child.location.type === 'flow-container-location' ? 'flow' : 'simple'}-location-${crypto.randomUUID()}`
        locationIdMap.set(oldLocationId, child.location.id)
      }
    }
    return block
  }
  const rewritten = payloads.map(payload => {
    const location = clone(payload.location)
    const oldLocationId = location.id
    location.id = `${location.type === 'flow-container-location' ? 'flow' : 'simple'}-location-${crypto.randomUUID()}`
    locationIdMap.set(oldLocationId, location.id)
    return { block: cloneBlock(payload.block), location }
  })
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') return blockIdMap.get(value) ?? locationIdMap.get(value) ?? value
    if (Array.isArray(value)) return value.map(rewrite)
    if (!isRecord(value)) return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
  }
  return rewritten.map(payload => rewrite(payload) as CardBlockPayload)
}
