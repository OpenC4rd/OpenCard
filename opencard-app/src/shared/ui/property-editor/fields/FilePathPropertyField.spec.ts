import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OcAutocompletePopover from '../../../../components/standard/OcAutocompletePopover.vue'
import FilePathPropertyField from './FilePathPropertyField.vue'
import { createResourceDirectoryProvider } from '../../../../features/workspace/services/resourceDirectoryProvider'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../../../features/workspace/services/projectIconCatalog'
import { normalizeResourcePackageManifest } from '../../../../features/workspace/model/resourcePackage'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('FilePathPropertyField', () => {
  it('browses a package from its title, selects a file, and returns from the package root', async () => {
    const readDirectoryEntries = vi.fn(async (path: string) => path === '/project'
      ? [] : [{ name: 'image.png', isDirectory: false, isFile: true, isSymlink: false }])
    const provider = createResourceDirectoryProvider('/project', {
      kind: 'project', namespace: 'project', rootPath: '/project',
      fonts: {}, fontDocument: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
      packages: new Map([['alice/theme@1.0.0', {
        coordinate: { author: 'alice', name: 'theme', version: '1.0.0' },
        manifest: normalizeResourcePackageManifest({
          type: 'opencard-resource-package',
          author: 'alice', name: 'theme', version: '1.0.0', title: 'Theme Pack',
          public: { fonts: [], iconSeries: [] },
        }).manifest,
        archivePath: '/project/.opencard/packages/theme.ocpack',
        fingerprint: 'fp-theme',
        rootPath: '/cache/packages/aa11', cover: null,
      }]]),
    }, { readDirectoryEntries })
    const wrapper = mount(FilePathPropertyField, {
      props: { definition: { title: 'Image', fieldType: 'filePath', directoryProvider: provider }, value: '',
        'onUpdate:value': (value: string) => { void wrapper.setProps({ value }) },
      },
    })
    try {
      const input = wrapper.get('input')
      await input.trigger('focus')
      await flushPromises()
      const rootMenu = wrapper.getComponent(OcAutocompletePopover)
      expect(rootMenu.props('items')).toEqual([
        expect.objectContaining({ insertText: 'icon:', icon: 'file.project-icon' }),
        expect.objectContaining({ label: 'Theme Pack', insertText: 'alice/theme@1.0.0#', icon: 'file.package' }),
      ])
      rootMenu.vm.$emit('select', rootMenu.props('items').find(item => item.label === 'Theme Pack')!.key)
      await flushPromises()
      expect(readDirectoryEntries).toHaveBeenLastCalledWith('/cache/packages/aa11', 1)
      const menu = wrapper.getComponent(OcAutocompletePopover)
      expect(menu.props('items').map(item => item.label)).toEqual(['icon:', 'image.png', '..'])
      menu.vm.$emit('select', menu.props('items').find(item => item.label === '..')!.key)
      await flushPromises()
      expect(input.element.value).toBe('')
      expect(menu.props('items').map(item => item.label)).toContain('Theme Pack')
      menu.vm.$emit('select', menu.props('items').find(item => item.label === 'Theme Pack')!.key)
      await flushPromises()
      menu.vm.$emit('select', menu.props('items').find(item => item.label === 'image.png')!.key)
      await flushPromises()
      expect(input.element.value).toBe('alice/theme@1.0.0#image.png')
    } finally {
      wrapper.unmount()
    }
  })

  it('follows the workspace dot-file visibility setting', async () => {
    const readDirectoryEntries = vi.fn(async () => [
      { name: '.opencard', isDirectory: true, isFile: false, isSymlink: false },
      { name: '.git', isDirectory: true, isFile: false, isSymlink: false },
      { name: 'assets', isDirectory: true, isFile: false, isSymlink: false },
    ])
    const environment = {
      kind: 'project' as const, namespace: 'project', rootPath: '/project',
      fonts: {}, fontDocument: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const hidden = createResourceDirectoryProvider('/project', environment, { readDirectoryEntries }, { hideDotFiles: true })
    const visible = createResourceDirectoryProvider('/project', environment, { readDirectoryEntries }, { hideDotFiles: false })

    expect((await hidden('')).map(entry => entry.name)).toEqual(['assets', 'icon:'])
    expect((await visible('')).map(entry => entry.name)).toEqual(['.opencard', '.git', 'assets', 'icon:'])
  })

  it('uses Shift+Tab for parent navigation without trapping focus at the root', async () => {
    const directoryProvider = vi.fn(async (directory: string) => directory === 'assets'
      ? [{ name: 'assets/card.png', isDirectory: false }]
      : [{ name: 'assets', isDirectory: true }])
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: { title: 'Image', fieldType: 'filePath', directoryProvider },
        value: 'assets/',
        'onUpdate:value': (value: string) => { void wrapper.setProps({ value }) },
      },
    })
    const input = wrapper.get('input')
    await input.trigger('focus')
    await flushPromises()

    const parentEvent = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    })
    input.element.dispatchEvent(parentEvent)
    await flushPromises()
    expect(parentEvent.defaultPrevented).toBe(true)
    expect(input.element.value).toBe('')

    const rootEvent = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    })
    input.element.dispatchEvent(rootEvent)
    expect(rootEvent.defaultPrevented).toBe(false)

    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(input.element.value).toBe('assets/')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(input.element.value).toBe('')
  })

  it('opens virtual scoped-resource entries without appending a path separator', async () => {
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: {
          title: 'Image',
          fieldType: 'filePath',
          directoryProvider: async () => [
            { name: 'icon:', label: 'Icons', isDirectory: true, icon: 'file.project-icon' },
            { name: 'portrait.png', isDirectory: false },
          ],
          completion: {
            provider: ({ value }) => value === 'icon:'
              ? {
                  replaceStart: 0,
                  replaceEnd: value.length,
                  items: [{ key: 'series', label: 'Status', insertText: 'icon:status/', keepOpen: true }],
                }
              : null,
          },
        },
        value: '',
        'onUpdate:value': (value: string) => { void wrapper.setProps({ value }) },
      },
    })
    const input = wrapper.get('input')
    await input.trigger('focus')
    await flushPromises()

    expect(wrapper.getComponent(OcAutocompletePopover).props('items')[0]).toEqual(expect.objectContaining({
      label: 'Icons', insertText: 'icon:', icon: 'file.project-icon',
    }))
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(input.element.value).toBe('icon:')
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ label: 'Status', insertText: 'icon:status/' }),
    ])
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps an existing complete file committed independently of the stale focus cursor', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'assets/icons', isDirectory: true },
      { name: 'assets/portrait.png', isDirectory: false },
      { name: 'assets/readme.txt', isDirectory: false },
    ])
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: {
          title: 'Image',
          fieldType: 'filePath',
          filter: { target: 'file', extensions: ['png'] },
          directoryProvider,
        },
        value: 'assets/portrait.png',
      },
    })
    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).setSelectionRange(0, 0)

    await input.trigger('focus')
    await flushPromises()

    expect(directoryProvider).toHaveBeenCalledWith('assets')
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({
        label: 'propertyEditor.filePath.clearSelection',
        insertText: 'assets/',
        keepOpen: true,
      }),
    ])
    expect(wrapper.getComponent(OcAutocompletePopover).props('open')).toBe(true)

    const clearItem = wrapper.getComponent(OcAutocompletePopover).props('items')[0]!
    wrapper.getComponent(OcAutocompletePopover).vm.$emit('select', clearItem.key)
    await flushPromises()

    const updates = wrapper.emitted('update:value') ?? []
    expect(updates[updates.length - 1]).toEqual(['assets/'])
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ label: 'icons' }),
      expect.objectContaining({ label: 'portrait.png' }),
      expect.objectContaining({ label: '..' }),
    ])
  })

  it('uses strict path-prefix filtering for every cursor and focus refresh', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'Outputs/main_instance.png', isDirectory: false },
      { name: 'Outputs/main_blueprint.png', isDirectory: false },
      { name: 'Outputs/domain_main_input.png', isDirectory: false },
    ])
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: { title: 'Image', fieldType: 'filePath', directoryProvider },
        value: 'Outputs/main_in',
      },
    })
    const input = wrapper.get('input')

    await input.trigger('focus')
    await input.trigger('click')
    await flushPromises()

    const labels = wrapper.getComponent(OcAutocompletePopover).props('items').map(item => item.label)
    expect(labels).toContain('main_instance.png')
    expect(labels).not.toContain('main_blueprint.png')
    expect(labels).not.toContain('domain_main_input.png')
  })

  it('filters typed fragments and continues browsing after selecting a directory', async () => {
    const directoryProvider = vi.fn(async (directory: string) => directory === 'assets/icons'
      ? [{ name: 'assets/icons/card.png', isDirectory: false }]
      : [
          { name: 'assets/icons', isDirectory: true },
          { name: 'assets/card.png', isDirectory: false },
          { name: 'assets/portrait.png', isDirectory: false },
        ])
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: {
          title: 'Image',
          fieldType: 'filePath',
          filter: { target: 'file', extensions: ['.png'] },
          directoryProvider,
        },
        value: '',
      },
    })
    const input = wrapper.get('input')
    const control = input.element as HTMLInputElement
    await input.trigger('focus')
    await flushPromises()
    control.value = 'assets/ca'
    control.setSelectionRange(control.value.length, control.value.length)

    await input.trigger('input')
    await flushPromises()
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ label: 'card.png' }),
      expect.objectContaining({ label: '..' }),
    ])

    control.value = 'assets/'
    control.setSelectionRange(control.value.length, control.value.length)
    await input.trigger('input')
    await flushPromises()
    const directoryItem = wrapper.getComponent(OcAutocompletePopover).props('items')
      .find(item => item.label === 'icons')!
    wrapper.getComponent(OcAutocompletePopover).vm.$emit('select', directoryItem.key)
    await flushPromises()

    const updates = wrapper.emitted('update:value') ?? []
    expect(updates[updates.length - 1]).toEqual(['assets/icons/'])
    expect(directoryProvider).toHaveBeenLastCalledWith('assets/icons')

    const fileItem = wrapper.getComponent(OcAutocompletePopover).props('items')
      .find(item => item.label === 'card.png')!
    wrapper.getComponent(OcAutocompletePopover).vm.$emit('select', fileItem.key)
    await wrapper.setProps({
      value: 'assets/icons/card.png',
      definition: {
        title: 'Image',
        fieldType: 'filePath',
        filter: { target: 'file', extensions: ['png'] },
        directoryProvider,
        completion: { provider: () => null },
      },
    })
    await flushPromises()

    expect(wrapper.getComponent(OcAutocompletePopover).props('open')).toBe(true)
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({
        label: 'propertyEditor.filePath.clearSelection',
        insertText: 'assets/icons/',
      }),
    ])
  })

  it('browses a package root without inserting a slash after the package separator', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'alice/theme@1.0.0#images', isDirectory: true },
      { name: 'alice/theme@1.0.0#cover.png', isDirectory: false },
    ])
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: { title: 'Image', fieldType: 'filePath', directoryProvider },
        value: 'alice/theme@1.0.0#',
      },
    })

    await wrapper.get('input').trigger('focus')
    await flushPromises()

    expect(directoryProvider).toHaveBeenCalledWith('alice/theme@1.0.0#')
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ label: 'images', insertText: 'alice/theme@1.0.0#images/' }),
      expect.objectContaining({ label: 'cover.png', insertText: 'alice/theme@1.0.0#cover.png' }),
      expect.objectContaining({ label: '..' }),
    ])
  })

  it('supports directory-only filters while keeping binding completion authoritative', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'assets', isDirectory: true },
      { name: 'portrait.png', isDirectory: false },
    ])
    const bindingProvider = vi.fn(({ value }: { value: string }) => value.startsWith('{{')
      ? {
          replaceStart: 2,
          replaceEnd: value.length,
          items: [{ key: 'binding', label: 'card:image', insertText: 'card:image' }],
        }
      : null)
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: {
          title: 'Directory',
          fieldType: 'filePath',
          filter: { target: 'directory' },
          directoryProvider,
          completion: { provider: bindingProvider },
        },
        value: '',
      },
    })
    const input = wrapper.get('input')
    await input.trigger('focus')
    await flushPromises()
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ label: 'assets' }),
    ])

    const control = input.element as HTMLInputElement
    control.value = '{{'
    control.setSelectionRange(2, 2)
    await input.trigger('input')
    await flushPromises()

    expect(bindingProvider).toHaveBeenLastCalledWith({ value: '{{', cursor: 2 })
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([
      expect.objectContaining({ key: 'binding' }),
    ])
  })

  it('discards a pending directory result after blur', async () => {
    let resolveEntries: ((entries: Array<{ name: string; isDirectory: boolean }>) => void) | undefined
    const directoryProvider = vi.fn(() => new Promise<Array<{ name: string; isDirectory: boolean }>>((resolve) => {
      resolveEntries = resolve
    }))
    const wrapper = mount(FilePathPropertyField, {
      props: {
        definition: { title: 'Image', fieldType: 'filePath', directoryProvider },
        value: 'assets/portrait.png',
      },
    })
    const input = wrapper.get('input')

    await input.trigger('focus')
    await input.trigger('blur')
    resolveEntries?.([{ name: 'assets/portrait.png', isDirectory: false }])
    await flushPromises()

    expect(wrapper.getComponent(OcAutocompletePopover).props('open')).toBe(false)
    expect(wrapper.getComponent(OcAutocompletePopover).props('items')).toEqual([])
  })
})
