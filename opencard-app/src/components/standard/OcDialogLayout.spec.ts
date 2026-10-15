import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import OcDialogLayout from './OcDialogLayout.vue'
import OcDialog from './OcDialog.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function pointer(element: HTMLElement, type: string, clientX: number): void {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX }))
}

function dragOffsetOf(wrapper: ReturnType<typeof mount>): number {
  const style = wrapper.get('.oc-dialog-layout').attributes('style') ?? ''
  return Number.parseFloat(/--oc-dialog-sidebar-drag:\s*(-?[\d.]+)px/.exec(style)?.[1] ?? 'NaN')
}

function layout(props: Record<string, unknown> = {}) {
  const Draft = defineComponent({ setup() {
    const value = ref('draft')
    return () => h('input', { value: value.value, onInput: (event: Event) => {
      value.value = (event.target as HTMLInputElement).value
    } })
  } })
  const wrapper = mount(OcDialogLayout, {
    props: { label: 'Properties', ...props },
    slots: { default: '<textarea>Document</textarea>', sidebar: () => h(Draft) },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('OcDialogLayout', () => {
  it('collapses and expands the external sidebar on double click without losing the panel state', async () => {
    const wrapper = layout()
    const handle = wrapper.get('button.oc-dialog-layout__handle')
    const aside = wrapper.get('aside')
    expect(wrapper.get('textarea').text()).toBe('Document')
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
    await wrapper.get('input').setValue('unsaved')

    await handle.trigger('dblclick')
    expect(handle.attributes('aria-expanded')).toBe('false')
    expect(aside.attributes('inert')).toBeDefined()
    expect(wrapper.classes()).not.toContain('is-sidebar-open')

    await handle.trigger('dblclick')
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
    expect(wrapper.classes()).toContain('is-sidebar-open')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('unsaved')
  })

  it('toggles on keyboard activation but leaves a plain pointer click alone', async () => {
    const wrapper = layout()
    const handle = wrapper.get('button.oc-dialog-layout__handle')
    const click = (detail: number) => handle.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))

    click(1)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')

    click(0)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')
  })

  it('follows the pointer while dragging and only settles the state, and the centring, on release', async () => {
    const wrapper = layout()
    const handle = wrapper.get('button.oc-dialog-layout__handle')
    const aside = wrapper.get('aside')
    const element = handle.element as HTMLElement

    // 内推不足阈值：松手回到展开，居中自始至终不变
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 350)
    await wrapper.vm.$nextTick()
    expect(dragOffsetOf(wrapper)).toBe(-50)
    expect(wrapper.classes()).toContain('is-sidebar-dragging')
    expect(wrapper.classes()).toContain('is-sidebar-open')
    pointer(element, 'pointerup', 350)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.oc-dialog-layout').attributes('style')).toBeUndefined()

    // 内推超过阈值：落位收起
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 320)
    pointer(element, 'pointerup', 320)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')
    expect(aside.attributes('inert')).toBeDefined()
    expect(wrapper.classes()).not.toContain('is-sidebar-open')

    // 外拉不足阈值：拖动期间收起状态和布局宽度都不变，松手仍收起
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 424)
    await wrapper.vm.$nextTick()
    expect(dragOffsetOf(wrapper)).toBe(24)
    expect(handle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.classes()).not.toContain('is-sidebar-open')
    pointer(element, 'pointerup', 424)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')

    // 外拉超过阈值：落位展开
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 500)
    pointer(element, 'pointerup', 500)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
    expect(wrapper.classes()).toContain('is-sidebar-open')
  })

  it('cancels a drag with Escape without closing its real dialog', async () => {
    const wrapper = mount(OcDialog, {
      props: { open: true, title: 'Editor' },
      slots: { default: () => h('textarea'), sidebar: () => h('input') },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    })
    wrappers.push(wrapper)
    await wrapper.vm.$nextTick()
    const handle = document.body.querySelector<HTMLElement>('.oc-dialog-layout__handle')!
    const root = document.body.querySelector<HTMLElement>('.oc-dialog-layout')!

    pointer(handle, 'pointerdown', 400)
    pointer(handle, 'pointermove', 100)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    pointer(handle, 'pointerup', 100)
    await wrapper.vm.$nextTick()

    expect(root.classList).toContain('is-sidebar-open')
    expect(root.getAttribute('style')).toBeNull()
    expect(document.body.querySelector('aside')?.hasAttribute('inert')).toBe(false)
    expect(wrapper.emitted('request-close')).toBeUndefined()
    expect(document.body.style.cursor).toBe('')
  })

  it('keeps the main window alone when the sidebar slot is absent', () => {
    const wrapper = mount(OcDialogLayout, {
      props: { label: 'Properties' },
      slots: { default: '<textarea>Document</textarea>' },
    })
    wrappers.push(wrapper)
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.find('button.oc-dialog-layout__handle').exists()).toBe(false)
    expect(wrapper.get('textarea').text()).toBe('Document')
  })

  it('drops the panel and its handle when the calling dialog hides the sidebar', () => {
    const wrapper = layout({ sidebar: false })
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.find('button.oc-dialog-layout__handle').exists()).toBe(false)
    expect(wrapper.get('textarea').text()).toBe('Document')
  })
})
