import type { CardBlock, CardDocument, CardFaceKey } from '../../entities/card/model'
import { createPropertyDefaultValue, getPropertyAllowedValues, resolvePropertyEditorSchema } from '../../entities/card/schema'
import { isRenderCssColor, isRenderCssLength, normalizeRenderCssLength } from './renderValueSyntax'
import {
  createCardPipelineIssue,
  type CardIssueOwner,
  type CardPipelineIssue,
  type CardRenderParseIssueType,
} from './cardPipelineIssue'
import { getRenderFieldContract, type RenderFieldContract } from './renderFieldContracts'
import { parseResourceReference, type ResourceReferenceKind } from '../workspace/services/resourceReference'
import type {
  RenderParseResult,
  RenderReadyBaseBlock,
  RenderReadyCardBlock,
  RenderReadyCardDocument,
  RenderReadyCardFace,
  RenderReadyFlowContainerLocation,
  RenderReadySimpleContainerLocation,
} from './render.types'
import { joinBlockPath } from './renderBlockPath'

type SourceRecord = Record<string, unknown>
type BlockType = CardBlock['type']

type IssueContext = {
  documentId: string
  instanceId: string | null
  faceKey: CardFaceKey | null
  owner: CardIssueOwner
  blockPath: string
  blockId?: string
  typeName: string
}

export type ParseRenderDocumentOptions = {
  instanceId?: string | null
}

type RenderParseFailure =
  | 'invalid-type'
  | 'conversion-failed'
  | 'invalid-option'
  | 'out-of-range'
  | 'required'
  | 'invalid-color'
  | 'invalid-css-length'
  | 'invalid-file-path'
  | 'invalid-object'
  const blockTypes: readonly BlockType[] = [
  'text-block',
  'markdown-text-block',
  'image-block',
  'qrcode-block',
  'shape-block',
  'simple-container-block',
  'flow-container-block',
]

export function parseRenderDocument(
  bindingExpandedCardDocument: CardDocument,
  options: ParseRenderDocumentOptions = {},
): RenderParseResult {
  const issues: CardPipelineIssue[] = []
  const source = toRecord(bindingExpandedCardDocument)
  const sourceDocumentId = primitiveString(source.id)
  const context: IssueContext = {
    documentId: sourceDocumentId,
    instanceId: options.instanceId ?? null,
    faceKey: null,
    owner: { kind: 'document', id: sourceDocumentId },
    blockPath: '',
    typeName: 'card-document',
  }
  const fields = createFieldReader(source, context, issues)

  fields.expectedLiteral('type', 'card-document')
  const id = fields.string('id')
  context.documentId = id
  context.owner = { kind: 'document', id }

  const width = fields.number('width')
  const height = fields.number('height')
  const faces = toRecord(source.faces)
  const document: RenderReadyCardDocument = {
    type: 'card-document',
    id,
    name: fields.optionalString('name'),
    version: fields.string('version'),
    description: fields.optionalString('description'),
    notes: fields.optionalString('notes'),
    faces: {
      front: parseFace(faces.front, 'front', width, height, id, context.instanceId, issues),
      back: parseFace(faces.back, 'back', width, height, id, context.instanceId, issues),
    },
  }

  return { document, issues }
}

function parseFace(
  faceValue: unknown,
  faceKey: CardFaceKey,
  width: number,
  height: number,
  documentId: string,
  instanceId: string | null,
  issues: CardPipelineIssue[],
): RenderReadyCardFace {
  const source = toRecord(faceValue)
  const context: IssueContext = {
    documentId,
    instanceId,
    faceKey,
    owner: { kind: 'face', id: primitiveString(source.id) },
    blockPath: '',
    typeName: 'card-face',
  }
  const fields = createFieldReader(source, context, issues)
  fields.expectedLiteral('type', 'card-face')
  const id = fields.string('id')
  context.owner = { kind: 'face', id }

  return {
    type: 'card-face',
    id,
    faceKey,
    width,
    height,
    background: fields.string('background'),
    children: fields.array('children').map((childValue) => {
      const child = toRecord(childValue)
      const block = parseBlock(child.block, '', documentId, instanceId, faceKey, issues)
      return {
        block,
        location: parseSimpleLocation(child.location, block, readyBlockName(block), documentId, instanceId, faceKey, issues),
      }
    }),
  }
}

