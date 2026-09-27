import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectIconRegistrationDialog from './ProjectIconRegistrationDialog.vue'
import OcButton from '../base/OcButton.vue'

const mocks = vi.hoisted(() => ({
  pickFiles: vi.fn(), pickDirectory: vi.fn(), readDirectory: vi.fn(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    pickFiles: mocks.pickFiles,
    pickDirectory: mocks.pickDirectory,
    readDirectory: mocks.readDirectory,
  },
}))

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ProjectIconRegistrationDialog, {
    props: { open: true, ...props },
    global: { stubs: { Teleport: true } },
  })
}

function chooseFiles(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.chooseFiles')!.trigger('click')
}

describe('ProjectIconRegistrationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pickFiles.mockResolvedValue([])
    mocks.pickDirectory.mockResolvedValue(null)
    mocks.readDirectory.mockResolvedValue([])
  })

  it('turns each picked file into an icon of the new set without reading it', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/Warn.svg', 'D:/Icons/Logo.svg'])
    const wrapper = mountDialog()

    await chooseFiles(wrapper)
    await flushPromises()

    expect(mocks.pickFiles).toHaveBeenCalledWith(expect.objectContaining({
      extensions: ['svg', 'png', 'jpg', 'jpeg', 'webp'],
    }))
    // Identity is derived from the file name only, so choosing is instant even for a huge folder.
    expect(wrapper.text()).toContain('projectConfig.icons.selectedIconsCount')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: 'Warn',
      key: 'warn',
      icons: [
        { sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn', name: 'Warn' },
        { sourcePath: 'D:/Icons/Logo.svg', iconKey: 'logo', name: 'Logo' },
      ],
    })
  })

  it('deduplicates icon Keys case-insensitively', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/Icon.svg', 'D:/Icons/icon.svg', 'D:/Icons/Icon.png'])
    const wrapper = mountDialog()

    await chooseFiles(wrapper)
    await flushPromises()
    await wrapper.get('form').trigger('submit')

    expect((wrapper.emitted('submit')?.[0]?.[0] as { icons: { iconKey: string }[] }).icons)
      .toEqual([
        { sourcePath: 'D:/Icons/Icon.svg', iconKey: 'icon', name: 'Icon' },
        { sourcePath: 'D:/Icons/icon.svg', iconKey: 'icon-2', name: 'icon' },
        { sourcePath: 'D:/Icons/Icon.png', iconKey: 'icon-3', name: 'Icon' },
      ])
  })

  it('names the set after the chosen folder and takes every icon file directly inside it', async () => {
    mocks.pickDirectory.mockResolvedValue('D:\\Pictures\\Memory Icons')
    mocks.readDirectory.mockResolvedValue([
      { name: 'warn.svg', isFile: true, isDirectory: false },
      { name: 'coin.png', isFile: true, isDirectory: false },
      { name: 'notes.txt', isFile: true, isDirectory: false },
      { name: 'nested', isFile: false, isDirectory: true },
    ])
    const wrapper = mountDialog()

    await wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.chooseFolder')!.trigger('click')
    await flushPromises()

    expect(mocks.readDirectory).toHaveBeenCalledWith('D:\\Pictures\\Memory Icons')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: 'Memory Icons',
      key: 'memory-icons',
      icons: [
        { sourcePath: 'D:\\Pictures\\Memory Icons\\warn.svg', iconKey: 'warn', name: 'warn' },
        { sourcePath: 'D:\\Pictures\\Memory Icons\\coin.png', iconKey: 'coin', name: 'coin' },
      ],
    })
  })

  it('reports a chosen folder that holds no usable icon file', async () => {
    mocks.pickDirectory.mockResolvedValue('D:/Icons/Empty')
    mocks.readDirectory.mockResolvedValue([{ name: 'readme.md', isFile: true, isDirectory: false }])
    const wrapper = mountDialog()

    await wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.chooseFolder')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('projectConfig.icons.noIconsInFolder')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('blocks a set Key that another set already uses', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/status.svg'])
    const wrapper = mountDialog({ series: [{ name: 'Existing', key: 'status', icons: [] }] })

    await chooseFiles(wrapper)
    await flushPromises()
    // A derived Key avoids the collision, so the conflict only appears once the user types it.
    await wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.advancedSettings')!.trigger('click')
    await wrapper.findAll('input')[1]!.setValue('status')

    expect(wrapper.text()).toContain('projectConfig.icons.iconSetKeyExists')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('keeps a user-edited Key when the name changes later', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/warn.svg'])
    const wrapper = mountDialog()

    await chooseFiles(wrapper)
    await flushPromises()
    await wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.advancedSettings')!.trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[1]!.setValue('my-icons')
    await inputs[0]!.setValue('Renamed')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Renamed', key: 'my-icons' })
  })

  it('resets the selection every time it opens', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/warn.svg'])
    const wrapper = mountDialog()
    await chooseFiles(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('projectConfig.icons.selectedIconsCount')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.text()).not.toContain('projectConfig.icons.selectedIconsCount')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('adds to an existing set without asking for its name or Key, and avoids the Keys it holds', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/Warn.svg', 'D:/Icons/Gem.svg'])
    const outline = {
      name: 'Outline', key: 'outline',
      icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'theme' as const }],
    }
    const wrapper = mountDialog({ series: [outline], targetSeries: outline })

    expect(wrapper.text()).toContain('projectConfig.icons.addIconsToSet')
    expect(wrapper.text()).not.toContain('projectConfig.icons.advancedSettings')

    await chooseFiles(wrapper)
    await flushPromises()
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      name: 'Outline',
      key: 'outline',
      icons: [
        { sourcePath: 'D:/Icons/Warn.svg', iconKey: 'warn-2', name: 'Warn' },
        { sourcePath: 'D:/Icons/Gem.svg', iconKey: 'gem', name: 'Gem' },
      ],
    })
  })
})
