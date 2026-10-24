import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'
import PropertyEditor from './PropertyEditor.vue'

/**
 * 右键菜单渲染在 "context-menu" 组的宿主里；子层是 `${overlayKey}/sub` 组。
 */
function menuElement(index = 0): HTMLElement | null {
  return document.body.querySelectorAll<HTMLElement>('.overlay-group-layer .oc-action-menu')[index] ?? null
}

function menuButton(key: string, index = 0): HTMLButtonElement {
  const button = [...(menuElement(index)?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    .find(item => item.dataset.ocActionKey === key)
  if (!button) throw new Error(`No menu command for "${key}"`)
  return button
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    te: () => false,
  }),
}))

function mountEditor(props: Record<string, unknown>, options: Record<string, unknown> = {}) {
  return mount(PropertyEditor, { ...options, props: { sortMode: 'category', inputs: [], ...props } })
}

describe('PropertyEditor records protocol', () => {
  // 右键菜单由 OverlayGroupRoot 为 "context-menu" 组创建的宿主渲染。
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
  })

  it('offers add-property from the category menu and emits the chosen field', async () => {
    const wrapper = mountEditor({
        inputs: [{
          key: 'block',
          record: {},
          fields: {
            content: { title: 'Content', fieldType: 'string', defaultValue: '' },
          },
        }],
    })

    await wrapper.get('.property-editor__category-header').trigger('contextmenu')
    await flushPromises()
    // 具体字段是 "add-property" 这一项的子层：悬停分支才看得见它。
    menuButton('add-property').closest('.oc-action-menu__item')!.dispatchEvent(new Event('pointerenter'))
    await flushPromises()
    menuButton('add-property:content', 1).click()
    await flushPromises()
    expect(wrapper.emitted('add-property')).toEqual([[
      { key: 'block', fieldKey: 'content' },
    ]])
  })

  it('copies the stable field key rather than the localized label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const wrapper = mountEditor({
        deleteMode: false,
        inputs: [{
          key: 'block',
          record: { opacity: 1 },
          fields: {
            opacity: { title: 'Opacity', fieldType: 'number' },
          },
        }],
    })

    await wrapper.get('.property-editor__field-key-button').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('opacity')
  })

  it('dispatches explicitly marked strings to the rich-text editor', async () => {
    const wrapper = mountEditor({
        inputs: [{
          key: 'text',
          record: { content: '<p>Hello</p>' },
          fields: {
            content: { title: 'Content', fieldType: 'string', richText: true },
          },
        }],
    })

    const editor = wrapper.vm as unknown as {
      activateField: (inputKey: string, fieldKey: string) => Promise<boolean>
    }
    expect(await editor.activateField('text', 'content')).toBe(true)
    await vi.dynamicImportSettled()
    await flushPromises()
    expect(document.body.querySelector('[data-oc-modal-root]')).not.toBeNull()
    wrapper.unmount()
  })

  it('edits array fields by emitting complete arrays and reuses element completion', async () => {
    const completion = vi.fn(() => ({
      replaceStart: 0,
      replaceEnd: 0,
      items: [{ key: 'base', label: 'base.opencardproject', insertText: 'base.opencardproject' }],
    }))
    const wrapper = mountEditor({
        inputs: [{
          key: 'project',
          record: { extends: ['base.opencardproject', 'locale.opencardproject'] },
          fields: {
            extends: {
              title: 'Extends',
              fieldType: 'filePath[]',
              defaultValue: [],
              completion: { provider: completion },
            },
          },
        }],
    })

    await wrapper.findAll('input')[0]!.trigger('focus')
    expect(completion).toHaveBeenCalled()

    await wrapper.findAll('button[aria-label="Move up"]')[1]!.trigger('click')
    const moveEmissions = wrapper.emitted('update-property') ?? []
    expect(moveEmissions[moveEmissions.length - 1]).toEqual([{
      key: 'project',
      fieldKey: 'extends',
      value: ['locale.opencardproject', 'base.opencardproject'],
    }])

    await wrapper.findAll('button[aria-label="Delete item"]')[0]!.trigger('click')
    const deleteEmissions = wrapper.emitted('update-property') ?? []
    expect(deleteEmissions[deleteEmissions.length - 1]).toEqual([{
      key: 'project',
      fieldKey: 'extends',
      value: ['base.opencardproject'],
    }])
  })

  it('reveals a field by its input and field keys, placing the caret at the character offset', async () => {
    const wrapper = mountEditor({
        inputs: [{
          key: 'block:1',
          record: { content: '😀 Hello {{self:missing}}!' },
          fields: {
            content: { title: 'Content', fieldType: 'string' },
          },
        }],
    }, { attachTo: document.body })

    const row = wrapper.get('[data-field-key="content"]')
    const scrollIntoView = vi.fn()
    Object.defineProperty(row.element, 'scrollIntoView', { value: scrollIntoView })

    const editor = wrapper.vm as unknown as {
      revealField: (
        inputKey: string,
        fieldKey: string,
        characterOffset?: number,
      ) => Promise<boolean>
    }
    expect(await editor.revealField('block:1', 'content', 8)).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(document.activeElement).toBe(row.get('input').element)
    expect((row.get('input').element as HTMLInputElement).selectionStart).toBe(9)
    expect(await editor.revealField('block:1', 'missing')).toBe(false)

    wrapper.unmount()
  })

  it('offers the delete action only in delete mode and emits on the first click', async () => {
    const wrapper = mountEditor({
        inputs: [{
          key: 'block',
          record: { score: 10 },
          fields: {
            score: { title: 'Score', fieldType: 'number' },
          },
        }],
    })

    expect(wrapper.find('[data-field-key="score"] [data-action-key="delete-property"]').exists()).toBe(false)
    await wrapper.setProps({ deleteMode: true })
    await wrapper.get('[data-field-key="score"] [data-action-key="delete-property"] button').trigger('click')
    expect(wrapper.emitted('delete-property')).toEqual([[
      { key: 'block', fieldKey: 'score' },
    ]])
  })

  it('withholds the delete action for unremovable or readonly fields', () => {
    const wrapper = mountEditor({
        deleteMode: true,
        inputs: [{
          key: 'block',
          record: { score: 10, label: 'A' },
          fields: {
            score: { title: 'Score', fieldType: 'number', unremovable: true },
            label: { title: 'Label', fieldType: 'string', isReadonly: true },
          },
        }],
    })

    expect(wrapper.find('[data-field-key="score"] [data-action-key="delete-property"]').exists()).toBe(false)
    expect(wrapper.find('[data-field-key="label"] [data-action-key="delete-property"]').exists()).toBe(false)
  })

  it('switches a bindable number field to the raw string editor', async () => {
    const wrapper = mountEditor({
        allowRawStringEditor: true,
        bindingInterpreter: {
          isExpression: (value: unknown) => typeof value === 'string' && value.startsWith('{{'),
        },
        inputs: [{
          key: 'block',
          record: { opacity: '1' },
          fields: {
            opacity: {
              title: 'Opacity',
              fieldType: 'number',
              defaultValue: '1',
              binding: { provider: () => null },
            },
          },
        }],
    })

    await wrapper.get('button[aria-label="propertyEditor.bindings.useRawEditor"]').trigger('click')
    await wrapper.get('input').setValue('{{self:score}}')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('{{self:score}}')
    expect(wrapper.emitted('update-property')).toEqual([[
      { key: 'block', fieldKey: 'opacity', value: '{{self:score}}' },
    ]])
  })

  it('shows a field rendering warning beside the affected editor row', () => {
    const warningKey = `block\u0000opacity`
    const wrapper = mountEditor({
        fieldWarnings: new Map([[warningKey, 'The current value has a rendering warning']]),
        inputs: [{
          key: 'block', record: { opacity: '2' },
          fields: { opacity: { title: 'Opacity', fieldType: 'number' } },
        }],
    })

    const row = wrapper.get('[data-field-key="opacity"]')
    expect(row.find('[data-tooltip="The current value has a rendering warning"]').exists()).toBe(true)
  })

  it('opens an existing binding in the raw string editor without the legacy binding field', () => {
    const wrapper = mountEditor({
        allowRawStringEditor: true,
        bindingInterpreter: {
          isExpression: (value: unknown) => typeof value === 'string' && value.startsWith('{{'),
        },
        inputs: [{
          key: 'block',
          record: { opacity: '{{self:score}}' },
          fields: {
            opacity: {
              title: 'Opacity',
              fieldType: 'number',
              defaultValue: '1',
              binding: { provider: () => null },
            },
          },
        }],
    })

    const row = wrapper.get('[data-field-key="opacity"]')
    expect((row.get('input').element as HTMLInputElement).value).toBe('{{self:score}}')
  })
})