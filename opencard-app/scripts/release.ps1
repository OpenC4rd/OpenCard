<#
.SYNOPSIS
Creates and publishes an OpenCard release.

.DESCRIPTION
Updates all application version files, runs the frontend and Rust checks,
creates the release commit and annotated tag, and pushes both atomically.
After a stable tag is pushed, it clears RELEASE_NOTES.md in a follow-up commit so
the next release starts with an empty draft. A preview release leaves the draft
open, so the notes accumulate until the stable release that closes them.
After pushing, the script waits for the tag-triggered GitHub Actions workflow
to finish, so callers should keep waiting for this process instead of running
the release command again.

A release belongs to one channel, and the channel decides the updater endpoint
written into tauri.conf.json, so a build only ever searches the channel it was
released on. A stable version such as 0.5.0 is a stable release, and stable
builds update only to newer stable releases. A version with a prerelease suffix
such as 0.5.0-beta.1 is a preview release, and preview builds update only to
newer preview releases. The channels never cross: a preview installation never
receives a stable release and a stable installation never receives a preview, so
switching channels means installing a build of that channel.

A preview release publishes the change since the previous release and keeps the
draft, so each preview carries everything new since the last stable release. The
stable release publishes that accumulated draft as it stands and then clears it,
so its notes never have to be assembled by hand.

.EXAMPLE
.\scripts\release.ps1 0.2.6 -ReleaseNotesPath C:\Temp\opencard-0.2.6.md

.EXAMPLE
.\scripts\release.ps1 0.5.0-beta.1
Publishes a preview release.

.EXAMPLE
.\scripts\release.ps1 0.2.6 -SkipChecks

.EXAMPLE
.\scripts\release.ps1 0.2.6 -NoPush

.PARAMETER Channel
Stable or Preview. Defaults to the channel implied by the version: a prerelease
suffix means Preview, anything else means Stable. A channel that contradicts the
version is rejected.

.PARAMETER NoWaitForWorkflow
Returns after the atomic push instead of waiting for GitHub Actions.

.PARAMETER ReleaseNotesPath
Markdown release notes to publish and bundle with the application. Defaults to
opencard-app/RELEASE_NOTES.md.

.PARAMETER WorkflowTimeoutMinutes
Maximum time to wait for GitHub Actions after a successful push. Defaults to
60 minutes. A timeout does not mean the release should be run again.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Version,

  [Parameter(Position = 1)]
  [ValidateSet('Stable', 'Preview')]
  [string]$Channel,

  [string]$ReleaseNotesPath,

  [switch]$SkipChecks,
  [switch]$NoPush,
  [switch]$NoWaitForWorkflow,

  [ValidateRange(1, 1440)]
  [int]$WorkflowTimeoutMinutes = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory)]
    [string]$Command,

    [Parameter(Mandatory)]
    [string[]]$Arguments,

    [Parameter(Mandatory)]
    [string]$WorkingDirectory
  )

  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
  }
  finally {
    Pop-Location
  }
}

