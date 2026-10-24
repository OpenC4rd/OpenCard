import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createQrCodeBlock } from '../../../entities/card/model'
import QrCodeBlockRenderer from './QrCodeBlockRenderer.vue'
import { parseRenderReadyBlockForTest, rendererTestGlobal } from './renderTestUtils'
import type { RenderReadyQrCodeBlock } from '../render.types'

function createBlock(content: string): RenderReadyQrCodeBlock {
  return parseRenderReadyBlockForTest(createQrCodeBlock({
    id: 'qr-test', name: 'QR test', content, errorCorrection: 'H',
    foreground: '#112233', backgroundColor: '#FDFDFD', quietZone: '2',
  }))
}

describe('QrCodeBlockRenderer', () => {
  it('shows a placeholder instead of a QR code when the content is empty', () => {
    const wrapper = mount(QrCodeBlockRenderer, {
      props: { block: createBlock(''), placement: { kind: 'root' } },
      global: rendererTestGlobal,
    })

    expect(wrapper.get('[aria-label="未配置二维码内容"]')).toBeDefined()
  })
})
