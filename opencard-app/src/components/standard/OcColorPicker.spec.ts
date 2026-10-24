import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setOcTheme } from '../../shared/ui/foundation'
import OcColorPicker from './OcColorPicker.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'

describe('OcColorPicker', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    setOcTheme('dark')
    document.body.innerHTML = ''
  })

  it('reports cancellation after restoring an uncommitted preview', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__field-trigger').trigger('click')
    await flushPromises()
    const panel = document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!
    const input = wrapper.get('.oc-color-picker__field-input').element as HTMLInputElement
    input.value = '#AABBCC'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    const previews = wrapper.emitted('preview') ?? []
    expect(previews[previews.length - 1]).toEqual(['#112233'])
    expect(wrapper.emitted('cancel')).toEqual([[]])
    expect(wrapper.emitted('commit')).toBeUndefined()
    wrapper.unmount()
  })

  it('restores an invalid inline value on blur', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
    })

    await wrapper.get('.oc-color-picker__field-input').setValue('#NOPE')
    await wrapper.get('.oc-color-picker__field-input').trigger('blur')

    expect((wrapper.get('.oc-color-picker__field-input').element as HTMLInputElement).value).toBe('#112233')
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('previews valid hex input and commits it explicitly', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233' },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__trigger').trigger('click')
    await flushPromises()
    const input = document.body.querySelector<HTMLInputElement>('.oc-color-picker__channel-input')!
    input.value = '#AABBCC'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('preview')).toContainEqual(['#AABBCC'])
    expect(wrapper.emitted('commit')).toEqual([['#AABBCC']])

    document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toBeUndefined()
    wrapper.unmount()
  })

  it('switches color models while keeping every channel on the same Slider', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#11223380', allowAlpha: true },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__trigger').trigger('click')
    await flushPromises()
    const panel = document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!

    panel.querySelector<HTMLButtonElement>('[aria-label="RGB"]')!.click()
    await wrapper.vm.$nextTick()
    const red = panel.querySelector<HTMLInputElement>('input[aria-label="Red"]')!
    const alpha = panel.querySelector<HTMLInputElement>('input[aria-label="Alpha"]')!
    expect(red.value).toBe('17')
    expect(alpha.value).toBe('50')
    red.value = '255'
    red.dispatchEvent(new Event('blur', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('commit')).toContainEqual(['#FF223380'])

    panel.querySelector<HTMLButtonElement>('[aria-label="HSV"]')!.click()
    await wrapper.vm.$nextTick()
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Hue"]')!.value).not.toBe('')
    const hsvAlpha = panel.querySelector<HTMLInputElement>('input[aria-label="Alpha"]')!
    hsvAlpha.value = '25'
    hsvAlpha.dispatchEvent(new Event('blur', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const commits = wrapper.emitted('commit') ?? []
    expect(commits[commits.length - 1]).toEqual(['#FF223340'])
    wrapper.unmount()
  })

  it('keeps the field variant labelled, alpha-limited and disabled-aware', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field', label: 'Border color', allowAlpha: false },
    })

    expect(wrapper.get('.oc-color-picker__field-trigger').attributes('aria-label')).toBe('Border color')
    const input = wrapper.get('.oc-color-picker__field-input')
    expect(input.attributes('aria-label')).toBe('Border color')
    expect(input.attributes('maxlength')).toBe('7')

    const disabled = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field', disabled: true },
      attachTo: document.body,
    })
    expect(disabled.get('.oc-color-picker__field-trigger').attributes('disabled')).toBeDefined()
    disabled.get('.oc-color-picker__field-trigger').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await disabled.vm.$nextTick()
    expect(document.body.querySelector('.oc-color-picker__panel')).toBeNull()
    disabled.unmount()
  })

  it('hands the shared panel over when another picker opens', async () => {
    const first = mount(OcColorPicker, { attachTo: document.body, props: { modelValue: '#112233' } })
    const second = mount(OcColorPicker, { attachTo: document.body, props: { modelValue: '#445566' } })
    try {
      await first.get('.oc-color-picker__trigger').trigger('click')
      await flushPromises()
      expect(first.get('.oc-color-picker__trigger').attributes('aria-expanded')).toBe('true')
      expect(document.body.querySelectorAll('.oc-color-picker__panel')).toHaveLength(1)

      await second.get('.oc-color-picker__trigger').trigger('click')
      await flushPromises()

      // 面板是全局共享的一组：后打开的一方接手同一份宿主，不会并排出现两份面板。
      expect(document.body.querySelectorAll('.overlay-group-layer')).toHaveLength(1)
      expect(document.body.querySelectorAll('.oc-color-picker__panel')).toHaveLength(1)
      expect(first.get('.oc-color-picker__trigger').attributes('aria-expanded')).toBe('false')
      expect(second.get('.oc-color-picker__trigger').attributes('aria-expanded')).toBe('true')
    } finally {
      first.unmount()
      second.unmount()
    }
  })

  it('dismisses on outside activation or focus without committing a choice', async () => {
    const wrapper = mount(OcColorPicker, { attachTo: document.body, props: { modelValue: '#112233' } })
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      const trigger = wrapper.get('.oc-color-picker__trigger')
      await trigger.trigger('click')
      await flushPromises()
      document.querySelector<HTMLInputElement>('input[aria-label="HEX"]')!.focus()
      await wrapper.vm.$nextTick()
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(document.querySelector('.oc-color-picker__panel')).not.toBeNull()

      outside.click()
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.querySelector('.oc-color-picker__panel')).toBeNull()

      await trigger.trigger('click')
      await flushPromises()
      outside.focus()
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(wrapper.emitted('commit')).toBeUndefined()
    } finally { wrapper.unmount(); outside.remove() }
  })

  it('follows an external model change in the field variant', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
    })

    await wrapper.setProps({ modelValue: '#445566' })

    expect((wrapper.get('.oc-color-picker__field-input').element as HTMLInputElement).value).toBe('#445566')
  })
})