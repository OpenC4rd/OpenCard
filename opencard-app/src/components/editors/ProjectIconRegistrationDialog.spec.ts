import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectIconRegistrationDialog from './ProjectIconRegistrationDialog.vue'
import OcButton from '../base/OcButton.vue'
import OcSelect from '../standard/OcSelect.vue'
import OcOptionGroup from '../standard/OcOptionGroup.vue'
import OcAlbum from '../standard/OcAlbum.vue'

const mocks = vi.hoisted(() => ({
  pickFiles: vi.fn(), pickFile: vi.fn(), pickDirectory: vi.fn(), readDirectory: vi.fn(), readBinaryFile: vi.fn(), loadRasterDimensions: vi.fn(),
}))
const sourceOption = (wrapper: { findAll: (selector: string) => Array<{ text: () => string; trigger: (event: string) => Promise<void> }> }, title: string) => (
  wrapper.findAll('.project-import-source-choice__option').find(option => option.text().includes(title))!
)

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../features/workspace/services/projectIconFileFacts', () => ({ loadRasterDimensions: mocks.loadRasterDimensions, PIXEL_ART_SHORT_SIDE: 32 }))
vi.mock('../../features/workspace/services/fileSystemService', () => ({
  fileSystemService: {
    pickFiles: mocks.pickFiles,
    pickFile: mocks.pickFile,
    readBinaryFile: mocks.readBinaryFile,
    pickDirectory: mocks.pickDirectory,
    readDirectory: mocks.readDirectory,
    toAssetSrc: (path: string) => `asset://${path}`,
  },
}))

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ProjectIconRegistrationDialog, {
    props: { open: true, ...props },
    global: { stubs: { Teleport: true } },
  })
}

