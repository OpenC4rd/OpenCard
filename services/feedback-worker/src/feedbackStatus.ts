export type FeedbackStatus = 'received' | 'answered' | 'closed'

export type GitHubIssueSnapshot = {
  state: 'open' | 'closed'
  updatedAt: string
}

export type GitHubCommentSnapshot = {
  body: string
  updatedAt: string
  trustedAuthor: boolean
}

export type FeedbackStatusResult = {
  status: FeedbackStatus
  updatedAt: string
  officialResponse?: {
    text: string
    updatedAt: string
  }
}

const MAX_OFFICIAL_RESPONSE_BYTES = 8 * 1024

export function resolveFeedbackStatus(
  issue: GitHubIssueSnapshot,
  comments: GitHubCommentSnapshot[],
): FeedbackStatusResult {
  const trustedComments = comments
    .filter(comment => comment.trustedAuthor)
    .map(comment => ({ comment, text: comment.body.trim() }))
    .filter(entry => entry.text.length > 0)
    .sort((left, right) => Date.parse(right.comment.updatedAt) - Date.parse(left.comment.updatedAt))

  const selectedResponse = trustedComments[0]
  if (selectedResponse && new TextEncoder().encode(selectedResponse.text).byteLength > MAX_OFFICIAL_RESPONSE_BYTES) {
    throw new Error('official_response_too_large')
  }

  const officialResponse = selectedResponse
    ? { text: selectedResponse.text, updatedAt: selectedResponse.comment.updatedAt }
    : undefined

  return {
    status: issue.state === 'closed' ? 'closed' : officialResponse ? 'answered' : 'received',
    updatedAt: officialResponse && Date.parse(officialResponse.updatedAt) > Date.parse(issue.updatedAt)
      ? officialResponse.updatedAt
      : issue.updatedAt,
    officialResponse,
  }
}
