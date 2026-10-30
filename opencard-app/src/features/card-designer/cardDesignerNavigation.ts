import type { EditorNavigationResult } from '../editor-runtime/model/editorIssue'
import type { CardFaceKey } from '../../entities/card/model'
import { isRecord } from '../../shared/model/record'

type CardDesignerNavigationOwner = 'document' | 'face' | 'instance' | 'block' | 'location'

export type CardDesignerNavigationToken = {
  protocol: 'card-designer'
  version: 2
  target: {
    kind: 'property'
    instanceId: string | null
    faceKey: CardFaceKey | null
    blockId?: string
    owner: CardDesignerNavigationOwner
    fieldKey: string
    characterOffset?: number
  }
}

export type CardDesignerNavigationResult = EditorNavigationResult

function isJsonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false

  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonSerializable(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value).every((item) => isJsonSerializable(item, seen))
  seen.delete(value)
  return valid
}

export function isCardDesignerNavigationToken(
  token: unknown,
): token is CardDesignerNavigationToken {
  if (!isJsonSerializable(token) || !isRecord(token)) return false
  if (token.protocol !== 'card-designer' || token.version !== 2 || !isRecord(token.target)) {
    return false
  }

  const target = token.target
  if (target.kind !== 'property' || typeof target.fieldKey !== 'string' || !target.fieldKey) {
    return false
  }
  if (target.instanceId !== null && typeof target.instanceId !== 'string') return false
  if (target.faceKey !== null && target.faceKey !== 'front' && target.faceKey !== 'back') return false
  if (target.blockId !== undefined && typeof target.blockId !== 'string') return false
  if (
    target.characterOffset !== undefined
    && (
      typeof target.characterOffset !== 'number'
      || !Number.isInteger(target.characterOffset)
      || target.characterOffset < 0
    )
  ) return false
  if (
    target.owner !== 'document'
    && target.owner !== 'face'
    && target.owner !== 'instance'
    && target.owner !== 'block'
    && target.owner !== 'location'
  ) {
    return false
  }
  if (target.owner === 'instance' && target.instanceId === null) return false
  if (target.owner === 'face' && target.faceKey === null) return false
  if ((target.owner === 'block' || target.owner === 'location') && !target.blockId) return false
  if ((target.owner === 'block' || target.owner === 'location') && target.faceKey === null) return false

  return true
}
