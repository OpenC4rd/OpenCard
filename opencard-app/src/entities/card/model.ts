/**
 * 模块说明：
 * - 定义卡牌领域模型、字段能力与对象创建
 * 职责边界：
 * - 维护领域结构真相 不包含组件渲染实现
 */
import {
    acceptsPropertyBinding,
    acceptsPropertyBindingScope,
    additionalFieldTypes,
    createPropertyDefaultValue,
    exposesPropertyReference,
    getDefault,
    getPropertyValueKind,
    getTypePropertyEditorSchema,
    parseAdditionalFieldDefinitions,
    resolvePropertyEditorSchema,
    validateAdditionalFieldKey as validateRecordAdditionalFieldKey,
} from './schema'
import type {
    AdditionalFieldDefinition,
    AdditionalFieldDefinitionMap,
    EditorPropertyDefinition,
    PropertyFieldType,
    AdditionalFieldKeyError,
} from './schema'
import type { BindingValueKind } from '../../features/editor-runtime/model/binding'
import type { BindingScopeKind } from '../../features/editor-runtime/model/bindingExpression'

export type {
    AdditionalFieldDefinition,
    AdditionalFieldDefinitionMap,
    AdditionalFieldKeyError,
} from './schema'

// Block and document data models.
export type BlockIdentity = {
    id: string
    additionalFieldDefinition?: AdditionalFieldDefinitionMap
}

export type CssValue = string
export type TextFontWeight = 'light' | 'normal' | 'bold'

export type AnchorPosition =
    | 'lt' | 'ct' | 'rt'
    | 'lc' | 'cc' | 'rc'
    | 'lb' | 'cb' | 'rb'

export type AlignmentPosition = 'start' | 'center' | 'end' | 'justify'
export type VerticalAlignmentPosition = 'top' | 'center' | 'bottom'
export type TextWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'

type TextContentBlock = BlockIdentity & {
    content: string
}

export type TextBlock = TextContentBlock & {
    type: "text-block"
}

export type MarkdownTextBlock = TextContentBlock & {
    type: "markdown-text-block"
}

export type ImageBlock = BlockIdentity & {
    type: "image-block"
    source: string
    fit: "cover" | "contain" | "fill"
}

export type QrCodeBlock = BlockIdentity & {
    type: "qrcode-block"
    content: string
    errorCorrection: "L" | "M" | "Q" | "H"
    foreground: string
    backgroundColor: string
    quietZone: string
}

export type ShapeBlock = BlockIdentity & {
    type: "shape-block"
    shape: "rectangle" | "ellipse" | "line" | "triangle" | "diamond"
    fill: string
    stroke: string
    strokeWidth: string
    strokeStyle: "solid" | "dashed" | "dotted"
    strokeAlignment: "inside" | "center" | "outside"
    strokeJoin: "miter" | "round" | "bevel"
    strokeCap: "butt" | "round" | "square"
    strokeMiterLimit: string
}
export type SimpleContainerLocationInfo = {
    id: string
    type: 'simple-container-location'
    anchor: AnchorPosition
    x?: CssValue
    y?: CssValue
}

export type ContainerPackaging = {
    packaged?: string
}

export type SimpleContainerBlock = BlockIdentity & ContainerPackaging & {
    type: "simple-container-block"
    clip: string
    children: {
        block: CardBlock
        location: SimpleContainerLocationInfo
    }[]
}

export type FlowContainerLocationInfo = {
    id: string
    type: 'flow-container-location'
    index: string
    align?: AlignmentPosition
}

export type FlowDirection = 'lr' | 'rl' | 'tb' | 'bt'

export type FlowContainerBlock = BlockIdentity & ContainerPackaging & {
    type: "flow-container-block"
    clip: string
    direction: FlowDirection
    gap: CssValue
    children: {
        block: CardBlock
        location: FlowContainerLocationInfo
    }[]
}

export type CardBlock = TextBlock | MarkdownTextBlock | ImageBlock | QrCodeBlock | ShapeBlock | SimpleContainerBlock | FlowContainerBlock

export type RootChild = {
    block: CardBlock
    location: SimpleContainerLocationInfo
}

