import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createImageBlock } from '../../../entities/card/model'
import ImageBlockRenderer from './ImageBlockRenderer.vue'
import { createRendererTestResources, parseRenderReadyBlockForTest, rendererTestGlobal } from './renderTestUtils'
import type { RenderReadyImageBlock } from '../render.types'
import { cardEditorContextKey } from './cardEditorContext'
import { createCardRenderResourceContext, createCardResourceResolver } from '../cardRenderResources'
import ProjectIconGraphic from './ProjectIconGraphic.vue'

vi.mock('../../workspace/store/projectStore', () => ({
  useProjectStore: () => ({ resolveAssetSrc: (path: string) => path }),
}))

function createBlock(source: string, fit: 'cover' | 'contain' | 'fill' = 'contain'): RenderReadyImageBlock {
  return parseRenderReadyBlockForTest(createImageBlock({
    id: 'image-block-test', name: 'Test image', source, fit,
  }))
}

describe('ImageBlockRenderer', () => {
  it.each(['cover', 'contain', 'fill'] as const)('renders icon sources through the real resolver with %s fit', async (fit) => {
    const entry = {
      seriesKey: 'status', iconKey: 'warning', name: 'Warning',
      source: 'icons/warning.svg', src: 'asset:///icons/warning.svg',
      tint: 'theme' as const, imageWidth: 64, imageHeight: 64,
    }
    const resources = createCardResourceResolver(createCardRenderResourceContext({
      projectIconCatalog: { series: [], entries: [entry] },
    }))
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('icon:status/warning', fit), placement: { kind: 'root' } },
      global: { provide: { [cardEditorContextKey as symbol]: {
        transformDisabledBlockIds: computed(() => new Set<string>()),
        handleBlockClick: () => undefined,
        resources,
      } } },
    })
    expect(wrapper.getComponent(ProjectIconGraphic).props('fit')).toBe(fit)
    expect(wrapper.get('.project-icon-graphic').attributes('aria-label')).toBe('Warning')
    expect(wrapper.get('.oc-project-icon').attributes('style')).toContain('icons/warning.svg')
    expect(wrapper.find('.image-block__placeholder').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ block: createBlock('icon:status/missing', fit) })
    expect(wrapper.find('.project-icon-graphic').exists()).toBe(false)
    expect(wrapper.find('[aria-label="图片加载失败"]').exists()).toBe(true)
  })

  it.each(['cover', 'contain', 'fill'] as const)('projects the %s fit mode onto the image', (fit) => {
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('/image.png', fit), placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })

    const image = wrapper.get('.image-block__image').element as HTMLImageElement
    expect(image.style.position).toBe('absolute')
    expect(image.style.inset).toBe('0px')
    expect(image.style.objectFit).toBe(fit)
    expect(image.style.objectPosition).toBe('50% 50%')
  })

  it('settles visual readiness after the image loads or fails', async () => {
    const settle = vi.fn()
    const begin = vi.fn(() => ({ settle }))
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('/image.png'), placement: { kind: 'root' } },
      global: {
        provide: {
          [cardEditorContextKey as symbol]: {
            transformDisabledBlockIds: computed(() => new Set<string>()),
            handleBlockClick: () => undefined,
            resources: createRendererTestResources(),
            visualReadiness: { createSlot: () => ({ begin, dispose: vi.fn() }) },
          },
        },
      },
    })

    expect(begin).toHaveBeenCalledOnce()
    await wrapper.get('.image-block__image').trigger('load')
    expect(settle).toHaveBeenCalledOnce()
  })

  it('replaces the native broken-image state and retries when the source changes', async () => {
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('/missing.png'), placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })

    expect(wrapper.get('.image-block__image').classes()).not.toContain('is-loaded')
    await wrapper.get('.image-block__image').trigger('error')
    expect(wrapper.get('[aria-label="图片加载失败"]')).toBeDefined()

    await wrapper.setProps({ block: createBlock('/available.png') })
    await wrapper.get('.image-block__image').trigger('load')
    expect(wrapper.find('.image-block__placeholder').exists()).toBe(false)
    expect(wrapper.get('.image-block__image').classes()).toContain('is-loaded')
  })

  it('keeps a loaded image visible when only the resolved source object is rebuilt', async () => {
    const generation = ref(0)
    const resources = createRendererTestResources()
    const resolve = vi.fn(() => {
      generation.value
      return { kind: 'url' as const, src: 'asset:///logo.png' }
    })
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('/logo.png'), placement: { kind: 'root' } },
      global: { provide: { [cardEditorContextKey as symbol]: {
        transformDisabledBlockIds: computed(() => new Set<string>()),
        handleBlockClick: () => undefined,
        resources: { ...resources, resolve },
      } } },
    })

    await wrapper.get('.image-block__image').trigger('load')
    expect(wrapper.get('.image-block__image').classes()).toContain('is-loaded')

    generation.value += 1
    await wrapper.vm.$nextTick()

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.image-block__image').classes()).toContain('is-loaded')
    expect(wrapper.find('.image-block__placeholder').exists()).toBe(false)
  })
})
