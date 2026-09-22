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
export interface RevisionRequest { revision: string }
export interface NamedRequest { name: string }

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
export type DiffTarget = 'worktree' | 'index' | 'commit'
export interface DiffRequest {
  from?: string | null
  to: DiffTarget
  toCommit?: string | null
  path?: string | null
}

export interface DiffFileSummary {
  oldPath: string | null
  newPath: string | null
  status: string
  binary: boolean
}

export interface DiffResult { files: DiffFileSummary[]; patch: string }

export interface BranchSummary {
  name: string
  target: string | null
  local: boolean
  current: boolean
}

export interface CreateBranchRequest { name: string; start?: string | null; force: boolean }
export interface CheckoutRequest { revision: string; force: boolean }
export interface RenameRequest { name: string; newName: string; force: boolean }
export interface CreateTagRequest {
  name: string
  target?: string | null
  message: string
  force: boolean
}
export interface TagSummary { name: string; target: string }

export interface CreateStashRequest {
  message: string
  includeUntracked: boolean
  includeIgnored: boolean
}
export interface StashIndexRequest { index: number }
export interface StashSummary { index: number; message: string; id: string }

export type ResetMode = 'soft' | 'mixed' | 'hard'
export interface ResetRequest { revision: string; mode: ResetMode }
export interface OperationState {
  repository: RepositorySummary
  operation: string
  conflicts: string[]
}

export type GitAuthentication =
  | { type: 'anonymous' }
  | { type: 'ssh-agent'; username?: string | null }
  | { type: 'https-token'; username: string; token: string }

export interface RemoteSummary {
  name: string
  url: string | null
  pushUrl: string | null
}
export interface AddRemoteRequest { name: string; url: string }
export interface FetchRequest {
  remote: string
  refspecs: string[]
  authentication: GitAuthentication
}
export interface PushRequest extends FetchRequest {}
export interface CloneRequest {
  url: string
  branch?: string | null
  identity: GitIdentity
  authentication: GitAuthentication
}
export type PullStrategy = 'fast-forward-only' | 'merge' | 'rebase'
export interface PullRequest {
  remote: string
  branch: string
  strategy: PullStrategy
  authentication: GitAuthentication
}
export interface RemoteOperationResult {
  repository: RepositorySummary
  operation: string
  outcome: string
  conflicts: string[]
}

export interface ConfigRequest { key: string; value: string }
export interface ConfigEntry { key: string; value: string }
export interface FileHistoryRequest { path: string; limit?: number | null }
export interface RevisionFileRequest { revision: string; path: string }
export interface RevisionFileContent { path: string; content: string; binary: boolean }
export interface MaterializeRevisionRequest { revision: string }
export interface RevisionSnapshot { revision: string; rootPath: string }
export interface ConflictSide { path: string | null; id: string | null }
export interface ConflictEntry {
  ancestor: ConflictSide
  ours: ConflictSide
  theirs: ConflictSide
}
export interface MergeRequest { revision: string; fastForwardOnly: boolean }
export interface RebaseRequest { upstream: string; onto?: string | null }