export const cardFaceKeys = ['front', 'back'] as const
export type CardFaceKey = typeof cardFaceKeys[number]

export type CardFace = {
    type: 'card-face'
    id: string
    background: string
    children: RootChild[]
}

export type CardDataTableConfiguration = {
    blocks: Record<string, string[]>
    exportInstanceIds?: string[]
}

export type CardDocument = {
    type: "card-document"
    name?: string
    description?: string
    notes?: string
    id: string
    version: string
    width: string
    height: string
    faces: Record<CardFaceKey, CardFace>
    instances: CardInstanceRecord[]
    dataTable?: CardDataTableConfiguration
}

export type CardInstanceRecord = {
    type: 'card-instance'
    id: string
    name: string
    amount: string
    data: Record<string, Record<string, CardStoredValue>>
}

export type CardStoredValue = string | CardStoredValue[] | { [key: string]: CardStoredValue }

export function isCardStoredValue(value: unknown): value is CardStoredValue {
    if (typeof value === 'string') return true
    if (Array.isArray(value)) return value.every(item => isCardStoredValue(item))
    if (!value || typeof value !== 'object') return false
    return Object.values(value).every(item => isCardStoredValue(item))
}

function materializeAdditionalFieldDefinitions(value: unknown): AdditionalFieldDefinitionMap {
    return parseAdditionalFieldDefinitions(value)
}

export function cloneAdditionalFieldDefinitions(
    fields: AdditionalFieldDefinitionMap | undefined,
): AdditionalFieldDefinitionMap | undefined {
    if (!fields) return undefined
    return Object.fromEntries(
        Object.entries(fields).map(([fieldKey, definition]) => [fieldKey, { ...definition }]),
    )
}

export function getAdditionalFieldPropertyDefinition(
    definition: AdditionalFieldDefinition,
): EditorPropertyDefinition {
    const { title: _title, ...editorDefinition } = definition
    return editorDefinition as EditorPropertyDefinition
}

export function getCardFieldDefinition(
    record: Record<string, unknown>,
    fieldKey: string,
 ): EditorPropertyDefinition | undefined {
    return resolvePropertyEditorSchema(record).fields[fieldKey]
}

export function getCardFieldKeys(record: Record<string, unknown>): string[] {
    return [...new Set([
        ...Object.keys(record).filter((fieldKey) => fieldKey !== 'additionalFieldDefinition'),
    ])]
}

export function hasCardField(record: Record<string, unknown>, fieldKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, fieldKey)
}

export function getCardFieldValue(record: Record<string, unknown>, fieldKey: string): unknown {
    return record[fieldKey]
}

export function getBlockProperty<T = unknown>(block: CardBlock | null | undefined, fieldKey: string): T | undefined {
    if (!block) return undefined
    return (block as unknown as Record<string, unknown>)[fieldKey] as T | undefined
}

export function setBlockProperty(block: CardBlock, fieldKey: string, value: unknown): void {
    ;(block as unknown as Record<string, unknown>)[fieldKey] = value
}

export function deleteBlockProperty(block: CardBlock, fieldKey: string): void {
    delete (block as unknown as Record<string, unknown>)[fieldKey]
}

export function setCardFieldValue(
    record: Record<string, unknown>,
    fieldKey: string,
    value: unknown,
): boolean {
    if (Object.prototype.hasOwnProperty.call(record, fieldKey)
        || materializeAdditionalFieldDefinitions(record.additionalFieldDefinition)[fieldKey]) {
        record[fieldKey] = value
        return true
    }
    return false
}

export function getCardFieldValueKind(
    record: Record<string, unknown>,
    fieldKey: string,
): BindingValueKind {
    return getPropertyValueKind(getCardFieldDefinition(record, fieldKey))
}

export function acceptsCardFieldBinding(record: Record<string, unknown>, fieldKey: string): boolean {
    return acceptsPropertyBinding(getCardFieldDefinition(record, fieldKey))
}

export function acceptsCardFieldBindingScope(
    record: Record<string, unknown>,
    fieldKey: string,
    scope: BindingScopeKind,
): boolean {
    return acceptsPropertyBindingScope(getCardFieldDefinition(record, fieldKey), scope)
}

