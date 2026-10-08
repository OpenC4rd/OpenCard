/** Shared viewport and comparison geometry; editor-specific state belongs to its editor. */
export interface EditorViewportTransform {
  x: number
  y: number
  scale: number
}

export type EditorDiffViewMode = 'split' | 'side-by-side'

export interface EditorDiffUiState {
  divider: number
  viewMode?: EditorDiffViewMode
}
