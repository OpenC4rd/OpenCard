import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import enUS from '../../locales/en-US'
import { tutorials } from '../../features/tutorials/tutorials'
import { createTutorialStore } from '../../shared/ui/tutorial/tutorial'
import OcTutorial from './OcTutorial.vue'
import OcDialog from './OcDialog.vue'
import OcFloatingLayer from './OcFloatingLayer.vue'

it('finishes the Git explanation without any target elements', async () => {
  const tutorial = createTutorialStore(tutorials)
  tutorial.start('versionControl')
  for (const id of ['sidebar', 'graph', 'changes', 'commit']) tutorial.completeStep('versionControl', id)
  const wrapper = mount(defineComponent({ setup: () => () => h(OcTutorial, {
    session: tutorial.session.value,
    onComplete: value => tutorial.completeStep(value.tutorialId, value.stepId, value.run),
  }) }), { attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    await flushPromises()
    const card = document.querySelector<HTMLElement>('.oc-tutorial')!
    expect(card.textContent).toContain('About Git')
    expect(card.textContent).not.toContain(enUS.tutorial.targetMissing)
    expect(document.querySelector('.oc-tutorial__outline')).toBeNull()
    card.querySelector<HTMLButtonElement>('footer button:last-child')!.click()
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
  } finally { wrapper.unmount() }
})

it('runs a read-only welcome tour, blocks background shortcuts, and releases them after completion', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList)
  const toggle = vi.fn()
  const completed = vi.fn()
  const tutorial = createTutorialStore(tutorials, completed)
  const backgroundShortcut = vi.fn()
  window.addEventListener('keydown', backgroundShortcut)
  tutorial.start('overview')
  const wrapper = mount(defineComponent({ setup: () => () => h('div', [
    ...tutorials.overview.steps.flatMap(step => step.targets.map(target => h('button', { 'data-oc-tutorial': target.key, onClick: toggle }, target.key))),
    h(OcTutorial, {
      session: tutorial.session.value, onExit: tutorial.exit,
      onComplete: value => tutorial.completeStep(value.tutorialId, value.stepId, value.run),
    }),
  ]) }), {
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    await flushPromises()
    const card = document.querySelector<HTMLElement>('.oc-tutorial')!
    expect(card.getAttribute('aria-modal')).toBe('true')
    expect(card.textContent).toContain('Welcome to OpenCard')
    expect(document.querySelector('.oc-tutorial__mask--blocking')).not.toBeNull()
    expect(document.querySelector('.oc-tutorial__click-hint')).toBeNull()
    const shortcut = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(shortcut)
    expect(shortcut.defaultPrevented).toBe(true)
    expect(backgroundShortcut).not.toHaveBeenCalled()

    const next = card.querySelector<HTMLButtonElement>('footer button:last-child')!
    next.focus()
    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(card.querySelector('footer button'))
    for (let index = 0; index < tutorials.overview.steps.length; index++) {
      if (tutorial.session.value?.step.id === 'sidebar-toggle') {
        expect(document.querySelectorAll('.oc-tutorial__click-hint')).toHaveLength(1)
        expect(card.getAttribute('aria-modal')).toBeNull()
        const target = wrapper.get('[data-oc-tutorial="shell.sidebar-toggle"]')
        expect(target.element.closest('[inert]')).toBeNull()
        await target.trigger('click')
        expect(toggle).toHaveBeenCalledOnce()
      }
      card.querySelector<HTMLButtonElement>('footer button:last-child')!.click()
      await flushPromises()
      if (tutorial.session.value) expect(document.querySelector('.oc-tutorial')).toBe(card)
    }
    expect(completed).toHaveBeenCalledExactlyOnceWith('overview')
    expect(document.querySelector('.oc-tutorial__mask')).toBeNull()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))
    expect(backgroundShortcut).toHaveBeenCalledOnce()
  } finally {
    wrapper.unmount()
    window.removeEventListener('keydown', backgroundShortcut)
    vi.restoreAllMocks()
  }
})