export function exposesCardFieldReference(record: Record<string, unknown>, fieldKey: string): boolean {
    return exposesPropertyReference(getCardFieldDefinition(record, fieldKey))
}

const additionalFieldTypeSet = new Set<PropertyFieldType>(additionalFieldTypes)

export function validateAdditionalFieldKey(block: CardBlock, candidate: string): AdditionalFieldKeyError | null {
    return validateRecordAdditionalFieldKey(
        block as Record<string, unknown>,
        Object.keys(getTypePropertyEditorSchema(block.type)),
        candidate,
    )
}

export function createBlockAdditionalField(
    block: CardBlock,
    fieldKeyInput: string,
    definition: AdditionalFieldDefinition,
): AdditionalFieldKeyError | null {
    if (!additionalFieldTypeSet.has(definition.fieldType)) return 'unsupported-field-type'
    const error = validateAdditionalFieldKey(block, fieldKeyInput)
    if (error) return error

    const fieldKey = fieldKeyInput.trim()
    const definitions = block.additionalFieldDefinition ?? (block.additionalFieldDefinition = {})
    definitions[fieldKey] = structuredClone(definition)
    ;(block as unknown as Record<string, unknown>)[fieldKey] = createPropertyDefaultValue(
        getAdditionalFieldPropertyDefinition(definition),
    )
    return null
}

export function deleteBlockAdditionalField(
    document: CardDocument,
    block: CardBlock,
    fieldKey: string,
): number {
    if (!block.additionalFieldDefinition?.[fieldKey]) return 0
    delete (block as unknown as Record<string, unknown>)[fieldKey]
    delete block.additionalFieldDefinition[fieldKey]
    if (Object.keys(block.additionalFieldDefinition).length === 0) delete block.additionalFieldDefinition

    let removedOverrides = 0
    for (const instance of document.instances ?? []) {
        const instanceBlockData = instance.data[block.id]
        if (!instanceBlockData || !Object.prototype.hasOwnProperty.call(instanceBlockData, fieldKey)) continue
        delete instanceBlockData[fieldKey]
        removedOverrides += 1
        if (Object.keys(instanceBlockData).length === 0) delete instance.data[block.id]
    }
    return removedOverrides
}

// Internal helper types for block factory functions. Attribute keys are intentionally
// explicit here; they are accepted as input but are not part of the block model.
type BlockInit = {
    id?: string
    name?: string; notes?: string; visible?: string; width?: CssValue; height?: CssValue
    borderColor?: string; borderWidth?: string; borderStyle?: 'solid' | 'dashed' | 'dotted'
    borderRadius?: CssValue; background?: string; translateX?: CssValue; translateY?: CssValue
    scaleX?: string; scaleY?: string; transformAnchor?: AnchorPosition; zIndex?: string
    rotation?: string; opacity?: string; customCss?: string
    additionalFieldDefinition?: AdditionalFieldDefinitionMap
}
type TextBlockInit = BlockInit & {
    content?: string; fontSize?: CssValue; fontFamily?: string; fontWeight?: TextFontWeight
    color?: string; textAlign?: AlignmentPosition; verticalAlign?: VerticalAlignmentPosition
    lineHeight?: CssValue; writingMode?: TextWritingMode
}
type MarkdownTextBlockInit = TextBlockInit
type ImageBlockInit = BlockInit & { source?: string; fit?: 'cover' | 'contain' | 'fill' }
type QrCodeBlockInit = BlockInit & { content?: string; errorCorrection?: 'L' | 'M' | 'Q' | 'H'; foreground?: string; backgroundColor?: string; quietZone?: string }
type ShapeBlockInit = BlockInit & { shape?: ShapeBlock['shape']; fill?: string; stroke?: string; strokeWidth?: string; strokeStyle?: ShapeBlock['strokeStyle']; strokeAlignment?: ShapeBlock['strokeAlignment']; strokeJoin?: ShapeBlock['strokeJoin']; strokeCap?: ShapeBlock['strokeCap']; strokeMiterLimit?: string }
type SimpleContainerBlockInit = BlockInit & { packaged?: string; clip?: string; children?: SimpleContainerBlock['children'] }
type FlowContainerBlockInit = BlockInit & { packaged?: string; clip?: string; direction?: FlowDirection; gap?: CssValue; children?: FlowContainerBlock['children'] }
type CardFaceInit = Partial<Omit<CardFace, 'type'>>

