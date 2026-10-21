import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AboutPageContent from '../components/AboutPageContent.vue'
import type { SpacePage } from '../spacePage'
import type { useApplicationServices } from './useApplicationServices'
import { useShellNavigation } from './useShellNavigation'

export function createAboutPage(about: ReturnType<typeof useApplicationServices>): SpacePage {
  const { t } = useI18n()
  const { returnFromFlow, isAbout } = useShellNavigation()
  watch([isAbout, about.currentReleaseNotes], ([active, release]) => {
    if (active && release?.seenAt === null) void about.markCurrentReleaseNotesSeen()
  })
  return {
    key: 'about', content: AboutPageContent,
    contentProps: computed(() => ({
      currentReleaseNotes: about.currentReleaseNotes.value,
      availableUpdateVersion: about.availableUpdate.value ? about.updateVersion.value : undefined,
      onBack: returnFromFlow,
      onShowAvailableRelease: () => { about.releaseNotesDialogMode.value = 'available' },
      onSendFeedback: () => about.openFeedbackCenter('submit'), onViewFeedback: () => about.openFeedbackCenter('history'),
    })),
    sidebar: computed(() => [{ key: 'primary', transitionKey: 'flow:about', title: '',
      onAction: returnFromFlow, headButtons: [{ key: 'return-primary-page', icon: 'mdiArrowLeft', title: t('app.shell.back') }], lists: [] }]),
    header: computed(() => ({ title: t('app.about.title'), titleLoading: false, actions: [] })),
  }
}