function parseBlock(
  blockValue: unknown,
  parentPath: string,
  documentId: string,
  instanceId: string | null,
  faceKey: CardFaceKey,
  issues: CardPipelineIssue[],
  allowTypedLiterals = false,
): RenderReadyCardBlock {
  const source = toRecord(blockValue)
  const type = resolveBlockType(source, parentPath, documentId, instanceId, faceKey, issues)
  const sourceBlockId = primitiveString(source.id)
  const context: IssueContext = {
    documentId,
    instanceId,
    faceKey,
    owner: { kind: 'block', id: sourceBlockId },
    blockPath: joinBlockPath(parentPath, primitiveString(source.name)),
    blockId: sourceBlockId || undefined,
    typeName: type,
  }
  const fields = createFieldReader(source, context, issues, allowTypedLiterals)
  const base = parseBaseBlock(source, fields)

  context.blockId = base.id || undefined
  context.owner = { kind: 'block', id: base.id }
  context.blockPath = joinBlockPath(parentPath, base.name)

  switch (type) {
    case 'text-block':
    case 'markdown-text-block':
      return {
        ...base,
        type,
	        content: fields.string('content'),
        fontSize: fields.cssLength('fontSize'),
        fontFamily: fields.string('fontFamily'),
        fontWeight: fields.option('fontWeight'),
        color: fields.string('color'),
        textAlign: fields.option('textAlign'),
        verticalAlign: fields.option('verticalAlign'),
        lineHeight: fields.cssLength('lineHeight'),
        writingMode: fields.option('writingMode'),
      }
    case 'image-block':
      return {
        ...base,
        type,
        source: fields.string('source'),
        fit: fields.option('fit'),
      }
    case 'qrcode-block':
      return {
        ...base,
        type,
        content: fields.string('content'),
        errorCorrection: fields.option('errorCorrection'),
        foreground: fields.string('foreground'),
        backgroundColor: fields.string('backgroundColor'),
        quietZone: fields.number('quietZone'),
      }
    case 'shape-block':
      return {
        ...base,
        type,
        shape: fields.option('shape'),
        fill: fields.string('fill'),
        stroke: fields.string('stroke'),
        strokeWidth: fields.number('strokeWidth'),
        strokeStyle: fields.option('strokeStyle'),
        strokeAlignment: fields.option('strokeAlignment'),
        strokeJoin: fields.option('strokeJoin'),
        strokeCap: fields.option('strokeCap'),
        strokeMiterLimit: fields.number('strokeMiterLimit'),
      }
    case 'simple-container-block':
      return {
        ...base,
        type,
        clip: fields.boolean('clip'),
        children: fields.array('children').map((childValue) => {
          const child = toRecord(childValue)
          const block = parseBlock(child.block, context.blockPath, documentId, instanceId, faceKey, issues, allowTypedLiterals)
          return {
            block,
            location: parseSimpleLocation(
              child.location,
              block,
              joinBlockPath(context.blockPath, readyBlockName(block)),
              documentId,
              instanceId,
              faceKey,
              issues,
            ),
          }
        }),
      }
    case 'flow-container-block':
      return {
        ...base,
        type,
        clip: fields.boolean('clip'),
        direction: fields.option('direction'),
        gap: fields.cssLength('gap'),
        children: fields.array('children').map((childValue) => {
          const child = toRecord(childValue)
          const block = parseBlock(child.block, context.blockPath, documentId, instanceId, faceKey, issues, allowTypedLiterals)
          return {
            block,
            location: parseFlowLocation(
              child.location,
              block,
              joinBlockPath(context.blockPath, readyBlockName(block)),
              documentId,
              instanceId,
              faceKey,
              issues,
            ),
          }
        }),
      }
  }
}

function readyBlockName(block: RenderReadyCardBlock): string {
  return typeof block.name === 'string' ? block.name : block.id
}

function parseBaseBlock(source: SourceRecord, fields: FieldReader): RenderReadyBaseBlock {
  const ready: RenderReadyBaseBlock = {
    id: fields.string('id'),
    name: fields.string('name'),
    notes: fields.string('notes'),
    visible: fields.boolean('visible'),
    width: fields.cssLength('width'),
    height: fields.cssLength('height'),
    borderColor: fields.string('borderColor'),
    borderWidth: fields.number('borderWidth'),
    borderStyle: fields.option('borderStyle'),
    borderRadius: fields.cssLength('borderRadius'),
    background: fields.string('background'),
    translateX: fields.cssLength('translateX'),
    translateY: fields.cssLength('translateY'),
    scaleX: fields.number('scaleX'),
    scaleY: fields.number('scaleY'),
    transformAnchor: fields.option('transformAnchor'),
    zIndex: fields.number('zIndex'),
    rotation: fields.number('rotation'),
    opacity: fields.number('opacity'),
    customCss: fields.string('customCss'),
  }
  const schema = resolvePropertyEditorSchema(source)
  for (const fieldKey of schema.customKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, fieldKey)) continue
    const contract = dynamicRenderContract(schema.fields[fieldKey])
    if (contract) ready[fieldKey] = fields.dynamic(fieldKey, contract)
  }
  return ready
}

