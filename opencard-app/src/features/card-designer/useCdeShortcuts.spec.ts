import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useCdeShortcuts } from './useCdeShortcuts'

function createHarness() {
  const duplicateBlock = vi.fn()
  const deleteInstance = vi.fn()
  const fitViewport = vi.fn()
  const toggleSnapping = vi.fn()
  const enabled = ref(true)
  const suspended = ref(false)
  const fillParent = vi.fn()

  const Host = defineComponent({
    setup() {
      const rootElement = ref<HTMLElement | null>(null)
      useCdeShortcuts({
        rootElement,
        suspendLetterShortcuts: () => suspended.value,
        commands: [
          {
            key: 'instance.delete',
            scopes: ['instance-tree'],
            canRun: () => enabled.value,
            run: deleteInstance,
          },
          {
            key: 'block.duplicate',
            scopes: ['canvas', 'structure-tree'],
            canRun: () => enabled.value,
            run: duplicateBlock,
          },
          {
            key: 'viewport.fit',
            canRun: () => enabled.value,
            run: fitViewport,
          },
          {
            key: 'view.toggle-snapping',
            scopes: ['canvas'],
            canRun: () => enabled.value,
            run: toggleSnapping,
          },
          {
            key: 'selection.fill-parent',
            scopes: ['canvas', 'structure-tree'],
            canRun: () => enabled.value,
            run: fillParent,
          },
        ],
      })
      return () => h('div', {
        ref: rootElement,
        class: 'root',
        tabindex: -1,
      }, [
        h('div', { class: 'instances', 'data-cde-shortcut-scope': 'instance-tree' }, [
          h('button', { class: 'instance-row' }, 'Instance'),
        ]),
        h('div', { class: 'structure', 'data-cde-shortcut-scope': 'structure-tree' }, [
          h('button', { class: 'block-row' }, 'Block'),
        ]),
        h('input', { class: 'input' }),
        h('div', { class: 'textbox', role: 'textbox', contenteditable: 'true' }),
      ])
    },
  })

  return {
    deleteInstance,
    duplicateBlock,
    enabled,
    suspended,
    fillParent,
    fitViewport,
    toggleSnapping,
    wrapper: mount(Host, { attachTo: document.body }),
  }
}

describe('useCdeShortcuts', () => {
  it('routes commands by the focused CDE region', async () => {
    const { deleteInstance, duplicateBlock, wrapper } = createHarness()

    await wrapper.get('.instance-row').trigger('keydown', { key: 'Delete' })
    await wrapper.get('.block-row').trigger('keydown', { key: 'd', ctrlKey: true })

    expect(deleteInstance).toHaveBeenCalledTimes(1)
    expect(duplicateBlock).toHaveBeenCalledTimes(1)
  })

  it('routes selection quick actions from the structure tree', async () => {
    const { fillParent, wrapper } = createHarness()
    await wrapper.get('.block-row').trigger('keydown', { key: 'f' })
    expect(fillParent).toHaveBeenCalledTimes(1)
  })

  it('runs unscoped viewport commands from the CDE root', async () => {
    const { fitViewport, toggleSnapping, wrapper } = createHarness()
    await wrapper.get('.root').trigger('keydown', { key: '0', metaKey: true })
    await wrapper.get('.root').trigger('keydown', { key: 's' })
    await wrapper.get('.block-row').trigger('keydown', { key: 's' })
    expect(fitViewport).toHaveBeenCalledTimes(1)
    expect(toggleSnapping).toHaveBeenCalledTimes(1)
  })

  it('yields bare letters while Layer View arbitrates, keeping modified shortcuts live', async () => {
    const { fitViewport, suspended, toggleSnapping, wrapper } = createHarness()

    suspended.value = true
    await wrapper.get('.root').trigger('keydown', { key: 's' })
    await wrapper.get('.root').trigger('keydown', { key: '0', ctrlKey: true })
    expect(toggleSnapping).not.toHaveBeenCalled()
    expect(fitViewport).toHaveBeenCalledTimes(1)

    suspended.value = false
    await wrapper.get('.root').trigger('keydown', { key: 's' })
    expect(toggleSnapping).toHaveBeenCalledTimes(1)
  })

  it('ignores editable, handled, composing, disabled, and alt-modified events', async () => {
    const { duplicateBlock, enabled, fitViewport, wrapper } = createHarness()

    await wrapper.get('.input').trigger('keydown', { key: '0', ctrlKey: true })
    await wrapper.get('.textbox').trigger('keydown', { key: '0', ctrlKey: true })
    await wrapper.get('.root').trigger('keydown', { key: '0', ctrlKey: true, altKey: true })
    enabled.value = false
    await wrapper.get('.root').trigger('keydown', { key: '0', ctrlKey: true })
    enabled.value = true
    const handled = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true })
    handled.preventDefault()
    wrapper.get('.structure').element.dispatchEvent(handled)
    const composing = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, isComposing: true })
    wrapper.get('.structure').element.dispatchEvent(composing)

    expect(fitViewport).not.toHaveBeenCalled()
    expect(duplicateBlock).not.toHaveBeenCalled()
  })
})
