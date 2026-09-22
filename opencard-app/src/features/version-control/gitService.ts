import { invoke } from '@tauri-apps/api/core'

import type {
  AddRemoteRequest,
  BranchSummary,
  CheckoutRequest,
  CloneRequest,
  CommitRequest,
  CommitSummary,
  ConfigEntry,
  ConfigRequest,
  ConflictEntry,
  CreateBranchRequest,
  CreateStashRequest,
  CreateTagRequest,
  DiffRequest,
  DiffResult,
  FetchRequest,
  FileHistoryRequest,
  GitCommandResult,
  GitIdentity,
  GitStatusResult,
  HistoryRequest,
  MergeRequest,
  MaterializeRevisionRequest,
  NamedRequest,
  OperationState,
  PathRequest,
  PullRequest,
  PushRequest,
  RebaseRequest,
  RemoteOperationResult,
  RemoteSummary,
  RenameRequest,
  RepositorySummary,
  ResetRequest,
  RevisionRequest,
  RevisionFileContent,
  RevisionFileRequest,
  RevisionSnapshot,
  StashIndexRequest,
  StashSummary,
  TagSummary,
} from './git.types'

function invokeProject<T>(command: string, projectRoot: string): Promise<GitCommandResult<T>> {
  return invoke(command, { projectRoot })
}

function invokeRequest<T, TRequest>(
  command: string,
  projectRoot: string,
  request: TRequest,
): Promise<GitCommandResult<T>> {
  return invoke(command, { projectRoot, request })
}

export const inspectRepository = (projectRoot: string) =>
  invokeProject<RepositorySummary>('git_inspect', projectRoot)

export const initializeRepository = (projectRoot: string, identity: GitIdentity) =>
  invoke<GitCommandResult<RepositorySummary>>('git_initialize', { projectRoot, identity })

export const readStatus = (projectRoot: string) =>
  invokeProject<GitStatusResult>('git_status', projectRoot)
export const stagePaths = (projectRoot: string, request: PathRequest) =>
  invokeRequest<RepositorySummary, PathRequest>('git_stage', projectRoot, request)
export const stageAll = (projectRoot: string) =>
  invokeProject<RepositorySummary>('git_stage_all', projectRoot)
export const unstagePaths = (projectRoot: string, request: PathRequest) =>
  invokeRequest<RepositorySummary, PathRequest>('git_unstage', projectRoot, request)
export const unstageAll = (projectRoot: string) =>
  invokeProject<RepositorySummary>('git_unstage_all', projectRoot)
export const discardPaths = (projectRoot: string, request: PathRequest) =>
  invokeRequest<RepositorySummary, PathRequest>('git_discard', projectRoot, request)

export const createCommit = (projectRoot: string, request: CommitRequest) =>
  invokeRequest<CommitSummary, CommitRequest>('git_commit', projectRoot, request)
export const amendCommit = (projectRoot: string, request: CommitRequest) =>
  invokeRequest<CommitSummary, CommitRequest>('git_amend', projectRoot, request)
export const readHistory = (projectRoot: string, request: HistoryRequest) =>
  invokeRequest<CommitSummary[], HistoryRequest>('git_history', projectRoot, request)
export const readCommitSummary = (projectRoot: string, request: RevisionRequest) =>
  invokeRequest<CommitSummary, RevisionRequest>('git_commit_summary', projectRoot, request)
export const readDiff = (projectRoot: string, request: DiffRequest) =>
  invokeRequest<DiffResult, DiffRequest>('git_diff', projectRoot, request)
export const readFileHistory = (projectRoot: string, request: FileHistoryRequest) =>
  invokeRequest<CommitSummary[], FileHistoryRequest>('git_file_history', projectRoot, request)
export const readFileAtRevision = (projectRoot: string, request: RevisionFileRequest) =>
  invokeRequest<RevisionFileContent, RevisionFileRequest>('git_read_file_at_revision', projectRoot, request)
export const materializeRevision = (projectRoot: string, request: MaterializeRevisionRequest) =>
  invokeRequest<RevisionSnapshot, MaterializeRevisionRequest>('git_materialize_revision', projectRoot, request)

export const listBranches = (projectRoot: string) =>
  invokeProject<BranchSummary[]>('git_branches', projectRoot)
export const createBranch = (projectRoot: string, request: CreateBranchRequest) =>
  invokeRequest<BranchSummary, CreateBranchRequest>('git_create_branch', projectRoot, request)
export const checkout = (projectRoot: string, request: CheckoutRequest) =>
  invokeRequest<RepositorySummary, CheckoutRequest>('git_checkout', projectRoot, request)
