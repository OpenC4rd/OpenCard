import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createTextBlock } from '../../../entities/card/model'
import TextBlockRenderer from './TextBlockRenderer.vue'
import { parseRenderReadyBlockForTest, rendererTestGlobal, richTextRendererTestGlobal } from './renderTestUtils'
import { cardEditorContextKey } from './cardEditorContext'

describe('TextBlockRenderer', () => {
  it('promotes plain-text line breaks to rich-text paragraphs', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'multiline-text-block',
      type: 'text-block',
      content: 'first line\nsecond line',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block),
    })

    expect(wrapper.findAll('.text-block-content--richtext p').map(paragraph => paragraph.text()))
      .toEqual(['first line', 'second line'])
  })

  it('renders content through the rich-text contract', () => {
    const block = parseRenderReadyBlockForTest(createTextBlock({
      id: 'rich-text-block',
      content: '<p style="text-align: center">first <strong>second</strong></p>',
    }))

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block),
    })
    const content = wrapper.get('.text-block-content--richtext')

    expect(content.get('p').attributes('style')).toContain('text-align: center')
    expect(content.get('strong').text()).toBe('second')
  })

  it('renders underline and strikethrough marks', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'decorated-rich-text-block',
      type: 'text-block',
      content: '<p><u>Underline</u> <s>Strike</s></p>',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block),
    })
    const content = wrapper.get('.text-block-content--richtext')

    expect(content.get('u').text()).toBe('Underline')
    expect(content.get('s').text()).toBe('Strike')
  })

  it('keeps horizontal text alignment independent from vertical content alignment', () => {
    const block = parseRenderReadyBlockForTest(createTextBlock({
      id: 'text-block-test',
      content: 'A paragraph long enough to exercise text layout.',
      textAlign: 'justify',
      verticalAlign: 'bottom',
    }))

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })
    const style = wrapper.element.style

    expect(style.display).toBe('flex')
    expect(style.flexDirection).toBe('column')
    expect(style.justifyContent).toBe('flex-end')
    expect(style.textAlign).toBe('justify')
  })

  it('renders semicolon-separated project and system font fallbacks', () => {
    const resolve = vi.fn(() => ({
      kind: 'font' as const,
      cssFamily: '"OpenCardProjectFont-brand-sans", "Microsoft YaHei", sans-serif',
    }))
    const block = parseRenderReadyBlockForTest(createTextBlock({
      id: 'project-font-block',
      content: 'Brand text',
      fontFamily: 'font:brand-sans; Microsoft YaHei; sans-serif',
    }))

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: {
        provide: {
          ...rendererTestGlobal.provide,
          [cardEditorContextKey as symbol]: {
            ...rendererTestGlobal.provide[cardEditorContextKey as symbol],
            resources: {
              ...rendererTestGlobal.provide[cardEditorContextKey as symbol].resources,
              resolve,
            },
          },
        },
      },
    })

    expect(resolve).toHaveBeenCalledWith({
      value: 'font:brand-sans; Microsoft YaHei; sans-serif',
      expect: 'font',
      blockId: 'project-font-block',
      fieldKey: 'fontFamily',
    })
    expect(wrapper.element.style.fontFamily)
      .toBe('"OpenCardProjectFont-brand-sans", "Microsoft YaHei", sans-serif')
  })

  it('does not render HTML that has no prepared safe document', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'safe-rich-text-block',
      type: 'text-block',
      content: '<script>alert(1)</script><p onclick="alert(1)" style="color: red; position: fixed">Safe <span style="font-family: Impact; background-image: url(x)">text</span></p>',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })
    const content = wrapper.get('.text-block-content--richtext')

    expect(content.find('script').exists()).toBe(false)
    expect(content.find('p').exists()).toBe(false)
  })

  it('preserves only the controlled binding attribute on rich-text spans', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'binding-rich-text-block',
      type: 'text-block',
      content: '<p><span data-oc-binding="self:name">OpenCard</span></p>',
    })

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block),
    })
    const binding = wrapper.get('[data-oc-binding]')

    expect(binding.attributes('data-oc-binding')).toBe('self:name')
  })

  it('renders saved project-icon nodes with their atlas CSS variables', () => {
    const block = parseRenderReadyBlockForTest({
      id: 'project-icon-rich-text-block',
      type: 'text-block',
      content: '<p><span data-oc-icon-path="mc-wu-pin/r3-c16"></span></p>',
    })
    const catalog = {
      series: [{ name: 'MC items', key: 'mc-wu-pin' }],
      entries: [{
        seriesKey: 'mc-wu-pin', source: '.opencard/icons/mc-wu-pin/carrot.svg', src: 'asset://icons/carrot.svg',
        imageWidth: 16, imageHeight: 16,
        iconKey: 'r3-c16', name: 'Carrot on a Stick', tint: 'original', pixelated: true, rotation: 180,
      }]
    } as const

    const wrapper = mount(TextBlockRenderer, {
      props: { block, placement: { kind: 'root' } },
      global: richTextRendererTestGlobal(block, catalog),
    })
    const icon = wrapper.get<HTMLElement>('.project-inline-icon').element

    expect(icon.style.getPropertyValue('--oc-project-icon-renderer')).toBe('image')
    expect(icon.style.getPropertyValue('--oc-project-icon-background-image')).toBe('url("asset://icons/carrot.svg")')
    expect(icon.style.getPropertyValue('--oc-project-icon-background-size')).toBe('100% 100%')
    expect(icon.style.getPropertyValue('--oc-project-icon-image-rendering')).toBe('pixelated')
    expect(icon.style.getPropertyValue('--oc-project-icon-transform')).toBe('rotate(180deg)')
  })
})
