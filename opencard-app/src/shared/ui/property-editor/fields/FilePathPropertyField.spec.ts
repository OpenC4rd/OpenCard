import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayGroupRoot from '../../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../../composables/overlayGroups'
import FilePathPropertyField from './FilePathPropertyField.vue'
import { createResourceDirectoryProvider } from '../../../../features/workspace/services/resourceDirectoryProvider'
import { EMPTY_PROJECT_ICON_CATALOG } from '../../../../features/workspace/services/projectIconCatalog'
import { normalizeResourcePackageManifest } from '../../../../features/workspace/model/resourcePackage'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

/**
 * 候选列表是共享组宿主里的一层：没有可读的登记内容，只能查真实 DOM。
 * 选择走列表自己的 pointerdown 入口，和用户点击的路径一致。
 */
function listbox(): HTMLElement | null {
  return document.body.querySelector('[role="listbox"]')
}

function optionLabels(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')]
    .map(option => option.textContent?.trim() ?? '')
}

function chooseOption(label: string): void {
  const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    .find(candidate => (candidate.textContent?.trim() ?? '') === label)
  if (!option) throw new Error(`选项 ${label} 不在列表里：${optionLabels().join(' | ')}`)
  option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
}

const projectEnvironment = {
  kind: 'project' as const, namespace: 'project', rootPath: '/project',
  fonts: {}, fontDocument: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
}

function mountField(
  definition: Record<string, unknown>,
  value: string,
): VueWrapper {
  const wrapper = mount(FilePathPropertyField, {
    attachTo: document.body,
    props: {
      definition: { title: 'Image', fieldType: 'filePath', ...definition },
      value,
      'onUpdate:value': (next: string) => { void wrapper.setProps({ value: next }) },
    },
  })
  return wrapper
}

