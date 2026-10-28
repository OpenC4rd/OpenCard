import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createImageBlock } from '../../../entities/card/model'
import ImageBlockRenderer from './ImageBlockRenderer.vue'
import { createRendererTestResources, parseRenderReadyBlockForTest, rendererTestGlobal } from './renderTestUtils'
import type { RenderReadyImageBlock } from '../render.types'
import { cardEditorContextKey } from './cardEditorContext'
import { createCardRenderResourceContext, createCardResourceResolver } from '../cardRenderResources'
import { createResourceEnvironment } from '../../workspace/services/projectResourceEnvironment'
import type { FileSystemService } from '../../workspace/services/fileSystemService'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `https://asset.localhost/${encodeURIComponent(path)}`,
}))

vi.mock('../../workspace/store/projectStore', () => ({
  useProjectStore: () => ({ resolveAssetSrc: (path: string) => path }),
}))

function createBlock(source: string): RenderReadyImageBlock {
  return parseRenderReadyBlockForTest(createImageBlock({ id: 'image-block-test', name: 'Test image', source }))
}

describe('ImageBlockRenderer', () => {
  it('reloads a local image after a resource change and reports the file as failed once it is gone', async () => {
    let exists = true
    const environment = await createResourceEnvironment('D:/project', { watch: false, snapshotsRoot: 'D:/cache',
      fs: { fileExists: async (path: string) => path.endsWith('logo.png') && exists } as unknown as FileSystemService,
    })
    const resources = createCardResourceResolver(() => createCardRenderResourceContext({
      resourceRootPath: 'D:/project',
      hostEnvironment: environment.state.value,
    }))
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('Assets/logo.png'), placement: { kind: 'root' } },
      global: { provide: { [cardEditorContextKey as symbol]: {
        transformDisabledBlockIds: computed(() => new Set<string>()), handleBlockClick: () => undefined, resources,
      } } },
    })
    try {
      await environment.state.value.waitForResources?.()
      await wrapper.vm.$nextTick()
      const oldSource = wrapper.get('img').attributes('src')
      await wrapper.get('img').trigger('load')

      await environment.refresh(['D:/project/Assets/logo.png'])
      await wrapper.vm.$nextTick()
      await environment.state.value.waitForResources?.()
      await wrapper.vm.$nextTick()
      expect(wrapper.get('img').attributes('src')).not.toBe(oldSource)

      await wrapper.get('img').trigger('error')
      expect(wrapper.find('[aria-label="图片加载失败"]').exists()).toBe(true)

      exists = false
      await environment.refresh(['D:/project/Assets'])
      await wrapper.vm.$nextTick()
      await environment.state.value.waitForResources?.()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.find('[aria-label="图片加载失败"]').exists()).toBe(true)
    } finally { wrapper.unmount(); await environment.dispose() }
  })

  it('settles visual readiness after the image loads', async () => {
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

  it('keeps visual readiness pending while resource resolution is pending', async () => {
    const settle = vi.fn()
    const begin = vi.fn(() => ({ settle }))
    const resources = {
      resolve: () => ({ kind: 'pending' as const }),
      resolveIconDimensions: () => undefined,
      withScopes: () => resources,
    }
    mount(ImageBlockRenderer, {
      props: { block: createBlock('/image.png'), placement: { kind: 'root' } },
      global: {
        provide: {
          [cardEditorContextKey as symbol]: {
            transformDisabledBlockIds: computed(() => new Set<string>()),
            handleBlockClick: () => undefined,
            resources,
            visualReadiness: { createSlot: () => ({ begin, dispose: vi.fn() }) },
          },
        },
      },
    })

    expect(begin).toHaveBeenCalledOnce()
    expect(settle).not.toHaveBeenCalled()
  })

  it('retries a broken image when its source changes', async () => {
    const wrapper = mount(ImageBlockRenderer, {
      props: { block: createBlock('/missing.png'), placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })

    await wrapper.get('.image-block__image').trigger('error')
    expect(wrapper.find('[aria-label="图片加载失败"]').exists()).toBe(true)

    await wrapper.setProps({ block: createBlock('/available.png') })
    await wrapper.get('.image-block__image').trigger('load')
    expect(wrapper.find('[aria-label="图片加载失败"]').exists()).toBe(false)
  })
})
