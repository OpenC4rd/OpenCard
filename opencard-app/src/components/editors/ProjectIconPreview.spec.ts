import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import OcOverlayToolbar from '../standard/OcOverlayToolbar.vue'
import ProjectIconPreview from './ProjectIconPreview.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const entry: ProjectIconCatalogEntry = {
  iconKey: 'coin',
  name: 'Coin',
  source: '.opencard/icons/pixels/coin.png',
  tint: 'original',
  pixelated: true,
  seriesKey: 'pixels',
  src: 'asset://coin.png',
  imageWidth: 16,
  imageHeight: 16,
}

function mountPreview() {
  return mount(ProjectIconPreview, { props: { entry } })
}

function iconStyle(wrapper: ReturnType<typeof mountPreview>): string {
  return wrapper.get('.project-icon-preview__icon').attributes('style') ?? ''
}

function controlsText(wrapper: ReturnType<typeof mountPreview>): string {
  return wrapper.get('.project-icon-preview__controls').text()
}

/** jsdom has neither PointerEvent nor pointer capture, so the events are built and the methods stubbed. */
async function dispatchPointer(element: HTMLElement, type: string, values: Record<string, number>): Promise<void> {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value })
  }
  element.dispatchEvent(event)
}

describe('ProjectIconPreview', () => {
  it('paints the icon through the shared icon contract at the canvas token size', () => {
    const wrapper = mountPreview()

    expect(wrapper.attributes('aria-label')).toBe('projectConfig.icons.previewLabel')
    expect(iconStyle(wrapper)).toContain('calc(var(--oc-project-icon-preview-size) * 1)')
    expect(iconStyle(wrapper)).toContain('--oc-project-icon-image-rendering')
    expect(controlsText(wrapper)).toContain('100%')
  })

  it('zooms with the wheel and returns to the canvas size on double click', async () => {
    const wrapper = mountPreview()

    await wrapper.trigger('wheel', { deltaY: -100 })
    expect(controlsText(wrapper)).toContain('116%')
    expect(iconStyle(wrapper)).toContain('* 1.1618')

    await wrapper.trigger('dblclick')
    expect(controlsText(wrapper)).toContain('100%')
    expect(iconStyle(wrapper)).toContain('* 1)')
  })

  it('drives the same zoom from its toolbar', async () => {
    const wrapper = mountPreview()
    const toolbar = wrapper.getComponent(OcOverlayToolbar)

    toolbar.vm.$emit('select', { key: 'viewport.zoom-in' })
    await wrapper.vm.$nextTick()
    expect(controlsText(wrapper)).toContain('125%')

    toolbar.vm.$emit('select', { key: 'viewport.fit' })
    await wrapper.vm.$nextTick()
    expect(controlsText(wrapper)).toContain('100%')
  })

  it('pans the icon while the pointer drags the canvas', async () => {
    const wrapper = mountPreview()
    const viewport = wrapper.get<HTMLElement>('.project-icon-preview')
    Object.defineProperties(viewport.element, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    })

    await dispatchPointer(viewport.element, 'pointerdown', { button: 0, pointerId: 7, clientX: 100, clientY: 100 })
    await dispatchPointer(viewport.element, 'pointermove', { pointerId: 7, clientX: 130, clientY: 120 })
    await dispatchPointer(viewport.element, 'pointerup', { pointerId: 7, clientX: 130, clientY: 120 })

    expect(iconStyle(wrapper)).toContain('translate(30px, 20px)')
  })

  it('shows the next icon at the canvas size instead of the previous zoom', async () => {
    const wrapper = mountPreview()

    await wrapper.trigger('wheel', { deltaY: -100 })
    await wrapper.setProps({ entry: { ...entry, iconKey: 'gem', name: 'Gem' } })

    expect(controlsText(wrapper)).toContain('100%')
  })
})
