import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import ProjectIconPreview from './ProjectIconPreview.vue'
import OcOverlayToolbar from '../standard/OcOverlayToolbar.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function mountPreview(entry: ProjectIconCatalogEntry, viewport = { width: 264, height: 264 }) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(viewport.width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(viewport.height)
  return mount(ProjectIconPreview, { props: { entry } })
}
const label = (wrapper: ReturnType<typeof mountPreview>) => wrapper.text()
const sprite: ProjectIconCatalogEntry = {
  iconKey: 'c', name: 'C', seriesKey: 's', source: 'sheet.png', src: 'asset://sheet.png', tint: 'original', pixelated: true,
  crop: { x: 0, y: 0, w: 16, h: 16 },
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ProjectIconPreview', () => {
  it('labels zoom as the real ratio to the own pixels of the icon, starting fitted to the canvas', async () => {
    const wrapper = mountPreview(sprite)
    await wrapper.vm.$nextTick()
    // A 16-pixel cell fitted into 264 − 2 × 32 pixels is drawn 12.5 times its size.
    expect(label(wrapper)).toContain('1250%')
    expect(wrapper.get('.project-icon-preview__icon').attributes('style')).toContain('font-size: 200px')

    wrapper.getComponent(OcOverlayToolbar).vm.$emit('select', { key: 'viewport.zoom-out' })
    await wrapper.vm.$nextTick()
    expect(label(wrapper)).toContain('1000%')
    wrapper.getComponent(OcOverlayToolbar).vm.$emit('select', { key: 'viewport.fit' })
    await wrapper.vm.$nextTick()
    expect(label(wrapper)).toContain('1250%')
  })

  it('reads 100% only when the icon is drawn at its actual size', async () => {
    const wrapper = mountPreview({ ...sprite, crop: { x: 0, y: 0, w: 200, h: 100 } })
    await wrapper.vm.$nextTick()
    expect(label(wrapper)).toContain('100%')
  })

  it('says nothing about scale until a file icon has been measured', async () => {
    const wrapper = mountPreview({ ...sprite, crop: undefined, readDimensions: () => undefined })
    await wrapper.vm.$nextTick()
    expect(label(wrapper)).toContain('…')
    expect(label(wrapper)).not.toContain('%')
  })

  it('shows the whole file focused on the crop, framed, and the plain icon only for an uncropped one', async () => {
    const wrapper = mountPreview({ ...sprite, crop: { x: 16, y: 32, w: 16, h: 16 }, readDimensions: () => ({ width: 64, height: 128 }) })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.project-icon-preview__icon').exists()).toBe(false)
    expect(wrapper.get('.project-icon-preview__sheet-image').attributes('src')).toBe('asset://sheet.png')
    // Fitted on the 16-pixel crop at 12.5×: the 64 × 128 file is 800 × 1600, shifted so the crop's centre
    // (24, 40 in file pixels) sits on the canvas centre.
    const sheetStyle = wrapper.get('.project-icon-preview__sheet').attributes('style')
    expect(sheetStyle).toContain('width: 800px; height: 1600px;')
    expect(sheetStyle).toContain('translate(-300px, -500px)')
    expect(wrapper.get('.project-icon-preview__sheet-cell').attributes('style'))
      .toBe('left: 25%; top: 25%; width: 25%; height: 12.5%;')
    expect(label(wrapper)).toContain('1250%')

    const plain = mountPreview({ ...sprite, crop: undefined, readDimensions: () => ({ width: 64, height: 64 }) })
    await plain.vm.$nextTick()
    expect(plain.find('.project-icon-preview__sheet').exists()).toBe(false)
    expect(plain.find('.project-icon-preview__icon').exists()).toBe(true)
  })

  it('fits once when an icon opens, and keeps the view through a resize or an edit of the same icon', async () => {
    const wrapper = mountPreview(sprite)
    await wrapper.vm.$nextTick()
    wrapper.getComponent(OcOverlayToolbar).vm.$emit('select', { key: 'viewport.zoom-out' })
    await wrapper.vm.$nextTick()
    expect(label(wrapper)).toContain('1000%')

    // The panel grows: nothing moves until the user asks to fit again.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(528)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(528)
    await wrapper.setProps({ entry: { ...sprite, pixelated: false } })
    expect(label(wrapper)).toContain('1000%')

    await wrapper.setProps({ entry: { ...sprite, iconKey: 'other' } })
    // Another icon is fitted afresh, to the panel as it is now: (528 − 64) / 16.
    expect(label(wrapper)).toContain('2900%')
  })
})
