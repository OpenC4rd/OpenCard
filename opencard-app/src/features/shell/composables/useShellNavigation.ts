import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  getActiveSpace,
  getPrimarySpace,
  leaveFlow,
  openSettings,
  showPrimarySpace,
  showSpace,
  type PrimarySpaceKey,
  type ShellLocation,
  type SpaceKey,
} from '../shellLocation'

export interface ShellNavigationModel {
  location: Ref<ShellLocation>
  activeSpace: ComputedRef<SpaceKey>
  isSettings: ComputedRef<boolean>
  isCreateProject: ComputedRef<boolean>
  isExportTemplate: ComputedRef<boolean>
  isAbout: ComputedRef<boolean>
  isWelcome: ComputedRef<boolean>
  isWorkbench: ComputedRef<boolean>
  isMarket: ComputedRef<boolean>
  isTest: ComputedRef<boolean>
  isAuxiliary: ComputedRef<boolean>
  getCurrentPrimarySpace: () => PrimarySpaceKey
  showPrimarySpace: (space: PrimarySpaceKey) => void
  showSettings: (categoryKey: Parameters<typeof openSettings>[1], focusKey?: Parameters<typeof openSettings>[2]) => void
  selectSpace: (space: SpaceKey) => void
  returnFromFlow: () => void
}

export function useShellNavigation(): ShellNavigationModel {
  const location = ref<ShellLocation>({ base: { space: 'welcome' } })
  const activeSpace = computed(() => getActiveSpace(location.value))
  const isSettings = computed(() => !location.value.flow && location.value.base.space === 'settings')
  const isCreateProject = computed(() => location.value.flow?.type === 'create-project')
  const isExportTemplate = computed(() => location.value.flow?.type === 'export-template')
  const isAbout = computed(() => location.value.flow?.type === 'about')
  const isWelcome = computed(() => !location.value.flow && location.value.base.space === 'welcome')
  const isWorkbench = computed(() => !location.value.flow && location.value.base.space === 'workbench')
  const isMarket = computed(() => !location.value.flow && location.value.base.space === 'market')
  const isTest = computed(() => !location.value.flow && location.value.base.space === 'test')
  const isAuxiliary = computed(() => (
    isSettings.value || isCreateProject.value || isExportTemplate.value || isAbout.value
  ))

  function getCurrentPrimarySpace(): PrimarySpaceKey {
    return getPrimarySpace(location.value)
  }

  function showPrimarySpacePage(space: PrimarySpaceKey): void {
    location.value = showPrimarySpace(location.value, space)
  }

  function showSettingsPage(categoryKey: Parameters<typeof openSettings>[1], focusKey?: Parameters<typeof openSettings>[2]): void {
    location.value = openSettings(location.value, categoryKey, focusKey)
  }

  function selectSpace(space: SpaceKey): void {
    if (space === activeSpace.value && !location.value.flow) return
    location.value = showSpace(location.value, space)
  }

  function returnFromFlow(): void {
    location.value = location.value.flow
      ? leaveFlow(location.value)
      : showPrimarySpace(location.value, getCurrentPrimarySpace())
  }

  return {
    location,
    activeSpace,
    isSettings,
    isCreateProject,
    isExportTemplate,
    isAbout,
    isWelcome,
    isWorkbench,
    isMarket,
    isTest,
    isAuxiliary,
    getCurrentPrimarySpace,
    showPrimarySpace: showPrimarySpacePage,
    showSettings: showSettingsPage,
    selectSpace,
    returnFromFlow,
  }
}
