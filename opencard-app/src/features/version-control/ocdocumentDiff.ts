import { getBlockProperty, type CardBlock, type CardDocument, type CardFaceKey, type CardInstanceRecord } from '../../entities/card/model'
import { parseCardDocument } from '../../entities/card/storage'

type OcdocumentChangeKind = 'added' | 'removed' | 'changed' | 'moved'

interface OcdocumentChange {
  path: string
  kind: OcdocumentChangeKind
  label: string
  before?: unknown
  after?: unknown
  blockId?: string
  faceKey?: CardFaceKey
  instanceId?: string
}

interface OcdocumentDiffError {
  side: 'before' | 'after'
  message: string
}

export type OcdocumentDiffModel =
  | {
      ok: true
      beforeDocument: CardDocument
      afterDocument: CardDocument
      beforeWarnings: readonly never[]
      afterWarnings: readonly never[]
      changes: readonly OcdocumentChange[]
    }
  | {
      ok: false
      error: OcdocumentDiffError
      changes: readonly []
    }

type BlockDescriptor = {
  block: CardBlock
  faceKey: CardFaceKey
  parentId: string
  order: number
  location: unknown
}

type ChangeContext = Pick<OcdocumentChange, 'blockId' | 'faceKey' | 'instanceId'>

function parseDocument(content: string, side: OcdocumentDiffError['side']) {
  try {
    return { value: { document: parseCardDocument(JSON.parse(content) as unknown), warnings: [] }, error: null }
  } catch (error) {
    return {
      value: null,
      error: {
        side,
        message: error instanceof Error ? error.message : String(error),
      } satisfies OcdocumentDiffError,
    }
  }
}

function equalValue(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true
  if (Array.isArray(before) || Array.isArray(after)) {
    return Array.isArray(before)
      && Array.isArray(after)
      && before.length === after.length
      && before.every((value, index) => equalValue(value, after[index]))
  }
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false
  const beforeRecord = before as Record<string, unknown>
  const afterRecord = after as Record<string, unknown>
  const beforeKeys = Object.keys(beforeRecord).sort()
  const afterKeys = Object.keys(afterRecord).sort()
  return equalValue(beforeKeys, afterKeys)
    && beforeKeys.every(key => equalValue(beforeRecord[key], afterRecord[key]))
}

function valueKind(before: unknown, after: unknown): OcdocumentChangeKind {
  if (before === undefined) return 'added'
  if (after === undefined) return 'removed'
  return 'changed'
}

function pushValueChange(
  changes: OcdocumentChange[],
  path: string,
  label: string,
  before: unknown,
  after: unknown,
  context: ChangeContext = {},
) {
  if (equalValue(before, after)) return
  changes.push({ path, label, kind: valueKind(before, after), before, after, ...context })
}

function collectBlocks(document: CardDocument): Map<string, BlockDescriptor> {
  const result = new Map<string, BlockDescriptor>()
  const visit = (
    block: CardBlock,
    faceKey: CardFaceKey,
    parentId: string,
    order: number,
    location: unknown,
  ) => {
    result.set(block.id, { block, faceKey, parentId, order, location })
    if (block.type !== 'simple-container-block' && block.type !== 'flow-container-block') return
    block.children.forEach((child, index) => {
      visit(child.block, faceKey, block.id, index, child.location)
    })
  }
  for (const faceKey of ['front', 'back'] as const) {
    document.faces[faceKey].children.forEach((child, index) => {
      visit(child.block, faceKey, `face:${faceKey}`, index, child.location)
    })
  }
  return result
}

function commonSiblingOrderChanged(
  blockId: string,
  beforeBlocks: ReadonlyMap<string, BlockDescriptor>,
  afterBlocks: ReadonlyMap<string, BlockDescriptor>,
): boolean {
  const before = beforeBlocks.get(blockId)
  const after = afterBlocks.get(blockId)
  if (!before || !after || before.parentId !== after.parentId || before.faceKey !== after.faceKey) return false
  const siblings = (source: ReadonlyMap<string, BlockDescriptor>, other: ReadonlyMap<string, BlockDescriptor>) => (
    [...source.entries()]
      .filter(([id, value]) => other.has(id)
        && value.parentId === before.parentId
        && value.faceKey === before.faceKey)
      .sort(([, left], [, right]) => left.order - right.order)
      .map(([id]) => id)
  )
  return siblings(beforeBlocks, afterBlocks).indexOf(blockId)
    !== siblings(afterBlocks, beforeBlocks).indexOf(blockId)
}

