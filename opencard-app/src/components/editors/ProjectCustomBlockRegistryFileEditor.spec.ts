import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSimpleContainerBlock } from '../../entities/card/model'
import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { parseCustomBlockRegistryText } from '../../features/workspace/model/customBlockRegistry'
import ProjectCustomBlockRegistryFileEditor from './ProjectCustomBlockRegistryFileEditor.vue'
import ProjectCustomBlockCollectionSettingsDialog from './ProjectCustomBlockCollectionSettingsDialog.vue'
import ProjectImportSourceChoice from './ProjectImportSourceChoice.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcButton from '../base/OcButton.vue'

const fs = vi.hoisted(() => ({
  pickDirectory: vi.fn(), pickFiles: vi.fn(), readDirectory: vi.fn(), readFile: vi.fn(),
  createDirectory: vi.fn(), fileExists: vi.fn(), copyFile: vi.fn(),
}))
const notifyAppError = vi.hoisted(() => vi.fn())
vi.mock('../../features/workspace/services/fileSystemService', () => ({ fileSystemService: fs }))
vi.mock('../../features/notifications/titlebarNotices', () => ({ notifyAppError }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../features/workspace/store/projectStore', () => ({
  useProjectStore: () => ({ projectResourceEnvironment: { value: {} } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  fs.fileExists.mockResolvedValue(false)
  fs.readFile.mockResolvedValue(JSON.stringify({ type: 'ocblock', block: createSimpleContainerBlock({ id: 'root' }), publicFields: {} }))
})

function openEditor() {
  const session = createTestSession({ path: '/project/.opencard/blocks/blocks.json', draftContent: '{}' })
  const wrapper = mount(ProjectCustomBlockRegistryFileEditor, { props: { session } })
  wrapper.vm.onCollectionAction('custom-block-registry.add-collection')
  return { wrapper, session }
}

describe('custom block collection import', () => {
  it('shows only the source choice until a source is decided', async () => {
    const { wrapper } = openEditor()
    await flushPromises()
    const dialog = wrapper.getComponent(ProjectCustomBlockCollectionSettingsDialog)
    expect(dialog.findComponent(ProjectImportSourceChoice).exists()).toBe(true)
    expect(dialog.findAllComponents(OcFieldInput)).toHaveLength(0)
    dialog.getComponent(ProjectImportSourceChoice).vm.$emit('select', 'empty')
    await flushPromises()
    expect(dialog.findComponent(ProjectImportSourceChoice).exists()).toBe(false)
    expect(dialog.findAllComponents(OcFieldInput)).toHaveLength(2)
    wrapper.unmount()
  })

  it('creates a collection from a folder and registers its supported files', async () => {
    fs.pickDirectory.mockResolvedValue('/imports/layout')
    fs.readDirectory.mockResolvedValue([
      { name: 'panel.ocblock', isFile: true }, { name: 'button.OCBLOCK', isFile: true },
      { name: 'readme.txt', isFile: true }, { name: 'nested.ocblock', isFile: false },
    ])
    const { wrapper, session } = openEditor()
    try {
      await flushPromises()
      const dialog = wrapper.getComponent(ProjectCustomBlockCollectionSettingsDialog)
      dialog.getComponent(ProjectImportSourceChoice).vm.$emit('select', 'folder')
      await flushPromises()
      const buttons = dialog.findAllComponents(OcButton)
      await buttons[buttons.length - 1]!.get('button').trigger('submit')
      await flushPromises()
      const reopened = parseCustomBlockRegistryText(session.state.draftContent!)
      expect(reopened?.collections?.[0]).toMatchObject({ key: 'layout', blocks: [
        { key: 'panel', source: '.opencard/blocks/layout/panel.ocblock' },
        { key: 'button', source: '.opencard/blocks/layout/button.ocblock' },
      ] })
      expect(fs.copyFile.mock.calls.map(call => call[0])).toEqual(['/imports/layout/panel.ocblock', '/imports/layout/button.OCBLOCK'])
    } finally { wrapper.unmount() }
  })

  it('validates every selected file before copying a batch', async () => {
    fs.readFile.mockResolvedValueOnce(JSON.stringify({ type: 'ocblock', block: createSimpleContainerBlock({ id: 'root' }), publicFields: {} }))
      .mockResolvedValueOnce('{broken')
    const { wrapper, session } = openEditor()
    try {
      await flushPromises()
      wrapper.getComponent(ProjectCustomBlockCollectionSettingsDialog).vm.$emit('submit', {
        key: 'layout', name: 'Layout', sources: ['/imports/panel.ocblock', '/imports/broken.ocblock'],
      })
      await flushPromises()
      expect(fs.copyFile).not.toHaveBeenCalled()
      expect(parseCustomBlockRegistryText(session.state.draftContent!)?.collections?.[0]?.blocks).toEqual([])
      expect(notifyAppError).toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
})
