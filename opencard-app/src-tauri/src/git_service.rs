use git2::{
    build::{CheckoutBuilder, RepoBuilder},
    BranchType, Cred, DiffFormat, DiffOptions, ErrorClass, ErrorCode, FetchOptions, IndexAddOption,
    ObjectType, Oid, PushOptions, RemoteCallbacks, Repository, RepositoryState, ResetType, Sort,
    StashApplyOptions, StashFlags, Status, StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_GITIGNORE: &str = ".opencard-init-*\n";
static GIT_OPERATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GitErrorKind {
    NotInitialized,
    AlreadyInitialized,
    InvalidProjectRoot,
    PathOutsideProject,
    NotFound,
    AlreadyExists,
    AuthenticationRequired,
    Conflict,
    Locked,
    InvalidInput,
    NonFastForward,
    Network,
    Git,
    Io,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitServiceError {
    pub kind: GitErrorKind,
    pub message: String,
    pub retryable: bool,
    pub authentication_required: bool,
}

impl GitServiceError {
    fn new(kind: GitErrorKind, message: impl Into<String>) -> Self {
        let authentication_required = kind == GitErrorKind::AuthenticationRequired;
        let retryable = matches!(kind, GitErrorKind::Locked | GitErrorKind::Network);
        Self {
            kind,
            message: message.into(),
            retryable,
            authentication_required,
        }
    }

    fn from_git(error: git2::Error) -> Self {
        let kind = match error.code() {
            ErrorCode::Auth | ErrorCode::Certificate => GitErrorKind::AuthenticationRequired,
            ErrorCode::NotFound | ErrorCode::UnbornBranch => GitErrorKind::NotFound,
            ErrorCode::Exists => GitErrorKind::AlreadyExists,
            ErrorCode::Conflict | ErrorCode::MergeConflict => GitErrorKind::Conflict,
            ErrorCode::Locked => GitErrorKind::Locked,
            ErrorCode::InvalidSpec | ErrorCode::Ambiguous => GitErrorKind::InvalidInput,
            ErrorCode::NotFastForward => GitErrorKind::NonFastForward,
            _ if matches!(
                error.class(),
                ErrorClass::Net | ErrorClass::Http | ErrorClass::Ssh
            ) =>
            {
                GitErrorKind::Network
            }
            _ => GitErrorKind::Git,
        };
        Self::new(kind, error.message())
    }

    fn from_io(error: std::io::Error) -> Self {
        Self::new(GitErrorKind::Io, error.to_string())
    }
}

pub type GitServiceResult<T> = Result<T, GitServiceError>;

fn run_exclusive<T>(operation: impl FnOnce() -> GitServiceResult<T>) -> GitServiceResult<T> {
    // 命令是并发执行的（`#[tauri::command(async)]`），同一时刻会有多个 git 操作在飞：
    // 打开项目时界面就并行读状态、历史、文件历史。这里必须排队等待，不能直接报
    // "另一个操作正在运行"——那等于用界面自己的读取把界面顶掉，协作侧栏会整块空着。
    // 持锁线程 panic 只污染锁本身，取回内层值继续用，别让一次失败让所有 git 命令永久不可用。
    let _guard = GIT_OPERATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    operation()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult<T> {
    pub ok: bool,
    pub value: Option<T>,
    pub error: Option<GitServiceError>,
    pub retryable: bool,
    pub authentication_required: bool,
    pub conflicted: bool,
    pub continuable: bool,
    pub abortable: bool,
}

impl<T> From<GitServiceResult<T>> for GitCommandResult<T> {
    fn from(result: GitServiceResult<T>) -> Self {
        match result {
            Ok(value) => Self {
                ok: true,
                value: Some(value),
                error: None,
                retryable: false,
                authentication_required: false,
                conflicted: false,
                continuable: false,
                abortable: false,
            },
            Err(error) => {
                let conflicted = error.kind == GitErrorKind::Conflict;
                Self {
                    ok: false,
                    value: None,
                    retryable: error.retryable,
                    authentication_required: error.authentication_required,
                    conflicted,
                    continuable: conflicted,
                    abortable: conflicted,
                    error: Some(error),
                }
            }
        }
    }
}

fn command_result_with_conflicts<T>(
    result: GitServiceResult<T>,
    has_conflicts: impl FnOnce(&T) -> bool,
) -> GitCommandResult<T> {
    let mut response: GitCommandResult<T> = result.into();
    if response.value.as_ref().is_some_and(has_conflicts) {
        response.conflicted = true;
        response.continuable = true;
        response.abortable = true;
    }
    response
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySummary {
    pub initialized: bool,
    pub project_root: String,
    pub head: Option<String>,
    pub current_branch: Option<String>,
    pub state: String,
    pub has_conflicts: bool,
    pub has_changes: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub index_new: bool,
    pub index_modified: bool,
    pub index_deleted: bool,
    pub worktree_new: bool,
    pub worktree_modified: bool,
    pub worktree_deleted: bool,
    pub conflicted: bool,
    pub ignored: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub repository: RepositorySummary,
    pub entries: Vec<GitStatusEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRequest {
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRequest {
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitChangedFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at_seconds: i64,
    pub parent_ids: Vec<String>,
    pub changed_files: Vec<CommitChangedFile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRequest {
    pub limit: Option<usize>,
    pub start: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffTarget {
    Worktree,
    Index,
    Commit,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRequest {
    pub from: Option<String>,
    pub to: DiffTarget,
    pub to_commit: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileSummary {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub files: Vec<DiffFileSummary>,
    pub patch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    pub name: String,
    pub target: Option<String>,
    pub local: bool,
    pub current: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchRequest {
    pub name: String,
    pub start: Option<String>,
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutRequest {
    pub revision: String,
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRequest {
    pub name: String,
    pub new_name: String,
    pub force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedRequest {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagRequest {
    pub name: String,
    pub target: Option<String>,
    pub message: String,
    pub force: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub name: String,
    pub target: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStashRequest {
    pub message: String,
    pub include_untracked: bool,
    pub include_ignored: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashIndexRequest {
    pub index: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashSummary {
    pub index: usize,
    pub message: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetRequest {
    pub revision: String,
    pub mode: ResetMode,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionRequest {
    pub revision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationState {
    pub repository: RepositorySummary,
    pub operation: String,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum GitAuthentication {
    Anonymous,
    SshAgent { username: Option<String> },
    HttpsToken { username: String, token: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSummary {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRemoteRequest {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub remote: String,
    pub refspecs: Vec<String>,
    pub authentication: GitAuthentication,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub remote: String,
    pub refspecs: Vec<String>,
    pub authentication: GitAuthentication,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneRequest {
    pub url: String,
    pub branch: Option<String>,
    pub identity: GitIdentity,
    pub authentication: GitAuthentication,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PullStrategy {
    FastForwardOnly,
    Merge,
    Rebase,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub remote: String,
    pub branch: String,
    pub strategy: PullStrategy,
    pub authentication: GitAuthentication,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOperationResult {
    pub repository: RepositorySummary,
    pub operation: String,
    pub outcome: String,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigRequest {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryRequest {
    pub path: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionFileRequest {
    pub revision: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionFileContent {
    pub path: String,
    pub content: String,
    pub binary: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterializeRevisionRequest {
    pub revision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionSnapshot {
    pub revision: String,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSide {
    pub path: Option<String>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictEntry {
    pub ancestor: ConflictSide,
    pub ours: ConflictSide,
    pub theirs: ConflictSide,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequest {
    pub revision: String,
    pub fast_forward_only: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseRequest {
    pub upstream: String,
    pub onto: Option<String>,
}

fn canonical_project_root(project_root: &str) -> GitServiceResult<PathBuf> {
    if project_root.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Project root is required",
        ));
    }
    let root = std::fs::canonicalize(project_root).map_err(GitServiceError::from_io)?;
    if !root.is_dir() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Project root must be an existing directory",
        ));
    }
    Ok(root)
}

fn normalized_path_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn open_exact_repository(project_root: &str) -> GitServiceResult<(PathBuf, Repository)> {
    let root = canonical_project_root(project_root)?;
    let git_path = root.join(".git");
    if !git_path.exists() {
        return Err(GitServiceError::new(
            GitErrorKind::NotInitialized,
            "The project root does not contain a Git repository",
        ));
    }
    let git_metadata = std::fs::symlink_metadata(&git_path).map_err(GitServiceError::from_io)?;
    if git_metadata.file_type().is_symlink() || !git_metadata.is_dir() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "The project .git path must be a directory owned by the project root",
        ));
    }
    let repository = Repository::open(&root).map_err(GitServiceError::from_git)?;
    let workdir = repository.workdir().ok_or_else(|| {
        GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Bare repositories cannot be used as OpenCard projects",
        )
    })?;
    let canonical_workdir = std::fs::canonicalize(workdir).map_err(GitServiceError::from_io)?;
    if canonical_workdir != root {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Git repository work directory does not match the project root",
        ));
    }
    Ok((root, repository))
}

fn validate_relative_path(path: &str) -> GitServiceResult<&Path> {
    let candidate = Path::new(path);
    if path.trim().is_empty() || candidate.is_absolute() {
        return Err(GitServiceError::new(
            GitErrorKind::PathOutsideProject,
            "A non-empty project-relative path is required",
        ));
    }
    if candidate.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(GitServiceError::new(
            GitErrorKind::PathOutsideProject,
            "Path must remain inside the project root",
        ));
    }
    Ok(candidate)
}

fn repository_state_name(state: RepositoryState) -> String {
    format!("{state:?}").to_lowercase()
}

fn repository_summary(root: &Path, repository: &Repository) -> GitServiceResult<RepositorySummary> {
    let head = repository.head().ok();
    let head_oid = head
        .as_ref()
        .and_then(|reference| reference.target())
        .map(|oid| oid.to_string());
    let current_branch = head
        .as_ref()
        .filter(|reference| reference.is_branch())
        .and_then(|reference| reference.shorthand().ok())
        .map(str::to_owned);
    let statuses = repository
        .statuses(None)
        .map_err(GitServiceError::from_git)?;
    let has_conflicts = statuses.iter().any(|entry| entry.status().is_conflicted());
    Ok(RepositorySummary {
        initialized: true,
        project_root: root.to_string_lossy().replace('\\', "/"),
        head: head_oid,
        current_branch,
        state: repository_state_name(repository.state()),
        has_conflicts,
        has_changes: !statuses.is_empty(),
    })
}

pub fn inspect_repository(project_root: &str) -> GitServiceResult<RepositorySummary> {
    let root = canonical_project_root(project_root)?;
    if !root.join(".git").exists() {
        return Ok(RepositorySummary {
            initialized: false,
            project_root: root.to_string_lossy().replace('\\', "/"),
            head: None,
            current_branch: None,
            state: "none".to_string(),
            has_conflicts: false,
            has_changes: false,
        });
    }
    let (_, repository) = open_exact_repository(project_root)?;
    repository_summary(&root, &repository)
}

pub fn initialize_repository(
    project_root: &str,
    identity: &GitIdentity,
) -> GitServiceResult<RepositorySummary> {
    let root = canonical_project_root(project_root)?;
    if root.join(".git").exists() {
        return Err(GitServiceError::new(
            GitErrorKind::AlreadyInitialized,
            "The project root already contains a Git repository",
        ));
    }
    if identity.name.trim().is_empty() || identity.email.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Commit author name and email are required",
        ));
    }
    let ignore_path = root.join(".gitignore");
    if ignore_path.exists() {
        let metadata = std::fs::symlink_metadata(&ignore_path).map_err(GitServiceError::from_io)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(GitServiceError::new(
                GitErrorKind::InvalidInput,
                "Existing .gitignore must be a regular file",
            ));
        }
    }

    let repository = Repository::init(&root).map_err(GitServiceError::from_git)?;
    let mut config = repository.config().map_err(GitServiceError::from_git)?;
    config
        .set_str("user.name", identity.name.trim())
        .map_err(GitServiceError::from_git)?;
    config
        .set_str("user.email", identity.email.trim())
        .map_err(GitServiceError::from_git)?;

    if !ignore_path.exists() {
        std::fs::write(ignore_path, DEFAULT_GITIGNORE).map_err(GitServiceError::from_io)?;
    }
    repository_summary(&root, &repository)
}

pub fn read_status(project_root: &str) -> GitServiceResult<GitStatusResult> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        // 不递归列出未跟踪目录的内容：项目里一旦放进成百上千个资源文件（导入图标包、装资源包），
        // 逐文件扫描会让状态查询要好几秒，界面上就是"更改列表半天出不来"。
        // 未跟踪目录仍会作为一个条目出现，点开或提交时再逐文件处理。
        .recurse_untracked_dirs(false)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);
    let statuses = repository
        .statuses(Some(&mut options))
        .map_err(GitServiceError::from_git)?;
    let entries = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path().ok()?.replace('\\', "/");
            let status = entry.status();
            Some(GitStatusEntry {
                path,
                index_new: status.contains(Status::INDEX_NEW),
                index_modified: status.intersects(
                    Status::INDEX_MODIFIED | Status::INDEX_RENAMED | Status::INDEX_TYPECHANGE,
                ),
                index_deleted: status.contains(Status::INDEX_DELETED),
                worktree_new: status.contains(Status::WT_NEW),
                worktree_modified: status
                    .intersects(Status::WT_MODIFIED | Status::WT_RENAMED | Status::WT_TYPECHANGE),
                worktree_deleted: status.contains(Status::WT_DELETED),
                conflicted: status.is_conflicted(),
                ignored: status.is_ignored(),
            })
        })
        .collect();
    Ok(GitStatusResult {
        repository: repository_summary(&root, &repository)?,
        entries,
    })
}

fn resolve_oid(repository: &Repository, revision: &str) -> GitServiceResult<Oid> {
    repository
        .revparse_single(revision)
        .map(|object| object.id())
        .map_err(GitServiceError::from_git)
}

fn commit_summary(commit: &git2::Commit<'_>) -> CommitSummary {
    let author = commit.author();
    let id = commit.id().to_string();
    CommitSummary {
        short_id: id.chars().take(8).collect(),
        id,
        summary: commit
            .summary()
            .ok()
            .flatten()
            .unwrap_or_default()
            .to_string(),
        message: commit.message().unwrap_or_default().to_string(),
        author_name: author.name().unwrap_or_default().to_string(),
        author_email: author.email().unwrap_or_default().to_string(),
        authored_at_seconds: author.when().seconds(),
        parent_ids: commit.parent_ids().map(|id| id.to_string()).collect(),
        changed_files: Vec::new(),
    }
}

fn commit_changed_files(
    repository: &Repository,
    commit: &git2::Commit<'_>,
) -> GitServiceResult<Vec<CommitChangedFile>> {
    let tree = commit.tree().map_err(GitServiceError::from_git)?;
    let parent_tree = commit
        .parent(0)
        .ok()
        .and_then(|parent| parent.tree().ok());
    let diff = repository
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(GitServiceError::from_git)?;
    let mut files = diff
        .deltas()
        .filter_map(|delta| {
            let path = delta.new_file().path().or_else(|| delta.old_file().path())?;
            let status = match delta.status() {
                git2::Delta::Added | git2::Delta::Untracked => "added",
                git2::Delta::Deleted => "deleted",
                _ => "modified",
            };
            Some(CommitChangedFile {
                path: normalized_path_string(path),
                status: status.to_string(),
            })
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    files.dedup_by(|left, right| left.path == right.path);
    Ok(files)
}

pub fn stage_paths(
    project_root: &str,
    request: &PathRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut index = repository.index().map_err(GitServiceError::from_git)?;
    for raw_path in &request.paths {
        // 更改列表里未跟踪的目录是一条以 `/` 结尾的整体条目，索引与工作区里的路径都不带它。
        let relative = raw_path
            .trim_end_matches(|character| character == '/' || character == '\\')
            .replace('\\', "/");
        let path = validate_relative_path(&relative)?;
        if index.get_path(path, 0).is_none()
            && repository
                .status_should_ignore(path)
                .map_err(GitServiceError::from_git)?
        {
            return Err(GitServiceError::new(
                GitErrorKind::InvalidInput,
                format!("Path is ignored by Git: {}", path.to_string_lossy()),
            ));
        }
        let status = repository.status_file(path).unwrap_or(Status::CURRENT);
        if status.contains(Status::WT_DELETED) {
            index.remove_path(path).map_err(GitServiceError::from_git)?;
        } else if root.join(path).is_dir() {
            // 一个目录（整条未跟踪目录）要递归加入：`add_path` 只认单个文件。
            index
                .add_all([relative.as_str()].iter(), IndexAddOption::DEFAULT, None)
                .map_err(GitServiceError::from_git)?;
            index
                .update_all([relative.as_str()].iter(), None)
                .map_err(GitServiceError::from_git)?;
        } else {
            index.add_path(path).map_err(GitServiceError::from_git)?;
        }
    }
    index.write().map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn stage_all(project_root: &str) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut index = repository.index().map_err(GitServiceError::from_git)?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(GitServiceError::from_git)?;
    index
        .update_all(["*"].iter(), None)
        .map_err(GitServiceError::from_git)?;
    index.write().map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn unstage_paths(
    project_root: &str,
    request: &PathRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let paths = request
        .paths
        .iter()
        .map(|path| validate_relative_path(path).map(Path::to_path_buf))
        .collect::<GitServiceResult<Vec<_>>>()?;
    match repository.head() {
        Ok(head) => {
            let target = head.peel_to_commit().map_err(GitServiceError::from_git)?;
            repository
                .reset_default(Some(target.as_object()), paths.iter())
                .map_err(GitServiceError::from_git)?;
        }
        Err(error)
            if error.code() == ErrorCode::UnbornBranch || error.code() == ErrorCode::NotFound =>
        {
            let mut index = repository.index().map_err(GitServiceError::from_git)?;
            for path in paths {
                if index.get_path(&path, 0).is_some() {
                    index
                        .remove_path(&path)
                        .map_err(GitServiceError::from_git)?;
                }
            }
            index.write().map_err(GitServiceError::from_git)?;
        }
        Err(error) => return Err(GitServiceError::from_git(error)),
    }
    repository_summary(&root, &repository)
}

pub fn unstage_all(project_root: &str) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    match repository.head() {
        Ok(head) => {
            let target = head.peel_to_commit().map_err(GitServiceError::from_git)?;
            repository
                .reset(target.as_object(), ResetType::Mixed, None)
                .map_err(GitServiceError::from_git)?;
        }
        Err(error)
            if error.code() == ErrorCode::UnbornBranch || error.code() == ErrorCode::NotFound =>
        {
            let mut index = repository.index().map_err(GitServiceError::from_git)?;
            index.clear().map_err(GitServiceError::from_git)?;
            index.write().map_err(GitServiceError::from_git)?;
        }
        Err(error) => return Err(GitServiceError::from_git(error)),
    }
    repository_summary(&root, &repository)
}

/**
 * 放弃更改：把给定路径的索引与工作区一起恢复到 HEAD，等价于 `git checkout HEAD -- <path>`。
 * HEAD 里不存在的路径（新增的文件）没有可恢复的版本，只把它从索引里摘掉，磁盘上的文件由调用方处理；
 * 一个路径都不匹配时什么都不做——绝不能退化成"整棵工作区重置"。
 */
pub fn discard_paths(
    project_root: &str,
    request: &PathRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, mut repository) = open_exact_repository(project_root)?;
    let head_tree = repository
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok());
    let mut checkout = CheckoutBuilder::new();
    checkout.force();
    let mut matched = false;
    let mut unstaged: Vec<PathBuf> = Vec::new();
    for raw_path in &request.paths {
        let relative = raw_path
            .trim_end_matches(|character| character == '/' || character == '\\')
            .replace('\\', "/");
        let path = validate_relative_path(&relative)?;
        if head_tree
            .as_ref()
            .is_some_and(|tree| tree.get_path(path).is_ok())
        {
            matched = true;
            checkout.path(path);
        } else {
            unstaged.push(path.to_path_buf());
        }
    }
    if matched {
        repository
            .checkout_head(Some(&mut checkout))
            .map_err(GitServiceError::from_git)?;
    }
    if !unstaged.is_empty() {
        let mut index = repository.index().map_err(GitServiceError::from_git)?;
        let mut changed = false;
        for path in &unstaged {
            if index.get_path(path, 0).is_some() {
                index
                    .remove_path(path)
                    .map_err(GitServiceError::from_git)?;
                changed = true;
            }
        }
        if changed {
            index.write().map_err(GitServiceError::from_git)?;
        }
    }
    repository_summary(&root, &repository)
}

pub fn create_commit(
    project_root: &str,
    request: &CommitRequest,
) -> GitServiceResult<CommitSummary> {
    if request.message.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Commit message is required",
        ));
    }
    let (_, mut repository) = open_exact_repository(project_root)?;
    let operation_state = repository.state();
    if !matches!(
        operation_state,
        RepositoryState::Clean
            | RepositoryState::Merge
            | RepositoryState::CherryPick
            | RepositoryState::Revert
    ) {
        return Err(GitServiceError::new(
            GitErrorKind::Conflict,
            "The current Git operation must be continued through its dedicated command",
        ));
    }
    let signature = repository.signature().map_err(GitServiceError::from_git)?;
    let mut index = repository.index().map_err(GitServiceError::from_git)?;
    let tree_id = index.write_tree().map_err(GitServiceError::from_git)?;
    let head_details = repository
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok())
        .map(|commit| (commit.id(), commit.tree_id()));
    if operation_state == RepositoryState::Clean
        && head_details
            .as_ref()
            .is_some_and(|(_, parent_tree_id)| *parent_tree_id == tree_id)
    {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "There are no staged changes to commit",
        ));
    }
    let mut parent_oids = head_details
        .as_ref()
        .map(|(parent_id, _)| vec![*parent_id])
        .unwrap_or_default();
    if operation_state == RepositoryState::Merge {
        repository
            .mergehead_foreach(|oid| {
                if !parent_oids.contains(oid) {
                    parent_oids.push(*oid);
                }
                true
            })
            .map_err(GitServiceError::from_git)?;
    }
    let tree = repository
        .find_tree(tree_id)
        .map_err(GitServiceError::from_git)?;
    let parent_commits = parent_oids
        .into_iter()
        .map(|oid| {
            repository
                .find_commit(oid)
                .map_err(GitServiceError::from_git)
        })
        .collect::<GitServiceResult<Vec<_>>>()?;
    let parents = parent_commits.iter().collect::<Vec<_>>();
    let oid = repository
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            request.message.trim(),
            &tree,
            &parents,
        )
        .map_err(GitServiceError::from_git)?;
    if operation_state != RepositoryState::Clean {
        repository
            .cleanup_state()
            .map_err(GitServiceError::from_git)?;
    }
    let commit = repository
        .find_commit(oid)
        .map_err(GitServiceError::from_git)?;
    Ok(commit_summary(&commit))
}

pub fn amend_commit(
    project_root: &str,
    request: &CommitRequest,
) -> GitServiceResult<CommitSummary> {
    let (_, repository) = open_exact_repository(project_root)?;
    let head = repository
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(GitServiceError::from_git)?;
    let signature = repository.signature().map_err(GitServiceError::from_git)?;
    let mut index = repository.index().map_err(GitServiceError::from_git)?;
    let tree_id = index.write_tree().map_err(GitServiceError::from_git)?;
    let tree = repository
        .find_tree(tree_id)
        .map_err(GitServiceError::from_git)?;
    let message = if request.message.trim().is_empty() {
        head.message().unwrap_or_default()
    } else {
        request.message.trim()
    };
    let oid = head
        .amend(
            Some("HEAD"),
            Some(&signature),
            Some(&signature),
            None,
            Some(message),
            Some(&tree),
        )
        .map_err(GitServiceError::from_git)?;
    let commit = repository
        .find_commit(oid)
        .map_err(GitServiceError::from_git)?;
    Ok(commit_summary(&commit))
}

pub fn read_history(
    project_root: &str,
    request: &HistoryRequest,
) -> GitServiceResult<Vec<CommitSummary>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let mut walk = repository.revwalk().map_err(GitServiceError::from_git)?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(GitServiceError::from_git)?;
    if let Some(start) = request.start.as_deref() {
        walk.push(resolve_oid(&repository, start)?)
            .map_err(GitServiceError::from_git)?;
    } else {
        walk.push_head().map_err(GitServiceError::from_git)?;
    }
    let limit = request.limit.unwrap_or(100).clamp(1, 1000);
    walk.take(limit)
        .map(|oid| {
            let commit = repository
                .find_commit(oid.map_err(GitServiceError::from_git)?)
                .map_err(GitServiceError::from_git)?;
            let mut summary = commit_summary(&commit);
            summary.changed_files = commit_changed_files(&repository, &commit)?;
            Ok(summary)
        })
        .collect()
}

pub fn read_commit_summary(
    project_root: &str,
    revision: &RevisionRequest,
) -> GitServiceResult<CommitSummary> {
    let (_, repository) = open_exact_repository(project_root)?;
    let commit = repository
        .find_commit(resolve_oid(&repository, revision.revision.trim())?)
        .map_err(GitServiceError::from_git)?;
    Ok(commit_summary(&commit))
}

pub fn read_diff(project_root: &str, request: &DiffRequest) -> GitServiceResult<DiffResult> {
    let (_, repository) = open_exact_repository(project_root)?;
    let mut options = DiffOptions::new();
    if let Some(path) = request.path.as_deref() {
        options.pathspec(validate_relative_path(path)?);
    }
    let from_tree = match request.from.as_deref() {
        Some(revision) => Some(
            repository
                .find_commit(resolve_oid(&repository, revision)?)
                .and_then(|commit| commit.tree())
                .map_err(GitServiceError::from_git)?,
        ),
        None => repository
            .head()
            .ok()
            .and_then(|head| head.peel_to_tree().ok()),
    };
    let diff = match request.to {
        DiffTarget::Worktree => {
            repository.diff_tree_to_workdir_with_index(from_tree.as_ref(), Some(&mut options))
        }
        DiffTarget::Index => {
            repository.diff_tree_to_index(from_tree.as_ref(), None, Some(&mut options))
        }
        DiffTarget::Commit => {
            let revision = request.to_commit.as_deref().ok_or_else(|| {
                GitServiceError::new(GitErrorKind::InvalidInput, "toCommit is required")
            })?;
            let to_tree = repository
                .find_commit(resolve_oid(&repository, revision)?)
                .and_then(|commit| commit.tree())
                .map_err(GitServiceError::from_git)?;
            repository.diff_tree_to_tree(from_tree.as_ref(), Some(&to_tree), Some(&mut options))
        }
    }
    .map_err(GitServiceError::from_git)?;
    let mut binary_paths = HashSet::new();
    let mut file_callback = |_delta: git2::DiffDelta<'_>, _progress: f32| true;
    let mut binary_callback = |delta: git2::DiffDelta<'_>, _binary: git2::DiffBinary<'_>| {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            binary_paths.insert(path.to_path_buf());
        }
        true
    };
    diff.foreach(&mut file_callback, Some(&mut binary_callback), None, None)
        .map_err(GitServiceError::from_git)?;
    let mut patch = Vec::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        patch.extend_from_slice(line.content());
        true
    })
    .map_err(GitServiceError::from_git)?;
    let files = diff
        .deltas()
        .map(|delta| DiffFileSummary {
            old_path: delta
                .old_file()
                .path()
                .map(|path| path.to_string_lossy().replace('\\', "/")),
            new_path: delta
                .new_file()
                .path()
                .map(|path| path.to_string_lossy().replace('\\', "/")),
            status: format!("{:?}", delta.status()).to_lowercase(),
            binary: delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .is_some_and(|path| binary_paths.contains(path)),
        })
        .collect();
    Ok(DiffResult {
        files,
        patch: String::from_utf8_lossy(&patch).into_owned(),
    })
}

pub fn list_branches(project_root: &str) -> GitServiceResult<Vec<BranchSummary>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let branches = repository
        .branches(None)
        .map_err(GitServiceError::from_git)?
        .map(|entry| {
            let (branch, branch_type) = entry.map_err(GitServiceError::from_git)?;
            let name = branch
                .name()
                .map_err(GitServiceError::from_git)?
                .unwrap_or_default()
                .to_string();
            Ok(BranchSummary {
                name,
                target: branch.get().target().map(|oid| oid.to_string()),
                local: branch_type == BranchType::Local,
                current: branch.is_head(),
            })
        })
        .collect();
    branches
}

pub fn create_branch(
    project_root: &str,
    request: &CreateBranchRequest,
) -> GitServiceResult<BranchSummary> {
    if request.name.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Branch name is required",
        ));
    }
    let (_, repository) = open_exact_repository(project_root)?;
    let target = match request.start.as_deref() {
        Some(revision) => repository
            .find_commit(resolve_oid(&repository, revision)?)
            .map_err(GitServiceError::from_git)?,
        None => repository
            .head()
            .and_then(|head| head.peel_to_commit())
            .map_err(GitServiceError::from_git)?,
    };
    let branch = repository
        .branch(request.name.trim(), &target, request.force)
        .map_err(GitServiceError::from_git)?;
    Ok(BranchSummary {
        name: branch
            .name()
            .map_err(GitServiceError::from_git)?
            .unwrap_or_default()
            .to_string(),
        target: branch.get().target().map(|oid| oid.to_string()),
        local: true,
        current: false,
    })
}

pub fn checkout_revision(
    project_root: &str,
    request: &CheckoutRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut checkout = CheckoutBuilder::new();
    if request.force {
        checkout.force();
    } else {
        checkout.safe();
    }
    if let Ok(branch) = repository.find_branch(request.revision.trim(), BranchType::Local) {
        let reference_name = branch
            .get()
            .name()
            .map_err(GitServiceError::from_git)?
            .to_string();
        let target = branch
            .get()
            .peel(git2::ObjectType::Commit)
            .map_err(GitServiceError::from_git)?;
        repository
            .checkout_tree(&target, Some(&mut checkout))
            .map_err(GitServiceError::from_git)?;
        repository
            .set_head(&reference_name)
            .map_err(GitServiceError::from_git)?;
    } else {
        let object = repository
            .revparse_single(request.revision.trim())
            .map_err(GitServiceError::from_git)?;
        repository
            .checkout_tree(&object, Some(&mut checkout))
            .map_err(GitServiceError::from_git)?;
        repository
            .set_head_detached(object.id())
            .map_err(GitServiceError::from_git)?;
    }
    repository_summary(&root, &repository)
}

pub fn delete_branch(
    project_root: &str,
    request: &NamedRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut branch = repository
        .find_branch(request.name.trim(), BranchType::Local)
        .map_err(GitServiceError::from_git)?;
    branch.delete().map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn rename_branch(
    project_root: &str,
    request: &RenameRequest,
) -> GitServiceResult<BranchSummary> {
    let (_, repository) = open_exact_repository(project_root)?;
    let mut branch = repository
        .find_branch(request.name.trim(), BranchType::Local)
        .map_err(GitServiceError::from_git)?;
    let branch = branch
        .rename(request.new_name.trim(), request.force)
        .map_err(GitServiceError::from_git)?;
    Ok(BranchSummary {
        name: branch
            .name()
            .map_err(GitServiceError::from_git)?
            .unwrap_or_default()
            .to_string(),
        target: branch.get().target().map(|oid| oid.to_string()),
        local: true,
        current: branch.is_head(),
    })
}

pub fn list_tags(project_root: &str) -> GitServiceResult<Vec<TagSummary>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let names = repository
        .tag_names(None)
        .map_err(GitServiceError::from_git)?;
    names
        .iter()
        .map(|entry| {
            let name = entry.map_err(GitServiceError::from_git)?.ok_or_else(|| {
                GitServiceError::new(GitErrorKind::InvalidInput, "Tag name is not valid UTF-8")
            })?;
            let reference = repository
                .find_reference(&format!("refs/tags/{name}"))
                .map_err(GitServiceError::from_git)?;
            let target = reference
                .peel(git2::ObjectType::Any)
                .map_err(GitServiceError::from_git)?
                .id()
                .to_string();
            Ok(TagSummary {
                name: name.to_string(),
                target,
            })
        })
        .collect()
}

pub fn create_tag(project_root: &str, request: &CreateTagRequest) -> GitServiceResult<TagSummary> {
    if request.name.trim().is_empty() || request.message.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Tag name and message are required",
        ));
    }
    let (_, repository) = open_exact_repository(project_root)?;
    let target_revision = request.target.as_deref().unwrap_or("HEAD");
    let object = repository
        .revparse_single(target_revision)
        .map_err(GitServiceError::from_git)?;
    let signature = repository.signature().map_err(GitServiceError::from_git)?;
    repository
        .tag(
            request.name.trim(),
            &object,
            &signature,
            request.message.trim(),
            request.force,
        )
        .map_err(GitServiceError::from_git)?;
    Ok(TagSummary {
        name: request.name.trim().to_string(),
        target: object.id().to_string(),
    })
}