function parseSimpleLocation(
  locationValue: unknown,
  block: RenderReadyCardBlock,
  blockPath: string,
  documentId: string,
  instanceId: string | null,
  faceKey: CardFaceKey,
  issues: CardPipelineIssue[],
): RenderReadySimpleContainerLocation {
  const source = toRecord(locationValue)
  const fields = createFieldReader(
    source,
    createLocationContext(source, block, blockPath, documentId, instanceId, faceKey, 'simple-container-location'),
    issues,
  )
  fields.expectedLiteral('type', 'simple-container-location')
  return {
    id: fields.string('id'),
    type: 'simple-container-location',
    anchor: fields.option('anchor'),
    x: fields.cssLength('x'),
    y: fields.cssLength('y'),
  }
}

function parseFlowLocation(
  locationValue: unknown,
  block: RenderReadyCardBlock,
  blockPath: string,
  documentId: string,
  instanceId: string | null,
  faceKey: CardFaceKey,
  issues: CardPipelineIssue[],
): RenderReadyFlowContainerLocation {
  const source = toRecord(locationValue)
  const fields = createFieldReader(
    source,
    createLocationContext(source, block, blockPath, documentId, instanceId, faceKey, 'flow-container-location'),
    issues,
  )
  fields.expectedLiteral('type', 'flow-container-location')
  return {
    id: fields.string('id'),
    type: 'flow-container-location',
    index: fields.number('index'),
    align: fields.option('align'),
  }
}

function createLocationContext(
  source: SourceRecord,
  block: RenderReadyCardBlock,
  blockPath: string,
  documentId: string,
  instanceId: string | null,
  faceKey: CardFaceKey,
  typeName: string,
): IssueContext {
  return {
    documentId,
    instanceId,
    faceKey,
    owner: { kind: 'location', id: primitiveString(source.id) },
    blockPath,
    blockId: block.id || undefined,
    typeName,
  }
}

function dynamicRenderContract(
  definition: ReturnType<typeof resolvePropertyEditorSchema>['fields'][string],
 ): RenderFieldContract | null {
  let kind: RenderFieldContract['kind']
  switch (definition.fieldType) {
    case 'filePath':
      kind = 'file-path'
      break
    case 'number':
    case 'boolean':
      kind = definition.fieldType
      break
    case 'color':
      kind = 'color'
      break
    case 'string':
      kind = 'string'
      break
    case 'object':
      return null
    default:
      kind = 'option'
      break
  }
  const allowedValues = getPropertyAllowedValues(definition)
  return {
    kind,
    defaultValue: createPropertyDefaultValue(definition),
    ...(definition.required ? { required: true } : {}),
    ...(definition.min !== undefined ? { min: definition.min } : {}),
    ...(definition.max !== undefined ? { max: definition.max } : {}),
    ...(definition.fieldType === 'filePath' && definition.allowRemote ? { allowRemote: true } : {}),
    ...(allowedValues ? { options: allowedValues } : {}),
  }
}

type FieldReader = ReturnType<typeof createFieldReader>

