import type { EditorSession } from './session/editorSession'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { EditorDiffUiState } from './model/editorUiState'
import type { EditorIssueSnapshot, EditorNavigationResult, SessionNavigationToken } from './model/editorIssue'
import type { OcThemeColorOverrides, OcThemeId } from '../../shared/ui/foundation'
import type { ResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import type { EditorHistoryKind } from './history/editorHistoryManager'

export interface EditorCapabilities {
  content?: 'text' | 'none'
  history?: EditorHistoryKind
  immediateSave?: boolean
}

export interface EditorProps {
  session: EditorSession
  comparison?: EditorComparisonInput
  resourceRootPath?: string | null
  resourceEnvironment?: ResourceEnvironment | null
  themeId?: OcThemeId
  themeOverrides?: OcThemeColorOverrides
}

export interface EditorInstance {
  canSave?: boolean
  flush?: () => void | Promise<void>
  presentation?: EditorPresentation
  headerActions?: readonly (OcActionDefinition | string)[]
  onHeaderAction?: (key: string) => void | Promise<void>
  navigate?: (token: SessionNavigationToken) => EditorNavigationResult | Promise<EditorNavigationResult>
}

export interface EditorSnapshotContext {
  revisionId: string | null
  label: string
  content: string
  resourceRootPath?: string | null
  resourceEnvironment?: ResourceEnvironment | null
  sourceFilePath?: string | null

}

export interface EditorComparisonInput {
  before: EditorSnapshotContext
  after: EditorSnapshotContext
}

export interface EditorEmits {
  (e: 'update-diff-ui-state', value: EditorDiffUiState): void
  (e: 'issue-snapshot', snapshot: EditorIssueSnapshot): void
  (e: 'open-file', path: string): void
  (e: 'trash-file', path: string): void
}
