import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OcDialog from './OcDialog.vue'
import { activeDialogRoot } from '../../shared/ui/overlayScope'

const wrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  wrappers.splice(0).reverse().forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function mountDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(OcDialog, {
    attachTo: document.body,
    props: { open: true, title: 'Example dialog', ...props },
    slots: {
      default: '<input autofocus><button class="last">Continue</button>',
      footer: '<button class="footer-action">Confirm</button>',
    },
    global: { stubs: { transition: false } },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('OcDialog', () => {
  it('owns an external sidebar in the same modal scope and hands its handle to the layout', async () => {
    const wrapper = mount(OcDialog, {
      props: { open: true, title: 'Editor', sidebarTitle: 'Properties', sidebarTooltip: 'Toggle properties' },
      slots: { default: '<input autofocus>', sidebar: '<input class="property">' },
      attachTo: document.body, global: { stubs: { transition: false } },
    })
    wrappers.push(wrapper)
    await wrapper.vm.$nextTick()
    const main = document.body.querySelector('.oc-dialog')!
    const sidebar = document.body.querySelector('aside')!
    const handle = document.body.querySelector<HTMLButtonElement>('.oc-dialog-layout__handle')!
    expect(main.contains(sidebar)).toBe(false)
    expect(document.body.querySelector('[role="dialog"]')?.contains(sidebar)).toBe(true)
    expect(handle.getAttribute('aria-label')).toBe('Toggle properties')

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(handle.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.hasAttribute('inert')).toBe(true)

    await wrapper.setProps({ sidebar: false })
    expect(document.body.querySelector('aside')).toBeNull()
    expect(document.body.querySelector('.oc-dialog-layout__handle')).toBeNull()
    main.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
  it('activates dialogs by opening order and restores the previous scope on release', async () => {
    const first = mountDialog({ open: false })
    const second = mountDialog()
    await second.vm.$nextTick()
    const previous = activeDialogRoot.value!

    await first.setProps({ open: true })
    await first.vm.$nextTick()
    const current = activeDialogRoot.value!
    expect(current).not.toBe(previous)
    expect(previous.inert).toBe(true)
    first.unmount()
    wrappers.splice(wrappers.indexOf(first), 1)
    expect(activeDialogRoot.value).toBe(previous)
    expect(previous.inert).toBe(false)
  })
  it('owns modal semantics and focuses the requested initial control', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mountDialog({ description: 'Details' })
    await wrapper.vm.$nextTick()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog.querySelector('[autofocus]'))
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Example dialog')
  })

  it('reports enabled close sources and ignores backdrop dismissal by default', async () => {
    const wrapper = mountDialog()
    await wrapper.vm.$nextTick()
    const backdrop = document.body.querySelector<HTMLElement>('.oc-dialog__backdrop')!
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!

    backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('request-close')).toBeUndefined()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('request-close')).toEqual([['escape']])

    await wrapper.setProps({ closeOnBackdrop: true })
    backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('request-close')).toEqual([['escape'], ['backdrop']])
  })

  it('traps tab focus and restores the opening control after closing', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mountDialog()
    await wrapper.vm.$nextTick()
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    const first = dialog.querySelector<HTMLElement>('[autofocus]')!
    const last = dialog.querySelector<HTMLElement>('.footer-action')!

    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first)

    await wrapper.setProps({ open: false })
    await new Promise(resolve => window.setTimeout(resolve, 200))
    expect(document.activeElement).toBe(trigger)
  })

  it('uses a form surface and emits submit without browser navigation', async () => {
    const wrapper = mountDialog({ as: 'form', padded: false, scrollable: false })
    await wrapper.vm.$nextTick()
    const dialog = document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!
    dialog.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(dialog.classList).toContain('oc-dialog--flush')
    expect(dialog.classList).toContain('oc-dialog--scroll-locked')
  })

  it('projects semantic content, bounded, and fixed height contracts', async () => {
    const wrapper = mountDialog({ minHeight: 'md', maxHeight: 'lg' })
    await wrapper.vm.$nextTick()
    let dialog = document.body.querySelector<HTMLElement>('.oc-dialog')!
    expect(Array.from(dialog.classList)).toEqual(expect.arrayContaining([
      'oc-dialog--height-mode-content',
      'oc-dialog--min-height-md',
      'oc-dialog--max-height-lg',
    ]))

    await wrapper.setProps({ heightMode: 'fixed', height: 'workspace', minHeight: undefined, maxHeight: 'viewport' })
    dialog = document.body.querySelector<HTMLElement>('.oc-dialog')!
    expect(dialog.classList).toContain('oc-dialog--height-mode-fixed')
    expect(dialog.classList).toContain('oc-dialog--height-workspace')
    expect(dialog.classList).not.toContain('oc-dialog--min-height-md')
  })

  it('reports a fixed height mode without a semantic preset in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapper = mountDialog({ heightMode: 'fixed' })
    await wrapper.vm.$nextTick()
    expect(warn).toHaveBeenCalledWith('[OcDialog] heightMode="fixed" requires a height preset.')
    warn.mockRestore()
  })
})