function Compare-SemVer {
  param(
    [Parameter(Mandatory)]
    [string]$Left,

    [Parameter(Mandatory)]
    [string]$Right,

    [Parameter(Mandatory)]
    [string]$Pattern
  )

  $leftMatch = [regex]::Match($Left, $Pattern)
  $rightMatch = [regex]::Match($Right, $Pattern)
  if (-not $leftMatch.Success -or -not $rightMatch.Success) {
    throw "Cannot compare invalid semantic versions: $Left and $Right"
  }

  foreach ($index in 1..3) {
    $leftPart = [System.Numerics.BigInteger]::Parse($leftMatch.Groups[$index].Value)
    $rightPart = [System.Numerics.BigInteger]::Parse($rightMatch.Groups[$index].Value)
    if ($leftPart -lt $rightPart) { return -1 }
    if ($leftPart -gt $rightPart) { return 1 }
  }

  $leftPrerelease = $leftMatch.Groups[4].Value
  $rightPrerelease = $rightMatch.Groups[4].Value
  if (-not $leftPrerelease -and -not $rightPrerelease) { return 0 }
  if (-not $leftPrerelease) { return 1 }
  if (-not $rightPrerelease) { return -1 }

  $leftIdentifiers = $leftPrerelease.Split('.')
  $rightIdentifiers = $rightPrerelease.Split('.')
  $sharedLength = [Math]::Min($leftIdentifiers.Length, $rightIdentifiers.Length)
  for ($index = 0; $index -lt $sharedLength; $index += 1) {
    $leftIdentifier = $leftIdentifiers[$index]
    $rightIdentifier = $rightIdentifiers[$index]
    $leftIsNumeric = $leftIdentifier -match '^\d+$'
    $rightIsNumeric = $rightIdentifier -match '^\d+$'

    if ($leftIsNumeric -and $rightIsNumeric) {
      $leftNumber = [System.Numerics.BigInteger]::Parse($leftIdentifier)
      $rightNumber = [System.Numerics.BigInteger]::Parse($rightIdentifier)
      if ($leftNumber -lt $rightNumber) { return -1 }
      if ($leftNumber -gt $rightNumber) { return 1 }
      continue
    }
    if ($leftIsNumeric) { return -1 }
    if ($rightIsNumeric) { return 1 }

    $comparison = [string]::CompareOrdinal($leftIdentifier, $rightIdentifier)
    if ($comparison -lt 0) { return -1 }
    if ($comparison -gt 0) { return 1 }
  }

  return $leftIdentifiers.Length.CompareTo($rightIdentifiers.Length)
}

function Set-FirstRegexMatch {
  param(
    [Parameter(Mandatory)]
    [string]$Path,

    [Parameter(Mandatory)]
    [string]$Pattern,

    [Parameter(Mandatory)]
    [string]$Replacement
  )

  $content = [System.IO.File]::ReadAllText($Path)
  $regex = [System.Text.RegularExpressions.Regex]::new(
    $Pattern,
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  )

  if (-not $regex.IsMatch($content)) {
    throw "Could not locate the version field in $Path"
  }

  $updated = $regex.Replace($content, $Replacement, 1)
  [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

function Get-GitHubRepositorySlug {
  param(
    [Parameter(Mandatory)]
    [string]$RepositoryRoot
  )

  $originUrl = (& git -C $RepositoryRoot remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the origin remote URL.'
  }

  $normalizedUrl = ($originUrl -replace '\\', '/') -replace '\.git$', ''
  if ($normalizedUrl -notmatch 'github\.com[/:](?<slug>[^/]+/[^/]+)$') {
    throw "Origin is not a supported GitHub repository URL: $originUrl"
  }

  return $Matches.slug
}

function Wait-GitHubWorkflow {
  param(
    [Parameter(Mandatory)]
    [string]$Repository,

    [Parameter(Mandatory)]
    [string]$Workflow,

    [Parameter(Mandatory)]
    [string]$Tag,

    [Parameter(Mandatory)]
    [string]$HeadSha,

    [Parameter(Mandatory)]
    [int]$TimeoutMinutes
  )

  $headers = @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'OpenCard-release-script'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
    $headers.Authorization = "Bearer $($env:GITHUB_TOKEN)"
  }

  $encodedWorkflow = [System.Uri]::EscapeDataString($Workflow)
  $runsUrl = "https://api.github.com/repos/$Repository/actions/workflows/$encodedWorkflow/runs?event=push&per_page=20"
  $deadline = [DateTimeOffset]::UtcNow.AddMinutes($TimeoutMinutes)
  $run = $null

  Write-Host "Waiting for GitHub Actions workflow $Workflow for $Tag..." -ForegroundColor Cyan

  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $runsUrl -Headers $headers
    }
    catch {
      throw "Release $Tag was pushed, but its GitHub Actions status could not be read. Do not run the release again. $($_.Exception.Message)"
    }

    $run = @($response.workflow_runs) |
      Where-Object { $_.head_sha -eq $HeadSha -and $_.head_branch -eq $Tag } |
      Select-Object -First 1

    if ($null -eq $run) {
      Write-Host 'The workflow run is not visible yet; checking again in 15 seconds...'
      Start-Sleep -Seconds 15
      continue
    }

    Write-Host "Workflow status: $($run.status) $($run.html_url)"
    if ($run.status -eq 'completed') {
      if ($run.conclusion -eq 'success') {
        Write-Host "GitHub Actions completed successfully for $Tag." -ForegroundColor Green
        return
      }

      throw "Release $Tag was pushed, but GitHub Actions concluded with '$($run.conclusion)'. Do not run the release again. Inspect $($run.html_url)"
    }

    Start-Sleep -Seconds 60
  }

  $runUrl = if ($null -ne $run) { " Inspect $($run.html_url)" } else { '' }
  throw "Release $Tag was pushed, but GitHub Actions did not finish within $TimeoutMinutes minutes. Do not run the release again.$runUrl"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = Read-Host 'Release version (for example 0.2.2 or 0.3.0-alpha)'
}

