import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import StringPropertyField from './StringPropertyField.vue'
import PropertyFieldRenderer from '../PropertyFieldRenderer.vue'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

function listbox(): HTMLElement | null {
  return document.body.querySelector('[role="listbox"]')
}

const english = () => ({ plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] })

describe('StringPropertyField', () => {
  let overlayRoot: VueWrapper | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  it('steps through every string enum option in schema order', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: 'standard',
        definition: {
          title: 'Quality',
          fieldType: 'string',
          options: ['preview', 'standard', 'high', 'ultra', 'custom'],
          presentation: 'stepper',
        },
      },
    })

    await wrapper.get('button[aria-label="Previous option"]').trigger('click')
    await wrapper.get('button[aria-label="Next option"]').trigger('click')
    expect(wrapper.emitted('update:value')).toEqual([['preview'], ['high']])
  })

  it('accepts the shortest trailing ghost completion with Tab', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: '12p',
        definition: {
          title: 'Width',
          fieldType: 'string',
          completion: { static: { values: ['percent', 'PX'] } },
        },
      },
    })

    await wrapper.get('input').trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('update:value')).toEqual([['12PX']])
  })

  it('commits deferred text on blur and cancels it with Escape', async () => {
    const wrapper = mount(StringPropertyField, {
      props: {
        value: 'before',
        definition: { title: 'Name', fieldType: 'string', commitMode: 'blur' },
      },
    })
    const input = wrapper.get('input')
    await input.setValue('after')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    await input.trigger('blur')
    expect(wrapper.emitted('update:value')).toEqual([['after']])

    await wrapper.setProps({ value: 'after' })
    await input.setValue('cancelled')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('after')
    expect(wrapper.emitted('update:value')).toEqual([['after']])
  })

  it.each([undefined, 'semicolon' as const])('dismisses on outside pointer while keeping focus and ignores IME confirmation: %s', async listSeparator => {
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        value: '',
        definition: {
          title: 'Reference',
          fieldType: 'string',
          listSeparator,
          completion: {
            provider: () => ({
              replaceStart: 0,
              replaceEnd: 0,
              items: [{ key: 'scope', label: 'Scope', insertText: 'scope:', keepOpen: true }],
            }),
          },
        },
      },
      global: english(),
    })
    const outside = document.createElement('button')
    document.body.append(outside)
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      await input.trigger('keydown', { key: 'Enter', isComposing: true })
      expect(wrapper.emitted('update:value')).toBeUndefined()
      const option = document.querySelector<HTMLElement>('[role="option"]')!
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      await flushPromises()
      expect(wrapper.emitted('update:value')).toBeDefined()
      expect(document.activeElement).toBe(input.element)
      expect(input.attributes('aria-expanded')).toBe('true')

      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      await nextTick()
      expect(document.activeElement).toBe(input.element)
      expect(input.attributes('aria-expanded')).toBe('false')
      expect(input.attributes('aria-activedescendant')).toBeUndefined()
    } finally {
      wrapper.unmount()
      outside.remove()
    }
  })

  it('keeps an accepted value closed through provider reconstruction until the next user interaction', async () => {
    const definition = () => ({
      title: 'Length',
      fieldType: 'string' as const,
      completion: {
        provider: () => ({
          replaceStart: 0,
          replaceEnd: 3,
          items: [{ key: '2px', label: '2 px', insertText: '2px' }],
        }),
      },
    })
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        value: '0px',
        definition: definition(),
        'onUpdate:value': (value: string) => {
          void wrapper.setProps({ value, definition: definition() })
        },
      },
    })
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(wrapper.props('value')).toBe('2px')
      expect(listbox()).toBeNull()
      await wrapper.setProps({ definition: definition() })
      await flushPromises()
      expect(listbox()).toBeNull()
      await input.trigger('click')
      await flushPromises()
      expect(listbox()).not.toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('edits array tags without submitting partial input, and commits on Enter, blur and removal', async () => {
    const definition: PropertyEditorFieldDefinition = {
      title: 'Viewed guides',
      fieldType: 'string[]',
      listSeparator: 'semicolon',
      optionLabels: { overview: 'Interface tour' },
    }
    const wrapper = mount(PropertyFieldRenderer, {
      attachTo: document.body,
      props: { definition, value: ['overview'], editorId: 'field' },
      global: english(),
    })
    const input = wrapper.get('input')
    input.element.focus()
    await input.setValue('welcome')
    expect(wrapper.emitted('update:value')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual([['overview', 'welcome']])
    await wrapper.setProps({ value: ['overview', 'welcome'] })
    expect(input.element.value).toBe('')
    await input.setValue('custom')
    await input.trigger('blur')
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual([['overview', 'welcome', 'custom']])
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual([['welcome', 'custom']])
    wrapper.unmount()
  })

  it('keeps existing array tags when accepting a suggestion after focusing the empty input', async () => {
    const definition: PropertyEditorFieldDefinition = {
      title: 'Viewed guides',
      fieldType: 'string[]',
      listSeparator: 'semicolon',
      completion: {
        provider: ({ value, cursor }) => ({
          replaceStart: value.lastIndexOf(';', cursor - 1) + 1,
          replaceEnd: value.length,
          items: [{ key: 'welcome', label: 'Create project', insertText: 'welcome' }],
        }),
      },
    }
    const wrapper = mount(PropertyFieldRenderer, {
      attachTo: document.body,
      props: { definition, value: ['overview'], editorId: 'field' },
      global: english(),
    })
    wrapper.get('input').element.focus()
    await flushPromises()
    await wrapper.get('input').trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual([['overview', 'welcome']])
    wrapper.unmount()
  })

  it('preserves the full-string completion range while editing the last token', async () => {
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        value: 'first; se',
        definition: {
          title: 'Sources',
          fieldType: 'string',
          listSeparator: 'semicolon',
          completion: {
            provider: ({ value }) => ({
              replaceStart: value.lastIndexOf('se'),
              replaceEnd: value.length,
              items: [{ key: 'second', label: 'Second', insertText: 'second' }],
            }),
          },
        },
      },
      global: english(),
    })
    const input = wrapper.get('input')
    input.element.focus()
    await flushPromises()
    await input.trigger('keydown', { key: 'Tab' })
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['first;second'])
    wrapper.unmount()
  })

  it('discards stale completion results and pending results after blur', async () => {
    const pending: Array<
      (result: {
        replaceStart: number
        replaceEnd: number
        items: Array<{ key: string; label: string; insertText: string }>
      }) => void
    > = []
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        value: '',
        definition: {
          title: 'Reference',
          fieldType: 'string',
          completion: {
            provider: ({ value }) => (value ? new Promise(resolve => pending.push(resolve)) : null),
          },
        },
      },
    })
    const result = (label: string) => ({
      replaceStart: 0,
      replaceEnd: 1,
      items: [{ key: label, label, insertText: label }],
    })
    const input = wrapper.get('input')
    input.element.focus()
    await input.setValue('a')
    await input.setValue('b')
    pending[1]!(result('Latest'))
    await flushPromises()
    pending[0]!(result('Stale'))
    await flushPromises()
    expect(input.attributes('aria-expanded')).toBe('true')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['Latest'])
    await input.setValue('c')
    input.element.blur()
    pending[2]!(result('After blur'))
    await flushPromises()
    expect(input.attributes('aria-expanded')).toBe('false')
    input.element.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    input.element.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    pending[3]!(result('After escape'))
    await flushPromises()
    expect(input.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('executes prepared auto-pairs and completion providers', async () => {
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        definition: {
          title: 'Content',
          fieldType: 'string',
          autoPairs: [{ open: '{{', close: '}}' }],
          completion: {
            provider: ({ value, cursor }) =>
              value === '{{}}' && cursor === 2
                ? {
                    replaceStart: 2,
                    replaceEnd: 2,
                    items: [{ key: 'scope:card', label: 'card:', insertText: 'card:', keepOpen: true }],
                  }
                : {
                    replaceStart: 2,
                    replaceEnd: 7,
                    items: [{ key: 'field:card:name', label: 'Name', insertText: 'card:name' }],
                  },
          },
        },
        value: '',
      },
    })
    const input = wrapper.get('input')
    input.element.focus()
    const element = input.element as HTMLInputElement

    element.value = '{{'
    element.setSelectionRange(2, 2)
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: '{', inputType: 'insertText' }))
    await flushPromises()

    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['{{}}'])
    expect(document.body.querySelector('[role="option"]')?.textContent).toContain('card:')

    await input.trigger('keydown', { key: 'Tab' })
    await flushPromises()
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['{{card:}}'])
    expect(document.body.querySelector('[role="option"]')?.textContent).toContain('Name')

    await input.trigger('keydown', { key: 'Tab' })
    await flushPromises()
    expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['{{card:name}}'])
    wrapper.unmount()
  })

  it('uses Shift+Tab for provider parent navigation without consuming it at the root', async () => {
    const wrapper = mount(StringPropertyField, {
      attachTo: document.body,
      props: {
        definition: {
          title: 'Reference',
          fieldType: 'string',
          completion: {
            static: { values: ['scope:'] },
            provider: ({ value }) =>
              value === 'scope:'
                ? {
                    replaceStart: 0,
                    replaceEnd: value.length,
                    items: [{ key: 'leaf', label: 'Leaf', insertText: 'scope:leaf' }],
                    parent: { key: 'parent', label: '..', insertText: '', keepOpen: true },
                  }
                : {
                    replaceStart: 0,
                    replaceEnd: value.length,
                    items: [{ key: 'scope', label: 'Scope', insertText: 'scope:', keepOpen: true }],
                  },
          },
        },
        value: 'scope:',
      },
    })
    const input = wrapper.get('input')
    const control = input.element as HTMLInputElement
    input.element.focus()
    await flushPromises()
    await nextTick()

    const parentEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    control.dispatchEvent(parentEvent)
    await nextTick()
    await nextTick()
    expect(parentEvent.defaultPrevented).toBe(true)
    expect(control.value).toBe('')

    control.value = 'sc'
    control.setSelectionRange(control.value.length, control.value.length)
    await input.trigger('input')
    await nextTick()
    const rootEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    control.dispatchEvent(rootEvent)
    expect(rootEvent.defaultPrevented).toBe(false)
    expect(control.value).toBe('sc')
    wrapper.unmount()
  })
})
