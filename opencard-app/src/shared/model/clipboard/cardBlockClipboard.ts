import type {
  CardBlock,
  CardFaceKey,
  FlowContainerLocationInfo,
  SimpleContainerLocationInfo,
} from '../../../entities/card/model'
import { isBlockContainer } from '../../../entities/card/tree'
import { isRecord } from '../../../shared/model/record'

export const OC_CLIPBOARD_MIME = 'application/x-opencard-clipboard+json'
const OC_CLIPBOARD_PROTOCOL = 'opencard.clipboard'
const OC_CLIPBOARD_VERSION = 1

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

export function serializeOcClipboard(envelope: OcClipboardEnvelope): string {
  return JSON.stringify(envelope)
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