$semverIdentifier = '(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)'
$semverPattern = "^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-($semverIdentifier(?:\.$semverIdentifier)*))?$"
if ($Version -notmatch $semverPattern) {
  throw "Version must be a semantic version such as 0.2.2 or 0.3.0-alpha. Received: $Version"
}

$versionChannel = if ($Version.Contains('-')) { 'Preview' } else { 'Stable' }
$channel = if ([string]::IsNullOrWhiteSpace($Channel)) {
  $versionChannel
}
elseif ($Channel -ieq 'Preview') {
  'Preview'
}
else {
  'Stable'
}

if ($channel -ne $versionChannel) {
  $requirement = if ($channel -eq 'Preview') {
    'A preview release needs a prerelease suffix such as -beta.1.'
  }
  else {
    'A stable release must not carry a prerelease suffix.'
  }
  throw "$requirement Received: $Version"
}

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (Resolve-Path (Join-Path $appRoot '..')).Path
$cargoRoot = Join-Path $appRoot 'src-tauri'
$cargoTomlPath = Join-Path $cargoRoot 'Cargo.toml'
$cargoLockPath = Join-Path $cargoRoot 'Cargo.lock'
$tauriConfigPath = Join-Path $cargoRoot 'tauri.conf.json'
$releaseNotesTargetPath = Join-Path $appRoot 'RELEASE_NOTES.md'
$tag = "v$Version"

if ([string]::IsNullOrWhiteSpace($ReleaseNotesPath)) {
  $ReleaseNotesPath = $releaseNotesTargetPath
}
if (-not (Test-Path -LiteralPath $ReleaseNotesPath -PathType Leaf)) {
  throw "Release notes file does not exist: $ReleaseNotesPath"
}
$releaseNotes = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ReleaseNotesPath).Path).Trim()
if ([string]::IsNullOrWhiteSpace($releaseNotes)) {
  throw 'Release notes must not be empty.'
}
if ($releaseNotes -match '(?m)^OPENCARD_RELEASE_NOTES_EOF\s*$') {
  throw 'Release notes contain the reserved workflow delimiter OPENCARD_RELEASE_NOTES_EOF.'
}

foreach ($command in @('git', 'node', 'npm.cmd', 'cargo')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command is unavailable: $command"
  }
}

$repositoryTopLevelOutput = (& git -C $repoRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Expected a Git repository rooted at $repoRoot"
}
$repositoryTopLevel = (Resolve-Path $repositoryTopLevelOutput).Path
if ($repositoryTopLevel -ne $repoRoot) {
  throw "Expected a Git repository rooted at $repoRoot"
}