function compareBlocks(beforeDocument: CardDocument, afterDocument: CardDocument, changes: OcdocumentChange[]) {
  const beforeBlocks = collectBlocks(beforeDocument)
  const afterBlocks = collectBlocks(afterDocument)
  const ids = new Set([...beforeBlocks.keys(), ...afterBlocks.keys()])
  for (const id of ids) {
    const before = beforeBlocks.get(id)
    const after = afterBlocks.get(id)
    const descriptor = after ?? before
    if (!descriptor) continue
    const label = getBlockProperty<string>(descriptor.block, 'name')?.trim() || id
    const context = { blockId: id, faceKey: descriptor.faceKey }
    if (!before || !after) {
      changes.push({
        path: `blocks.${id}`,
        label,
        kind: before ? 'removed' : 'added',
        before: before?.block,
        after: after?.block,
        ...context,
      })
      continue
    }

    if (before.parentId !== after.parentId
      || before.faceKey !== after.faceKey
      || !equalValue(before.location, after.location)
      || commonSiblingOrderChanged(id, beforeBlocks, afterBlocks)) {
      changes.push({
        path: `blocks.${id}.location`,
        label,
        kind: 'moved',
        before: { parentId: before.parentId, faceKey: before.faceKey, location: before.location },
        after: { parentId: after.parentId, faceKey: after.faceKey, location: after.location },
        ...context,
      })
    }

    const ignored = new Set(['id', 'children'])
    const beforeRecord = before.block as unknown as Record<string, unknown>
    const afterRecord = after.block as unknown as Record<string, unknown>
    const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])
    for (const key of keys) {
      if (ignored.has(key)) continue
      pushValueChange(
        changes,
        `blocks.${id}.${key}`,
        `${label}.${key}`,
        beforeRecord[key],
        afterRecord[key],
        context,
      )
    }
  }
}

function compareInstances(
  beforeInstances: readonly CardInstanceRecord[],
  afterInstances: readonly CardInstanceRecord[],
  changes: OcdocumentChange[],
) {
  const beforeById = new Map(beforeInstances.map(instance => [instance.id, instance]))
  const afterById = new Map(afterInstances.map(instance => [instance.id, instance]))
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const before = beforeById.get(id)
    const after = afterById.get(id)
    const label = after?.name || before?.name || id
    const context = { instanceId: id }
    if (!before || !after) {
      changes.push({
        path: `instances.${id}`,
        label,
        kind: before ? 'removed' : 'added',
        before,
        after,
        ...context,
      })
      continue
    }
    for (const key of ['name', 'amount', 'data'] as const) {
      pushValueChange(
        changes,
        `instances.${id}.${key}`,
        `${label}.${key}`,
        before[key],
        after[key],
        context,
      )
    }
  }
}

export function compareOcdocuments(beforeContent: string, afterContent: string): OcdocumentDiffModel {
  const before = parseDocument(beforeContent, 'before')
  if (before.error || !before.value) return { ok: false, error: before.error!, changes: [] }
  const after = parseDocument(afterContent, 'after')
  if (after.error || !after.value) return { ok: false, error: after.error!, changes: [] }

  const beforeDocument = before.value.document
  const afterDocument = after.value.document
  const changes: OcdocumentChange[] = []
  for (const key of ['name', 'description', 'notes', 'id', 'version', 'width', 'height'] as const) {
    pushValueChange(changes, `document.${key}`, key, beforeDocument[key], afterDocument[key])
  }
  for (const faceKey of ['front', 'back'] as const) {
    pushValueChange(
      changes,
      `faces.${faceKey}.background`,
      `${faceKey}.background`,
      beforeDocument.faces[faceKey].background,
      afterDocument.faces[faceKey].background,
      { faceKey },
    )
  }
  compareBlocks(beforeDocument, afterDocument, changes)
  compareInstances(beforeDocument.instances, afterDocument.instances, changes)
  pushValueChange(changes, 'dataTable', 'dataTable', beforeDocument.dataTable, afterDocument.dataTable)

  return {
    ok: true,
    beforeDocument,
    afterDocument,
    beforeWarnings: before.value.warnings,
    afterWarnings: after.value.warnings,
    changes,
  }
}
