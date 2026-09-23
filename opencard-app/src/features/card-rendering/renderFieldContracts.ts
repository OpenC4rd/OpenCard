import type { ResourceReferenceKind } from '../workspace/services/resourceReference'

export type RenderFieldKind =
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
  required?: boolean
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

function baseBlockContracts(type: string): Record<string, RenderFieldContract> {
  return {
    id: { kind: 'string', defaultValue: '', required: true },
    type: { kind: 'option', defaultValue: type, required: true, options: [type] },
    name: { kind: 'string', defaultValue: '' },
    notes: { kind: 'string', defaultValue: '' },
    visible: { kind: 'boolean', defaultValue: 'true' },
    width: { kind: 'css-length', defaultValue: '32%' },
    height: { kind: 'css-length', defaultValue: '18%' },
    borderColor: { kind: 'color', defaultValue: '#000000' },
    borderWidth: { kind: 'number', defaultValue: '0', min: 0 },
    borderStyle: { kind: 'option', defaultValue: 'solid', options: borderStyleOptions },
    borderRadius: { kind: 'css-length', defaultValue: '' },
    background: { kind: 'string', defaultValue: '' },
    translateX: { kind: 'css-length', defaultValue: '0px' },
    translateY: { kind: 'css-length', defaultValue: '0px' },
    scaleX: { kind: 'number', defaultValue: '1' },
    scaleY: { kind: 'number', defaultValue: '1' },
    transformAnchor: { kind: 'option', defaultValue: 'cc', options: anchorOptions },
    zIndex: { kind: 'number', defaultValue: '0' },
    rotation: { kind: 'number', defaultValue: '0' },
    opacity: { kind: 'number', defaultValue: '1', min: 0, max: 1 },
    customCss: { kind: 'string', defaultValue: '' },
  }
}

function textContracts(type: 'text-block' | 'markdown-text-block'): Record<string, RenderFieldContract> {
  return {
    ...baseBlockContracts(type),
    content: { kind: 'string', defaultValue: '' },
    fontSize: { kind: 'css-length', defaultValue: '' },
    fontFamily: { kind: 'string', defaultValue: '' },
    fontWeight: { kind: 'option', defaultValue: 'normal', options: ['light', 'normal', 'bold'] },
    color: { kind: 'color', defaultValue: '#000000', displayFieldKey: 'textColor' },
    textAlign: { kind: 'option', defaultValue: 'start', options: alignOptions },
    verticalAlign: { kind: 'option', defaultValue: 'top', options: verticalAlignOptions },
    lineHeight: { kind: 'css-length', defaultValue: '' },
    writingMode: {
      kind: 'option',
      defaultValue: 'horizontal-tb',
      options: ['horizontal-tb', 'vertical-rl', 'vertical-lr'],
    },
  }
}

const contractsByType: Readonly<Record<string, Readonly<Record<string, RenderFieldContract>>>> = {
  'card-document': {
    type: { kind: 'option', defaultValue: 'card-document', required: true, options: ['card-document'] },
    id: { kind: 'string', defaultValue: '', required: true },
    name: { kind: 'string', defaultValue: '' },
    version: { kind: 'string', defaultValue: '1.0.0', required: true },
    description: { kind: 'string', defaultValue: '' },
    notes: { kind: 'string', defaultValue: '' },
    width: { kind: 'number', defaultValue: '540', required: true, min: 0 },
    height: { kind: 'number', defaultValue: '850', required: true, min: 0 },
  },
  'card-face': {
    type: { kind: 'option', defaultValue: 'card-face', required: true, options: ['card-face'] },
    id: { kind: 'string', defaultValue: '', required: true },
    background: { kind: 'string', defaultValue: '#FFFFFF', required: true },
    children: { kind: 'array', defaultValue: [], required: true, itemShape: 'root-child' },
  },
  'text-block': textContracts('text-block'),
  'markdown-text-block': textContracts('markdown-text-block'),
  'image-block': {
    ...baseBlockContracts('image-block'),
    source: {
      kind: 'file-path',
      defaultValue: '',
      extensions: imageExtensions,
      allowRemote: true,
      acceptsReferences: ['icon'],
    },
    fit: { kind: 'option', defaultValue: 'cover', required: true, options: ['cover', 'contain', 'fill'] },
  },
  'qrcode-block': {
    ...baseBlockContracts('qrcode-block'),
    content: { kind: 'string', defaultValue: '', required: true },
    errorCorrection: { kind: 'option', defaultValue: 'M', required: true, options: ['L', 'M', 'Q', 'H'] },
    foreground: { kind: 'color', defaultValue: '#000000', required: true },
    backgroundColor: { kind: 'color', defaultValue: '#FFFFFF', required: true },
    quietZone: { kind: 'number', defaultValue: '4', required: true, min: 0, max: 16 },
  },
  'shape-block': {
    ...baseBlockContracts('shape-block'),
    shape: {
      kind: 'option', defaultValue: 'rectangle', required: true,
      options: ['rectangle', 'ellipse', 'line', 'triangle', 'diamond'],
    },
    fill: { kind: 'color', defaultValue: '#7C6CFF', required: true },
    stroke: { kind: 'color', defaultValue: '#000000', required: true },
    strokeWidth: { kind: 'number', defaultValue: '0', required: true, min: 0 },
    strokeStyle: { kind: 'option', defaultValue: 'solid', required: true, options: borderStyleOptions },
    strokeAlignment: {
      kind: 'option', defaultValue: 'center', required: true, options: ['inside', 'center', 'outside'],
    },
    strokeJoin: { kind: 'option', defaultValue: 'miter', required: true, options: ['miter', 'round', 'bevel'] },
    strokeCap: { kind: 'option', defaultValue: 'butt', required: true, options: ['butt', 'round', 'square'] },
    strokeMiterLimit: { kind: 'number', defaultValue: '4', required: true, min: 1 },
  },
  'simple-container-block': {
    ...baseBlockContracts('simple-container-block'),
    clip: { kind: 'boolean', defaultValue: 'false', required: true },
    children: { kind: 'array', defaultValue: [], required: true, itemShape: 'root-child' },
  },
  'flow-container-block': {
    ...baseBlockContracts('flow-container-block'),
    clip: { kind: 'boolean', defaultValue: 'false', required: true },
    direction: { kind: 'option', defaultValue: 'lr', required: true, options: flowDirectionOptions },
    gap: { kind: 'css-length', defaultValue: '10px', required: true },
    children: { kind: 'array', defaultValue: [], required: true, itemShape: 'root-child' },
  },
  'simple-container-location': {
    id: { kind: 'string', defaultValue: '', required: true },
    type: {
      kind: 'option', defaultValue: 'simple-container-location', required: true,
      options: ['simple-container-location'],
    },
    anchor: { kind: 'option', defaultValue: 'lt', required: true, options: anchorOptions },
    x: { kind: 'css-length', defaultValue: '0px' },
    y: { kind: 'css-length', defaultValue: '0px' },
  },
  'flow-container-location': {
    id: { kind: 'string', defaultValue: '', required: true },
    type: {
      kind: 'option', defaultValue: 'flow-container-location', required: true,
      options: ['flow-container-location'],
    },
    index: { kind: 'number', defaultValue: '0', required: true, min: 0 },
    align: { kind: 'option', defaultValue: 'start', options: alignOptions },
  },
}

export function getRenderFieldContract(typeName: string, fieldKey: string): RenderFieldContract | undefined {
  return contractsByType[typeName]?.[fieldKey]
}
