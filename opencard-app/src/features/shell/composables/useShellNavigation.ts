import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  getActiveSpace,
  getPrimarySpace,
  leaveFlow,
  openSettings,
  showPrimarySpace,
  showSpace,
  resolveShellPage,
  type ShellPage,
  type PrimarySpaceKey,
  type ShellLocation,
  type SpaceKey,
} from '../shellLocation'

export interface ShellNavigationModel {
  location: Ref<ShellLocation>
  activeSpace: ComputedRef<SpaceKey>
  page: ComputedRef<ShellPage>
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

const location = ref<ShellLocation>({ base: { space: 'welcome' } })

export function useShellNavigation(): ShellNavigationModel {
  const activeSpace = computed(() => getActiveSpace(location.value))
  const page = computed(() => resolveShellPage(location.value))
  const isSettings = computed(() => page.value === 'settings')
  const isCreateProject = computed(() => page.value === 'create-project')
  const isExportTemplate = computed(() => page.value === 'export-template')
  const isAbout = computed(() => page.value === 'about')
  const isWelcome = computed(() => page.value === 'welcome')
  const isWorkbench = computed(() => page.value === 'workbench')
  const isMarket = computed(() => page.value === 'market')
  const isTest = computed(() => page.value === 'test')
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
    page,
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
