import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('skips hidden autofocus targets and controls excluded from tab order', async () => {
    const wrapper = mount(OcDialog, {
      attachTo: document.body,
      props: { open: true, title: 'Editor' },
      slots: { default: '<div style="display:none"><input autofocus></div><textarea autofocus></textarea><button tabindex="-1">Skip</button>' },
    })
    wrappers.push(wrapper)
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(document.querySelector('textarea'))

    const textarea = document.querySelector<HTMLElement>('[role="dialog"] textarea')!
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(textarea)
  })

  it('owns an external sidebar in the same modal scope and hands its handle to the layout', async () => {
    const wrapper = mount(OcDialog, {
      props: { open: true, title: 'Editor', sidebarTitle: 'Properties', sidebarTooltip: 'Toggle properties' },
      slots: { default: '<input autofocus>', sidebar: '<input class="property">' },
      attachTo: document.body, global: { stubs: { transition: false } },
    })
    wrappers.push(wrapper)
    await wrapper.vm.$nextTick()
    const sidebar = document.body.querySelector('aside')!
    const handle = document.body.querySelector<HTMLButtonElement>('.oc-dialog-layout__handle')!
    expect(handle.getAttribute('aria-label')).toBe('Toggle properties')

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(handle.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.hasAttribute('inert')).toBe(true)

    await wrapper.setProps({ sidebar: false })
    expect(document.body.querySelector('aside')).toBeNull()
    expect(document.body.querySelector('.oc-dialog-layout__handle')).toBeNull()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('request-close')).toEqual([[]])
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
    expect(wrapper.emitted('request-close')).toEqual([[]])

    await wrapper.setProps({ closeOnBackdrop: true })
    backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('request-close')).toEqual([[], []])
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
    expect(trigger.inert).toBe(true)

    first.addEventListener('keydown', event => event.preventDefault(), { once: true })
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('request-close')).toBeUndefined()

    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first)

    await wrapper.setProps({ open: false })
    await new Promise(resolve => window.setTimeout(resolve, 200))
    expect(document.activeElement).toBe(trigger)
    expect(trigger.inert).toBeFalsy()
  })

  it('submits through a form surface without browser navigation', async () => {
    const wrapper = mountDialog({ as: 'form' })
    await wrapper.vm.$nextTick()
    const form = document.querySelector<HTMLFormElement>('[role="dialog"] form')
      ?? document.querySelector<HTMLFormElement>('[role="dialog"]')!
    const submit = new SubmitEvent('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submit)

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(submit.defaultPrevented).toBe(true)
  })
})