pub fn delete_tag(
    project_root: &str,
    request: &NamedRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    repository
        .tag_delete(request.name.trim())
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn list_stashes(project_root: &str) -> GitServiceResult<Vec<StashSummary>> {
    let (_, mut repository) = open_exact_repository(project_root)?;
    let mut stashes = Vec::new();
    repository
        .stash_foreach(|index, message, oid| {
            stashes.push(StashSummary {
                index,
                message: message.to_string(),
                id: oid.to_string(),
            });
            true
        })
        .map_err(GitServiceError::from_git)?;
    Ok(stashes)
}

pub fn create_stash(
    project_root: &str,
    request: &CreateStashRequest,
) -> GitServiceResult<StashSummary> {
    let (_, mut repository) = open_exact_repository(project_root)?;
    let signature = repository.signature().map_err(GitServiceError::from_git)?;
    let mut flags = StashFlags::DEFAULT;
    if request.include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }
    if request.include_ignored {
        flags |= StashFlags::INCLUDE_IGNORED;
    }
    let oid = repository
        .stash_save(&signature, request.message.trim(), Some(flags))
        .map_err(GitServiceError::from_git)?;
    Ok(StashSummary {
        index: 0,
        message: request.message.clone(),
        id: oid.to_string(),
    })
}

pub fn apply_stash(
    project_root: &str,
    request: &StashIndexRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, mut repository) = open_exact_repository(project_root)?;
    let mut options = StashApplyOptions::new();
    repository
        .stash_apply(request.index, Some(&mut options))
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn drop_stash(
    project_root: &str,
    request: &StashIndexRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, mut repository) = open_exact_repository(project_root)?;
    repository
        .stash_drop(request.index)
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn reset_repository(
    project_root: &str,
    request: &ResetRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    let object = repository
        .revparse_single(request.revision.trim())
        .map_err(GitServiceError::from_git)?;
    let mode = match request.mode {
        ResetMode::Soft => ResetType::Soft,
        ResetMode::Mixed => ResetType::Mixed,
        ResetMode::Hard => ResetType::Hard,
    };
    repository
        .reset(&object, mode, None)
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

fn operation_state(
    root: &Path,
    repository: &Repository,
    operation: &str,
) -> GitServiceResult<OperationState> {
    let conflicts = read_status(root.to_string_lossy().as_ref())?
        .entries
        .into_iter()
        .filter(|entry| entry.conflicted)
        .map(|entry| entry.path)
        .collect();
    Ok(OperationState {
        repository: repository_summary(root, repository)?,
        operation: operation.to_string(),
        conflicts,
    })
}

pub fn cherry_pick(
    project_root: &str,
    request: &RevisionRequest,
) -> GitServiceResult<OperationState> {
    let (root, repository) = open_exact_repository(project_root)?;
    let commit = repository
        .find_commit(resolve_oid(&repository, request.revision.trim())?)
        .map_err(GitServiceError::from_git)?;
    repository
        .cherrypick(&commit, None)
        .map_err(GitServiceError::from_git)?;
    operation_state(&root, &repository, "cherry-pick")
}

pub fn revert_commit(
    project_root: &str,
    request: &RevisionRequest,
) -> GitServiceResult<OperationState> {
    let (root, repository) = open_exact_repository(project_root)?;
    let commit = repository
        .find_commit(resolve_oid(&repository, request.revision.trim())?)
        .map_err(GitServiceError::from_git)?;
    repository
        .revert(&commit, None)
        .map_err(GitServiceError::from_git)?;
    operation_state(&root, &repository, "revert")
}

pub fn cleanup_operation_state(project_root: &str) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    repository
        .cleanup_state()
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn read_file_history(
    project_root: &str,
    request: &FileHistoryRequest,
) -> GitServiceResult<Vec<CommitSummary>> {
    let path = validate_relative_path(&request.path)?.to_path_buf();
    let (_, repository) = open_exact_repository(project_root)?;
    let mut walk = repository.revwalk().map_err(GitServiceError::from_git)?;
    walk.push_head().map_err(GitServiceError::from_git)?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(GitServiceError::from_git)?;
    let limit = request.limit.unwrap_or(100).clamp(1, 1000);
    let mut result = Vec::new();
    for oid in walk {
        let commit = repository
            .find_commit(oid.map_err(GitServiceError::from_git)?)
            .map_err(GitServiceError::from_git)?;
        let tree = commit.tree().map_err(GitServiceError::from_git)?;
        let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
        let mut options = DiffOptions::new();
        options.pathspec(&path);
        let diff = repository
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
            .map_err(GitServiceError::from_git)?;
        if diff.deltas().len() > 0 {
            result.push(commit_summary(&commit));
            if result.len() >= limit {
                break;
            }
        }
    }
    Ok(result)
}

pub fn read_file_at_revision(
    project_root: &str,
    request: &RevisionFileRequest,
) -> GitServiceResult<RevisionFileContent> {
    let relative_path = validate_relative_path(&request.path)?;
    let (_, repository) = open_exact_repository(project_root)?;
    let object = repository
        .revparse_single(request.revision.trim())
        .map_err(GitServiceError::from_git)?;
    let commit = object.peel_to_commit().map_err(GitServiceError::from_git)?;
    let tree = commit.tree().map_err(GitServiceError::from_git)?;
    let entry = tree
        .get_path(relative_path)
        .map_err(GitServiceError::from_git)?;
    let blob = repository
        .find_blob(entry.id())
        .map_err(GitServiceError::from_git)?;
    let binary = blob.is_binary();
    let content = if binary {
        String::new()
    } else {
        match std::str::from_utf8(blob.content()) {
            Ok(content) => content.to_string(),
            Err(_) => String::new(),
        }
    };
    Ok(RevisionFileContent {
        path: request.path.replace('\\', "/"),
        binary: binary || (content.is_empty() && !blob.content().is_empty()),
        content,
    })
}

fn revision_snapshot_cache_root(project_root: &Path, revision: Oid) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    project_root.hash(&mut hasher);
    std::env::temp_dir()
        .join("opencard")
        .join("git-snapshots")
        .join(format!("{:016x}", hasher.finish()))
        .join(revision.to_string())
}

