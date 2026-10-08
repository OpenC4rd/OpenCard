import { invoke } from '@tauri-apps/api/core'
import type {
  CommitRequest,
  CommitSummary,
  FileHistoryRequest,
  GitCommandResult,
  GitIdentity,
  GitStatusResult,
  HistoryRequest,
  MergeRequest,
  MaterializeRevisionRequest,
  OperationState,
  PathRequest,
  RepositorySummary,
  RevisionFileContent,
  RevisionFileRequest,
  RevisionSnapshot,
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

export const readHistory = (projectRoot: string, request: HistoryRequest) =>
  invokeRequest<CommitSummary[], HistoryRequest>('git_history', projectRoot, request)

export const readFileHistory = (projectRoot: string, request: FileHistoryRequest) =>
  invokeRequest<CommitSummary[], FileHistoryRequest>('git_file_history', projectRoot, request)

export const readFileAtRevision = (projectRoot: string, request: RevisionFileRequest) =>
  invokeRequest<RevisionFileContent, RevisionFileRequest>('git_read_file_at_revision', projectRoot, request)

export const materializeRevision = (projectRoot: string, request: MaterializeRevisionRequest) =>
  invokeRequest<RevisionSnapshot, MaterializeRevisionRequest>('git_materialize_revision', projectRoot, request)

export const merge = (projectRoot: string, request: MergeRequest) =>
  invokeRequest<OperationState, MergeRequest>('git_merge', projectRoot, request)

export const releaseRevisionSnapshot = (rootPath: string): Promise<void> => invoke('git_release_revision_snapshot', { rootPath })