function createFieldReader(
  source: SourceRecord,
  context: IssueContext,
  issues: CardPipelineIssue[],
  allowTypedLiterals = false,
) {
  function contractFor(fieldKey: string): RenderFieldContract {
    const contract = getRenderFieldContract(context.typeName, fieldKey)
    if (!contract) throw new Error(`Missing render contract for ${context.typeName}.${fieldKey}`)
    return contract
  }

  function value(fieldKey: string, suppliedContract?: RenderFieldContract): unknown {
    const contract = suppliedContract ?? contractFor(fieldKey)
    const hasValue = Object.prototype.hasOwnProperty.call(source, fieldKey)
      && source[fieldKey] !== null
      && source[fieldKey] !== undefined

    if (!hasValue) {
      if (contract.required) pushIssue(context, fieldKey, contract, 'required', issues)
      return parseRenderDefault(context.typeName, fieldKey, contract)
    }

    const parsed = parseRenderField(source[fieldKey], contract, false, allowTypedLiterals)
    if (!parsed.ok) {
      for (const diagnostic of parsed.diagnostics) {
        pushIssue(context, fieldKey, contract, diagnostic.code, issues, diagnostic.path)
      }
      return parseRenderDefault(context.typeName, fieldKey, contract)
    }
    return parsed.value
  }

  return {
    dynamic(fieldKey: string, contract: RenderFieldContract): unknown {
      return value(fieldKey, contract)
    },
    string(fieldKey: string): string {
      return value(fieldKey) as string
    },
    optionalString(fieldKey: string, fallback = ''): string {
      const contract = contractFor(fieldKey)
      const hasValue = Object.prototype.hasOwnProperty.call(source, fieldKey)
        && source[fieldKey] !== null
        && source[fieldKey] !== undefined
      if (!hasValue) return fallback

      const parsed = parseRenderField(source[fieldKey], contract, false, allowTypedLiterals)
      if (!parsed.ok) {
        for (const diagnostic of parsed.diagnostics) {
          pushIssue(context, fieldKey, contract, diagnostic.code, issues, diagnostic.path)
        }
        return fallback
      }
      return parsed.value as string
    },
    number(fieldKey: string): number {
      return value(fieldKey) as number
    },
    boolean(fieldKey: string): boolean {
      return value(fieldKey) as boolean
    },
    array(fieldKey: string): unknown[] {
      return value(fieldKey) as unknown[]
    },
    option<const T extends string>(fieldKey: string): T {
      return value(fieldKey) as T
    },
    cssLength(fieldKey: string): string {
      return value(fieldKey) as string
    },
    expectedLiteral(fieldKey: string, expected: string): void {
      const contract = contractFor(fieldKey)
      const hasValue = Object.prototype.hasOwnProperty.call(source, fieldKey)
        && source[fieldKey] !== null
        && source[fieldKey] !== undefined
      if (!hasValue) {
        if (contract.required) pushIssue(context, fieldKey, contract, 'required', issues)
        return
      }
      if (source[fieldKey] !== expected) {
        pushIssue(context, fieldKey, contract, 'invalid-option', issues)
      }
    },
  }
}

type RenderFieldDiagnostic = {
  code: RenderParseFailure
  path: readonly (string | number)[]
}
type RenderFieldResult =
  | { ok: true, value: unknown }
  | { ok: false, diagnostics: readonly RenderFieldDiagnostic[] }

function parseRenderField(
  value: unknown,
  contract: RenderFieldContract,
  ignoreRequired = false,
  allowTypedLiterals = false,
): RenderFieldResult {
  if (!ignoreRequired && contract.required && value === '') return invalidRenderField('required')

  if (contract.kind === 'array') {
    if (!Array.isArray(value)) return invalidRenderField('invalid-type')
    if (contract.itemShape === 'root-child') {
      const diagnostics = value.flatMap((item, index) => (
        isRecord(item) && isRecord(item.block) && isRecord(item.location)
          ? []
          : [{ code: 'invalid-object' as const, path: [index] }]
      ))
      if (diagnostics.length > 0) return { ok: false, diagnostics }
    }
    return { ok: true, value }
  }

  if (contract.kind === 'number') {
    if (allowTypedLiterals && typeof value === 'number') {
      if (!Number.isFinite(value)) return invalidRenderField('conversion-failed')
      if ((contract.min !== undefined && value < contract.min)
        || (contract.max !== undefined && value > contract.max)) return invalidRenderField('out-of-range')
      return { ok: true, value }
    }
    if (typeof value !== 'string') return invalidRenderField('invalid-type')
    const parsed = value.trim() === '' ? Number.NaN : Number(value)
    if (!Number.isFinite(parsed)) return invalidRenderField('conversion-failed')
    if ((contract.min !== undefined && parsed < contract.min)
      || (contract.max !== undefined && parsed > contract.max)) return invalidRenderField('out-of-range')
    return { ok: true, value: parsed }
  }

  if (contract.kind === 'boolean') {
    if (allowTypedLiterals && typeof value === 'boolean') return { ok: true, value }
    if (value !== 'true' && value !== 'false') {
      return invalidRenderField(typeof value === 'string' ? 'conversion-failed' : 'invalid-type')
    }
    return { ok: true, value: value === 'true' }
  }

  const stringValue = contract.kind === 'css-length' && typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : value
  if (typeof stringValue !== 'string') return invalidRenderField('invalid-type')
  if (contract.kind === 'color' && stringValue && !isRenderCssColor(stringValue)) {
    return invalidRenderField('invalid-color')
  }
  if (contract.kind === 'file-path' && stringValue
    && !isValidRenderFilePath(
      stringValue,
      contract.extensions,
      contract.allowRemote,
    )
    && !isAcceptedResourceReference(stringValue, contract.acceptsReferences)) {
    return invalidRenderField('invalid-file-path')
  }
  const converted = contract.kind === 'css-length' ? normalizeRenderCssLength(stringValue) : stringValue
  if (contract.kind === 'css-length' && converted && !isRenderCssLength(converted)) {
    return invalidRenderField('invalid-css-length')
  }
  if (contract.options && !contract.options.includes(converted)) return invalidRenderField('invalid-option')
  return { ok: true, value: converted }
}