fn materialize_tree(
    repository: &Repository,
    tree: &git2::Tree<'_>,
    destination: &Path,
) -> GitServiceResult<()> {
    for entry in tree.iter() {
        let name = entry.name().map_err(|_| {
            GitServiceError::new(
                GitErrorKind::InvalidInput,
                "Revision contains a path that is not valid UTF-8",
            )
        })?;
        if name.is_empty() || name == "." || name == ".." {
            return Err(GitServiceError::new(
                GitErrorKind::PathOutsideProject,
                "Revision contains an unsafe path",
            ));
        }
        let target = destination.join(name);
        match entry.kind() {
            Some(ObjectType::Tree) => {
                std::fs::create_dir_all(&target).map_err(GitServiceError::from_io)?;
                let child = repository
                    .find_tree(entry.id())
                    .map_err(GitServiceError::from_git)?;
                materialize_tree(repository, &child, &target)?;
            }
            Some(ObjectType::Blob) if entry.filemode() != 0o120000 => {
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent).map_err(GitServiceError::from_io)?;
                }
                let blob = repository
                    .find_blob(entry.id())
                    .map_err(GitServiceError::from_git)?;
                std::fs::write(&target, blob.content()).map_err(GitServiceError::from_io)?;
            }
            _ => {}
        }
    }
    Ok(())
}

