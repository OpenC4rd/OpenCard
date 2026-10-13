import type { CardFaceKey } from '../../entities/card/model'
import type { PreparedCardRender } from '../card-rendering/renderPipeline'
import type { EditorProps } from '../editor-runtime/editorProtocol'
import type { EditorViewportTransform } from '../editor-runtime/model/editorUiState'

export interface CardDesignerLayoutState {
  leftTopHeight: number | null
  rightTopHeight: number | null
  leftDockExtent: number
  rightDockExtent: number
  leftExpandedDockExtent: number
  rightExpandedDockExtent: number
}
export type CardDesignerMode = 'design' | 'data-table'
export interface CardDesignerViewState {
  activeFace: CardFaceKey
  clipToFace: boolean
  alignmentSnappingEnabled?: boolean
  selectedInstanceId: string | null
  selectedBlockIdsByFace?: Partial<Record<CardFaceKey, readonly string[]>>
}
export interface CardDesignerSessionView {
  mode?: CardDesignerMode
  viewportTransform?: EditorViewportTransform
  layout?: CardDesignerLayoutState
  view?: CardDesignerViewState
}
export interface CardDesignerProps extends EditorProps {
  renderCardImages?: (render: PreparedCardRender, faces: readonly CardFaceKey[], scale: number, outputs?: ReadonlyMap<CardFaceKey, string>) => Promise<ReadonlyMap<CardFaceKey, Uint8Array> | null>
  imageExportBusy?: boolean
  debugHideCdeOverlays?: boolean
  debugTransparentCdeViewport?: boolean
  debugPassiveCdeViewport?: boolean
}
