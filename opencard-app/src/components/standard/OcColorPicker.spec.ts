import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { setOcTheme } from '../../shared/ui/foundation'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcColorPicker from './OcColorPicker.vue'

describe('OcColorPicker', () => {
  afterEach(() => setOcTheme('dark'))

  it('uses a themed popover without a native color input', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233' },
      attachTo: document.body,
    })

    await wrapper.get('.oc-color-picker__trigger').trigger('click')
    expect(document.body.querySelector('.oc-color-picker__panel')).not.toBeNull()
    expect(document.body.querySelector('[role="slider"][aria-label="Alpha"]')).not.toBeNull()
    expect(document.body.querySelector('input[aria-label="Alpha"]')).not.toBeNull()
    expect(document.body.querySelector('input[type="color"]')).toBeNull()
    expect(wrapper.findAllComponents(OcFieldInput).every(input => input.props('mono') === false)).toBe(true)
    wrapper.unmount()
  })

  it('offers an editable color field with a contrast-safe foreground', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
    })

    expect(wrapper.getComponent(OcFieldFrame).classes()).toContain('oc-color-picker__field')
    expect(wrapper.getComponent(OcFieldFrame)
      .get('.oc-field-frame__prefix .oc-color-picker__field-trigger').element.tagName).toBe('BUTTON')
    expect(wrapper.get('.oc-color-picker__field').attributes('style')).toContain('color: rgb(245, 242, 255)')
    await wrapper.get('.oc-color-picker__field-input').setValue('#FFFFFF')
    expect(wrapper.get('.oc-color-picker__field').attributes('style')).toContain('color: rgb(31, 36, 48)')
    await wrapper.get('.oc-color-picker__field-input').trigger('blur')
    expect(wrapper.emitted('commit')).toEqual([['#FFFFFF']])
  })

  it('keeps a contrasting foreground on middle-gray colors', () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#ACACAC', variant: 'field' },
    })

    expect(wrapper.get('.oc-color-picker__field').attributes('style'))
      .toContain('color: rgb(31, 36, 48)')
  })

  it('uses the same theme-aware foreground color as accent controls', () => {
    setOcTheme('light', { '--oc-accent': '#5879FA' })
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#5879FA', variant: 'field' },
    })

    expect(wrapper.get('.oc-color-picker__field').attributes('style'))
      .toContain('color: rgb(245, 242, 255)')
    expect(document.documentElement.style.getPropertyValue('--oc-accent-fg')).toBe('#F5F2FF')
  })

  it.each(['#000000', '#FFFFFF'])(
    'keeps the selected hue while editing achromatic color %s',
    async (modelValue) => {
      const wrapper = mount(OcColorPicker, {
        props: { modelValue },
        attachTo: document.body,
      })
      await wrapper.get('.oc-color-picker__trigger').trigger('click')
      const hue = document.body.querySelector<HTMLElement>('[role="slider"][aria-label="Hue"]')!
      hue.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }))
      await wrapper.vm.$nextTick()

      const cursor = hue.querySelector<HTMLElement>('.oc-slider__thumb')!
      expect(Number.parseFloat(cursor.style.left)).toBeGreaterThan(0)
      wrapper.unmount()
    },
  )

  it('keeps saturation while editing pure black', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#000000' },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__trigger').trigger('click')
    const saturation = document.body.querySelector<HTMLElement>('.oc-color-picker__saturation')!
    saturation.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }))
    await wrapper.vm.$nextTick()

    const cursor = document.body.querySelector<HTMLElement>('.oc-color-picker__cursor')!
    expect(Number.parseFloat(cursor.style.left)).toBeGreaterThan(0)
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
    const input = document.body.querySelector<HTMLInputElement>('.oc-color-picker__channel-input')!
    input.value = '#AABBCC'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('preview')).toContainEqual(['#AABBCC'])
    expect(wrapper.emitted('commit')).toEqual([['#AABBCC']])
    expect(wrapper.emitted('update:modelValue')).toEqual([['#AABBCC']])
    document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancel')).toBeUndefined()
    wrapper.unmount()
  })

  it('reports cancellation after restoring an uncommitted preview', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__field-trigger').trigger('click')
    const panel = document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!
    const input = wrapper.get('.oc-color-picker__field-input').element as HTMLInputElement
    input.value = '#AABBCC'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    const previews = wrapper.emitted('preview') ?? []
    expect(previews[previews.length - 1]).toEqual(['#112233'])
    expect(wrapper.emitted('cancel')).toEqual([[]])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('switches color models while keeping all linear channels on the same Slider', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#11223380', allowAlpha: true },
      attachTo: document.body,
    })
    await wrapper.get('.oc-color-picker__trigger').trigger('click')
    const panel = document.body.querySelector<HTMLElement>('.oc-color-picker__panel')!

    expect(panel.querySelector('.oc-color-picker__saturation')).not.toBeNull()
    expect(panel.querySelectorAll('.oc-color-picker__channel-sliders .oc-slider')).toHaveLength(1)
    expect(panel.querySelector('[role="radiogroup"]')).not.toBeNull()

    panel.querySelector<HTMLButtonElement>('[aria-label="RGB"]')!.click()
    await wrapper.vm.$nextTick()
    expect(panel.querySelector('.oc-color-picker__saturation')).toBeNull()
    expect(panel.querySelectorAll('.oc-color-picker__channel-sliders .oc-slider')).toHaveLength(3)
    const red = panel.querySelector<HTMLInputElement>('input[aria-label="Red"]')!
    const alpha = panel.querySelector<HTMLInputElement>('input[aria-label="Alpha"]')!
    expect(red.value).toBe('17')
    expect(alpha.value).toBe('50')
    red.value = '255'
    red.dispatchEvent(new Event('blur', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['#FF223380'])

    panel.querySelector<HTMLButtonElement>('[aria-label="HSV"]')!.click()
    await wrapper.vm.$nextTick()
    expect(panel.querySelectorAll('.oc-color-picker__channel-sliders .oc-slider')).toHaveLength(3)
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Hue"]')!.value).not.toBe('')
    const hsvAlpha = panel.querySelector<HTMLInputElement>('input[aria-label="Alpha"]')!
    hsvAlpha.value = '25'
    hsvAlpha.dispatchEvent(new Event('blur', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const updates = wrapper.emitted('update:modelValue') ?? []
    expect(updates[updates.length - 1]).toEqual(['#FF223340'])
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

  it('follows an external model change in the field variant', async () => {
    const wrapper = mount(OcColorPicker, {
      props: { modelValue: '#112233', variant: 'field' },
    })

    await wrapper.setProps({ modelValue: '#445566' })

    expect((wrapper.get('.oc-color-picker__field-input').element as HTMLInputElement).value).toBe('#445566')
  })
})
