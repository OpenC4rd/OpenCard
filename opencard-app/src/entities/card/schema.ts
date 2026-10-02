/**
 * 模块说明：
 * - 定义属性编辑 schema 默认值与字段物化策略
 * 职责边界：
 * - 只维护字段协议与默认值 不承载 UI 写回逻辑
 */
import type { CardBlock } from './model'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { BindingValueKind } from '../../features/editor-runtime/model/binding'
import type { BindingScopeKind } from '../../features/editor-runtime/model/bindingExpression'
import type { FilePathFilter } from '../../shared/model/filePath'

type EditorPropertyBase = {
    required?: boolean
    isHidden?: boolean
    isArray?: boolean
    isReadonly?: boolean
    resettable?: boolean
    deletable?: boolean
    nonOverridable?: true
    acceptsBinding?: false
    bindingScopes?: readonly BindingScopeKind[]
    exposesReference?: false
    categoryId?: PropertyEditorCategoryId
    displayFieldKey?: string
    defaultValue?: unknown
}

// 这里可以定义对于某一特定 fieldType 的数据编辑器需求的辅助约束条件
export type PropertyConstraintMap = {
    string: {
        minLength?: number
        maxLength?: number
        options?: readonly string[]
        optionLabelKeys?: Readonly<Record<string, string>>
        presentation?: 'select' | 'stepper'
        autocomplete?: readonly string[]
        multiline?: boolean
        richText?: boolean
    }
    filePath: {
        minLength?: number
        maxLength?: number
        filter?: FilePathFilter
        allowRemote?: boolean
    }
    anchorPosition: {}
    alignPosition: {}
    verticalAlignPosition: {}
    flowDirection: {}
    number: {
        min?: number
        max?: number
        step?: number
    }
    boolean: {}
    color: {}
    object: {
        objectType: string
    }
}

export type PropertyFieldType = keyof PropertyConstraintMap
type AdditionalFieldEditorOptions = Pick<EditorPropertyBase,
    'required' | 'isHidden' | 'isReadonly' | 'resettable' | 'deletable' | 'categoryId' | 'displayFieldKey'>
type AdditionalFieldDefinitionBase<T extends PropertyFieldType> = AdditionalFieldEditorOptions & {
    title?: string
    fieldType: T
}
export type AdditionalFieldDefinition =
    | (AdditionalFieldDefinitionBase<'string'> & PropertyConstraintMap['string'])
    | (AdditionalFieldDefinitionBase<'filePath'> & PropertyConstraintMap['filePath'])
    | (AdditionalFieldDefinitionBase<'number'> & PropertyConstraintMap['number'])
    | AdditionalFieldDefinitionBase<Exclude<(typeof additionalFieldTypes)[number], 'string' | 'filePath' | 'number'>>
export type AdditionalFieldDefinitionMap = Record<string, AdditionalFieldDefinition>
export type AdditionalFieldKeyError = 'required' | 'invalid' | 'duplicate' | 'unsupported-field-type'
export type { BindingValueKind } from '../../features/editor-runtime/model/binding'
export const additionalFieldTypes = [
    'string',
    'filePath',
    'anchorPosition',
    'alignPosition',
    'verticalAlignPosition',
    'flowDirection',
    'number',
    'boolean',
    'color',
] as const satisfies readonly PropertyFieldType[]
export const additionalFieldKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

const additionalFieldTypeSet = new Set<PropertyFieldType>(additionalFieldTypes)