// Shared block creation helpers.
function createBlockId(prefix = 'block'): string {
    return `${prefix}-${crypto.randomUUID()}`
}

export function createCardFace(init: CardFaceInit = {}): CardFace {
    return {
        type: 'card-face',
        id: init.id ?? `card-face-${crypto.randomUUID()}`,
        background: init.background ?? '#FFFFFF',
        children: init.children ? [...init.children] : [],
    }
}

function createBlockIdentity(init: BlockInit = {}): BlockIdentity & Record<string, unknown> {
    const block: Record<string, unknown> = { id: init.id ?? createBlockId() }
    for (const [key, value] of Object.entries(init)) {
        if (key !== 'id' && key !== 'additionalFieldDefinition' && value !== undefined) block[key] = value
    }
    if (init.additionalFieldDefinition) {
        block.additionalFieldDefinition = cloneAdditionalFieldDefinitions(init.additionalFieldDefinition)
    }
    return block as BlockIdentity & Record<string, unknown>
}

function getDefaultBlockName(type: CardBlock['type']): string {
    switch (type) {
        case 'text-block':
            return 'Text Block'
        case 'markdown-text-block':
            return 'Markdown Text Block'
        case 'image-block':
            return 'Image Block'
        case 'qrcode-block':
            return 'QR Code'
        case 'shape-block':
            return 'Shape'
        case 'simple-container-block':
            return 'Simple Container'
        case 'flow-container-block':
            return 'Flow Container'
    }
}

/**
 * 出厂就带值的字段：这里只声明"带哪些字段"，值一律取自 schema 默认值。
 * 未列出的字段保持缺省，在属性面板里显示为"尚未添加"，由用户按需添加。
 */
const blockSeedFieldKeys: Record<CardBlock['type'], readonly string[]> = {
    'text-block': ['width', 'height', 'fontSize', 'fontWeight', 'color', 'textAlign', 'verticalAlign', 'lineHeight'],
    'markdown-text-block': ['width', 'height', 'fontSize', 'fontWeight', 'color', 'textAlign', 'verticalAlign', 'lineHeight'],
    'image-block': ['width', 'height'],
    'qrcode-block': ['width', 'height'],
    'shape-block': ['width', 'height'],
    'simple-container-block': ['width', 'height'],
    'flow-container-block': ['width', 'height'],
}

function createBlockSeed(type: CardBlock['type']): Record<string, unknown> {
    return Object.fromEntries(blockSeedFieldKeys[type].flatMap(fieldKey => {
        const value = getDefault(type, fieldKey)
        return value === undefined ? [] : [[fieldKey, value] as const]
    }))
}

export function createTextBlock(init: TextBlockInit = {}): TextBlock {
    return {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('text-block'),
            name: init.name ?? getDefaultBlockName('text-block'),
            ...createBlockSeed('text-block'),
            ...init,
        }),
        type: 'text-block',
        content: init.content ?? '',
    } as TextBlock
}

export function createMarkdownTextBlock(init: MarkdownTextBlockInit = {}): MarkdownTextBlock {
    return {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('markdown-text-block'),
            name: init.name ?? getDefaultBlockName('markdown-text-block'),
            ...createBlockSeed('markdown-text-block'),
            ...init,
        }),
        type: 'markdown-text-block',
        content: init.content ?? '',
    } as MarkdownTextBlock
}

export function createImageBlock(init: ImageBlockInit = {}): ImageBlock {
    const block: Record<string, unknown> = {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('image-block'),
            name: init.name ?? getDefaultBlockName('image-block'),
            ...createBlockSeed('image-block'),
            ...init,
        }),
        type: 'image-block',
        source: init.source ?? '',
        fit: init.fit ?? 'cover',
    }

    return block as ImageBlock
}