function chooseFiles(wrapper: ReturnType<typeof mountDialog>) {
  return sourceOption(wrapper, 'projectConfig.icons.chooseFiles').trigger('click')
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

    await sourceOption(wrapper, 'projectConfig.icons.chooseFolder').trigger('click')
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

    await sourceOption(wrapper, 'projectConfig.icons.chooseFolder').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('projectConfig.icons.noIconsInFolder')
    expect(wrapper.find('.project-import-source-choice').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
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

  it('starts on the source choice and returns to it when choosing again', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/warn.svg'])
    const wrapper = mountDialog()
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)

    await chooseFiles(wrapper)
    await flushPromises()
    expect(wrapper.find('.project-import-source-choice').exists()).toBe(false)
    expect(wrapper.get('.oc-album img').attributes('src')).toBe('asset://D:/Icons/warn.svg')

    await wrapper.findAllComponents(OcButton).find(b => b.text() === 'projectConfig.icons.chooseAgain')!.trigger('click')
    expect(wrapper.find('.project-import-source-choice').exists()).toBe(true)
  })

  it('resets the selection every time it opens', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/warn.svg'])
    const wrapper = mountDialog()
    await chooseFiles(wrapper)
    await flushPromises()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
  })

  it('adds to an existing set without asking for its name or Key, and avoids the Keys it holds', async () => {
    mocks.pickFiles.mockResolvedValue(['D:/Icons/Warn.svg', 'D:/Icons/Gem.svg'])
    const outline = {
      name: 'Outline', key: 'outline',
      icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/outline/warn.svg', tint: 'context' as const }],
    }
    const wrapper = mountDialog({ series: [outline], targetSeries: outline })

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

  describe('sprite sheet', () => {
    async function pickSheet(size: { width: number, height: number } | null = { width: 64, height: 32 }) {
      mocks.pickFile.mockResolvedValue('D:/Art/Pixel Hero.png')
      mocks.readBinaryFile.mockResolvedValue(new Uint8Array([1]))
      mocks.loadRasterDimensions.mockResolvedValue(size)
      const wrapper = mountDialog()
      await sourceOption(wrapper, 'projectConfig.icons.chooseSprite').trigger('click')
      await flushPromises()
      return wrapper
    }
    const selects = (wrapper: ReturnType<typeof mountDialog>) => wrapper.findAllComponents(OcSelect)
    const setCell = async (wrapper: ReturnType<typeof mountDialog>, width: string, height: string) => {
      selects(wrapper)[0]!.vm.$emit('update:modelValue', width)
      selects(wrapper)[1]!.vm.$emit('update:modelValue', height)
      await wrapper.vm.$nextTick()
    }

    it('picks only raster files and starts on the cell size the sheet most likely holds', async () => {
      const wrapper = await pickSheet({ width: 128, height: 64 })
      expect(mocks.pickFile).toHaveBeenCalledWith(expect.objectContaining({ extensions: ['png', 'jpg', 'jpeg', 'webp'] }))

      // 128×64 is evenly cut by 32, the most common icon cell, so that is already selected.
      expect(selects(wrapper).map(select => select.props('modelValue'))).toEqual(['32', '32'])
      expect(wrapper.text()).toContain('projectConfig.icons.spriteGrid')
      await wrapper.get('form').trigger('submit')
      const icons = (wrapper.emitted('submit')?.[0]?.[0] as { icons: unknown[] }).icons
      expect(icons).toHaveLength(8)
      expect(icons[0]).toEqual({ sourcePath: 'D:/Art/Pixel Hero.png', iconKey: 'pixel-hero-1', name: 'Pixel Hero 1', crop: { x: 0, y: 0, w: 32, h: 32 } })
    })

    it('offers only sizes that cut each side evenly, so no choice can be wrong', async () => {
      const wrapper = await pickSheet({ width: 96, height: 64 })
      expect(selects(wrapper)[0]!.props('options').map((option: { value: string }) => option.value))
        .toEqual(['4', '6', '8', '12', '16', '24', '32', '48', '96'])
      expect(selects(wrapper)[1]!.props('options').map((option: { value: string }) => option.value))
        .toEqual(['4', '8', '16', '32', '64'])
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('cuts the sheet by the chosen cells, all sharing the sheet file, and keeps keys clear of the set it adds to', async () => {
      const wrapper = await pickSheet({ width: 64, height: 32 })
      await setCell(wrapper, '32', '32')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
        name: 'Pixel Hero',
        key: 'pixel-hero',
        icons: [
          { sourcePath: 'D:/Art/Pixel Hero.png', iconKey: 'pixel-hero-1', name: 'Pixel Hero 1', crop: { x: 0, y: 0, w: 32, h: 32 } },
          { sourcePath: 'D:/Art/Pixel Hero.png', iconKey: 'pixel-hero-2', name: 'Pixel Hero 2', crop: { x: 32, y: 0, w: 32, h: 32 } },
        ],
      })

      const append = mountDialog({ targetSeries: { name: 'Pixel', key: 'pixel', icons: [{ iconKey: 'pixel-hero-1', name: 'x', source: 's', tint: 'original' }] } })
      await sourceOption(append, 'projectConfig.icons.chooseSprite').trigger('click')
      await flushPromises()
      await append.get('form').trigger('submit')
      const keys = (append.emitted('submit')?.[0]?.[0] as { icons: { iconKey: string }[] }).icons.map(icon => icon.iconKey)
      expect(keys).toEqual(['pixel-hero-1-2', 'pixel-hero-2'])
    })

    it('shows the whole sheet with the cut drawn over it instead of an album of icons', async () => {
      const wrapper = await pickSheet({ width: 64, height: 32 })
      await setCell(wrapper, '32', '16')

      expect(wrapper.findComponent(OcAlbum).exists()).toBe(false)
      expect(wrapper.get('.project-icon-registration-dialog__sheet-image').attributes('src')).toBe('asset://D:/Art/Pixel Hero.png')
      const grid = wrapper.get('.project-icon-registration-dialog__sheet-grid')
      expect(grid.attributes('viewBox')).toBe('0 0 64 32')
      // 2 columns × 2 rows: three vertical and three horizontal lines, edges included.
      expect(grid.get('path').attributes('d')).toBe('M0 0V32M32 0V32M64 0V32M0 0H64M0 16H64M0 32H64')

      await setCell(wrapper, '16', '16')
      expect(wrapper.get('.project-icon-registration-dialog__sheet-grid path').attributes('d')).toContain('M48 0V32')
    })

    it('switches between cell size and columns and rows without losing the cut', async () => {
      const wrapper = await pickSheet({ width: 64, height: 32 })
      await setCell(wrapper, '16', '16')
      const values = () => selects(wrapper).map(select => select.props('modelValue'))
      expect(values()).toEqual(['16', '16'])

      await wrapper.getComponent(OcOptionGroup).vm.$emit('update:modelValue', 'grid')
      await wrapper.vm.$nextTick()
      // 64 / 16 = 4 columns, 32 / 16 = 2 rows: the same cut, counted instead of measured.
      expect(values()).toEqual(['4', '2'])
      expect(selects(wrapper)[0]!.props('options').map((option: { value: string }) => option.value)).toEqual(['1', '2', '4', '8', '16'])

      selects(wrapper)[0]!.vm.$emit('update:modelValue', '8')
      await wrapper.vm.$nextTick()
      await wrapper.getComponent(OcOptionGroup).vm.$emit('update:modelValue', 'size')
      await wrapper.vm.$nextTick()
      expect(values()).toEqual(['8', '16'])
      await wrapper.get('form').trigger('submit')
      const icons = (wrapper.emitted('submit')?.[0]?.[0] as { icons: { crop: unknown }[] }).icons
      expect(icons).toHaveLength(16)
      expect(icons[1]!.crop).toEqual({ x: 8, y: 0, w: 8, h: 16 })
    })

    it('reports an image whose size cannot be read instead of continuing', async () => {
      const wrapper = await pickSheet(null)
      expect(wrapper.text()).toContain('projectConfig.icons.spriteUnreadable')
      expect(wrapper.find('.project-icon-registration-dialog__sprite').exists()).toBe(false)
    })
  })
})
