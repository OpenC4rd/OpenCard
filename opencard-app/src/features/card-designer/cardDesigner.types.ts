import type { CardFaceKey } from '../../entities/card/model'
import type { DockLayoutState } from '../../shared/ui/dock/dockGeometry'
import type { PreparedCardRender } from '../card-rendering/renderPipeline'
import type { EditorProps } from '../editor-runtime/editorProtocol'
import type { EditorViewportTransform } from '../editor-runtime/model/editorUiState'
import type { CdePreviewBackground } from './cdePreviewBackground'

type CardDesignerMode = 'design' | 'data-table'
export interface CardDesignerViewState {
  activeFace: CardFaceKey
  previewBackground?: CdePreviewBackground
  alignmentSnappingEnabled?: boolean
  selectedInstanceId: string | null
  selectedBlockIdsByFace?: Partial<Record<CardFaceKey, readonly string[]>>
}
export interface CardDesignerSessionView {
  mode?: CardDesignerMode
  viewportTransform?: EditorViewportTransform
  layout?: DockLayoutState
  view?: CardDesignerViewState
}
export interface CardDesignerProps extends EditorProps {
  renderCardImages?: (render: PreparedCardRender, faces: readonly CardFaceKey[], scale: number, outputs?: ReadonlyMap<CardFaceKey, string>, dpi?: number) => Promise<ReadonlyMap<CardFaceKey, Uint8Array> | null>
  imageExportBusy?: boolean
}