export function parseAdditionalFieldDefinitions(
    value: unknown,
    reservedKeys: readonly string[] = [],
    typeName?: string,
): AdditionalFieldDefinitionMap {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    const reservedIdentities = new Set(reservedKeys.map(key => key.toLocaleLowerCase()))
    const nativeSchema = getTypePropertyEditorSchema(typeName)
    const nativeKeysByIdentity = new Map(
        Object.keys(nativeSchema).map(fieldKey => [fieldKey.toLocaleLowerCase(), fieldKey]),
    )
    const definitions: AdditionalFieldDefinitionMap = {}

    for (const [fieldKey, fieldValue] of Object.entries(value)) {
        if (!additionalFieldKeyPattern.test(fieldKey)
            || reservedIdentities.has(fieldKey.toLocaleLowerCase())
            || !fieldValue
            || typeof fieldValue !== 'object'
            || Array.isArray(fieldValue)) {
            continue
        }

        const source = fieldValue as Record<string, unknown>
        const nativeKey = nativeKeysByIdentity.get(fieldKey.toLocaleLowerCase())
        const nativeDefinition = nativeKey ? nativeSchema[nativeKey] : undefined
        if (nativeDefinition?.nonOverridable) continue
        const hasFieldType = typeof source.fieldType === 'string'
            && additionalFieldTypeSet.has(source.fieldType as PropertyFieldType)
        const fieldType = hasFieldType
            ? source.fieldType as (typeof additionalFieldTypes)[number]
            : nativeDefinition?.fieldType
        if (!fieldType || fieldType === 'object') continue
        const normalizedFieldKey = nativeKey ?? fieldKey
        const title = typeof source.title === 'string' ? source.title.trim() : ''
        const base = {
            ...(hasFieldType ? { fieldType } : {}),
            ...(title ? { title } : {}),
            ...parseAdditionalEditorOptions(source),
        }
        if (fieldType === 'string') {
            const minLength = parseNonNegativeInteger(source.minLength)
            const maxLength = parseNonNegativeInteger(source.maxLength)
            const options = Array.isArray(source.options) ? parseStringOptions(source.options) : undefined
            const autocomplete = Array.isArray(source.autocomplete) ? parseStringOptions(source.autocomplete) : undefined
            const optionLabelKeys = parseStringRecord(source.optionLabelKeys)
            definitions[normalizedFieldKey] = {
                ...base,
                ...(minLength !== undefined ? { minLength } : {}),
                ...(maxLength !== undefined ? { maxLength } : {}),
                ...(typeof source.multiline === 'boolean' ? { multiline: source.multiline } : {}),
                ...(typeof source.richText === 'boolean' ? { richText: source.richText } : {}),
                ...(options ? { options } : {}),
                ...(autocomplete ? { autocomplete } : {}),
                ...(optionLabelKeys ? { optionLabelKeys } : {}),
                ...(source.presentation === 'select' || source.presentation === 'stepper'
                    ? { presentation: source.presentation } : {}),
            } as AdditionalFieldDefinition
        } else if (fieldType === 'filePath') {
            const minLength = parseNonNegativeInteger(source.minLength)
            const maxLength = parseNonNegativeInteger(source.maxLength)
            const filter = parseFilePathFilter(source.filter)
            definitions[normalizedFieldKey] = {
                ...base,
                ...(minLength !== undefined ? { minLength } : {}),
                ...(maxLength !== undefined ? { maxLength } : {}),
                ...(filter ? { filter } : {}),
            } as AdditionalFieldDefinition
        } else if (fieldType === 'number') {
            const min = parseFiniteNumber(source.min)
            const max = parseFiniteNumber(source.max)
            const step = parseFiniteNumber(source.step)
            definitions[normalizedFieldKey] = {
                ...base,
                ...(min !== undefined ? { min } : {}),
                ...(max !== undefined ? { max } : {}),
                ...(step !== undefined && step > 0 ? { step } : {}),
            } as AdditionalFieldDefinition
        } else {
            definitions[normalizedFieldKey] = { ...base, ...(hasFieldType ? { fieldType } : {}) } as AdditionalFieldDefinition
        }
    }

    return definitions
}

function parseFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function parseStringOptions(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value.flatMap(candidate => {
        if (typeof candidate !== 'string') return []
        const option = candidate.trim()
        const identity = option.toLocaleLowerCase()
        if (!option || seen.has(identity)) return []
        seen.add(identity)
        return [option]
    })
}

function parseAdditionalEditorOptions(source: Record<string, unknown>): AdditionalFieldEditorOptions {
    const categoryId = typeof source.categoryId === 'string'
        && Object.prototype.hasOwnProperty.call(propertyEditorCategoryDefinitions, source.categoryId)
        ? source.categoryId as PropertyEditorCategoryId
        : undefined
    const displayFieldKey = typeof source.displayFieldKey === 'string' ? source.displayFieldKey.trim() : ''
    return {
        ...(typeof source.required === 'boolean' ? { required: source.required } : {}),
        ...(typeof source.isHidden === 'boolean' ? { isHidden: source.isHidden } : {}),
        ...(typeof source.isReadonly === 'boolean' ? { isReadonly: source.isReadonly } : {}),
        ...(typeof source.resettable === 'boolean' ? { resettable: source.resettable } : {}),
        ...(typeof source.deletable === 'boolean' ? { deletable: source.deletable } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(displayFieldKey ? { displayFieldKey } : {}),
    }
}

function parseStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const entries = Object.entries(value).flatMap(([key, label]) => (
        key && typeof label === 'string' && label.trim() ? [[key, label.trim()] as const] : []
    ))
    return entries.length ? Object.fromEntries(entries) : undefined
}

