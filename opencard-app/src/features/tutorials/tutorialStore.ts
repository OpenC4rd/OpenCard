import { createTutorialStore } from '../../shared/ui/tutorial/tutorial'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import { tutorials } from './tutorials'

const flow = createTutorialStore(tutorials)
const tutorialStore = { ...flow, start(id: string): boolean {
  if (!flow.start(id)) return false
  const settings = useAppSettingsStore()
  settings.updateSetting('tutorials.seen', [...settings.settings.value.tutorials.seen, id])
  return true
} }

export function useTutorialStore() { return tutorialStore }