pub fn materialize_revision(
    project_root: &str,
    request: &MaterializeRevisionRequest,
) -> GitServiceResult<RevisionSnapshot> {
    let (root, repository) = open_exact_repository(project_root)?;
    let object = repository
        .revparse_single(request.revision.trim())
        .map_err(GitServiceError::from_git)?;
    let commit = object.peel_to_commit().map_err(GitServiceError::from_git)?;
    let revision = commit.id();
    let destination = revision_snapshot_cache_root(&root, revision);
    if destination.is_dir() {
        return Ok(RevisionSnapshot {
            revision: revision.to_string(),
            root_path: normalized_path_string(&destination),
        });
    }

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = destination.with_extension(format!("partial-{}-{nonce}", std::process::id()));
    std::fs::create_dir_all(&temporary).map_err(GitServiceError::from_io)?;
    let result = commit
        .tree()
        .map_err(GitServiceError::from_git)
        .and_then(|tree| materialize_tree(&repository, &tree, &temporary));
    if let Err(error) = result {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(GitServiceError::from_io)?;
    }
    if let Err(error) = std::fs::rename(&temporary, &destination) {
        let _ = std::fs::remove_dir_all(&temporary);
        if !destination.is_dir() {
            return Err(GitServiceError::from_io(error));
        }
    }
    Ok(RevisionSnapshot {
        revision: revision.to_string(),
        root_path: normalized_path_string(&destination),
    })
}

fn conflict_side(entry: Option<&git2::IndexEntry>) -> ConflictSide {
    ConflictSide {
        path: entry.map(|entry| String::from_utf8_lossy(&entry.path).replace('\\', "/")),
        id: entry.map(|entry| entry.id.to_string()),
    }
}

pub fn read_conflicts(project_root: &str) -> GitServiceResult<Vec<ConflictEntry>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let index = repository.index().map_err(GitServiceError::from_git)?;
    let conflicts = index.conflicts().map_err(GitServiceError::from_git)?;
    conflicts
        .map(|conflict| {
            let conflict = conflict.map_err(GitServiceError::from_git)?;
            Ok(ConflictEntry {
                ancestor: conflict_side(conflict.ancestor.as_ref()),
                ours: conflict_side(conflict.our.as_ref()),
                theirs: conflict_side(conflict.their.as_ref()),
            })
        })
        .collect()
}

pub fn merge_revision(
    project_root: &str,
    request: &MergeRequest,
) -> GitServiceResult<OperationState> {
    let (root, repository) = open_exact_repository(project_root)?;
    if repository_summary(&root, &repository)?.has_changes {
        return Err(GitServiceError::new(
            GitErrorKind::Conflict,
            "Merge requires a clean index and worktree",
        ));
    }
    let object = repository
        .revparse_single(request.revision.trim())
        .map_err(GitServiceError::from_git)?;
    let target = repository
        .find_annotated_commit(object.id())
        .map_err(GitServiceError::from_git)?;
    let (analysis, _) = repository
        .merge_analysis(&[&target])
        .map_err(GitServiceError::from_git)?;
    if analysis.is_up_to_date() {
        return operation_state(&root, &repository, "up-to-date");
    }
    if analysis.is_fast_forward() {
        let branch = repository
            .head()
            .ok()
            .and_then(|head| head.shorthand().ok().map(str::to_owned))
            .ok_or_else(|| {
                GitServiceError::new(
                    GitErrorKind::InvalidInput,
                    "Fast-forward requires a current branch",
                )
            })?;
        fast_forward_branch(&repository, &branch, target.id())?;
        return operation_state(&root, &repository, "fast-forwarded");
    }
    if request.fast_forward_only {
        return Err(GitServiceError::new(
            GitErrorKind::NonFastForward,
            "The histories have diverged",
        ));
    }
    repository
        .merge(&[&target], None, None)
        .map_err(GitServiceError::from_git)?;
    operation_state(&root, &repository, "merge-pending")
}

