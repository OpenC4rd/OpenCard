import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import OcTutorial from '../../../components/standard/OcTutorial.vue'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import { initializeAppProjectActions } from '../services/appProjectActions'
import { useShellNavigation } from './useShellNavigation'
import { createWelcomePage } from './createWelcomePage'

// The already-open project is an input; page navigation, settings and the tutorial run unchanged.
vi.mock('../../workspace/store/projectStore', () => ({
  useProjectStore: () => ({ projectPath: ref('D:/Cards/demo') }),
}))

it('replays the welcome guide after clearing all records with a project still open', async () => {
  const settings = useAppSettingsStore()
  await settings.initialize()
  settings.previewSetting('tutorials.seen', ['overview', 'welcome', 'workbench', 'initializeVersionControl', 'versionControl'])
  const navigation = useShellNavigation()
  navigation.showSettings('general')
  const tutorial = useTutorialStore()
  tutorial.exit()
  const wrapper = mount(defineComponent({ setup() {
    initializeAppProjectActions({
      openProject: async () => false, openRecentProject: async () => false, relocateRecentProject: async () => null,
      newProject: async () => {}, openFile: async () => {}, exportTemplate: async () => {},
      cancelDeferredOpen: () => {}, closeProject: async () => 'completed', closeApplication: async () => 'completed',
    })
    createWelcomePage()
    return () => h(OcTutorial, { session: tutorial.session.value, onExit: tutorial.exit })
  } }), { attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    settings.previewSetting('tutorials.seen', [])
    await settings.save()
    await nextTick()
    expect(tutorial.session.value).toBeNull()
    navigation.selectSpace('welcome')
    await flushPromises()
    expect(tutorial.session.value?.tutorialId).toBe('overview')
  } finally {
    wrapper.unmount()
    tutorial.exit()
  }
})