$repository = Get-GitHubRepositorySlug -RepositoryRoot $repoRoot
# GitHub resolves no URL to the newest prerelease, so preview builds read a pointer
# file that .github/workflows/preview-channel.yml keeps at the tip of its own branch.
$updaterEndpoint = if ($channel -eq 'Preview') {
  "https://raw.githubusercontent.com/$repository/preview-update/latest.json"
}
else {
  "https://github.com/$repository/releases/latest/download/latest.json"
}

# A preview keeps the draft open, so it must add something. A stable release closes
# the accumulated draft and may publish it unchanged.
$previousReleaseNotes = (& git -C $repoRoot show 'HEAD:opencard-app/RELEASE_NOTES.md' 2>$null | Out-String).Trim()
if ($channel -ne 'Stable' -and $LASTEXITCODE -eq 0 -and $releaseNotes -eq $previousReleaseNotes) {
  throw 'Release notes still match the previous release. Update RELEASE_NOTES.md or pass -ReleaseNotesPath.'
}

$workingTreeStatus = & git -C $repoRoot status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw 'Could not inspect the Git working tree.'
}
$unexpectedChanges = @($workingTreeStatus | Where-Object {
  $_.Length -lt 4 -or $_.Substring(3).Replace('\', '/') -ne 'opencard-app/RELEASE_NOTES.md'
})
if ($unexpectedChanges.Count -gt 0) {
  throw 'The working tree contains changes other than RELEASE_NOTES.md. Commit or stash them before creating a release.'
}

$branch = (& git -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
  throw 'Releases cannot be created from a detached HEAD.'
}

$tauriConfig = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
$currentVersion = [string]$tauriConfig.version
if ((Compare-SemVer -Left $Version -Right $currentVersion -Pattern $semverPattern) -le 0) {
  throw "The release version must be newer than the current version $currentVersion."
}

Write-Host "Preparing OpenCard $tag as a $($channel.ToLowerInvariant()) release from branch $branch" -ForegroundColor Cyan
Invoke-NativeCommand -Command 'git' -Arguments @('fetch', 'origin', '--tags') -WorkingDirectory $repoRoot

& git -C $repoRoot rev-parse --verify --quiet "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) {
  throw "Tag already exists locally: $tag"
}

& git -C $repoRoot ls-remote --exit-code --tags origin "refs/tags/$tag" *> $null
if ($LASTEXITCODE -eq 0) {
  throw "Tag already exists on origin: $tag"
}

Write-Host 'Updating application versions...' -ForegroundColor Cyan
[System.IO.File]::WriteAllText(
  $releaseNotesTargetPath,
  "$releaseNotes$([Environment]::NewLine)",
  [System.Text.UTF8Encoding]::new($false)
)
Invoke-NativeCommand -Command 'npm.cmd' -Arguments @(
  'version',
  $Version,
  '--no-git-tag-version',
  '--allow-same-version'
) -WorkingDirectory $appRoot

$updateJsonVersion = @'
const fs = require('node:fs');
const [filePath, version, endpointsJson] = process.argv.slice(1);
const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
document.version = version;
document.plugins.updater.endpoints = JSON.parse(endpointsJson);
fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
'@
Invoke-NativeCommand -Command 'node' -Arguments @(
  '-e',
  $updateJsonVersion,
  $tauriConfigPath,
  $Version,
  (ConvertTo-Json -InputObject @($updaterEndpoint) -Compress)
) -WorkingDirectory $repoRoot

Set-FirstRegexMatch `
  -Path $cargoTomlPath `
  -Pattern '(?ms)(^\[package\]\s*(?:(?!^\[).)*?^version\s*=\s*")[^"]+(")' `
  -Replacement "`${1}$Version`${2}"

Set-FirstRegexMatch `
  -Path $cargoLockPath `
  -Pattern '(?ms)(^\[\[package\]\]\s*\r?\nname\s*=\s*"OpenCard"\s*\r?\nversion\s*=\s*")[^"]+(")' `
  -Replacement "`${1}$Version`${2}"

