import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { createCollaborationPage } from './createCollaborationPage'
import { useWorkbenchVersionControl } from './useWorkbenchVersionControl'
import { useShellNavigation } from './useShellNavigation'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import { useProjectStore } from '../../workspace/store/projectStore'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import ShellSidebar from '../components/ShellSidebar.vue'

const git = vi.hoisted(() => ({ inspectRepository: vi.fn(), initializeRepository: vi.fn(), readHistory: vi.fn(), readStatus: vi.fn() }))
vi.mock('../../version-control/gitService', () => git)
vi.mock('../../workspace/store/projectStore', async () => {
  const { ref } = await import('vue')
  const projectPath = ref('D:/Cards/demo')
  return { useProjectStore: () => ({ projectPath }) }
})
vi.mock('../../settings/store/appSettingsStore', async importOriginal => {
  const original = await importOriginal<typeof import('../../settings/store/appSettingsStore')>()
  const { MemoryJsonPersistence } = await import('../../../shared/storage/jsonPersistence')
  const settings = original.createAppSettingsStore(new MemoryJsonPersistence())
  return { ...original, useAppSettingsStore: () => settings }
})

it.each([false, true])('starts separate tutorials for a repository initially initialized=%s', async initialized => {
  vi.clearAllMocks()
  const settings = useAppSettingsStore()
  await settings.initialize()
  settings.previewSetting('tutorials.seen', [])
  settings.previewSetting('versionControl.createInitialCommit', false)
  const projectPath = useProjectStore().projectPath as Ref<string>
  projectPath.value = 'D:/Cards/demo'
  const navigation = useShellNavigation()
  const tutorial = useTutorialStore()
  tutorial.exit()
  navigation.selectSpace('workbench')
  const ok = (value: unknown) => ({ ok: true, value })
  git.inspectRepository.mockResolvedValue(ok({ initialized }))
  git.readHistory.mockResolvedValue(ok([]))
  git.readStatus.mockResolvedValue(ok({ entries: [] }))
  git.initializeRepository.mockResolvedValue({ ok: false, error: { kind: 'git', message: 'Initialization failed' } })
  const wrapper = mount(defineComponent({ setup() {
    const version = useWorkbenchVersionControl({
      projectPath, activeSession: ref(null), locale: ref('en-US'), fileChangeRevision: ref(0),
      translate: key => key, getRelativeProjectPath: path => path, settings: settings.settings,
      moveProjectEntryToTrash: async () => {}, requestPathChanges: async (_, perform) => perform(),
      requestConfirmation: async () => false, openSetting: () => {},
    })
    const page = createCollaborationPage({
      version, workbench: { content: {}, contentProps: ref({}), header: ref(null) },
      activateChange: async () => {}, openProject: async () => {},
    })
    return () => h(ShellSidebar, { collapsed: false, width: 260, bodyGroup: page.sidebar.value[0] })
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  try {
    await nextTick()
    expect(tutorial.session.value).toBeNull()
    navigation.selectSpace('collaboration')
    if (!initialized) {
      await vi.waitFor(() => expect(tutorial.session.value?.tutorialId).toBe('initializeVersionControl'))
      await wrapper.get('[data-oc-tutorial="collaboration.initialize"]').trigger('click')
      await vi.waitFor(() => expect(git.initializeRepository).toHaveBeenCalledTimes(1))
      expect(tutorial.session.value?.step.id).toBe('initialize')
      git.initializeRepository.mockResolvedValue(ok({ initialized: true }))
      git.inspectRepository.mockResolvedValue(ok({ initialized: true }))
      await wrapper.get('[data-oc-tutorial="collaboration.initialize"]').trigger('click')
    }
    await vi.waitFor(() => expect(tutorial.session.value?.step.id).toBe('sidebar'))
    expect(tutorial.session.value?.tutorialId).toBe('versionControl')
    expect(settings.settings.value.tutorials.seen.includes('initializeVersionControl')).toBe(!initialized)
    expect(wrapper.find('[data-oc-tutorial="collaboration.graph"]').exists()).toBe(true)
    expect(wrapper.find('[data-oc-tutorial="collaboration.changes"]').exists()).toBe(true)
    expect(wrapper.find('[data-oc-tutorial="collaboration.commit"]').exists()).toBe(true)
    projectPath.value = 'D:/Cards/other'
    await nextTick()
    expect(tutorial.session.value).toBeNull()
    projectPath.value = ''
    settings.previewSetting('tutorials.seen', [])
    await nextTick()
    expect(tutorial.session.value).toBeNull()
  } finally {
    wrapper.unmount()
    tutorial.exit()
    navigation.selectSpace('welcome')
  }
})