function parseRenderDefault(typeName: string, fieldKey: string, contract: RenderFieldContract): unknown {
  const parsed = parseRenderField(cloneRenderValue(contract.defaultValue), contract, true)
  if (!parsed.ok) {
    throw new Error(`Invalid render default for ${typeName}.${fieldKey}: ${parsed.diagnostics[0]?.code}`)
  }
  return parsed.value
}

function invalidRenderField(code: RenderParseFailure): RenderFieldResult {
  return { ok: false, diagnostics: [{ code, path: [] }] }
}

function cloneRenderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneRenderValue)
  if (isRecord(value)) return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneRenderValue(child)]),
  )
  return value
}

function isValidRenderFilePath(
  value: string,
  extensions?: readonly string[],
  allowRemote = false,
): boolean {
  const normalized = value.replace(/\\/g, '/')
  if (allowRemote && /^https:\/\/[^\s]+$/i.test(value.trim())) return true
  if (normalized.includes('\0') || /(^|\/)\.\.(?:\/|$)/.test(normalized) || /[<>:"|?*]/.test(normalized)) {
    return false
  }
  if (!extensions?.length || normalized.endsWith('/')) return true
  const extension = normalized.split('.').pop()?.toLocaleLowerCase()
  return Boolean(extension && extensions.some(candidate => candidate.toLocaleLowerCase() === extension))
}

/**
 * A path field may declare that it also accepts resource references. A reference names a resource by
 * key (`icon:collection/icon`, `作者/包名@版本#icon:collection/icon`) and resolves to a path afterwards,
 * so the contract, not the path validator, decides whether a field accepts it.
 */
function isAcceptedResourceReference(
  value: string,
  accepted: readonly ResourceReferenceKind[] | undefined,
): boolean {
  if (!accepted?.length) return false
  const parsed = parseResourceReference(value)
  return parsed.reference !== null && accepted.includes(parsed.reference.kind)
}

function resolveBlockType(
  source: SourceRecord,
  parentPath: string,
  documentId: string,
  instanceId: string | null,
  faceKey: CardFaceKey,
  issues: CardPipelineIssue[],
): BlockType {
  const rawType = source.type
  if (typeof rawType === 'string' && blockTypes.includes(rawType as BlockType)) {
    return rawType as BlockType
  }

  const fallbackType: BlockType = 'text-block'
  const context: IssueContext = {
    documentId,
    instanceId,
    faceKey,
    owner: { kind: 'block', id: primitiveString(source.id) },
    blockPath: joinBlockPath(parentPath, primitiveString(source.name)),
    blockId: primitiveString(source.id) || undefined,
    typeName: fallbackType,
  }
  const contract = getRenderFieldContract(fallbackType, 'type')
  if (!contract) throw new Error(`Missing render contract for ${fallbackType}.type`)
  if (rawType !== null && rawType !== undefined) {
    pushIssue(context, 'type', contract, 'invalid-option', issues)
  }
  return fallbackType
}

function pushIssue(
  context: IssueContext,
  fieldKey: string,
  contract: RenderFieldContract,
  reasonCode: RenderParseFailure,
  issues: CardPipelineIssue[],
  valuePath: readonly (string | number)[] = [],
): void {
  const defaultValue = formatIssueValue(parseRenderDefault(context.typeName, fieldKey, contract))
  issues.push(createCardPipelineIssue({
    type: `card-designer.render-parse.${reasonCode}` as CardRenderParseIssueType,
    location: {
      documentId: context.documentId,
      instanceId: context.instanceId,
      faceKey: context.faceKey,
      owner: context.owner,
      ...(context.blockId ? { blockId: context.blockId } : {}),
      ...(context.blockPath ? { blockPath: context.blockPath } : {}),
      fieldKey,
      ...(valuePath.length ? { valuePath } : {}),
    },
    parameters: {
      ...(contract.displayFieldKey ? { fieldName: contract.displayFieldKey } : {}),
      defaultValue,
    },
  }))
}

function formatIssueValue(value: unknown): string {
  if (typeof value === 'string') return value || '""'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? String(value)
}

function primitiveString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is SourceRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toRecord(value: unknown): SourceRecord {
  return isRecord(value) ? value : {}
}
