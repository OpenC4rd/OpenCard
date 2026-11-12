import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createBlock } from '../../../entities/card/model'
import { createCardRenderResourceContext } from '../cardRenderResources'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../workspace/services/projectIconCatalog'
import {
  projectResourceScopeIdentity,
  type ProjectResourceEnvironment,
} from '../../workspace/services/projectResourceEnvironment'
import type { RenderReadyCardFace } from '../render.types'
import CardFaceRenderer from './CardFaceRenderer.vue'
import { parseRenderReadyBlockForTest } from './renderTestUtils'

describe('CardFaceRenderer resources', () => {
  it('does not expose a package-local path to an ordinary native block', () => {
    const image = parseRenderReadyBlockForTest(createBlock('image-block', {
      id: 'picture',
      source: 'assets/a.png',
    }))
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100,
      background: '#fff',
      children: [{
        block: image,
        location: { id: 'location', type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px' },
      }],
    }
    const packageEnvironment: ProjectResourceEnvironment = {
      kind: 'package',
      namespace: 'package-alice-picture',
      rootPath: 'D:/Cards/.opencard/packages/alice-picture',
      fontDocument: {},
      fonts: {},
      iconDocument: {},
      iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const resourceContext = createCardRenderResourceContext({
      resourceScopes: new Map([[
        projectResourceScopeIdentity('custom-host', 'image'),
        packageEnvironment,
      ]]),
    })

    const wrapper = mount(CardFaceRenderer, { props: { face, resourceContext } })

    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('scales physical canvas pixels dynamically with renderScale without artificial ratio clamp', () => {
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100,
      background: '#fff',
      children: [],
    }
    const resourceContext = createCardRenderResourceContext({})
    const wrapper = mount(CardFaceRenderer, {
      props: { face, resourceContext, renderScale: 15 },
    })

    const canvas = wrapper.find('canvas').element as HTMLCanvasElement
    expect(canvas.width).toBeGreaterThanOrEqual(1500)
    expect(canvas.height).toBeGreaterThanOrEqual(1500)
  })

  it('paints only the view on a single canvas that stays 1:1 with device pixels', () => {
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100,
      background: '#fff',
      children: [],
    }
    const wrapper = mount(CardFaceRenderer, {
      props: {
        face,
        resourceContext: createCardRenderResourceContext({}),
        view: { left: 10, top: 20, width: 50, height: 40, pixelScale: 8, screenScale: 4 },
      },
    })

    expect(wrapper.findAll('canvas')).toHaveLength(1)
    const canvas = wrapper.find('canvas').element as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([400, 320])
    // 按屏幕尺寸布局，只平移不缩放
    expect([canvas.style.width, canvas.style.height]).toEqual(['200px', '160px'])
    expect(canvas.style.transform).toBe('translate(40px, 80px)')
  })

  it('maps clicks through the view back to face coordinates', async () => {
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100,
      background: '#fff',
      children: [{
        block: parseRenderReadyBlockForTest(createBlock('text-block', { id: 'hit', width: '20mm', height: '20mm' })),
        location: { id: 'location', type: 'simple-container-location', anchor: 'lt', x: '55mm', y: '55mm' },
      }],
    }
    const wrapper = mount(CardFaceRenderer, {
      props: {
        face,
        resourceContext: createCardRenderResourceContext({}),
        view: { left: 50, top: 50, width: 50, height: 50, pixelScale: 2, screenScale: 2 },
      },
    })
    const canvas = wrapper.find('canvas').element
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect

    await wrapper.find('canvas').trigger('click', { clientX: 20, clientY: 20 })
    expect(wrapper.emitted('block-click')?.[0]?.[0]).toBe('hit')
    await wrapper.find('canvas').trigger('click', { clientX: 90, clientY: 90 })
    expect(wrapper.emitted('blank-click')).toHaveLength(1)
  })
})
