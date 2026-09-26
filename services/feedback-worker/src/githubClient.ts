import type { GitHubCommentSnapshot, GitHubIssueSnapshot } from './feedbackStatus'

const GITHUB_API_VERSION = '2026-03-10'
const MAX_COMMENT_PAGES = 3
const COMMENTS_PER_PAGE = 100
const textEncoder = new TextEncoder()
const trustedAuthorAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

export async function createInstallationToken(env: Env): Promise<string> {
  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_PRIVATE_KEY)
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`,
    { method: 'POST', headers: githubHeaders(jwt) },
  )
  if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status})`)
  const body = requireGitHubRecord(await response.json(), 'installation token')
  if (typeof body.token !== 'string') throw new Error('GitHub installation token response was invalid')
  return body.token
}

export async function createIssue(
  env: Env,
  token: string,
  content: { title: string; body: string },
): Promise<{ number: number }> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/issues`,
    {
      method: 'POST',
      headers: githubHeaders(token),
      body: JSON.stringify(content),
    },
  )
  if (!response.ok) throw new Error(`GitHub issue creation failed (${response.status})`)
  const body = requireGitHubRecord(await response.json(), 'issue')
  if (typeof body.number !== 'number') throw new Error('GitHub issue response was invalid')
  return { number: body.number }
}

export async function getIssue(
  env: Env,
  token: string,
  issueNumber: number,
): Promise<GitHubIssueSnapshot & { commentCount: number }> {
  const response = await fetch(githubIssueUrl(env, issueNumber), { headers: githubHeaders(token) })
  if (!response.ok) throw new Error(`GitHub issue request failed (${response.status})`)
  const body = requireGitHubRecord(await response.json(), 'issue')
  const state = body.state
  const commentCount = body.comments
  if (state !== 'open' && state !== 'closed') throw new Error('GitHub issue state was invalid')
  if (typeof commentCount !== 'number' || !Number.isInteger(commentCount) || commentCount < 0) {
    throw new Error('GitHub issue comment count was invalid')
  }

  return {
    state,
    updatedAt: requireGitHubText(body.updated_at, 'issue updated_at'),
    commentCount,
  }
}

export async function getIssueComments(
  env: Env,
  token: string,
  issueNumber: number,
  commentCount: number,
): Promise<GitHubCommentSnapshot[]> {
  const pageCount = Math.ceil(commentCount / COMMENTS_PER_PAGE)
  if (pageCount > MAX_COMMENT_PAGES) throw new Error('GitHub issue has too many comments to project safely')

  const comments: GitHubCommentSnapshot[] = []
  for (let page = 1; page <= pageCount; page += 1) {
    const response = await fetch(
      `${githubIssueUrl(env, issueNumber)}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
      { headers: githubHeaders(token) },
    )
    if (!response.ok) throw new Error(`GitHub issue comments request failed (${response.status})`)
    const body: unknown = await response.json()
    if (!Array.isArray(body)) throw new Error('GitHub issue comments response was invalid')
    comments.push(...body.map(value => parseGitHubComment(value, env.GITHUB_APP_ID)))
  }
  return comments
}

function parseGitHubComment(value: unknown, githubAppId: string): GitHubCommentSnapshot {
  const comment = requireGitHubRecord(value, 'issue comment')
  return {
    body: requireGitHubText(comment.body, 'issue comment body'),
    updatedAt: requireGitHubText(comment.updated_at, 'issue comment updated_at'),
    trustedAuthor: isTrustedGitHubComment(comment, githubAppId),
  }
}

function githubIssueUrl(env: Env, issueNumber: number): string {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/issues/${issueNumber}`
}

function githubHeaders(token: string): Headers {
  return new Headers({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'OpenCard-Feedback-Relay',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  })
}

function requireGitHubRecord(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`GitHub ${subject} response was invalid`)
  }
  return value as Record<string, unknown>
}

function requireGitHubText(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new Error(`GitHub ${subject} was invalid`)
  return value
}

function isTrustedGitHubComment(comment: Record<string, unknown>, githubAppId: string): boolean {
  const association = requireGitHubText(comment.author_association, 'issue comment author association')
  if (trustedAuthorAssociations.has(association)) return true
  if (comment.performed_via_github_app === null || comment.performed_via_github_app === undefined) return false
  const app = requireGitHubRecord(comment.performed_via_github_app, 'comment GitHub App')
  return typeof app.id === 'number' && String(app.id) === githubAppId
}

export async function createAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const unsignedToken = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, textEncoder.encode(unsignedToken))
  return `${unsignedToken}.${base64Url(new Uint8Array(signature))}`
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n')
  const isPkcs1 = normalized.includes('-----BEGIN RSA PRIVATE KEY-----')
  const base64 = normalized
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(base64)
  const keyBytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (!isPkcs1) return keyBytes.buffer

  const version = new Uint8Array([0x02, 0x01, 0x00])
  const rsaAlgorithmIdentifier = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ])
  const privateKey = derValue(0x04, keyBytes)
  return new Uint8Array(derValue(0x30, concatBytes(version, rsaAlgorithmIdentifier, privateKey))).buffer
}

function derValue(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(value.length), value)
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length])
  const bytes: number[] = []
  for (let remaining = length; remaining > 0; remaining >>>= 8) bytes.unshift(remaining & 0xff)
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
