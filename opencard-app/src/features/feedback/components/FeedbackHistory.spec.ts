import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import * as feedbackService from '../services/feedbackService'
import { feedbackReceiptStore, type FeedbackReceiptRecord } from '../services/feedbackReceiptStore'
import FeedbackHistory from './FeedbackHistory.vue'
import { confirmationRequest, resolveConfirmation } from '../../shell/services/appConfirmation'

const record: FeedbackReceiptRecord = {
  reportId: '6e18e221-4c8a-4c90-8234-b2aa60654f70',
  receiptToken: 'receipt-token',
  kind: 'suggestion',
  summary: 'Improve keyboard navigation.',
  submittedAt: '2026-08-01T00:00:00.000Z',
  status: 'received',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function mountDialog(props: { developerMode?: boolean } = {}) {
  return mount(FeedbackHistory, {
    props: { active: true, ...props },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: { Teleport: true },
    },
  })
}

afterEach(() => {
  resolveConfirmation(false)
  vi.restoreAllMocks()
})

describe('FeedbackHistory', () => {
  it('renders Markdown replies without interpreting raw HTML or unsafe links', async () => {
    vi.spyOn(feedbackReceiptStore, 'list').mockResolvedValue([{
      ...record,
      status: 'answered',
      nextCheckAt: '2999-01-01T00:00:00.000Z',
      officialResponse: {
        text: '### Update\n\n**Fixed**\n\n[Details](https://example.com/update)\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))',
        updatedAt: record.updatedAt,
      },
    }])
    vi.spyOn(feedbackReceiptStore, 'markResponseRead').mockResolvedValue()
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]!.attributes('href')).toBe('https://example.com/update')
    wrapper.unmount()
  })

  it('refreshes only the public status projection and never shows the receipt token', async () => {
    const answeredRecord: FeedbackReceiptRecord = {
      ...record,
      status: 'answered',
      updatedAt: '2026-08-01T02:00:00.000Z',
      lastSyncedAt: '2026-08-01T02:01:00.000Z',
      officialResponse: { text: 'This is now fixed.', updatedAt: '2026-08-01T02:00:00.000Z' },
    }
    vi.spyOn(feedbackReceiptStore, 'list')
      .mockResolvedValueOnce([record])
      .mockResolvedValue([answeredRecord])
    const markResponseRead = vi.spyOn(feedbackReceiptStore, 'markResponseRead').mockResolvedValue()
    const applyStatuses = vi.spyOn(feedbackReceiptStore, 'applyStatuses').mockResolvedValue()
    const getStatuses = vi.spyOn(feedbackService, 'getFeedbackStatuses').mockResolvedValue([{
      reportId: record.reportId,
      status: 'answered',
      submittedAt: record.submittedAt,
      updatedAt: answeredRecord.updatedAt,
      officialResponse: answeredRecord.officialResponse,
    }])

    const wrapper = mountDialog()
    await flushPromises()

    expect(getStatuses).toHaveBeenCalledWith([{
      reportId: record.reportId,
      receiptToken: record.receiptToken,
    }])
    expect(applyStatuses).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('This is now fixed.')
    expect(wrapper.text()).not.toContain('receipt-token')
    expect(markResponseRead).toHaveBeenCalledWith(record.reportId, answeredRecord.officialResponse?.updatedAt)
  })

  it('requires confirmation and deletes only the selected local record', async () => {
    vi.spyOn(feedbackReceiptStore, 'list')
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([record])
      .mockResolvedValueOnce([])
    vi.spyOn(feedbackService, 'getFeedbackStatuses').mockRejectedValue(
      new feedbackService.FeedbackServiceError('network', 'offline'),
    )
    vi.spyOn(feedbackReceiptStore, 'markRefreshFailed').mockResolvedValue()
    const remove = vi.spyOn(feedbackReceiptStore, 'remove').mockResolvedValue()
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text().includes('Delete Local Record'))!.trigger('click')
    expect(confirmationRequest.value?.message).toContain('does not withdraw or delete')
    expect(remove).not.toHaveBeenCalled()

    resolveConfirmation(true)
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(record.reportId)
  })

  it('never sends closed receipts when refreshing the history', async () => {
    const closedRecord: FeedbackReceiptRecord = {
      ...record,
      reportId: 'closed-report',
      receiptToken: 'closed-token',
      status: 'closed',
    }
    vi.spyOn(feedbackReceiptStore, 'list')
      .mockResolvedValueOnce([closedRecord, record])
      .mockResolvedValueOnce([closedRecord, record])
    vi.spyOn(feedbackReceiptStore, 'applyStatuses').mockResolvedValue()
    const getStatuses = vi.spyOn(feedbackService, 'getFeedbackStatuses').mockResolvedValue([{
      reportId: record.reportId,
      status: 'received',
      submittedAt: record.submittedAt,
      updatedAt: record.updatedAt,
    }])

    mountDialog()
    await flushPromises()

    expect(getStatuses).toHaveBeenCalledWith([{
      reportId: record.reportId,
      receiptToken: record.receiptToken,
    }])
  })

  it('shows cached data without a request when no open receipt is due', async () => {
    vi.spyOn(feedbackReceiptStore, 'list').mockResolvedValue([{
      ...record,
      nextCheckAt: '2999-01-01T00:00:00.000Z',
    }])
    const getStatuses = vi.spyOn(feedbackService, 'getFeedbackStatuses')

    mountDialog()
    await flushPromises()

    expect(getStatuses).not.toHaveBeenCalled()
  })

  it('allows developer mode to force one batch refresh before the schedule is due', async () => {
    const scheduledRecord = { ...record, nextCheckAt: '2999-01-01T00:00:00.000Z' }
    vi.spyOn(feedbackReceiptStore, 'list')
      .mockResolvedValueOnce([scheduledRecord])
      .mockResolvedValueOnce([scheduledRecord])
    vi.spyOn(feedbackReceiptStore, 'applyStatuses').mockResolvedValue()
    const getStatuses = vi.spyOn(feedbackService, 'getFeedbackStatuses').mockResolvedValue([{
      reportId: record.reportId,
      status: 'received',
      submittedAt: record.submittedAt,
      updatedAt: record.updatedAt,
    }])
    const wrapper = mountDialog({ developerMode: true })
    await flushPromises()
    expect(getStatuses).not.toHaveBeenCalled()

    await wrapper.findAll('button').find(button => button.text().includes('Force Refresh'))!.trigger('click')
    await flushPromises()

    expect(getStatuses).toHaveBeenCalledWith([{
      reportId: record.reportId,
      receiptToken: record.receiptToken,
    }])
  })
})
