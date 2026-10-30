import type { ResourceReferenceKind } from '../workspace/services/resourceReference'

type RenderFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'option'
  | 'css-length'
  | 'color'
  | 'file-path'

export type RenderFieldContract = {
  kind: RenderFieldKind
  defaultValue: unknown
  min?: number
  max?: number
  options?: readonly string[]
  extensions?: readonly string[]
  allowRemote?: boolean
  /**
   * Resource reference kinds this path field also accepts, for example `作者/包名@版本#icon:collection/icon`.
   * A reference names an image by key instead of by path; it resolves to a path, so everything
   * downstream of resolution is identical to a literal path.
   */
  acceptsReferences?: readonly ResourceReferenceKind[]
  itemShape?: 'root-child'
  displayFieldKey?: string
}

const anchorOptions = ['lt', 'ct', 'rt', 'lc', 'cc', 'rc', 'lb', 'cb', 'rb'] as const
const alignOptions = ['start', 'center', 'end', 'justify'] as const
const verticalAlignOptions = ['top', 'center', 'bottom'] as const
const flowDirectionOptions = ['lr', 'rl', 'tb', 'bt'] as const
const borderStyleOptions = ['solid', 'dashed', 'dotted'] as const
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] as const
const imageSourceContract: RenderFieldContract = {
  kind: 'file-path', defaultValue: '', extensions: imageExtensions, allowRemote: true, acceptsReferences: ['icon'],
}

function baseBlockContracts(type: string): Record<string, RenderFieldContract> {
  return {
    id: { kind: 'string', defaultValue: '' },
    type: { kind: 'option', defaultValue: type, options: [type] },
    name: { kind: 'string', defaultValue: '' },
    notes: { kind: 'string', defaultValue: '' },
    visible: { kind: 'boolean', defaultValue: 'true' },
    width: { kind: 'css-length', defaultValue: '32%' },
    height: { kind: 'css-length', defaultValue: '18%' },
    borderColor: { kind: 'color', defaultValue: '#000000' },
    borderWidth: { kind: 'number', defaultValue: '0', min: 0 },
    borderStyle: { kind: 'option', defaultValue: 'solid', options: borderStyleOptions },
    borderRadius: { kind: 'css-length', defaultValue: '' },
    background: { kind: 'color', defaultValue: '' },
    translateX: { kind: 'css-length', defaultValue: '0mm' },
    translateY: { kind: 'css-length', defaultValue: '0mm' },
    scaleX: { kind: 'number', defaultValue: '1' },
    scaleY: { kind: 'number', defaultValue: '1' },
    transformAnchor: { kind: 'option', defaultValue: 'cc', options: anchorOptions },
    zIndex: { kind: 'number', defaultValue: '0' },
    rotation: { kind: 'number', defaultValue: '0' },
    opacity: { kind: 'number', defaultValue: '1', min: 0, max: 1 },
  }
}

function textContracts(): Record<string, RenderFieldContract> {
  return {
    ...baseBlockContracts('text-block'),
    content: { kind: 'string', defaultValue: '' },
    fontSize: { kind: 'css-length', defaultValue: '3.5mm' },
    fontFamily: { kind: 'string', defaultValue: '' },
    fontWeight: { kind: 'option', defaultValue: 'normal', options: ['light', 'normal', 'bold'] },
    color: { kind: 'color', defaultValue: '#000000', displayFieldKey: 'textColor' },
    textAlign: { kind: 'option', defaultValue: 'start', options: alignOptions },
    verticalAlign: { kind: 'option', defaultValue: 'top', options: verticalAlignOptions },
    lineHeight: { kind: 'css-length', defaultValue: '150%' },
    writingMode: {
      kind: 'option',
      defaultValue: 'horizontal-tb',
      options: ['horizontal-tb', 'vertical-rl', 'vertical-lr'],
    },
  }
}