export const deleteBranch = (projectRoot: string, request: NamedRequest) =>
  invokeRequest<RepositorySummary, NamedRequest>('git_delete_branch', projectRoot, request)
export const renameBranch = (projectRoot: string, request: RenameRequest) =>
  invokeRequest<BranchSummary, RenameRequest>('git_rename_branch', projectRoot, request)

export const listTags = (projectRoot: string) =>
  invokeProject<TagSummary[]>('git_tags', projectRoot)
export const createTag = (projectRoot: string, request: CreateTagRequest) =>
  invokeRequest<TagSummary, CreateTagRequest>('git_create_tag', projectRoot, request)
export const deleteTag = (projectRoot: string, request: NamedRequest) =>
  invokeRequest<RepositorySummary, NamedRequest>('git_delete_tag', projectRoot, request)

export const listStashes = (projectRoot: string) =>
  invokeProject<StashSummary[]>('git_stashes', projectRoot)
export const createStash = (projectRoot: string, request: CreateStashRequest) =>
  invokeRequest<StashSummary, CreateStashRequest>('git_create_stash', projectRoot, request)
export const applyStash = (projectRoot: string, request: StashIndexRequest) =>
  invokeRequest<RepositorySummary, StashIndexRequest>('git_apply_stash', projectRoot, request)
export const dropStash = (projectRoot: string, request: StashIndexRequest) =>
  invokeRequest<RepositorySummary, StashIndexRequest>('git_drop_stash', projectRoot, request)

export const resetRepository = (projectRoot: string, request: ResetRequest) =>
  invokeRequest<RepositorySummary, ResetRequest>('git_reset', projectRoot, request)
export const cherryPick = (projectRoot: string, request: RevisionRequest) =>
  invokeRequest<OperationState, RevisionRequest>('git_cherry_pick', projectRoot, request)
export const revertCommit = (projectRoot: string, request: RevisionRequest) =>
  invokeRequest<OperationState, RevisionRequest>('git_revert', projectRoot, request)
export const cleanupOperationState = (projectRoot: string) =>
  invokeProject<RepositorySummary>('git_cleanup_state', projectRoot)
export const readConflicts = (projectRoot: string) =>
  invokeProject<ConflictEntry[]>('git_conflicts', projectRoot)
export const merge = (projectRoot: string, request: MergeRequest) =>
  invokeRequest<OperationState, MergeRequest>('git_merge', projectRoot, request)
export const startRebase = (projectRoot: string, request: RebaseRequest) =>
  invokeRequest<OperationState, RebaseRequest>('git_rebase_start', projectRoot, request)
export const continueRebase = (projectRoot: string) =>
  invokeProject<OperationState>('git_rebase_continue', projectRoot)
export const abortOperation = (projectRoot: string) =>
  invokeProject<RepositorySummary>('git_abort_operation', projectRoot)

export const listRemotes = (projectRoot: string) =>
  invokeProject<RemoteSummary[]>('git_remotes', projectRoot)
export const addRemote = (projectRoot: string, request: AddRemoteRequest) =>
  invokeRequest<RemoteSummary, AddRemoteRequest>('git_add_remote', projectRoot, request)
export const deleteRemote = (projectRoot: string, request: NamedRequest) =>
  invokeRequest<RepositorySummary, NamedRequest>('git_delete_remote', projectRoot, request)
export const renameRemote = (projectRoot: string, request: RenameRequest) =>
  invokeRequest<RemoteSummary, RenameRequest>('git_rename_remote', projectRoot, request)
export const fetchRemote = (projectRoot: string, request: FetchRequest) =>
  invokeRequest<RemoteOperationResult, FetchRequest>('git_fetch', projectRoot, request)
export const pushRemote = (projectRoot: string, request: PushRequest) =>
  invokeRequest<RemoteOperationResult, PushRequest>('git_push', projectRoot, request)
export const pullRemote = (projectRoot: string, request: PullRequest) =>
  invokeRequest<RemoteOperationResult, PullRequest>('git_pull', projectRoot, request)
export const cloneRepository = (projectRoot: string, request: CloneRequest) =>
  invokeRequest<RepositorySummary, CloneRequest>('git_clone', projectRoot, request)

export const readConfig = (projectRoot: string) =>
  invokeProject<ConfigEntry[]>('git_read_config', projectRoot)
export const writeConfig = (projectRoot: string, request: ConfigRequest) =>
  invokeRequest<ConfigEntry, ConfigRequest>('git_write_config', projectRoot, request)