if (-not $SkipChecks) {
  Write-Host 'Running frontend build...' -ForegroundColor Cyan
  Invoke-NativeCommand -Command 'npm.cmd' -Arguments @('run', 'build') -WorkingDirectory $appRoot

  Write-Host 'Running Rust checks...' -ForegroundColor Cyan
  Invoke-NativeCommand -Command 'cargo' -Arguments @(
    'check',
    '--manifest-path',
    $cargoTomlPath
  ) -WorkingDirectory $repoRoot
}

$versionFiles = @(
  'opencard-app/package.json',
  'opencard-app/package-lock.json',
  'opencard-app/RELEASE_NOTES.md',
  'opencard-app/src-tauri/Cargo.toml',
  'opencard-app/src-tauri/Cargo.lock',
  'opencard-app/src-tauri/tauri.conf.json'
)

Write-Host 'Creating release commit and tag...' -ForegroundColor Cyan
Invoke-NativeCommand -Command 'git' -Arguments (@('add', '--') + $versionFiles) -WorkingDirectory $repoRoot
Invoke-NativeCommand -Command 'git' -Arguments @(
  '-c',
  'core.whitespace=cr-at-eol',
  'diff',
  '--cached',
  '--check'
) -WorkingDirectory $repoRoot
Invoke-NativeCommand -Command 'git' -Arguments @('commit', '-m', "chore(release): $tag") -WorkingDirectory $repoRoot
Invoke-NativeCommand -Command 'git' -Arguments @('tag', '-a', $tag, '-m', "OpenCard $tag") -WorkingDirectory $repoRoot

if ($NoPush) {
  Write-Host "Created $tag locally. Push was skipped because -NoPush was supplied." -ForegroundColor Yellow
  exit 0
}

Write-Host 'Pushing the release commit and tag atomically...' -ForegroundColor Cyan
Invoke-NativeCommand -Command 'git' -Arguments @(
  'push',
  '--atomic',
  'origin',
  "HEAD:refs/heads/$branch",
  "refs/tags/$tag"
) -WorkingDirectory $repoRoot

Write-Host "Released $tag. GitHub Actions will now build the desktop release." -ForegroundColor Green

if ($channel -eq 'Stable') {
  Write-Host 'Clearing the release notes draft for the next version...' -ForegroundColor Cyan
  [System.IO.File]::WriteAllText(
    $releaseNotesTargetPath,
    '',
    [System.Text.UTF8Encoding]::new($false)
  )
  try {
    Invoke-NativeCommand -Command 'git' -Arguments @('add', '--', 'opencard-app/RELEASE_NOTES.md') -WorkingDirectory $repoRoot
    Invoke-NativeCommand -Command 'git' -Arguments @(
      'commit',
      '-m',
      "chore(release): reset notes after $tag"
    ) -WorkingDirectory $repoRoot
    Invoke-NativeCommand -Command 'git' -Arguments @(
      'push',
      'origin',
      "HEAD:refs/heads/$branch"
    ) -WorkingDirectory $repoRoot
  }
  catch {
    throw "Release $tag was pushed, but the release notes draft could not be reset on $branch. Do not run the release again. $($_.Exception.Message)"
  }
}
else {
  Write-Host 'Keeping the release notes draft open for the next preview or stable release.' -ForegroundColor Cyan
}

if ($NoWaitForWorkflow) {
  Write-Host 'GitHub Actions waiting was skipped because -NoWaitForWorkflow was supplied.' -ForegroundColor Yellow
  exit 0
}

$releaseCommit = (& git -C $repoRoot rev-list -n 1 $tag).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($releaseCommit)) {
  throw "Release $tag was pushed, but its commit could not be resolved. Do not run the release again."
}

Wait-GitHubWorkflow `
  -Repository $repository `
  -Workflow 'tauri-build.yml' `
  -Tag $tag `
  -HeadSha $releaseCommit `
  -TimeoutMinutes $WorkflowTimeoutMinutes