describe('FilePathPropertyField', () => {
  // 候选列表要真的渲染出来才说明「列表打开了」。
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

  it('offers parent navigation for a deleted directory but still reports real read failures', async () => {
    const error = new Error('read directory failed')
    const fs = { readDirectoryEntries: vi.fn(async () => { throw error }), fileExists: vi.fn(async () => false) }
    const provider = createResourceDirectoryProvider('/project', projectEnvironment, fs)
    const wrapper = mountField({ directoryProvider: provider }, 'Assets/deleted.png')
    try {
      wrapper.get('input').element.focus()
      await flushPromises()
      expect(fs.fileExists).toHaveBeenCalledWith('/project/Assets')
      expect(optionLabels()).toEqual(['..'])
      fs.fileExists.mockResolvedValue(true)
      await expect(provider('Assets')).rejects.toBe(error)
    } finally { wrapper.unmount() }
  })

  it('browses a package by its title and writes the package coordinate back', async () => {
    const readDirectoryEntries = vi.fn(async (path: string) => path === '/project'
      ? [] : [{ name: 'image.png', isDirectory: false, isFile: true, isSymlink: false }])
    const provider = createResourceDirectoryProvider('/project', {
      ...projectEnvironment,
      packages: new Map([['alice/theme@1.0.0', {
        coordinate: { author: 'alice', name: 'theme', version: '1.0.0' },
        manifest: normalizeResourcePackageManifest({
          type: 'opencard-resource-package',
          author: 'alice', name: 'theme', version: '1.0.0', title: 'Theme Pack',
          public: { fonts: [], iconSeries: [] },
        }).manifest,
        archivePath: '/project/.opencard/packages/theme.ocpack',
        fingerprint: 'fp-theme',
        rootPath: '/cache/snapshots/aa11', cover: null,
      }]]),
    }, { readDirectoryEntries, fileExists: async () => true })
    const wrapper = mountField({ directoryProvider: provider }, '')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      expect(optionLabels()).toEqual(['icon:', 'Theme Pack'])
      chooseOption('Theme Pack')
      await flushPromises()
      expect(readDirectoryEntries).toHaveBeenLastCalledWith('/cache/snapshots/aa11', 1)
      chooseOption('image.png')
      await flushPromises()
      expect(input.element.value).toBe('alice/theme@1.0.0#image.png')
    } finally { wrapper.unmount() }
  })

  it('follows the workspace dot-file visibility setting', async () => {
    const fs = {
      readDirectoryEntries: vi.fn(async () => [
        { name: '.opencard', isDirectory: true, isFile: false, isSymlink: false },
        { name: '.git', isDirectory: true, isFile: false, isSymlink: false },
        { name: 'assets', isDirectory: true, isFile: false, isSymlink: false },
      ]),
      fileExists: async () => true,
    }
    const hidden = createResourceDirectoryProvider('/project', projectEnvironment, fs, { hideDotFiles: true })
    const visible = createResourceDirectoryProvider('/project', projectEnvironment, fs, { hideDotFiles: false })

    expect((await hidden('')).map(entry => entry.name)).toEqual(['assets', 'icon:'])
    expect((await visible('')).map(entry => entry.name)).toEqual(['.opencard', '.git', 'assets', 'icon:'])
  })

  it('uses Shift+Tab for parent navigation without consuming it at the root', async () => {
    const directoryProvider = vi.fn(async (directory: string) => directory === 'assets'
      ? [{ name: 'assets/card.png', isDirectory: false }]
      : [{ name: 'assets', isDirectory: true }])
    const wrapper = mountField({ directoryProvider }, 'assets/')
    try {
      const input = wrapper.get('input')
      input.element.focus()
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
    } finally { wrapper.unmount() }
  })

  it('opens virtual scoped-resource entries without appending a path separator', async () => {
    const wrapper = mountField({
      directoryProvider: async () => [
        { name: 'icon:', label: 'Icons', isDirectory: true, icon: 'mdiStickerEmoji' },
        { name: 'portrait.png', isDirectory: false },
      ],
      completion: {
        provider: ({ value }: { value: string }) => value === 'icon:'
          ? {
              replaceStart: 0,
              replaceEnd: value.length,
              items: [{ key: 'series', label: 'Status', insertText: 'icon:status/', keepOpen: true }],
            }
          : null,
      },
    }, '')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()

      // 目录项写回的是前缀本身（`icon:`），不是 `icon:/`：作用域前缀后面没有分隔符。
      expect(optionLabels()[0]).toBe('Icons')
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(input.element.value).toBe('icon:')
      expect(optionLabels()).toEqual(['Status'])
    } finally { wrapper.unmount() }
  })

  it('keeps an existing complete file committed independently of the stale focus cursor', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'assets/icons', isDirectory: true },
      { name: 'assets/portrait.png', isDirectory: false },
      { name: 'assets/readme.txt', isDirectory: false },
    ])
    const wrapper = mountField({
      directoryProvider,
      filter: { target: 'file', extensions: ['png'] },
    }, 'assets/portrait.png')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      ;(input.element as HTMLInputElement).setSelectionRange(0, 0)
      input.element.focus()
      await flushPromises()

      expect(directoryProvider).toHaveBeenCalledWith('assets')
      expect(optionLabels()).toEqual(['propertyEditor.filePath.clearSelection'])

      chooseOption('propertyEditor.filePath.clearSelection')
      await flushPromises()

      const updates = wrapper.emitted('update:value') ?? []
      expect(updates[updates.length - 1]).toEqual(['assets/'])
      expect(optionLabels()).toEqual(['icons', 'portrait.png', '..'])
    } finally { wrapper.unmount() }
  })

  it('uses strict path-prefix filtering for every cursor and focus refresh', async () => {
    const directoryProvider = vi.fn(async () => [
      { name: 'Outputs/main_instance.png', isDirectory: false },
      { name: 'Outputs/main_blueprint.png', isDirectory: false },
      { name: 'Outputs/domain_main_input.png', isDirectory: false },
    ])
    const wrapper = mountField({ directoryProvider }, 'Outputs/main_in')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      await input.trigger('click')
      await flushPromises()

      const labels = optionLabels()
      expect(labels).toContain('main_instance.png')
      expect(labels).not.toContain('main_blueprint.png')
      expect(labels).not.toContain('domain_main_input.png')
    } finally { wrapper.unmount() }
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
    const wrapper = mountField({
      directoryProvider,
      filter: { target: 'directory' },
      completion: { provider: bindingProvider },
    }, '')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      expect(optionLabels()).toEqual(['assets'])

      const control = input.element as HTMLInputElement
      control.value = '{{'
      control.setSelectionRange(2, 2)
      await input.trigger('input')
      await flushPromises()

      expect(bindingProvider).toHaveBeenLastCalledWith({ value: '{{', cursor: 2 })
      expect(optionLabels()).toEqual(['card:image'])
    } finally { wrapper.unmount() }
  })

  it('discards a pending directory result after blur', async () => {
    let resolveEntries: ((entries: Array<{ name: string; isDirectory: boolean }>) => void) | undefined
    const directoryProvider = vi.fn(() => new Promise<Array<{ name: string; isDirectory: boolean }>>((resolve) => {
      resolveEntries = resolve
    }))
    const wrapper = mountField({ directoryProvider }, 'assets/portrait.png')
    try {
      const input = wrapper.get('input')
      input.element.focus()
      await flushPromises()
      await input.trigger('blur')
      resolveEntries?.([{ name: 'assets/portrait.png', isDirectory: false }])
      await flushPromises()

      expect(listbox()).toBeNull()
      expect(optionLabels()).toEqual([])
    } finally { wrapper.unmount() }
  })
})