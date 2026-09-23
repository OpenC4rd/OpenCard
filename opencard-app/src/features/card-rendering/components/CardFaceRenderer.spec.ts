import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRichTextHtml } from '../../../shared/rich-text/richTextHtml'
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
import { setProjectFonts } from '../../workspace/model/projectFonts'

afterEach(() => setProjectFonts([]))

describe('CardFaceRenderer resources', () => {
  it('renders the project font for text blocks', () => {
    const font = { key: 'brand', name: 'Brand', files: { normal: { upright: 'fonts/Brand.ttf' } } }
    setProjectFonts([font])
    const environment: ProjectResourceEnvironment = {
      kind: 'project', namespace: 'project-root', rootPath: '/project',
      fontDocument: {}, fonts: { brand: { kind: 'family', name: 'Brand', family: font } },
      iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const native = parseRenderReadyBlockForTest(createBlock('text-block', {
      id: 'native-text', content: '<p>Native</p>', fontFamily: 'font:brand',
    }))
    const nativeRichText = parseRichTextHtml('<p>Native</p>')
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100, background: '#fff',
      children: [native].map((block, index) => ({
        block,
        location: {
          id: `location-${index}`, type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px',
        },
      })),
    }
    const resourceContext = createCardRenderResourceContext({
      hostEnvironment: environment,
      richText: new Map([['native-text', {
        document: nativeRichText.document, embeddedBlocks: new Map(), diagnostics: [], valid: true,
      }]]),
    })

    const wrapper = mount(CardFaceRenderer, { props: { face, resourceContext } })

    expect(wrapper.get<HTMLElement>('[data-block-id="native-text"]').element.style.fontFamily)
      .toBe('"OpenCardProjectFont-brand"')
  })

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

  it('reacts to a replaced rich-text resource context without remounting the face', async () => {
    const text = parseRenderReadyBlockForTest(createBlock('text-block', {
      id: 'text',
      content: '<p>Initial</p>',
    }))
    const face: RenderReadyCardFace = {
      type: 'card-face', id: 'front', faceKey: 'front', width: 100, height: 100,
      background: '#fff',
      children: [{
        block: text,
        location: { id: 'location', type: 'simple-container-location', anchor: 'lt', x: '0px', y: '0px' },
      }],
    }
    const prepared = (html: string) => {
      const parsed = parseRichTextHtml(html)
      return new Map([['text', {
        document: parsed.document,
        embeddedBlocks: new Map(),
        diagnostics: [],
        valid: true,
      }]])
    }
    const wrapper = mount(CardFaceRenderer, {
      props: { face, resourceContext: createCardRenderResourceContext({ richText: prepared('<p>Initial</p>') }) },
    })

    expect(wrapper.text()).toContain('Initial')
    await wrapper.setProps({
      resourceContext: createCardRenderResourceContext({ richText: prepared('<p>Updated</p>') }),
    })

    expect(wrapper.text()).toContain('Updated')
    expect(wrapper.text()).not.toContain('Initial')
  })
})
