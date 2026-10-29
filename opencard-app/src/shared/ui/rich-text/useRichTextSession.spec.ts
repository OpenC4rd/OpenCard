// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useRichTextSession, type RichTextEditorHandle } from './useRichTextSession'

function createFakeEditor(initial = 'initial'): {
  handle: RichTextEditorHandle
  getSpy: ReturnType<typeof vi.fn>
  setSpy: ReturnType<typeof vi.fn>
  flushSpy: ReturnType<typeof vi.fn>
} {
  let content = initial
  const getSpy = vi.fn(() => content)
  const setSpy = vi.fn((val: string) => { content = val; return true })
  const flushSpy = vi.fn(() => true)
  const handle: RichTextEditorHandle = {
    focus: vi.fn(),
    getHtml: getSpy,
    applyHtml: setSpy,
    getContent: getSpy,
    setContent: setSpy,
    flushPendingInput: flushSpy,
    endInteraction: vi.fn(),
  }
  return { handle, getSpy, setSpy, flushSpy }
}

describe('useRichTextSession', () => {
  it('initializes in rich mode regardless of legacy HTML or syntax flaws', async () => {
    const editor = ref<RichTextEditorHandle | null>(null)
    const sourceInput = ref<{ focus: () => void } | null>(null)
    const session = useRichTextSession(editor, sourceInput)

    await session.begin('@b{unclosed tag')
    expect(session.mode.value).toBe('rich')
    expect(session.open.value).toBe(true)
  })

  it('switches freely between rich and source mode without blocking', async () => {
    const { handle, getSpy, setSpy } = createFakeEditor('@b{hello}')
    const editor = ref<RichTextEditorHandle | null>(handle)
    const sourceInput = ref<{ focus: () => void } | null>(null)
    const session = useRichTextSession(editor, sourceInput)

    await session.begin('@b{hello}')
    expect(session.mode.value).toBe('rich')

    // Switch to source
    await session.switchMode('source')
    expect(session.mode.value).toBe('source')
    expect(session.source.value).toBe('@b{hello}')
    expect(getSpy).toHaveBeenCalled()

    // Edit source with syntax error
    session.editSource('@b{broken')

    // Switch back to rich without being blocked
    await session.switchMode('rich')
    expect(session.mode.value).toBe('rich')
    expect(setSpy).toHaveBeenCalledWith('@b{broken')
  })

  it('reflects Card Markup diagnostics in source mode without blocking save', async () => {
    const editor = ref<RichTextEditorHandle | null>(null)
    const sourceInput = ref<{ focus: () => void } | null>(null)
    const session = useRichTextSession(editor, sourceInput)

    await session.begin('hello')
    await session.switchMode('source')
    expect(session.diagnostics.value).toHaveLength(0)

    session.editSource('@b{unclosed')
    expect(session.diagnostics.value.length).toBeGreaterThan(0)
    expect(session.diagnostics.value[0]?.code).toBe('unclosed-tag')

    // Save is not blocked even with diagnostics
    const saved = session.readForSave()
    expect(saved).toBe('@b{unclosed')
  })

  it('flushes pending editor input before switching to source mode and stops on failure', async () => {
    const { handle, flushSpy } = createFakeEditor('hello')
    flushSpy.mockReturnValueOnce(false)
    const editor = ref<RichTextEditorHandle | null>(handle)
    const sourceInput = ref<{ focus: () => void } | null>(null)
    const session = useRichTextSession(editor, sourceInput)

    await session.begin('hello')
    await session.switchMode('source')

    // Mode switch stopped because flush returned false
    expect(session.mode.value).toBe('rich')
  })
})
