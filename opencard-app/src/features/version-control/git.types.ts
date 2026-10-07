export type GitErrorKind =
  | 'not-initialized'
  | 'already-initialized'
  | 'invalid-project-root'
  | 'path-outside-project'
  | 'not-found'
  | 'already-exists'
  | 'authentication-required'
  | 'conflict'
  | 'locked'
  | 'invalid-input'
  | 'non-fast-forward'
  | 'network'
  | 'git'
  | 'io'

export interface GitServiceError {
  kind: GitErrorKind
  message: string
  retryable: boolean
  authenticationRequired: boolean
}

export interface GitCommandResult<T> {
  ok: boolean
  value: T | null
  error: GitServiceError | null
  retryable: boolean
  authenticationRequired: boolean
  conflicted: boolean
  continuable: boolean
  abortable: boolean
}

export interface GitIdentity { name: string; email: string }

export interface RepositorySummary {
  initialized: boolean
  projectRoot: string
  head: string | null
  currentBranch: string | null
  state: string
  hasConflicts: boolean
  hasChanges: boolean
}

export interface GitStatusEntry {
  path: string
  indexNew: boolean
  indexModified: boolean
  indexDeleted: boolean
  worktreeNew: boolean
  worktreeModified: boolean
  worktreeDeleted: boolean
  conflicted: boolean
  ignored: boolean
}

export interface GitStatusResult {
  repository: RepositorySummary
  entries: GitStatusEntry[]
}

export interface PathRequest { paths: string[] }
export interface CommitRequest { message: string }
export type CommitChangedFileStatus = 'added' | 'modified' | 'deleted'
export interface CommitChangedFile { path: string; status: CommitChangedFileStatus }

export interface CommitSummary {
  id: string
  shortId: string
  summary: string
  message: string
  authorName: string
  authorEmail: string
  authoredAtSeconds: number
  parentIds: string[]
  changedFiles: CommitChangedFile[]
}

export interface HistoryRequest { limit?: number | null; start?: string | null }
export interface OperationState {
  repository: RepositorySummary
  operation: string
  conflicts: string[]
}

export interface FileHistoryRequest { path: string; limit?: number | null }
export interface RevisionFileRequest { revision: string; path: string }
export interface RevisionFileContent { path: string; content: string; binary: boolean }
export interface MaterializeRevisionRequest { revision: string }
export interface RevisionSnapshot { revision: string; rootPath: string }
export interface MergeRequest { revision: string; fastForwardOnly: boolean }