it('places an interactive tutorial inside its target dialog and yields to a newer modal', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList)
  const tutorial = createTutorialStore({ demo: { title: 'Demo', steps: [{ id: 'field', manual: true,
    targets: [{ key: 'dialog.field', title: 'Field', desc: 'Explanation' }] }] } })
  const newer = ref(false)
  const wrapper = mount(defineComponent({ setup: () => () => h('main', [
    h(OcDialog, { open: true, title: 'Editor' }, { default: () => h('button', { 'data-oc-tutorial': 'dialog.field' }, 'Field') }),
    newer.value ? h(OcDialog, { open: true, title: 'Confirmation' }) : null,
    h(OcTutorial, { session: tutorial.session.value }),
  ]) }), { attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    await flushPromises()
    tutorial.start('demo')
    await flushPromises()
    const layer = document.querySelector<HTMLElement>('.oc-tutorial-layer')!
    expect(layer.closest('.oc-dialog__backdrop')).not.toBeNull()
    expect(layer.style.display).not.toBe('none')
    expect(layer.querySelectorAll('.oc-tutorial__outline')).toHaveLength(1)
    newer.value = true
    await flushPromises()
    expect(layer.style.display).toBe('none')
    newer.value = false
    await flushPromises()
    expect(layer.style.display).not.toBe('none')
    expect(tutorial.session.value?.step.id).toBe('field')
  } finally {
    wrapper.unmount()
    vi.restoreAllMocks()
  }
})


it('restricts clicks to current targets and their teleported popovers, then restores them on exit', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList)
  const tutorial = createTutorialStore({ demo: { title: 'Demo', steps: ['first', 'second'].map(id => ({
    id, manual: true, targets: ['first', 'second'].map(key => ({ key, title: key, desc: 'Explanation', interactive: key === id })),
  })) } })
  const first = ref<HTMLElement | null>(null), second = ref<HTMLElement | null>(null)
  const action = vi.fn()
  const wrapper = mount(defineComponent({ setup: () => () => h('main', [
    h('button', { ref: first, 'data-oc-tutorial': 'first', onClick: () => action('first') }, 'First'),
    h('button', { ref: second, 'data-oc-tutorial': 'second', onClick: () => action('second') }, 'Second'),
    h(OcFloatingLayer, { open: true, anchor: first.value }, { default: () => h('button', { id: 'first-option', onClick: () => action('first-option') }, 'Option') }),
    h(OcFloatingLayer, { open: true, anchor: second.value }, { default: () => h('button', { id: 'second-option', onClick: () => action('second-option') }, 'Other option') }),
    h(OcTutorial, { session: tutorial.session.value, onExit: tutorial.exit,
      onComplete: value => tutorial.completeStep(value.tutorialId, value.stepId, value.run) }),
  ]) }), { attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    tutorial.start('demo')
    await flushPromises()
    first.value!.click()
    expect(document.querySelectorAll('.oc-tutorial__click-hint')).toHaveLength(1)
    second.value!.click()
    document.querySelector<HTMLButtonElement>('#first-option')!.click()
    document.querySelector<HTMLButtonElement>('#second-option')!.click()
    expect(action.mock.calls).toEqual([['first'], ['first-option']])
    const blocked = new Event('pointerdown', { bubbles: true, cancelable: true })
    second.value!.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)
    document.querySelector<HTMLButtonElement>('.oc-tutorial footer button:last-child')!.click()
    await flushPromises()
    first.value!.click()
    second.value!.click()
    document.querySelector<HTMLButtonElement>('#first-option')!.click()
    document.querySelector<HTMLButtonElement>('#second-option')!.click()
    expect(action.mock.calls.slice(2)).toEqual([['second'], ['second-option']])
    expect(document.querySelectorAll('.oc-tutorial__click-hint')).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('.oc-tutorial footer button')!.click()
    await flushPromises()
    first.value!.click()
    expect(action.mock.calls.slice(-1)[0]).toEqual(['first'])
    expect(document.querySelector('.oc-tutorial__click-hint')).toBeNull()
  } finally { wrapper.unmount(); vi.restoreAllMocks() }
})
