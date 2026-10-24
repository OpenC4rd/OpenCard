import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from '../../locales/en-US'
import ImagePreviewEditor from './ImagePreviewEditor.vue'
import { useProjectStore } from '../../features/workspace/store/projectStore'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  convertFileSrc: (path: string) => `asset://${path}`,
}))

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(): void {
    this.callback([{
      contentRect: { width: 800, height: 600 },
    } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  disconnect(): void {}
}

type EditorWrapper = VueWrapper<InstanceType<typeof ImagePreviewEditor>>
type ViewportTransform = { x: number; y: number; scale: number }

const VIEWPORT_RECT = {
  left: 40,
  top: 20,
  width: 800,
  height: 600,
  right: 840,
  bottom: 620,
}

async function dispatchPointer(
  element: HTMLElement,
  type: string,
  values: Record<string, number>,
): Promise<void> {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value })
  }
  element.dispatchEvent(event)
  await nextTick()
}

function createEditor(viewportTransform?: ViewportTransform): EditorWrapper {
  const wrapper = mount(ImagePreviewEditor, {
    props: { session: createTestSession({ path: 'assets/example.png', viewState: { 'image-preview': { viewportTransform } } }) },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
    },
  })
  vi.spyOn(wrapper.props('session'), 'updateViewState')
  return wrapper
}

async function loadImage(wrapper: EditorWrapper): Promise<void> {
  const image = wrapper.get('img').element as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: 1000 })
  Object.defineProperty(image, 'naturalHeight', { value: 500 })
  await wrapper.get('img').trigger('load')
}

function lastTransform(wrapper: EditorWrapper): ViewportTransform | undefined {
  const calls = vi.mocked(wrapper.props('session').updateViewState).mock.calls
    .filter(([id, patch]) => id === 'image-preview' && patch.viewportTransform)
  return calls[calls.length - 1]?.[1].viewportTransform as ViewportTransform | undefined
}

describe('ImagePreviewEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('previews an external image without requiring an open project', async () => {
    expect(useProjectStore().projectPath.value).toBe('')
    const wrapper = mount(ImagePreviewEditor, {
      props: { session: createTestSession({ path: 'D:/Downloads/example.png' }) },
      global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
    })

    expect(wrapper.get('img').attributes('src')).toBe('asset://D:/Downloads/example.png')
    await loadImage(wrapper)
    expect(wrapper.find('img').exists()).toBe(true)
    wrapper.unmount()
  })

  it('pans, toggles pixelation, and resets through the session view state', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)

    const pixelated = wrapper.get('button[aria-label="Pixelated"]')
    expect(pixelated.attributes('aria-pressed')).toBe('false')
    await pixelated.trigger('click')
    expect(wrapper.props('session').state.viewState['image-preview']).toMatchObject({ pixelated: true })
    expect(pixelated.attributes('aria-pressed')).toBe('true')

    await wrapper.get('.image-preview-editor').trigger('keydown', { key: 'ArrowLeft' })
    expect(lastTransform(wrapper)).toEqual({ x: 32, y: 0, scale: 1 })

    await wrapper.get('[aria-label="Fit viewport"]').trigger('click')
    expect(lastTransform(wrapper)).toEqual({ x: 0, y: 0, scale: 1 })

    const viewport = wrapper.get<HTMLElement>('.image-preview-editor')
    Object.defineProperties(viewport.element, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })
    await dispatchPointer(viewport.element, 'pointerdown', { button: 0, pointerId: 7, clientX: 100, clientY: 100 })
    await dispatchPointer(viewport.element, 'pointermove', { pointerId: 7, clientX: 130, clientY: 120 })
    await dispatchPointer(viewport.element, 'pointerup', { pointerId: 7, clientX: 130, clientY: 120 })

    expect(lastTransform(wrapper)).toEqual({ x: 30, y: 20, scale: 1 })
  })

  it('reads each diff revision from its own snapshot root', async () => {
    const wrapper = mount(ImagePreviewEditor, {
      props: {
        session: createTestSession({ path: 'D:/project/assets/example.png', mode: 'diff' }),
        resourceRootPath: 'D:/project',
        comparison: {
          before: { revisionId: 'a', label: 'A', content: '', resourceRootPath: 'D:/snapshot-a' },
          after: { revisionId: null, label: 'Current', content: '', resourceRootPath: 'D:/project' },
        },
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      },
    })

    const images = wrapper.findAll<HTMLImageElement>('.image-preview-editor__diff-panel img')
    expect(images).toHaveLength(2)
    expect(images[0]!.attributes('src')).toBe('asset://D:/snapshot-a/assets/example.png')
    expect(images[1]!.attributes('src')).toBe('asset://D:/project/assets/example.png')
  })

  it('resets the transform on viewport double click', async () => {
    const wrapper = createEditor({ x: 10, y: 20, scale: 2 })
    await loadImage(wrapper)

    await wrapper.get('.image-preview-editor').trigger('dblclick')

    expect(lastTransform(wrapper)).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('prevents the default wheel action while zooming', async () => {
    const wrapper = createEditor()
    await loadImage(wrapper)
    Object.defineProperty(wrapper.get('.image-preview-editor').element, 'getBoundingClientRect', {
      value: () => VIEWPORT_RECT,
    })

    const event = new WheelEvent('wheel', {
      deltaY: -120,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      clientX: 440,
      clientY: 320,
      bubbles: true,
      cancelable: true,
    })
    wrapper.get('.image-preview-editor').element.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
  })
})
