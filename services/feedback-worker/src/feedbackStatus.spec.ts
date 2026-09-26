import { describe, expect, it } from 'vitest'
import { resolveFeedbackStatus } from './feedbackStatus'

const issue = {
  state: 'open',
  updatedAt: '2026-08-01T01:00:00.000Z',
} as const

describe('feedback status mapping', () => {
  it('treats an open issue without trusted comments as received', () => {
    expect(resolveFeedbackStatus(issue, [])).toMatchObject({ status: 'received' })
  })

  it('returns the newest comment from a trusted repository member or app as the answer', () => {
    const result = resolveFeedbackStatus(issue, [
      {
        body: 'Spoofed response',
        updatedAt: '2026-08-01T02:00:00.000Z',
        trustedAuthor: false,
      },
      {
        body: 'First answer',
        updatedAt: '2026-08-01T03:00:00.000Z',
        trustedAuthor: true,
      },
      {
        body: 'Updated answer',
        updatedAt: '2026-08-01T04:00:00.000Z',
        trustedAuthor: true,
      },
    ])

    expect(result.officialResponse).toEqual({
      text: 'Updated answer',
      updatedAt: '2026-08-01T04:00:00.000Z',
    })
    expect(result.updatedAt).toBe('2026-08-01T04:00:00.000Z')
    expect(result.status).toBe('answered')
  })

  it('lets a closed issue win and rejects oversized replies', () => {
    expect(resolveFeedbackStatus({ ...issue, state: 'closed' }, []).status).toBe('closed')
    expect(() => resolveFeedbackStatus(issue, [{
      body: '界'.repeat(3_000),
      updatedAt: '2026-08-01T02:00:00.000Z',
      trustedAuthor: true,
    }])).toThrow('official_response_too_large')
  })
})