const contractsByType: Readonly<Record<string, Readonly<Record<string, RenderFieldContract>>>> = {
  'card-document': {
    type: { kind: 'option', defaultValue: 'card-document', options: ['card-document'] },
    id: { kind: 'string', defaultValue: '' },
    name: { kind: 'string', defaultValue: '' },
    version: { kind: 'string', defaultValue: '1.0.0' },
    description: { kind: 'string', defaultValue: '' },
    notes: { kind: 'string', defaultValue: '' },
    width: { kind: 'number', defaultValue: '63', min: 0 },
    height: { kind: 'number', defaultValue: '88', min: 0 },
    dpi: { kind: 'number', defaultValue: '', min: 72 },
  },
  'card-face': {
    type: { kind: 'option', defaultValue: 'card-face', options: ['card-face'] },
    id: { kind: 'string', defaultValue: '' },
    background: { kind: 'color', defaultValue: '#FFFFFF' },
    children: { kind: 'array', defaultValue: [], itemShape: 'root-child' },
  },
  'text-block': textContracts(),
  'image-block': {
    ...baseBlockContracts('image-block'),
    source: { ...imageSourceContract, displayFieldKey: 'imageSource' },
    maskSource: { ...imageSourceContract, displayFieldKey: 'maskSource' },
    fit: { kind: 'option', defaultValue: 'cover', options: ['cover', 'contain', 'fill'] },
    maskFit: { kind: 'option', defaultValue: 'contain', options: ['cover', 'contain', 'fill'] },
  },
  'qrcode-block': {
    ...baseBlockContracts('qrcode-block'),
    content: { kind: 'string', defaultValue: '' },
    errorCorrection: { kind: 'option', defaultValue: 'M', options: ['L', 'M', 'Q', 'H'] },
    foreground: { kind: 'color', defaultValue: '#000000' },
    backgroundColor: { kind: 'color', defaultValue: '#FFFFFF' },
    quietZone: { kind: 'number', defaultValue: '4', min: 0, max: 16 },
  },
  'shape-block': {
    ...baseBlockContracts('shape-block'),
    shape: {
      kind: 'option', defaultValue: 'rectangle',
      options: ['rectangle', 'ellipse', 'line', 'triangle', 'diamond'],
    },
    fill: { kind: 'color', defaultValue: '#7C6CFF' },
    stroke: { kind: 'color', defaultValue: '#000000' },
    strokeWidth: { kind: 'number', defaultValue: '0', min: 0 },
    strokeStyle: { kind: 'option', defaultValue: 'solid', options: borderStyleOptions },
    strokeAlignment: {
      kind: 'option', defaultValue: 'center', options: ['inside', 'center', 'outside'],
    },
    strokeJoin: { kind: 'option', defaultValue: 'miter', options: ['miter', 'round', 'bevel'] },
    strokeCap: { kind: 'option', defaultValue: 'butt', options: ['butt', 'round', 'square'] },
    strokeMiterLimit: { kind: 'number', defaultValue: '4', min: 1 },
  },
  'simple-container-block': {
    ...baseBlockContracts('simple-container-block'),
    clip: { kind: 'boolean', defaultValue: 'false' },
    children: { kind: 'array', defaultValue: [], itemShape: 'root-child' },
  },
  'flow-container-block': {
    ...baseBlockContracts('flow-container-block'),
    clip: { kind: 'boolean', defaultValue: 'false' },
    direction: { kind: 'option', defaultValue: 'lr', options: flowDirectionOptions },
    gap: { kind: 'css-length', defaultValue: '2mm' },
    children: { kind: 'array', defaultValue: [], itemShape: 'root-child' },
  },
  'simple-container-location': {
    id: { kind: 'string', defaultValue: '' },
    type: {
      kind: 'option', defaultValue: 'simple-container-location',
      options: ['simple-container-location'],
    },
    anchor: { kind: 'option', defaultValue: 'lt', options: anchorOptions },
    x: { kind: 'css-length', defaultValue: '0mm' },
    y: { kind: 'css-length', defaultValue: '0mm' },
  },
  'flow-container-location': {
    id: { kind: 'string', defaultValue: '' },
    type: {
      kind: 'option', defaultValue: 'flow-container-location',
      options: ['flow-container-location'],
    },
    index: { kind: 'number', defaultValue: '0', min: 0 },
    align: { kind: 'option', defaultValue: 'start', options: alignOptions },
  },
}

export function getRenderFieldContract(typeName: string, fieldKey: string): RenderFieldContract | undefined {
  return contractsByType[typeName]?.[fieldKey]
}