export function createQrCodeBlock(init: QrCodeBlockInit = {}): QrCodeBlock {
    return {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('qrcode-block'),
            name: init.name ?? getDefaultBlockName('qrcode-block'),
            ...createBlockSeed('qrcode-block'),
            ...init,
        }),
        type: 'qrcode-block',
        content: init.content ?? '',
        errorCorrection: init.errorCorrection ?? 'M',
        foreground: init.foreground ?? '#000000',
        backgroundColor: init.backgroundColor ?? '#FFFFFF',
        quietZone: init.quietZone ?? '4',
    } as QrCodeBlock
}

export function createShapeBlock(init: ShapeBlockInit = {}): ShapeBlock {
    return {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('shape-block'),
            name: init.name ?? getDefaultBlockName('shape-block'),
            ...createBlockSeed('shape-block'),
            ...init,
        }),
        type: 'shape-block',
        shape: init.shape ?? 'rectangle',
        fill: init.fill ?? '#7C6CFF',
        stroke: init.stroke ?? '#000000',
        strokeWidth: init.strokeWidth ?? '0',
        strokeStyle: init.strokeStyle ?? 'solid',
        strokeAlignment: init.strokeAlignment ?? 'center',
        strokeJoin: init.strokeJoin ?? 'miter',
        strokeCap: init.strokeCap ?? 'butt',
        strokeMiterLimit: init.strokeMiterLimit ?? '4',
    } as ShapeBlock
}
export function createSimpleContainerBlock(init: SimpleContainerBlockInit = {}): SimpleContainerBlock {
    const block: SimpleContainerBlock = {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('simple-container-block'),
            name: init.name ?? getDefaultBlockName('simple-container-block'),
            ...createBlockSeed('simple-container-block'),
            ...init,
        }),
        type: 'simple-container-block',
        ...(init.packaged !== undefined ? { packaged: init.packaged } : {}),
        clip: init.clip ?? 'false',
        children: init.children ? [...init.children] : [],
    }

    return block
}

export function createFlowContainerBlock(init: FlowContainerBlockInit = {}): FlowContainerBlock {
    const block: FlowContainerBlock = {
        ...createBlockIdentity({
            id: init.id ?? createBlockId('flow-container-block'),
            name: init.name ?? getDefaultBlockName('flow-container-block'),
            ...createBlockSeed('flow-container-block'),
            ...init,
        }),
        type: 'flow-container-block',
        ...(init.packaged !== undefined ? { packaged: init.packaged } : {}),
        clip: init.clip ?? 'false',
        direction: init.direction ?? 'lr',
        gap: init.gap ?? '10px',
        children: init.children ? [...init.children] : [],
    }

    return block
}

export function createBlock(type: 'text-block', init?: TextBlockInit): TextBlock
export function createBlock(type: 'markdown-text-block', init?: MarkdownTextBlockInit): MarkdownTextBlock
export function createBlock(type: 'image-block', init?: ImageBlockInit): ImageBlock
export function createBlock(type: 'qrcode-block', init?: QrCodeBlockInit): QrCodeBlock
export function createBlock(type: 'shape-block', init?: ShapeBlockInit): ShapeBlock
export function createBlock(type: 'simple-container-block', init?: SimpleContainerBlockInit): SimpleContainerBlock
export function createBlock(type: 'flow-container-block', init?: FlowContainerBlockInit): FlowContainerBlock
export function createBlock(type: CardBlock['type'], init: unknown = {}): CardBlock {
    switch (type) {
        case 'text-block':
            return createTextBlock(init as TextBlockInit)
        case 'markdown-text-block':
            return createMarkdownTextBlock(init as MarkdownTextBlockInit)
        case 'image-block':
            return createImageBlock(init as ImageBlockInit)
        case 'qrcode-block':
            return createQrCodeBlock(init as QrCodeBlockInit)
        case 'shape-block':
            return createShapeBlock(init as ShapeBlockInit)
        case 'simple-container-block':
            return createSimpleContainerBlock(init as SimpleContainerBlockInit)
        case 'flow-container-block':
            return createFlowContainerBlock(init as FlowContainerBlockInit)
    }
}