pub fn start_rebase(
    project_root: &str,
    request: &RebaseRequest,
) -> GitServiceResult<OperationState> {
    let (root, repository) = open_exact_repository(project_root)?;
    if repository_summary(&root, &repository)?.has_changes {
        return Err(GitServiceError::new(
            GitErrorKind::Conflict,
            "Rebase requires a clean index and worktree",
        ));
    }
    let upstream_object = repository
        .revparse_single(request.upstream.trim())
        .map_err(GitServiceError::from_git)?;
    let upstream = repository
        .find_annotated_commit(upstream_object.id())
        .map_err(GitServiceError::from_git)?;
    let onto = request
        .onto
        .as_deref()
        .map(|revision| {
            let object = repository
                .revparse_single(revision)
                .map_err(GitServiceError::from_git)?;
            repository
                .find_annotated_commit(object.id())
                .map_err(GitServiceError::from_git)
        })
        .transpose()?;
    let mut rebase = repository
        .rebase(None, Some(&upstream), onto.as_ref(), None)
        .map_err(GitServiceError::from_git)?;
    let outcome = match rebase.next() {
        Some(operation) => {
            operation.map_err(GitServiceError::from_git)?;
            "rebase-step"
        }
        None => {
            let signature = repository.signature().map_err(GitServiceError::from_git)?;
            rebase
                .finish(Some(&signature))
                .map_err(GitServiceError::from_git)?;
            "rebased"
        }
    };
    drop(rebase);
    operation_state(&root, &repository, outcome)
}

pub fn continue_rebase(project_root: &str) -> GitServiceResult<OperationState> {
    let (root, repository) = open_exact_repository(project_root)?;
    let signature = repository.signature().map_err(GitServiceError::from_git)?;
    let mut rebase = repository
        .open_rebase(None)
        .map_err(GitServiceError::from_git)?;
    rebase
        .commit(None, &signature, None)
        .map_err(GitServiceError::from_git)?;
    let outcome = match rebase.next() {
        Some(operation) => {
            operation.map_err(GitServiceError::from_git)?;
            "rebase-step"
        }
        None => {
            rebase
                .finish(Some(&signature))
                .map_err(GitServiceError::from_git)?;
            "rebased"
        }
    };
    drop(rebase);
    operation_state(&root, &repository, outcome)
}

pub fn abort_operation(project_root: &str) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    if repository.state() == RepositoryState::Rebase
        || repository.state() == RepositoryState::RebaseInteractive
        || repository.state() == RepositoryState::RebaseMerge
    {
        let mut rebase = repository
            .open_rebase(None)
            .map_err(GitServiceError::from_git)?;
        rebase.abort().map_err(GitServiceError::from_git)?;
    } else if repository.state() != RepositoryState::Clean {
        let original = repository
            .revparse_single("ORIG_HEAD")
            .map_err(GitServiceError::from_git)?;
        repository
            .reset(&original, ResetType::Hard, None)
            .map_err(GitServiceError::from_git)?;
        repository
            .cleanup_state()
            .map_err(GitServiceError::from_git)?;
    }
    repository_summary(&root, &repository)
}

fn remote_callbacks(authentication: &GitAuthentication) -> RemoteCallbacks<'_> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(
        move |_url, username_from_url, _allowed| match authentication {
            GitAuthentication::Anonymous => Cred::default(),
            GitAuthentication::SshAgent { username } => {
                let username = username.as_deref().or(username_from_url).unwrap_or("git");
                Cred::ssh_key_from_agent(username)
            }
            GitAuthentication::HttpsToken { username, token } => {
                Cred::userpass_plaintext(username, token)
            }
        },
    );
    callbacks
}

fn fetch_options(authentication: &GitAuthentication) -> FetchOptions<'_> {
    let mut options = FetchOptions::new();
    options.remote_callbacks(remote_callbacks(authentication));
    options
}

fn remote_summary(name: &str, remote: &git2::Remote<'_>) -> GitServiceResult<RemoteSummary> {
    Ok(RemoteSummary {
        name: name.to_string(),
        url: Some(remote.url().map_err(GitServiceError::from_git)?.to_string()),
        push_url: remote
            .pushurl()
            .map_err(GitServiceError::from_git)?
            .map(str::to_owned),
    })
}

pub fn list_remotes(project_root: &str) -> GitServiceResult<Vec<RemoteSummary>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let names = repository.remotes().map_err(GitServiceError::from_git)?;
    names
        .iter()
        .map(|entry| {
            let name = entry.map_err(GitServiceError::from_git)?.ok_or_else(|| {
                GitServiceError::new(GitErrorKind::InvalidInput, "Remote name is not valid UTF-8")
            })?;
            let remote = repository
                .find_remote(name)
                .map_err(GitServiceError::from_git)?;
            remote_summary(name, &remote)
        })
        .collect()
}

pub fn add_remote(
    project_root: &str,
    request: &AddRemoteRequest,
) -> GitServiceResult<RemoteSummary> {
    if request.name.trim().is_empty() || request.url.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Remote name and URL are required",
        ));
    }
    let (_, repository) = open_exact_repository(project_root)?;
    let remote = repository
        .remote(request.name.trim(), request.url.trim())
        .map_err(GitServiceError::from_git)?;
    remote_summary(request.name.trim(), &remote)
}

pub fn delete_remote(
    project_root: &str,
    request: &NamedRequest,
) -> GitServiceResult<RepositorySummary> {
    let (root, repository) = open_exact_repository(project_root)?;
    repository
        .remote_delete(request.name.trim())
        .map_err(GitServiceError::from_git)?;
    repository_summary(&root, &repository)
}

pub fn rename_remote(
    project_root: &str,
    request: &RenameRequest,
) -> GitServiceResult<RemoteSummary> {
    let (_, repository) = open_exact_repository(project_root)?;
    let problems = repository
        .remote_rename(request.name.trim(), request.new_name.trim())
        .map_err(GitServiceError::from_git)?;
    if !problems.is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Some remote refspecs could not be renamed",
        ));
    }
    let remote = repository
        .find_remote(request.new_name.trim())
        .map_err(GitServiceError::from_git)?;
    remote_summary(request.new_name.trim(), &remote)
}

pub fn fetch_remote(
    project_root: &str,
    request: &FetchRequest,
) -> GitServiceResult<RemoteOperationResult> {
    let (root, repository) = open_exact_repository(project_root)?;
    let mut remote = repository
        .find_remote(request.remote.trim())
        .map_err(GitServiceError::from_git)?;
    let mut options = fetch_options(&request.authentication);
    let refspecs = request
        .refspecs
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    remote
        .fetch(&refspecs, Some(&mut options), None)
        .map_err(GitServiceError::from_git)?;
    Ok(RemoteOperationResult {
        repository: repository_summary(&root, &repository)?,
        operation: "fetch".to_string(),
        outcome: "fetched".to_string(),
        conflicts: Vec::new(),
    })
}

pub fn push_remote(
    project_root: &str,
    request: &PushRequest,
) -> GitServiceResult<RemoteOperationResult> {
    if request.refspecs.is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "At least one push refspec is required",
        ));
    }
    let (root, repository) = open_exact_repository(project_root)?;
    let mut remote = repository
        .find_remote(request.remote.trim())
        .map_err(GitServiceError::from_git)?;
    let mut options = PushOptions::new();
    options.remote_callbacks(remote_callbacks(&request.authentication));
    let refspecs = request
        .refspecs
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    remote
        .push(&refspecs, Some(&mut options))
        .map_err(GitServiceError::from_git)?;
    Ok(RemoteOperationResult {
        repository: repository_summary(&root, &repository)?,
        operation: "push".to_string(),
        outcome: "pushed".to_string(),
        conflicts: Vec::new(),
    })
}

fn validate_clone_target(project_root: &str) -> GitServiceResult<PathBuf> {
    let target = PathBuf::from(project_root);
    if !target.is_absolute() || target.file_name().is_none() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Clone target must be an absolute project directory path",
        ));
    }
    if target.exists() {
        return Err(GitServiceError::new(
            GitErrorKind::AlreadyExists,
            "Clone target already exists",
        ));
    }
    let parent = target.parent().ok_or_else(|| {
        GitServiceError::new(
            GitErrorKind::InvalidProjectRoot,
            "Clone target has no parent directory",
        )
    })?;
    let parent = std::fs::canonicalize(parent).map_err(GitServiceError::from_io)?;
    Ok(parent.join(target.file_name().unwrap()))
}

pub fn clone_repository(
    project_root: &str,
    request: &CloneRequest,
) -> GitServiceResult<RepositorySummary> {
    if request.url.trim().is_empty()
        || request.identity.name.trim().is_empty()
        || request.identity.email.trim().is_empty()
    {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Remote URL and commit identity are required",
        ));
    }
    let target = validate_clone_target(project_root)?;
    let fetch = fetch_options(&request.authentication);
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch);
    if let Some(branch) = request.branch.as_deref() {
        builder.branch(branch);
    }
    let clone_result = builder.clone(request.url.trim(), &target);
    let repository = match clone_result {
        Ok(repository) => repository,
        Err(error) => {
            if target.exists() {
                std::fs::remove_dir_all(&target).map_err(GitServiceError::from_io)?;
            }
            return Err(GitServiceError::from_git(error));
        }
    };
    let mut config = repository.config().map_err(GitServiceError::from_git)?;
    config
        .set_str("user.name", request.identity.name.trim())
        .map_err(GitServiceError::from_git)?;
    config
        .set_str("user.email", request.identity.email.trim())
        .map_err(GitServiceError::from_git)?;
    let root = std::fs::canonicalize(&target).map_err(GitServiceError::from_io)?;
    repository_summary(&root, &repository)
}

fn fast_forward_branch(repository: &Repository, branch: &str, target: Oid) -> GitServiceResult<()> {
    let reference_name = format!("refs/heads/{branch}");
    match repository.find_reference(&reference_name) {
        Ok(mut reference) => {
            reference
                .set_target(target, "OpenCard fast-forward")
                .map_err(GitServiceError::from_git)?;
        }
        Err(error) if error.code() == ErrorCode::NotFound => {
            repository
                .reference(&reference_name, target, false, "OpenCard fast-forward")
                .map_err(GitServiceError::from_git)?;
        }
        Err(error) => return Err(GitServiceError::from_git(error)),
    }
    repository
        .set_head(&reference_name)
        .map_err(GitServiceError::from_git)?;
    let mut checkout = CheckoutBuilder::new();
    checkout.force();
    repository
        .checkout_head(Some(&mut checkout))
        .map_err(GitServiceError::from_git)
}