function parseFilePathFilter(value: unknown): FilePathFilter | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const source = value as Record<string, unknown>
    const target = source.target === 'file' || source.target === 'directory' || source.target === 'both'
        ? source.target
        : undefined
    const extensions = Array.isArray(source.extensions) ? parseStringOptions(source.extensions) : undefined
    return target || extensions ? { ...(target ? { target } : {}), ...(extensions ? { extensions } : {}) } : undefined
}

export function validateAdditionalFieldKey(
    record: Readonly<Record<string, unknown>>,
    reservedKeys: readonly string[],
    candidate: string,
): AdditionalFieldKeyError | null {
    const fieldKey = candidate.trim()
    if (!fieldKey) return 'required'
    if (!additionalFieldKeyPattern.test(fieldKey)) return 'invalid'

    const occupiedIdentities = new Set([
        ...reservedKeys,
        ...Object.keys(record).filter(key => key !== 'additionalFieldDefinition'),
        ...Object.keys(parseAdditionalFieldDefinitions(record.additionalFieldDefinition)),
    ].map(key => key.toLocaleLowerCase()))
    return occupiedIdentities.has(fieldKey.toLocaleLowerCase()) ? 'duplicate' : null
}

type AllConstraintKeys = {
    [K in keyof PropertyConstraintMap]: keyof PropertyConstraintMap[K]
}[keyof PropertyConstraintMap]

type StrictVariant<
    T extends keyof PropertyConstraintMap
> = EditorPropertyBase & {
    fieldType: T
} & PropertyConstraintMap[T] & {
        [K in Exclude<AllConstraintKeys, keyof PropertyConstraintMap[T]>]?: never
    }

export type EditorPropertyDefinition = {
    [K in keyof PropertyConstraintMap]: StrictVariant<K>
}[keyof PropertyConstraintMap]

const propertyOptionsByFieldType: Partial<Record<PropertyFieldType, readonly string[]>> = {
    anchorPosition: ['lt', 'ct', 'rt', 'lc', 'cc', 'rc', 'lb', 'cb', 'rb'],
    alignPosition: ['start', 'center', 'end', 'justify'],
    verticalAlignPosition: ['top', 'center', 'bottom'],
    flowDirection: ['lr', 'rl', 'tb', 'bt'],
}

export function getPropertyFieldTypeOptions(
    fieldType: PropertyFieldType
): readonly string[] | undefined {
    return propertyOptionsByFieldType[fieldType]
}

export function getPropertyAllowedValues(
    definition: EditorPropertyDefinition | undefined
): readonly string[] | undefined {
    if (!definition) return undefined
    if (definition.fieldType === 'string') return definition.options
    return getPropertyFieldTypeOptions(definition.fieldType)
}

export type TypePropertyDefinitions = Record<string, Record<string, EditorPropertyDefinition>>
export type PropertyEditorSchemaByType = Record<CardBlock['type'], Record<string, EditorPropertyDefinition>>

export type PropertyEditorCategoryId =
    | 'general'
    | 'size'
    | 'container'
    | 'transform'
    | 'layer'
    | 'textStyle'
    | 'textLayout'
    | 'surface'
    | 'graphicStyle'
    | 'data'
    | 'content'
    | 'position'
    | 'customFields'
    | 'advanced'
    | 'uncategorized'

export type PropertyEditorCategoryDefinition = {
    icon: IconToken
}

export const propertyEditorCategoryDefinitions: Record<PropertyEditorCategoryId, PropertyEditorCategoryDefinition> = {
    general: { icon: 'data.symbol-key' },
    content: { icon: 'data.symbol-string' },
    size: { icon: 'data.symbol-number' },
    container: { icon: 'layout.columns' },
    position: { icon: 'nav.compass' },
    transform: { icon: 'nav.arrow-swap' },
    layer: { icon: 'data.layers' },
    textStyle: { icon: 'format.bold' },
    textLayout: { icon: 'format.align-start' },
    surface: { icon: 'format.color-fill' },
    graphicStyle: { icon: 'data.symbol-color' },
    customFields: { icon: 'data.variable' },
    advanced: { icon: 'format.code-braces' },
    data: { icon: 'data.collection' },
    uncategorized: { icon: 'data.list-tree' },
}

const textWritingModeOptions = ['horizontal-tb', 'vertical-rl', 'vertical-lr'] as const
const textFontWeightOptions = ['light', 'normal', 'bold'] as const
const imageFitOptions = ['cover', 'contain', 'fill'] as const
const qrErrorCorrectionOptions = ['L', 'M', 'Q', 'H'] as const
const shapeOptions = ['rectangle', 'ellipse', 'line', 'triangle', 'diamond'] as const
const shapeStrokeStyleOptions = ['solid', 'dashed', 'dotted'] as const
const shapeStrokeAlignmentOptions = ['inside', 'center', 'outside'] as const
const shapeStrokeJoinOptions = ['miter', 'round', 'bevel'] as const
const shapeStrokeCapOptions = ['butt', 'round', 'square'] as const
const blockBorderStyleOptions = ['solid', 'dashed', 'dotted'] as const
const cssLengthAutocomplete = ['px', '%'] as const

