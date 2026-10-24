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
})
