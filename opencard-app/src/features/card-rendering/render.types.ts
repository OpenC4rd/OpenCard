import type {
  AlignmentPosition,
  AnchorPosition,
  FlowDirection,
  TextWritingMode,
  VerticalAlignmentPosition,
  CardFaceKey,
} from '../../entities/card/model'
import type { CardPipelineIssue } from './cardPipelineIssue'

export type RenderReadyBaseBlock = {
  id: string
  name: string
  notes: string
  visible: boolean
  width: string
  height: string
  borderColor: string
  borderWidth: number
  borderStyle: 'solid' | 'dashed' | 'dotted'
  borderRadius: string
  background: string
  translateX: string
  translateY: string
  scaleX: number
  scaleY: number
  transformAnchor: AnchorPosition
  zIndex: number
  rotation: number
  opacity: number
  customCss: string
  [fieldKey: string]: unknown
}

type RenderReadyTextContentBlock = RenderReadyBaseBlock & {
  content: string
  fontSize: string
  fontFamily: string
  fontWeight: 'light' | 'normal' | 'bold'
  color: string
  textAlign: AlignmentPosition
  verticalAlign: VerticalAlignmentPosition
  lineHeight: string
  writingMode: TextWritingMode
}

export type RenderReadyTextBlock = RenderReadyTextContentBlock & {
  type: 'text-block'
}

export type RenderReadyMarkdownTextBlock = RenderReadyTextContentBlock & {
  type: 'markdown-text-block'
}

export type RenderReadyImageBlock = RenderReadyBaseBlock & {
  type: 'image-block'
  source: string
  fit: 'cover' | 'contain' | 'fill'
}

export type RenderReadyQrCodeBlock = RenderReadyBaseBlock & {
  type: 'qrcode-block'
  content: string
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
  foreground: string
  backgroundColor: string
  quietZone: number
}

export type RenderReadyShapeBlock = RenderReadyBaseBlock & {
  type: 'shape-block'
  shape: 'rectangle' | 'ellipse' | 'line' | 'triangle' | 'diamond'
  fill: string
  stroke: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  strokeAlignment: 'inside' | 'center' | 'outside'
  strokeJoin: 'miter' | 'round' | 'bevel'
  strokeCap: 'butt' | 'round' | 'square'
  strokeMiterLimit: number
}

export type RenderReadySimpleContainerLocation = {
  id: string
  type: 'simple-container-location'
  anchor: AnchorPosition
  x: string
  y: string
}

export type RenderReadyFlowContainerLocation = {
  id: string
  type: 'flow-container-location'
  index: number
  align: AlignmentPosition
}

export type RenderReadySimpleContainerChild = {
  block: RenderReadyCardBlock
  location: RenderReadySimpleContainerLocation
}

export type RenderReadyFlowContainerChild = {
  block: RenderReadyCardBlock
  location: RenderReadyFlowContainerLocation
}

export type RenderReadySimpleContainerBlock = RenderReadyBaseBlock & {
  type: 'simple-container-block'
  clip: boolean
  children: RenderReadySimpleContainerChild[]
}

export type RenderReadyFlowContainerBlock = RenderReadyBaseBlock & {
  type: 'flow-container-block'
  clip: boolean
  direction: FlowDirection
  gap: string
  children: RenderReadyFlowContainerChild[]
}

export type RenderReadyCustomBlock = RenderReadyBaseBlock & {
  type: 'custom-block'
  id: string
  source: string
  state: 'ready' | 'source-unavailable' | 'limited'
  content: RenderReadySimpleContainerBlock | RenderReadyFlowContainerBlock
}

export type RenderReadyCardBlock =
  | RenderReadyTextBlock
  | RenderReadyMarkdownTextBlock
  | RenderReadyImageBlock
  | RenderReadyQrCodeBlock
  | RenderReadyShapeBlock
  | RenderReadySimpleContainerBlock
  | RenderReadyFlowContainerBlock
  | RenderReadyCustomBlock

export type RenderReadyCardFace = {
  type: 'card-face'
  id: string
  faceKey: CardFaceKey
  width: number
  height: number
  background: string
  children: RenderReadySimpleContainerChild[]
}

export type RenderReadyCardDocument = {
  type: 'card-document'
  id: string
  name: string
  version: string
  description: string
  notes: string
  faces: Record<CardFaceKey, RenderReadyCardFace>
}

export type RenderParseResult = {
  document: RenderReadyCardDocument
  issues: CardPipelineIssue[]
}