function createBaseBlockPropertyEditorSchema(): Record<string, EditorPropertyDefinition> {
    return {
        name: { fieldType: 'string', categoryId: 'general' },
        notes: { fieldType: 'string', multiline: true, categoryId: 'general' },
        width: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'size' },
        height: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'size' },
        transformAnchor: { fieldType: 'anchorPosition', categoryId: 'transform' },
        translateX: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'transform' },
        translateY: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'transform' },
        rotation: { fieldType: 'number', categoryId: 'transform' },
        scaleX: { fieldType: 'number', categoryId: 'transform' },
        scaleY: { fieldType: 'number', categoryId: 'transform' },
        visible: { fieldType: 'boolean', categoryId: 'layer' },
        zIndex: { fieldType: 'number', categoryId: 'layer' },
        opacity: { fieldType: 'number', min: 0, max: 1, categoryId: 'layer' },
        background: { fieldType: 'string', categoryId: 'surface' },
        borderColor: { fieldType: 'color', categoryId: 'surface' },
        borderWidth: { fieldType: 'number', min: 0, categoryId: 'surface' },
        borderStyle: { fieldType: 'string', options: blockBorderStyleOptions, categoryId: 'surface' },
        borderRadius: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'surface' },
        customCss: { fieldType: 'string', multiline: true, categoryId: 'advanced' },
        id: { fieldType: 'string', required: true, isReadonly: true, isHidden: true, minLength: 1, categoryId: 'advanced', acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, isHidden: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        additionalFieldDefinition: { fieldType: 'object', objectType: 'AdditionalFieldDefinition', isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    }
}

function createCustomBlockPropertyEditorSchema(): Record<string, EditorPropertyDefinition> {
    return {
        name: { fieldType: 'string', categoryId: 'general' },
        source: { fieldType: 'string', required: true, categoryId: 'data', acceptsBinding: false },
        id: { fieldType: 'string', required: true, isReadonly: true, isHidden: true, categoryId: 'advanced', acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, isHidden: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        additionalFieldDefinition: { fieldType: 'object', objectType: 'AdditionalFieldDefinition', isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    }
}

function createTextContentBlockPropertyEditorSchema(richText: boolean): Record<string, EditorPropertyDefinition> {
    return {
        ...createBaseBlockPropertyEditorSchema(),
        content: {
            fieldType: 'string',
            multiline: true,
            ...(richText ? { richText: true } : {}),
            categoryId: 'content',
        },
        fontFamily: { fieldType: 'string', categoryId: 'textStyle' },
        fontSize: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'textStyle' },
        fontWeight: {
            fieldType: 'string',
            options: textFontWeightOptions,
            optionLabelKeys: {
                light: 'propertyEditor.fontWeight.light',
                normal: 'propertyEditor.fontWeight.normal',
                bold: 'propertyEditor.fontWeight.bold',
            },
            categoryId: 'textStyle',
        },
        color: { fieldType: 'color', categoryId: 'textStyle', displayFieldKey: 'textColor' },
        lineHeight: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'textLayout' },
        textAlign: { fieldType: 'alignPosition', categoryId: 'textLayout' },
        verticalAlign: { fieldType: 'verticalAlignPosition', categoryId: 'textLayout' },
        writingMode: { fieldType: 'string', options: textWritingModeOptions, categoryId: 'textLayout' },
    }
}