pub fn pull_remote(
    project_root: &str,
    request: &PullRequest,
) -> GitServiceResult<RemoteOperationResult> {
    let (root, repository) = open_exact_repository(project_root)?;
    if repository_summary(&root, &repository)?.has_changes {
        return Err(GitServiceError::new(
            GitErrorKind::Conflict,
            "Pull requires a clean index and worktree",
        ));
    }
    let fetch_request = FetchRequest {
        remote: request.remote.clone(),
        refspecs: Vec::new(),
        authentication: request.authentication.clone(),
    };
    fetch_remote(project_root, &fetch_request)?;
    let tracking_name = format!(
        "refs/remotes/{}/{}",
        request.remote.trim(),
        request.branch.trim()
    );
    let fetch_commit = repository
        .find_reference(&tracking_name)
        .and_then(|reference| repository.reference_to_annotated_commit(&reference))
        .map_err(GitServiceError::from_git)?;
    let (analysis, _) = repository
        .merge_analysis(&[&fetch_commit])
        .map_err(GitServiceError::from_git)?;
    let outcome = if analysis.is_up_to_date() {
        "up-to-date"
    } else if analysis.is_fast_forward() {
        fast_forward_branch(&repository, request.branch.trim(), fetch_commit.id())?;
        "fast-forwarded"
    } else if analysis.is_normal() {
        match request.strategy {
            PullStrategy::FastForwardOnly => {
                return Err(GitServiceError::new(
                    GitErrorKind::NonFastForward,
                    "Local and remote histories have diverged",
                ));
            }
            PullStrategy::Merge => {
                repository
                    .merge(&[&fetch_commit], None, None)
                    .map_err(GitServiceError::from_git)?;
                "merge-pending"
            }
            PullStrategy::Rebase => {
                let signature = repository.signature().map_err(GitServiceError::from_git)?;
                let mut rebase = repository
                    .rebase(None, Some(&fetch_commit), None, None)
                    .map_err(GitServiceError::from_git)?;
                while let Some(operation) = rebase.next() {
                    operation.map_err(GitServiceError::from_git)?;
                    rebase
                        .commit(None, &signature, None)
                        .map_err(GitServiceError::from_git)?;
                }
                rebase
                    .finish(Some(&signature))
                    .map_err(GitServiceError::from_git)?;
                "rebased"
            }
        }
    } else {
        return Err(GitServiceError::new(
            GitErrorKind::Git,
            "Remote history cannot be integrated into the current branch",
        ));
    };
    let conflicts = read_status(project_root)?
        .entries
        .into_iter()
        .filter(|entry| entry.conflicted)
        .map(|entry| entry.path)
        .collect();
    Ok(RemoteOperationResult {
        repository: repository_summary(&root, &repository)?,
        operation: "pull".to_string(),
        outcome: outcome.to_string(),
        conflicts,
    })
}

pub fn read_repository_config(project_root: &str) -> GitServiceResult<Vec<ConfigEntry>> {
    let (_, repository) = open_exact_repository(project_root)?;
    let config =
        git2::Config::open(&repository.path().join("config")).map_err(GitServiceError::from_git)?;
    let mut entries = config.entries(None).map_err(GitServiceError::from_git)?;
    let mut result = Vec::new();
    while let Some(entry) = entries.next() {
        let entry = entry.map_err(GitServiceError::from_git)?;
        let key = entry.name().map_err(GitServiceError::from_git)?.to_string();
        let value = entry
            .value()
            .map_err(GitServiceError::from_git)?
            .to_string();
        result.push(ConfigEntry { key, value });
    }
    Ok(result)
}

pub fn write_repository_config(
    project_root: &str,
    request: &ConfigRequest,
) -> GitServiceResult<ConfigEntry> {
    if request.key.trim().is_empty() {
        return Err(GitServiceError::new(
            GitErrorKind::InvalidInput,
            "Config key is required",
        ));
    }
    let (_, repository) = open_exact_repository(project_root)?;
    let mut config =
        git2::Config::open(&repository.path().join("config")).map_err(GitServiceError::from_git)?;
    config
        .set_str(request.key.trim(), &request.value)
        .map_err(GitServiceError::from_git)?;
    Ok(ConfigEntry {
        key: request.key.trim().to_string(),
        value: request.value.clone(),
    })
}

#[tauri::command(async)]
pub fn git_inspect(project_root: String) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| inspect_repository(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_initialize(
    project_root: String,
    identity: GitIdentity,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| initialize_repository(&project_root, &identity)).into()
}

#[tauri::command(async)]
pub fn git_status(project_root: String) -> GitCommandResult<GitStatusResult> {
    command_result_with_conflicts(run_exclusive(|| read_status(&project_root)), |value| {
        value.repository.has_conflicts
    })
}

