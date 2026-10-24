import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monacoMock = vi.hoisted(() => {
  const editor = {
    getValue: vi.fn(() => '{}'),
    getModel: vi.fn((): { dispose: () => void } | null => null),
    onDidChangeModelContent: vi.fn(),
    addCommand: vi.fn(),
    updateOptions: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    dispose: vi.fn(),
  }
  const diffEditor = { setModel: vi.fn(), dispose: vi.fn() }
  return {
    editor,
    diffEditor,
    create: vi.fn((_container: unknown, _options?: Record<string, unknown>) => editor),
    createDiffEditor: vi.fn((_container: unknown, _options?: Record<string, unknown>) => diffEditor),
    createModel: vi.fn((_value?: string, _language?: string, _uri?: unknown) => ({ dispose: vi.fn() })),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
  }
})

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

vi.mock('monaco-editor', () => ({
  editor: {
    create: monacoMock.create,
    createDiffEditor: monacoMock.createDiffEditor,
    createModel: monacoMock.createModel,
    defineTheme: monacoMock.defineTheme,
    setTheme: monacoMock.setTheme,
    setModelLanguage: monacoMock.setModelLanguage,
  },
  Uri: { parse: (value: string) => ({ toString: () => value }) },
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { KeyS: 49 },
}))

import MonacoEditor from './MonacoEditor.vue'

/** The editor module is loaded on demand, so a mount needs a few flushes before it settles. */
async function flushMonacoLoad(): Promise<void> {
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 0))
  await flushPromises()
}

describe('MonacoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    monacoMock.editor.getModel.mockReturnValue(null)
  })

  it('builds the editor only after the on-demand module is ready', async () => {
    const wrapper = mount(MonacoEditor, { props: { modelValue: '{}', language: 'json' } })

    expect(monacoMock.create).not.toHaveBeenCalled()

    await flushMonacoLoad()

    expect(monacoMock.create).toHaveBeenCalledOnce()
    expect(monacoMock.create.mock.calls[0]?.[1]).toMatchObject({ language: 'json' })
    wrapper.unmount()
  })

  it('does not build an editor for a component that unmounted while loading', async () => {
    const wrapper = mount(MonacoEditor, { props: { modelValue: '{}', language: 'json' } })
    wrapper.unmount()

    await flushMonacoLoad()

    expect(monacoMock.create).not.toHaveBeenCalled()
    expect(monacoMock.createModel).not.toHaveBeenCalled()
  })

  it('builds a read-only diff editor with both sides when comparing revisions', async () => {
    const wrapper = mount(MonacoEditor, {
      props: {
        modelValue: '',
        language: 'json',
        mode: 'diff',
        comparison: {
          before: { revisionId: 'before', label: 'before', content: '{}' },
          after: { revisionId: 'after', label: 'after', content: '{ "a": 1 }' },
        },
      },
    })
    await flushMonacoLoad()

    expect(monacoMock.createModel).toHaveBeenCalledTimes(2)
    expect(monacoMock.createDiffEditor).toHaveBeenCalledOnce()
    const sides = monacoMock.diffEditor.setModel.mock.calls[0]?.[0]
    expect(sides.original).not.toBe(sides.modified)
    expect(monacoMock.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('applies language and read-only changes after the editor exists', async () => {
    const wrapper = mount(MonacoEditor, { props: { modelValue: '{}', language: 'json' } })
    await flushMonacoLoad()

    const fakeModel = { dispose: vi.fn() }
    monacoMock.editor.getModel.mockReturnValue(fakeModel)
    await wrapper.setProps({ language: 'markdown' })
    expect(monacoMock.setModelLanguage).toHaveBeenCalledWith(fakeModel, 'markdown')

    await wrapper.setProps({ readOnly: true })
    expect(monacoMock.editor.updateOptions).toHaveBeenCalledWith({ readOnly: true })
    wrapper.unmount()
  })
})