const rawPropertyEditorSchemaByType: TypePropertyDefinitions = {
    'text-block': createTextContentBlockPropertyEditorSchema(true),
    'markdown-text-block': createTextContentBlockPropertyEditorSchema(false),
    'image-block': {
        ...createBaseBlockPropertyEditorSchema(),
        source: {
            fieldType: 'filePath',
            allowRemote: true,
            minLength: 0,
            categoryId: 'content',
            filter: {
                target: 'file',
                extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
            },
        },
        fit: { fieldType: 'string', required: true, options: imageFitOptions, categoryId: 'content' },
    },
    'qrcode-block': {
        ...createBaseBlockPropertyEditorSchema(),
        content: { fieldType: 'string', required: true, multiline: true, categoryId: 'content' },
        errorCorrection: { fieldType: 'string', required: true, options: qrErrorCorrectionOptions, categoryId: 'content' },
        quietZone: { fieldType: 'number', required: true, min: 0, max: 16, categoryId: 'content' },
        foreground: { fieldType: 'color', required: true, categoryId: 'graphicStyle' },
        backgroundColor: { fieldType: 'color', required: true, categoryId: 'graphicStyle' },
    },
    'shape-block': {
        ...createBaseBlockPropertyEditorSchema(),
        shape: { fieldType: 'string', required: true, options: shapeOptions, categoryId: 'content' },
        fill: { fieldType: 'color', required: true, categoryId: 'graphicStyle' },
        stroke: { fieldType: 'color', required: true, categoryId: 'graphicStyle' },
        strokeWidth: { fieldType: 'number', required: true, min: 0, categoryId: 'graphicStyle' },
        strokeStyle: { fieldType: 'string', required: true, options: shapeStrokeStyleOptions, categoryId: 'graphicStyle' },
        strokeAlignment: { fieldType: 'string', required: true, options: shapeStrokeAlignmentOptions, categoryId: 'graphicStyle' },
        strokeJoin: { fieldType: 'string', required: true, options: shapeStrokeJoinOptions, categoryId: 'graphicStyle' },
        strokeCap: { fieldType: 'string', required: true, options: shapeStrokeCapOptions, categoryId: 'graphicStyle' },
        strokeMiterLimit: { fieldType: 'number', required: true, min: 1, categoryId: 'graphicStyle' },
    },
    'simple-container-block': {
        ...createBaseBlockPropertyEditorSchema(),
        packaged: { fieldType: 'boolean', isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
        clip: { fieldType: 'boolean', required: true, categoryId: 'container' },
        children: { fieldType: 'object', objectType: 'CardBlock', required: true, isArray: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    },
    'flow-container-block': {
        ...createBaseBlockPropertyEditorSchema(),
        packaged: { fieldType: 'boolean', isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
        clip: { fieldType: 'boolean', required: true, categoryId: 'container' },
        direction: { fieldType: 'flowDirection', required: true, categoryId: 'container' },
        gap: { fieldType: 'string', required: true, autocomplete: cssLengthAutocomplete, categoryId: 'container' },
        children: { fieldType: 'object', objectType: 'CardBlock', required: true, isArray: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    },
    'custom-block': createCustomBlockPropertyEditorSchema(),
    'simple-container-location': {
        id: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        anchor: { fieldType: 'anchorPosition', required: true, categoryId: 'position' },
        x: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'position' },
        y: { fieldType: 'string', autocomplete: cssLengthAutocomplete, categoryId: 'position' },
    },
    'flow-container-location': {
        id: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        index: { fieldType: 'number', required: true, min: 0, categoryId: 'position' },
        align: { fieldType: 'alignPosition', categoryId: 'position' },
    },
    'card-document': {
        name: { fieldType: 'string', categoryId: 'general', bindingScopes: ['project'] },
        description: { fieldType: 'string', multiline: true, categoryId: 'general', bindingScopes: ['project'] },
        notes: { fieldType: 'string', multiline: true, categoryId: 'general', bindingScopes: ['project'] },
        version: { fieldType: 'string', required: true, categoryId: 'general', bindingScopes: ['project'] },
        width: { fieldType: 'number', required: true, min: 0, categoryId: 'size', bindingScopes: ['project'] },
        height: { fieldType: 'number', required: true, min: 0, categoryId: 'size', bindingScopes: ['project'] },
        id: { fieldType: 'string', required: true, categoryId: 'advanced', isReadonly: true, acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        faces: { fieldType: 'object', objectType: 'CardFace', required: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
        instances: { fieldType: 'object', objectType: 'CardInstanceRecord', required: true, isArray: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
        dataTable: { fieldType: 'object', objectType: 'CardDataTableConfiguration', isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    },
    'card-face': {
        type: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        id: { fieldType: 'string', required: true, categoryId: 'advanced', isReadonly: true, acceptsBinding: false },
        background: { fieldType: 'string', required: true, categoryId: 'surface' },
        children: { fieldType: 'object', objectType: 'RootChild', required: true, isArray: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    },
    'card-instance': {
        name: { fieldType: 'string', required: true, categoryId: 'general' },
        amount: { fieldType: 'number', required: true, min: 0, categoryId: 'general' },
        id: { fieldType: 'string', required: true, categoryId: 'advanced', isReadonly: true, acceptsBinding: false },
        type: { fieldType: 'string', required: true, isReadonly: true, categoryId: 'advanced', acceptsBinding: false, exposesReference: false },
        data: { fieldType: 'object', objectType: 'instanceData', required: true, isHidden: true, categoryId: 'data', acceptsBinding: false, exposesReference: false },
    },
}

/** 五种块的公共默认值：公共属性只写一遍，各型只补 `type` 与自己的字段。 */
const BASE_BLOCK_DEFAULTS = {
    id: '',
    name: '',
    notes: '',
    visible: 'true',
    width: '32%',
    height: '18%',
    translateX: '0px',
    translateY: '0px',
    scaleX: '1',
    scaleY: '1',
    transformAnchor: 'cc',
    zIndex: '0',
    rotation: '0',
    opacity: '1',
    borderColor: '#000000',
    borderWidth: '0',
    borderStyle: 'solid',
    borderRadius: '',
    background: '',
    customCss: '',
}

function createTextContentBlockDefaultValues(type: 'text-block' | 'markdown-text-block'): Record<string, unknown> {
    return {
        ...BASE_BLOCK_DEFAULTS,
        type,
        content: '',
        fontSize: '16px',
        fontFamily: '',
        fontWeight: 'normal',
        color: '#000000',
        textAlign: 'start',
        verticalAlign: 'top',
        lineHeight: '1.4em',
        writingMode: 'horizontal-tb',
    }
}

const schemaDefaultValuesByType: Record<string, Record<string, unknown>> = {
    'text-block': createTextContentBlockDefaultValues('text-block'),
    'markdown-text-block': createTextContentBlockDefaultValues('markdown-text-block'),
    'image-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'image-block',
        source: '',
        fit: 'cover',
    },
    'qrcode-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'qrcode-block',
        content: '',
        errorCorrection: 'M',
        foreground: '#000000',
        backgroundColor: '#FFFFFF',
        quietZone: '4',
    },
    'shape-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'shape-block',
        shape: 'rectangle',
        fill: '#7C6CFF',
        stroke: '#000000',
        strokeWidth: '0',
        strokeStyle: 'solid',
        strokeAlignment: 'center',
        strokeJoin: 'miter',
        strokeCap: 'butt',
        strokeMiterLimit: '4',
    },
    'simple-container-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'simple-container-block',
        packaged: 'false',
        clip: 'false',
        children: [],
    },
    'flow-container-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'flow-container-block',
        packaged: 'false',
        clip: 'false',
        direction: 'lr',
        gap: '10px',
        children: [],
    },
    'custom-block': {
        ...BASE_BLOCK_DEFAULTS,
        type: 'custom-block',
        source: '',
    },
    'simple-container-location': {
        id: '',
        type: 'simple-container-location',
        anchor: 'lt',
        x: '0px',
        y: '0px',
    },
    'flow-container-location': {
        id: '',
        type: 'flow-container-location',
        index: '0',
        align: 'start',
    },
    'card-document': {
        type: 'card-document',
        id: '',
        version: '1.0.0',
        width: '540',
        height: '850',
        faces: {
            front: { type: 'card-face', id: '', background: '#FFFFFF', children: [] },
            back: { type: 'card-face', id: '', background: '#FFFFFF', children: [] },
        },
        instances: [],
    },
    'card-face': {
        type: 'card-face',
        id: '',
        background: '#FFFFFF',
        children: [],
    },
    'card-instance': {
        type: 'card-instance',
        amount: '1',
        id: '',
        name: '',
    },
}

function applyDefaultsToSchema(schemaByType: TypePropertyDefinitions): TypePropertyDefinitions {
    const nextSchema: TypePropertyDefinitions = {}

    for (const [typeName, schema] of Object.entries(schemaByType)) {
        const defaults = schemaDefaultValuesByType[typeName] ?? {}
        const withDefaults: Record<string, EditorPropertyDefinition> = {}
        for (const [fieldName, definition] of Object.entries(schema)) {
            withDefaults[fieldName] = {
                ...definition,
                defaultValue: defaults[fieldName],
            } as EditorPropertyDefinition
        }
        nextSchema[typeName] = withDefaults
    }

    return nextSchema
}

/** 默认值派发出去之前必须与 schema 脱钩：交给平台自己的深拷贝。 */
const cloneDefaultValue = structuredClone

const nonOverridableFieldIdentities = new Set([
    'type',
    'id',
    'additionalfielddefinition',
    'children',
    'faces',
    'instances',
    'data',
    'packageid',
])

function markNonOverridableFields(schemaByType: TypePropertyDefinitions): TypePropertyDefinitions {
    return Object.fromEntries(Object.entries(schemaByType).map(([typeName, schema]) => [
        typeName,
        Object.fromEntries(Object.entries(schema).map(([fieldKey, definition]) => [
            fieldKey,
            nonOverridableFieldIdentities.has(fieldKey.toLocaleLowerCase())
                ? { ...definition, nonOverridable: true }
                : definition,
        ])),
    ]))
}

export const propertyEditorSchemaByType: TypePropertyDefinitions = markNonOverridableFields(
    applyDefaultsToSchema(rawPropertyEditorSchemaByType),
)

export function getTypePropertyEditorSchema(typeName: string | undefined): Record<string, EditorPropertyDefinition> {
    if (!typeName) {
        return {}
    }
    return propertyEditorSchemaByType[typeName] ?? {}
}

export type ResolvedPropertyEditorSchema = {
    fields: Readonly<Record<string, EditorPropertyDefinition>>
    labels: Readonly<Record<string, string>>
    customKeys: ReadonlySet<string>
}

const editorConstraintKeys = [
    'minLength', 'maxLength', 'options', 'optionLabelKeys', 'presentation', 'autocomplete', 'multiline', 'richText',
    'filter', 'min', 'max', 'step', 'objectType', 'isArray', 'defaultValue',
] as const

function createDefinitionForFieldType(
    base: EditorPropertyDefinition | undefined,
    fieldType: PropertyFieldType,
    fieldTypeChanged: boolean,
): Record<string, unknown> {
    const definition = base ? { ...base } as Record<string, unknown> : {}
    if (fieldTypeChanged) {
        for (const key of editorConstraintKeys) delete definition[key]
    }
    definition.fieldType = fieldType
    return definition
}

function applyAdditionalConstraints(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    fieldType: PropertyFieldType,
): void {
    if (fieldType === 'string') {
        const minLength = parseNonNegativeInteger(source.minLength)
        const maxLength = parseNonNegativeInteger(source.maxLength)
        if (minLength !== undefined) target.minLength = minLength
        if (maxLength !== undefined) target.maxLength = maxLength
        if (Array.isArray(source.options)) target.options = parseStringOptions(source.options)
        if (Array.isArray(source.autocomplete)) target.autocomplete = parseStringOptions(source.autocomplete)
        const optionLabelKeys = parseStringRecord(source.optionLabelKeys)
        if (optionLabelKeys) target.optionLabelKeys = optionLabelKeys
        if (source.presentation === 'select' || source.presentation === 'stepper') target.presentation = source.presentation
        if (typeof source.multiline === 'boolean') target.multiline = source.multiline
        if (typeof source.richText === 'boolean') target.richText = source.richText
        return
    }
    if (fieldType === 'filePath') {
        const minLength = parseNonNegativeInteger(source.minLength)
        const maxLength = parseNonNegativeInteger(source.maxLength)
        const filter = parseFilePathFilter(source.filter)
        if (minLength !== undefined) target.minLength = minLength
        if (maxLength !== undefined) target.maxLength = maxLength
        if (filter) target.filter = filter
        return
    }
    if (fieldType === 'number') {
        const min = parseFiniteNumber(source.min)
        const max = parseFiniteNumber(source.max)
        const step = parseFiniteNumber(source.step)
        if (min !== undefined) target.min = min
        if (max !== undefined) target.max = max
        if (step !== undefined && step > 0) target.step = step
    }
}

/** Resolve the editor-only field contract for one typed record. */
export function resolvePropertyEditorSchema(
    record: Readonly<Record<string, unknown>>,
): ResolvedPropertyEditorSchema {
    const typeName = typeof record.type === 'string' ? record.type : undefined
    const nativeSchema = getTypePropertyEditorSchema(typeName)
    const fields: Record<string, EditorPropertyDefinition> = { ...nativeSchema }
    const labels: Record<string, string> = {}
    const customKeys = new Set<string>()
    const nativeKeysByIdentity = new Map(
        Object.keys(nativeSchema).map(fieldKey => [fieldKey.toLocaleLowerCase(), fieldKey]),
    )
    const additional = record.additionalFieldDefinition
    if (!additional || typeof additional !== 'object' || Array.isArray(additional)) {
        return { fields, labels, customKeys }
    }

    const seenIdentities = new Set<string>()
    for (const [candidateKey, candidateValue] of Object.entries(additional)) {
        const identity = candidateKey.toLocaleLowerCase()
        if (seenIdentities.has(identity) || !additionalFieldKeyPattern.test(candidateKey)
            || !candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) {
            continue
        }
        seenIdentities.add(identity)
        const source = candidateValue as Record<string, unknown>
        const nativeKey = nativeKeysByIdentity.get(identity)
        const base = nativeKey ? nativeSchema[nativeKey] : undefined
        if (base?.nonOverridable) continue

        const requestedFieldType = typeof source.fieldType === 'string'
            && additionalFieldTypeSet.has(source.fieldType as PropertyFieldType)
            ? source.fieldType as PropertyFieldType
            : undefined
        const fieldType = requestedFieldType ?? base?.fieldType
        if (!fieldType) continue

        const fieldKey = nativeKey ?? candidateKey
        const target = createDefinitionForFieldType(base, fieldType, Boolean(base && fieldType !== base.fieldType))
        Object.assign(target, parseAdditionalEditorOptions(source))
        applyAdditionalConstraints(target, source, fieldType)
        fields[fieldKey] = target as EditorPropertyDefinition

        const title = typeof source.title === 'string' ? source.title.trim() : ''
        if (title) labels[fieldKey] = title
        if (!base) customKeys.add(fieldKey)
    }
    return { fields, labels, customKeys }
}

export function getPropertyValueKind(definition: EditorPropertyDefinition | undefined): BindingValueKind {
    if (!definition) return 'string'
    if (definition.fieldType === 'number') return 'number'
    if (definition.fieldType === 'boolean') return 'boolean'
    if (definition.fieldType === 'object') return 'object'
    return 'string'
}

export function createPropertyDefaultValue(definition: EditorPropertyDefinition): unknown {
    if (definition.defaultValue !== undefined) return cloneDefaultValue(definition.defaultValue)

    switch (definition.fieldType) {
        case 'string':
            return definition.options?.[0] ?? ''
        case 'filePath':
        case 'color':
            return ''
        case 'anchorPosition':
            return 'cc'
        case 'alignPosition':
            return 'start'
        case 'verticalAlignPosition':
            return 'top'
        case 'flowDirection':
            return 'lr'
        case 'number':
            return String(definition.min ?? 0)
        case 'boolean':
            return 'false'
        case 'object':
            return definition.isArray ? [] : {}
    }
}

export function acceptsPropertyBinding(definition: EditorPropertyDefinition | undefined): boolean {
    return definition?.acceptsBinding !== false && getPropertyValueKind(definition) !== 'object'
}

export function acceptsPropertyBindingScope(
    definition: EditorPropertyDefinition | undefined,
    scope: BindingScopeKind,
): boolean {
    return acceptsPropertyBinding(definition)
        && (!definition?.bindingScopes || definition.bindingScopes.includes(scope))
}

export function exposesPropertyReference(definition: EditorPropertyDefinition | undefined): boolean {
    return definition?.exposesReference !== false && getPropertyValueKind(definition) !== 'object'
}

export function isReferenceFieldExposed(typeName: string | undefined, fieldName: string): boolean {
    const schema = getTypePropertyEditorSchema(typeName)
    return exposesPropertyReference(schema[fieldName])
}

// Return a cloned default value for one schema field, or undefined if absent.
export function getDefault(typeName: string | undefined, fieldName: string): unknown {
    const schema = getTypePropertyEditorSchema(typeName)
    const definition = schema[fieldName]
    if (!definition || definition.defaultValue === undefined) {
        return undefined
    }
    return cloneDefaultValue(definition.defaultValue)
}

// Resolve only existing null/undefined fields in a target object using schema defaults.
export function resolveNulls(
    typeName: string | undefined,
    target: Record<string, unknown> | undefined
): Record<string, unknown> {
    const source = target ?? {}
    const schema = getTypePropertyEditorSchema(typeName)
    if (Object.keys(schema).length === 0) {
        return { ...source }
    }

    const resolved: Record<string, unknown> = { ...source }
    for (const key of Object.keys(source)) {
        const definition = schema[key]
        if (!definition || definition.defaultValue === undefined) {
            continue
        }

        const currentValue = source[key]
        if (currentValue === null || currentValue === undefined) {
            resolved[key] = cloneDefaultValue(definition.defaultValue)
        }
    }

    return resolved
}

// 使用此函数给一个Record按照type去schema里补齐默认值。会克隆默认值以避免引用类型的共享。
export function fillDefaults(
    typeName: string | undefined,
    target: Record<string, unknown> | undefined
): Record<string, unknown> {
    const schema = getTypePropertyEditorSchema(typeName)
    const source = target ?? {}
    if (Object.keys(schema).length === 0) {
        return { ...source }
    }

    const materialized: Record<string, unknown> = { ...source }

    for (const [fieldName, definition] of Object.entries(schema)) {
        const hasOwnValue = Object.prototype.hasOwnProperty.call(source, fieldName)
        const currentValue = source[fieldName]
        const shouldUseDefault = !hasOwnValue || currentValue === null || currentValue === undefined
        if (!shouldUseDefault || definition.defaultValue === undefined) {
            continue
        }
        materialized[fieldName] = cloneDefaultValue(definition.defaultValue)
    }

    return materialized
}