#[tauri::command(async)]
pub fn git_stage(
    project_root: String,
    request: PathRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| stage_paths(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_stage_all(project_root: String) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| stage_all(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_unstage(
    project_root: String,
    request: PathRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| unstage_paths(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_unstage_all(project_root: String) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| unstage_all(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_discard(
    project_root: String,
    request: PathRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| discard_paths(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_commit(project_root: String, request: CommitRequest) -> GitCommandResult<CommitSummary> {
    run_exclusive(|| create_commit(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_amend(project_root: String, request: CommitRequest) -> GitCommandResult<CommitSummary> {
    run_exclusive(|| amend_commit(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_history(
    project_root: String,
    request: HistoryRequest,
) -> GitCommandResult<Vec<CommitSummary>> {
    run_exclusive(|| read_history(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_commit_summary(
    project_root: String,
    request: RevisionRequest,
) -> GitCommandResult<CommitSummary> {
    run_exclusive(|| read_commit_summary(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_diff(project_root: String, request: DiffRequest) -> GitCommandResult<DiffResult> {
    run_exclusive(|| read_diff(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_branches(project_root: String) -> GitCommandResult<Vec<BranchSummary>> {
    run_exclusive(|| list_branches(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_create_branch(
    project_root: String,
    request: CreateBranchRequest,
) -> GitCommandResult<BranchSummary> {
    run_exclusive(|| create_branch(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_checkout(
    project_root: String,
    request: CheckoutRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| checkout_revision(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_delete_branch(
    project_root: String,
    request: NamedRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| delete_branch(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_rename_branch(
    project_root: String,
    request: RenameRequest,
) -> GitCommandResult<BranchSummary> {
    run_exclusive(|| rename_branch(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_tags(project_root: String) -> GitCommandResult<Vec<TagSummary>> {
    run_exclusive(|| list_tags(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_create_tag(
    project_root: String,
    request: CreateTagRequest,
) -> GitCommandResult<TagSummary> {
    run_exclusive(|| create_tag(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_delete_tag(
    project_root: String,
    request: NamedRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| delete_tag(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_stashes(project_root: String) -> GitCommandResult<Vec<StashSummary>> {
    run_exclusive(|| list_stashes(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_create_stash(
    project_root: String,
    request: CreateStashRequest,
) -> GitCommandResult<StashSummary> {
    run_exclusive(|| create_stash(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_apply_stash(
    project_root: String,
    request: StashIndexRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| apply_stash(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_drop_stash(
    project_root: String,
    request: StashIndexRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| drop_stash(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_reset(
    project_root: String,
    request: ResetRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| reset_repository(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_cherry_pick(
    project_root: String,
    request: RevisionRequest,
) -> GitCommandResult<OperationState> {
    command_result_with_conflicts(
        run_exclusive(|| cherry_pick(&project_root, &request)),
        |value| value.repository.has_conflicts,
    )
}

#[tauri::command(async)]
pub fn git_revert(
    project_root: String,
    request: RevisionRequest,
) -> GitCommandResult<OperationState> {
    command_result_with_conflicts(
        run_exclusive(|| revert_commit(&project_root, &request)),
        |value| value.repository.has_conflicts,
    )
}

#[tauri::command(async)]
pub fn git_cleanup_state(project_root: String) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| cleanup_operation_state(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_remotes(project_root: String) -> GitCommandResult<Vec<RemoteSummary>> {
    run_exclusive(|| list_remotes(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_add_remote(
    project_root: String,
    request: AddRemoteRequest,
) -> GitCommandResult<RemoteSummary> {
    run_exclusive(|| add_remote(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_delete_remote(
    project_root: String,
    request: NamedRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| delete_remote(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_rename_remote(
    project_root: String,
    request: RenameRequest,
) -> GitCommandResult<RemoteSummary> {
    run_exclusive(|| rename_remote(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_fetch(
    project_root: String,
    request: FetchRequest,
) -> GitCommandResult<RemoteOperationResult> {
    run_exclusive(|| fetch_remote(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_push(
    project_root: String,
    request: PushRequest,
) -> GitCommandResult<RemoteOperationResult> {
    run_exclusive(|| push_remote(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_pull(
    project_root: String,
    request: PullRequest,
) -> GitCommandResult<RemoteOperationResult> {
    command_result_with_conflicts(
        run_exclusive(|| pull_remote(&project_root, &request)),
        |value| value.repository.has_conflicts || !value.conflicts.is_empty(),
    )
}

#[tauri::command(async)]
pub fn git_clone(
    project_root: String,
    request: CloneRequest,
) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| clone_repository(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_read_config(project_root: String) -> GitCommandResult<Vec<ConfigEntry>> {
    run_exclusive(|| read_repository_config(&project_root)).into()
}

#[tauri::command(async)]
pub fn git_write_config(
    project_root: String,
    request: ConfigRequest,
) -> GitCommandResult<ConfigEntry> {
    run_exclusive(|| write_repository_config(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_file_history(
    project_root: String,
    request: FileHistoryRequest,
) -> GitCommandResult<Vec<CommitSummary>> {
    run_exclusive(|| read_file_history(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_read_file_at_revision(
    project_root: String,
    request: RevisionFileRequest,
) -> GitCommandResult<RevisionFileContent> {
    run_exclusive(|| read_file_at_revision(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_materialize_revision(
    project_root: String,
    request: MaterializeRevisionRequest,
) -> GitCommandResult<RevisionSnapshot> {
    run_exclusive(|| materialize_revision(&project_root, &request)).into()
}

#[tauri::command(async)]
pub fn git_conflicts(project_root: String) -> GitCommandResult<Vec<ConflictEntry>> {
    command_result_with_conflicts(run_exclusive(|| read_conflicts(&project_root)), |value| {
        !value.is_empty()
    })
}

#[tauri::command(async)]
pub fn git_merge(project_root: String, request: MergeRequest) -> GitCommandResult<OperationState> {
    command_result_with_conflicts(
        run_exclusive(|| merge_revision(&project_root, &request)),
        |value| value.repository.has_conflicts,
    )
}

#[tauri::command(async)]
pub fn git_rebase_start(
    project_root: String,
    request: RebaseRequest,
) -> GitCommandResult<OperationState> {
    command_result_with_conflicts(
        run_exclusive(|| start_rebase(&project_root, &request)),
        |value| value.repository.has_conflicts,
    )
}

#[tauri::command(async)]
pub fn git_rebase_continue(project_root: String) -> GitCommandResult<OperationState> {
    command_result_with_conflicts(run_exclusive(|| continue_rebase(&project_root)), |value| {
        value.repository.has_conflicts
    })
}

#[tauri::command(async)]
pub fn git_abort_operation(project_root: String) -> GitCommandResult<RepositorySummary> {
    run_exclusive(|| abort_operation(&project_root)).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn identity() -> GitIdentity {
        GitIdentity {
            name: "OpenCard Test".to_string(),
            email: "test@opencard.invalid".to_string(),
        }
    }

    fn initialized_repository() -> TempDir {
        let directory = TempDir::new().unwrap();
        let root = directory.path().to_str().unwrap();
        initialize_repository(root, &identity()).unwrap();
        std::fs::write(directory.path().join("card.txt"), "first\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "first".into(),
            },
        )
        .unwrap();
        directory
    }

    #[test]
    fn stage_paths_adds_a_whole_untracked_directory() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::create_dir_all(directory.path().join("assets/nested")).unwrap();
        std::fs::write(directory.path().join("assets/one.txt"), "one\n").unwrap();
        std::fs::write(directory.path().join("assets/nested/two.txt"), "two\n").unwrap();

        // 更改列表里未跟踪的目录是一条以 `/` 结尾的整体条目。
        stage_paths(
            root,
            &PathRequest {
                paths: vec!["assets/".into()],
            },
        )
        .unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "assets".into(),
            },
        )
        .unwrap();

        let repository = Repository::open(directory.path()).unwrap();
        let tree = repository
            .head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .tree()
            .unwrap();
        assert!(tree.get_path(Path::new("assets/one.txt")).is_ok());
        assert!(tree.get_path(Path::new("assets/nested/two.txt")).is_ok());
    }

    #[test]
    fn discard_paths_restores_tracked_files_and_unstages_new_ones() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("card.txt"), "second\n").unwrap();
        std::fs::write(directory.path().join("added.txt"), "new\n").unwrap();
        stage_paths(
            root,
            &PathRequest {
                paths: vec!["card.txt".into(), "added.txt".into()],
            },
        )
        .unwrap();

        discard_paths(
            root,
            &PathRequest {
                paths: vec!["card.txt".into(), "added.txt".into()],
            },
        )
        .unwrap();

        assert_eq!(
            std::fs::read_to_string(directory.path().join("card.txt"))
                .unwrap()
                // 检出时平台可能按 core.autocrlf 换行，这里只比内容。
                .replace("\r\n", "\n"),
            "first\n"
        );
        // 新增的文件 HEAD 里没有，只退出索引，磁盘上的文件留给调用方处理。
        assert_eq!(
            std::fs::read_to_string(directory.path().join("added.txt")).unwrap(),
            "new\n"
        );
        let entries = read_status(root).unwrap().entries;
        assert!(!entries.iter().any(|entry| entry.path == "card.txt"));
        assert!(entries
            .iter()
            .any(|entry| entry.path == "added.txt" && entry.worktree_new));
    }

    #[test]
    fn committing_selected_paths_leaves_the_rest_uncommitted() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("card.txt"), "second\n").unwrap();
        std::fs::write(directory.path().join("new.txt"), "new\n").unwrap();

        // 更改列表的提交：索引先回到 HEAD，只暂存勾选的路径，然后提交。
        unstage_all(root).unwrap();
        stage_paths(
            root,
            &PathRequest {
                paths: vec!["card.txt".into()],
            },
        )
        .unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "selected".into(),
            },
        )
        .unwrap();

        let repository = Repository::open(directory.path()).unwrap();
        let tree = repository
            .head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .tree()
            .unwrap();
        assert!(tree.get_path(Path::new("card.txt")).is_ok());
        assert!(tree.get_path(Path::new("new.txt")).is_err());
        // 没勾的改动原样留在工作区。
        assert!(read_status(root)
            .unwrap()
            .entries
            .iter()
            .any(|entry| entry.path == "new.txt" && entry.worktree_new));
    }

    #[test]
    fn parent_repository_is_not_treated_as_project_repository() {
        let parent = TempDir::new().unwrap();
        Repository::init(parent.path()).unwrap();
        let child = parent.path().join("project");
        std::fs::create_dir(&child).unwrap();

        let summary = inspect_repository(child.to_str().unwrap()).unwrap();
        assert!(!summary.initialized);
        let error = match open_exact_repository(child.to_str().unwrap()) {
            Ok(_) => panic!("child project unexpectedly opened the parent repository"),
            Err(error) => error,
        };
        assert_eq!(error.kind, GitErrorKind::NotInitialized);
    }

    #[test]
    fn initialization_sets_identity_and_preserves_existing_ignore_file() {
        let directory = TempDir::new().unwrap();
        let ignore_path = directory.path().join(".gitignore");
        std::fs::write(&ignore_path, "custom/\n").unwrap();

        let summary =
            initialize_repository(directory.path().to_str().unwrap(), &identity()).unwrap();
        assert!(summary.initialized);
        assert_eq!(std::fs::read_to_string(ignore_path).unwrap(), "custom/\n");
        let repository = Repository::open(directory.path()).unwrap();
        assert_eq!(
            repository
                .config()
                .unwrap()
                .get_string("user.name")
                .unwrap(),
            "OpenCard Test"
        );
    }

    #[test]
    fn invalid_gitignore_does_not_leave_a_partial_repository() {
        let directory = TempDir::new().unwrap();
        std::fs::create_dir(directory.path().join(".gitignore")).unwrap();
        let error =
            initialize_repository(directory.path().to_str().unwrap(), &identity()).unwrap_err();
        assert_eq!(error.kind, GitErrorKind::InvalidInput);
        assert!(!directory.path().join(".git").exists());
    }

    #[test]
    fn status_respects_gitignore() {
        let directory = TempDir::new().unwrap();
        initialize_repository(directory.path().to_str().unwrap(), &identity()).unwrap();
        std::fs::write(directory.path().join("visible.txt"), "visible").unwrap();
        std::fs::write(directory.path().join(".opencard-init-hidden"), "hidden").unwrap();

        let status = read_status(directory.path().to_str().unwrap()).unwrap();
        assert!(status
            .entries
            .iter()
            .any(|entry| entry.path == "visible.txt" && entry.worktree_new));
        assert!(!status
            .entries
            .iter()
            .any(|entry| entry.path.contains("hidden")));
    }

    /// 已跟踪文件的修改必须带 modified 标志：这种多位判定要用 `intersects`，
    /// 用 `contains` 只有当"同时修改、重命名并改了类型"才成立——界面上就是改过的文件一条都不显示。
    #[test]
    fn status_reports_modified_tracked_files() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("card.txt"), "second\n").unwrap();

        let status = read_status(root).unwrap();
        assert!(status
            .entries
            .iter()
            .any(|entry| entry.path == "card.txt" && entry.worktree_modified));
    }

    #[test]
    fn relative_paths_cannot_escape_project() {
        assert!(validate_relative_path("cards/example.ocdocument").is_ok());
        assert_eq!(
            validate_relative_path("../outside").unwrap_err().kind,
            GitErrorKind::PathOutsideProject
        );
    }

    #[test]
    fn git_pointer_files_are_not_opened_as_project_repositories() {
        let directory = TempDir::new().unwrap();
        std::fs::write(directory.path().join(".git"), "gitdir: ../outside\n").unwrap();
        let error = match open_exact_repository(directory.path().to_str().unwrap()) {
            Ok(_) => panic!("worktree pointer unexpectedly opened"),
            Err(error) => error,
        };
        assert_eq!(error.kind, GitErrorKind::InvalidProjectRoot);
    }

    #[test]
    fn stage_commit_history_and_diff_round_trip() {
        let directory = TempDir::new().unwrap();
        let root = directory.path().to_str().unwrap();
        initialize_repository(root, &identity()).unwrap();
        std::fs::write(directory.path().join("card.txt"), "first\n").unwrap();
        stage_all(root).unwrap();
        let first = create_commit(
            root,
            &CommitRequest {
                message: "first".into(),
            },
        )
        .unwrap();

        std::fs::write(directory.path().join("card.txt"), "second\n").unwrap();
        let diff = read_diff(
            root,
            &DiffRequest {
                from: None,
                to: DiffTarget::Worktree,
                to_commit: None,
                path: Some("card.txt".into()),
            },
        )
        .unwrap();
        assert!(diff.patch.contains("first"), "{}", diff.patch);
        assert!(diff.patch.contains("second"), "{}", diff.patch);

        stage_paths(
            root,
            &PathRequest {
                paths: vec!["card.txt".into()],
            },
        )
        .unwrap();
        let second = create_commit(
            root,
            &CommitRequest {
                message: "second".into(),
            },
        )
        .unwrap();
        let history = read_history(
            root,
            &HistoryRequest {
                limit: None,
                start: None,
            },
        )
        .unwrap();
        assert_eq!(
            history
                .iter()
                .map(|commit| commit.id.as_str())
                .collect::<Vec<_>>(),
            [second.id, first.id]
        );
    }

    #[test]
    fn reads_text_and_materializes_tracked_files_at_revision() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::create_dir_all(directory.path().join("assets")).unwrap();
        std::fs::write(directory.path().join("assets/icon.bin"), [0_u8, 159, 255]).unwrap();
        stage_all(root).unwrap();
        let commit = create_commit(
            root,
            &CommitRequest {
                message: "resources".into(),
            },
        )
        .unwrap();

        let text = read_file_at_revision(
            root,
            &RevisionFileRequest {
                revision: commit.id.clone(),
                path: "card.txt".into(),
            },
        )
        .unwrap();
        assert_eq!(text.content, "first\n");
        assert!(!text.binary);

        let binary = read_file_at_revision(
            root,
            &RevisionFileRequest {
                revision: commit.id.clone(),
                path: "assets/icon.bin".into(),
            },
        )
        .unwrap();
        assert!(binary.binary);
        assert!(binary.content.is_empty());

        let snapshot = materialize_revision(
            root,
            &MaterializeRevisionRequest {
                revision: commit.id.clone(),
            },
        )
        .unwrap();
        let snapshot_root = PathBuf::from(&snapshot.root_path);
        assert_eq!(snapshot.revision, commit.id);
        assert_eq!(
            std::fs::read_to_string(snapshot_root.join("card.txt")).unwrap(),
            "first\n"
        );
        assert_eq!(
            std::fs::read(snapshot_root.join("assets/icon.bin")).unwrap(),
            [0_u8, 159, 255]
        );
        std::fs::remove_dir_all(snapshot_root).unwrap();
    }

    #[test]
    fn revision_file_read_rejects_paths_outside_project() {
        let directory = initialized_repository();
        let error = read_file_at_revision(
            directory.path().to_str().unwrap(),
            &RevisionFileRequest {
                revision: "HEAD".into(),
                path: "../outside".into(),
            },
        )
        .unwrap_err();
        assert_eq!(error.kind, GitErrorKind::PathOutsideProject);
    }

    #[test]
    fn stage_rejects_paths_outside_project() {
        let directory = TempDir::new().unwrap();
        let root = directory.path().to_str().unwrap();
        initialize_repository(root, &identity()).unwrap();
        let error = stage_paths(
            root,
            &PathRequest {
                paths: vec!["../outside".into()],
            },
        )
        .unwrap_err();
        assert_eq!(error.kind, GitErrorKind::PathOutsideProject);
    }

    #[test]
    fn explicit_stage_cannot_bypass_gitignore() {
        let directory = TempDir::new().unwrap();
        let root = directory.path().to_str().unwrap();
        initialize_repository(root, &identity()).unwrap();
        std::fs::write(directory.path().join(".opencard-init-secret"), "ignored").unwrap();
        let error = stage_paths(
            root,
            &PathRequest {
                paths: vec![".opencard-init-secret".into()],
            },
        )
        .unwrap_err();
        assert_eq!(error.kind, GitErrorKind::InvalidInput);
    }

    #[test]
    fn branch_tag_and_checkout_lifecycle() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        create_branch(
            root,
            &CreateBranchRequest {
                name: "alternate".into(),
                start: None,
                force: false,
            },
        )
        .unwrap();
        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "alternate".into(),
                force: false,
            },
        )
        .unwrap();
        assert!(list_branches(root)
            .unwrap()
            .iter()
            .any(|branch| branch.name == "alternate" && branch.current));

        create_tag(
            root,
            &CreateTagRequest {
                name: "v1".into(),
                target: None,
                message: "version one".into(),
                force: false,
            },
        )
        .unwrap();
        assert_eq!(list_tags(root).unwrap()[0].name, "v1");
        delete_tag(root, &NamedRequest { name: "v1".into() }).unwrap();
        assert!(list_tags(root).unwrap().is_empty());
    }

    #[test]
    fn stash_and_hard_reset_follow_git_semantics() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("card.txt"), "changed\n").unwrap();
        create_stash(
            root,
            &CreateStashRequest {
                message: "work".into(),
                include_untracked: false,
                include_ignored: false,
            },
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(directory.path().join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "first\n"
        );
        assert_eq!(list_stashes(root).unwrap().len(), 1);
        apply_stash(root, &StashIndexRequest { index: 0 }).unwrap();
        assert_eq!(
            std::fs::read_to_string(directory.path().join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "changed\n"
        );
        reset_repository(
            root,
            &ResetRequest {
                revision: "HEAD".into(),
                mode: ResetMode::Hard,
            },
        )
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(directory.path().join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "first\n"
        );
    }

    #[test]
    fn local_remote_push_and_clone_round_trip() {
        let source = initialized_repository();
        let source_root = source.path().to_str().unwrap();
        let remote = TempDir::new().unwrap();
        Repository::init_bare(remote.path()).unwrap();
        add_remote(
            source_root,
            &AddRemoteRequest {
                name: "origin".into(),
                url: remote.path().to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        push_remote(
            source_root,
            &PushRequest {
                remote: "origin".into(),
                refspecs: vec!["refs/heads/master:refs/heads/master".into()],
                authentication: GitAuthentication::Anonymous,
            },
        )
        .unwrap();

        let clone_parent = TempDir::new().unwrap();
        let clone_target = clone_parent.path().join("clone");
        let summary = clone_repository(
            clone_target.to_str().unwrap(),
            &CloneRequest {
                url: remote.path().to_string_lossy().into_owned(),
                branch: Some("master".into()),
                identity: identity(),
                authentication: GitAuthentication::Anonymous,
            },
        )
        .unwrap();
        assert!(summary.initialized);
        assert_eq!(
            std::fs::read_to_string(clone_target.join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "first\n"
        );

        std::fs::write(source.path().join("card.txt"), "remote update\n").unwrap();
        stage_all(source_root).unwrap();
        create_commit(
            source_root,
            &CommitRequest {
                message: "remote update".into(),
            },
        )
        .unwrap();
        push_remote(
            source_root,
            &PushRequest {
                remote: "origin".into(),
                refspecs: vec!["refs/heads/master:refs/heads/master".into()],
                authentication: GitAuthentication::Anonymous,
            },
        )
        .unwrap();
        let pull = pull_remote(
            clone_target.to_str().unwrap(),
            &PullRequest {
                remote: "origin".into(),
                branch: "master".into(),
                strategy: PullStrategy::FastForwardOnly,
                authentication: GitAuthentication::Anonymous,
            },
        )
        .unwrap();
        assert_eq!(pull.outcome, "fast-forwarded");
        assert_eq!(
            std::fs::read_to_string(clone_target.join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "remote update\n"
        );
    }

    #[test]
    fn file_history_and_local_config_are_project_scoped() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("card.txt"), "second\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "second".into(),
            },
        )
        .unwrap();

        let history = read_file_history(
            root,
            &FileHistoryRequest {
                path: "card.txt".into(),
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(history.len(), 2);
        write_repository_config(
            root,
            &ConfigRequest {
                key: "opencard.test".into(),
                value: "yes".into(),
            },
        )
        .unwrap();
        assert!(read_repository_config(root)
            .unwrap()
            .iter()
            .any(|entry| entry.key == "opencard.test" && entry.value == "yes"));
    }

    #[test]
    fn command_lock_serializes_concurrent_operations() {
        // 命令是并发执行的：同时发起的两个 git 操作都必须成功。
        // 界面打开项目时就是并行读状态、历史、文件历史，一个被"另一个操作正在运行"顶掉，
        // 协作侧栏就会空着。
        let completed = std::sync::Arc::new(Mutex::new(0usize));
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let completed = completed.clone();
                std::thread::spawn(move || {
                    run_exclusive(|| {
                        *completed.lock().unwrap() += 1;
                        Ok(())
                    })
                })
            })
            .collect();
        for handle in handles {
            assert!(handle.join().unwrap().is_ok());
        }
        assert_eq!(*completed.lock().unwrap(), 2);
    }

    #[test]
    fn command_result_serializes_stable_error_flags() {
        let response: GitCommandResult<()> = Err(GitServiceError::new(
            GitErrorKind::AuthenticationRequired,
            "credentials required",
        ))
        .into();
        let json = serde_json::to_value(response).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["authenticationRequired"], true);
        assert_eq!(json["retryable"], false);
        assert_eq!(json["error"]["kind"], "authentication-required");
    }

    #[test]
    fn merge_conflicts_are_structured_and_abort_restores_head() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        create_branch(
            root,
            &CreateBranchRequest {
                name: "feature".into(),
                start: None,
                force: false,
            },
        )
        .unwrap();
        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "feature".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("card.txt"), "feature\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "feature".into(),
            },
        )
        .unwrap();

        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "master".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("card.txt"), "master\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "master".into(),
            },
        )
        .unwrap();

        let merge = merge_revision(
            root,
            &MergeRequest {
                revision: "feature".into(),
                fast_forward_only: false,
            },
        )
        .unwrap();
        assert!(merge.repository.has_conflicts);
        let response = command_result_with_conflicts(Ok(merge.clone()), |value| {
            value.repository.has_conflicts
        });
        assert!(response.conflicted && response.continuable && response.abortable);
        let conflicts = read_conflicts(root).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].ours.path.as_deref(), Some("card.txt"));
        abort_operation(root).unwrap();
        assert_eq!(
            Repository::open(root).unwrap().state(),
            RepositoryState::Clean
        );
        assert_eq!(
            std::fs::read_to_string(directory.path().join("card.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "master\n"
        );
    }

    #[test]
    fn completing_merge_commit_preserves_both_parents() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        create_branch(
            root,
            &CreateBranchRequest {
                name: "feature".into(),
                start: None,
                force: false,
            },
        )
        .unwrap();
        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "feature".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("feature.txt"), "feature\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "feature".into(),
            },
        )
        .unwrap();

        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "master".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("master.txt"), "master\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "master".into(),
            },
        )
        .unwrap();

        let merge = merge_revision(
            root,
            &MergeRequest {
                revision: "feature".into(),
                fast_forward_only: false,
            },
        )
        .unwrap();
        assert_eq!(merge.operation, "merge-pending");
        let commit = create_commit(
            root,
            &CommitRequest {
                message: "merge feature".into(),
            },
        )
        .unwrap();
        assert_eq!(commit.parent_ids.len(), 2);
        assert_eq!(
            Repository::open(root).unwrap().state(),
            RepositoryState::Clean
        );
    }

    #[test]
    fn rebase_start_and_continue_complete_a_clean_rebase() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        create_branch(
            root,
            &CreateBranchRequest {
                name: "feature".into(),
                start: None,
                force: false,
            },
        )
        .unwrap();
        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "feature".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("feature.txt"), "feature\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "feature".into(),
            },
        )
        .unwrap();

        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "master".into(),
                force: false,
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("master.txt"), "master\n").unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "master".into(),
            },
        )
        .unwrap();
        checkout_revision(
            root,
            &CheckoutRequest {
                revision: "feature".into(),
                force: false,
            },
        )
        .unwrap();

        let before_rebase = read_status(root).unwrap();
        assert!(
            before_rebase.entries.is_empty(),
            "unexpected pre-rebase status: {:?}",
            before_rebase.entries
        );

        let started = start_rebase(
            root,
            &RebaseRequest {
                upstream: "master".into(),
                onto: None,
            },
        )
        .unwrap();
        assert_eq!(started.operation, "rebase-step");
        let finished = continue_rebase(root).unwrap();
        assert_eq!(finished.operation, "rebased");
        assert_eq!(finished.repository.state, "clean");
        assert!(directory.path().join("master.txt").exists());
        assert!(directory.path().join("feature.txt").exists());
    }

    #[test]
    fn binary_diff_is_identified_without_text_decoding() {
        let directory = initialized_repository();
        let root = directory.path().to_str().unwrap();
        std::fs::write(directory.path().join("asset.bin"), [0, 1, 2, 3]).unwrap();
        stage_all(root).unwrap();
        create_commit(
            root,
            &CommitRequest {
                message: "binary".into(),
            },
        )
        .unwrap();
        std::fs::write(directory.path().join("asset.bin"), [0, 1, 9, 3]).unwrap();
        let diff = read_diff(
            root,
            &DiffRequest {
                from: None,
                to: DiffTarget::Worktree,
                to_commit: None,
                path: Some("asset.bin".into()),
            },
        )
        .unwrap();
        assert_eq!(diff.files.len(), 1);
        assert!(diff.files[0].binary);
    }

    #[test]
    fn failed_clone_removes_only_its_new_target() {
        let parent = TempDir::new().unwrap();
        let target = parent.path().join("failed-clone");
        let result = clone_repository(
            target.to_str().unwrap(),
            &CloneRequest {
                url: parent
                    .path()
                    .join("missing.git")
                    .to_string_lossy()
                    .into_owned(),
                branch: None,
                identity: identity(),
                authentication: GitAuthentication::Anonymous,
            },
        );
        assert!(result.is_err());
        assert!(!target.exists());
    }
}
