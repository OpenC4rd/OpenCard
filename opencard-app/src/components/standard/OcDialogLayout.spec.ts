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
  it('collapses and expands the sidebar without losing the panel state', async () => {
    const wrapper = layout()
    const handle = wrapper.get('button.oc-dialog-layout__handle')
    const aside = wrapper.get('aside')
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
    await wrapper.get('input').setValue('unsaved')

    await handle.trigger('dblclick')
    expect(handle.attributes('aria-expanded')).toBe('false')
    expect(aside.attributes('inert')).toBeDefined()

    await handle.trigger('dblclick')
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
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

  it('only settles the collapsed state on release once the drag passes the threshold', async () => {
    const wrapper = layout()
    const handle = wrapper.get('button.oc-dialog-layout__handle')
    const aside = wrapper.get('aside')
    const element = handle.element as HTMLElement

    // 内推不足阈值：松手回到展开。
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 350)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')
    pointer(element, 'pointerup', 350)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')

    // 内推超过阈值：落位收起。
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 320)
    pointer(element, 'pointerup', 320)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')
    expect(aside.attributes('inert')).toBeDefined()

    // 外拉不足阈值：松手仍收起。
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 424)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')
    pointer(element, 'pointerup', 424)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('false')

    // 外拉超过阈值：落位展开。
    pointer(element, 'pointerdown', 400)
    pointer(element, 'pointermove', 500)
    pointer(element, 'pointerup', 500)
    await wrapper.vm.$nextTick()
    expect(handle.attributes('aria-expanded')).toBe('true')
    expect(aside.attributes('inert')).toBeUndefined()
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
    const aside = document.body.querySelector<HTMLElement>('aside')!

    pointer(handle, 'pointerdown', 400)
    pointer(handle, 'pointermove', 100)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    pointer(handle, 'pointerup', 100)
    await wrapper.vm.$nextTick()

    expect(handle.getAttribute('aria-expanded')).toBe('true')
    expect(aside.hasAttribute('inert')).toBe(false)
    expect(wrapper.emitted('request-close')).toBeUndefined()
    expect(document.body.style.cursor).toBe('')
  })
})
