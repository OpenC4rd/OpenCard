/**
 * 模块说明：
 * - 管理侧栏的持久化宽度、折叠状态与拖拽调宽交互，并把布局变化写回应用设置。
 * 职责边界：
 * - 只维护侧栏布局状态与其持久化，不渲染侧栏、不定义列表内容与分组规则。
 */
import { computed, nextTick, ref, watch, type Ref } from 'vue'
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type ProjectWorkspaceSidebarState,
} from '../../settings/model/appSettings'
import { updateProjectWorkspaceState } from '../../settings/model/workspaceState'
import type { AppSettingsStore } from '../../settings/store/appSettingsStore'
import { SHELL_SIDEBAR_COLLAPSE_THRESHOLD } from '../shellSidebarConfig'

type ShellSidebarLayoutOptions = {
  /** 侧栏宽度、折叠状态与项目侧栏缓存的真相仓储。 */
  settings: AppSettingsStore
  /** 当前页提供的布局缓存 key；空字符串表示不缓存列表布局。 */
  persistenceKey: Readonly<Ref<string>>
  /** 窗口视口宽度；窄视口下侧栏默认收起。 */
  viewportWidth: Readonly<Ref<number>>
  /** 当前页是否希望窄视口保留侧栏。 */
  expandOnNarrowViewport: Readonly<Ref<boolean>>
}

type ShellSidebarLayout = {
  sidebarCollapsed: Readonly<Ref<boolean>>
  sidebarWidth: Readonly<Ref<number>>
  effectiveSidebarCollapsed: Readonly<Ref<boolean>>
  sidebarResizeActive: Readonly<Ref<boolean>>
  sidebarResizeToggleAnimating: Readonly<Ref<boolean>>
  sidebarPersistedLayout: Readonly<Ref<ProjectWorkspaceSidebarState | undefined>>
  toggleSidebarCollapsed: () => void
  handleSidebarResizeStart: () => void
  handleSidebarResizeEnd: () => void
  handleSidebarTransitionEnd: (event: TransitionEvent) => void
  handleSidebarResize: (width: number) => void
  handleSidebarLayoutChange: (layout: ProjectWorkspaceSidebarState) => void
}

export function useShellSidebarLayout(options: ShellSidebarLayoutOptions): ShellSidebarLayout {
  const {
    settings: settingsStore,
    persistenceKey,
    viewportWidth,
    expandOnNarrowViewport,
  } = options

  const sidebarCollapsed = computed(() => settingsStore.settings.value.shell.sidebarCollapsed)
  const sidebarWidth = ref(settingsStore.settings.value.shell.sidebarWidth)
  const lastExpandedSidebarWidth = ref(sidebarWidth.value)
  const sidebarResizeActive = ref(false)
  const sidebarResizeCollapsed = ref<boolean | null>(null)
  const sidebarResizeToggleAnimating = ref(false)
  let sidebarResizeRevision = 0
  const effectiveSidebarCollapsed = computed(() => (
    (sidebarResizeCollapsed.value ?? sidebarCollapsed.value)
    || (viewportWidth.value < 960 && !expandOnNarrowViewport.value)
  ))
  watch(() => settingsStore.settings.value.shell.sidebarWidth, width => {
    if (!sidebarResizeActive.value) sidebarWidth.value = width
  })
  const sidebarPersistedLayout = computed<ProjectWorkspaceSidebarState | undefined>(() => {
    const key = persistenceKey.value
    const sidebar = key ? settingsStore.settings.value.projectCreation.workspaceStates[key]?.sidebar : undefined
    return sidebar ? {
      collapsedLists: [...sidebar.collapsedLists],
      listWeights: { ...sidebar.listWeights },
    } : undefined
  })
  function handleSidebarLayoutChange(layout: ProjectWorkspaceSidebarState): void {
    const key = persistenceKey.value
    if (!key) return
    settingsStore.updateProjectCreation({
      workspaceStates: updateProjectWorkspaceState(
        settingsStore.settings.value.projectCreation.workspaceStates,
        key,
        current => {
          current.sidebar = {
            collapsedLists: [...layout.collapsedLists],
            listWeights: { ...layout.listWeights },
          }
          return current
        },
      ),
    })
  }

  function toggleSidebarCollapsed() {
    if (sidebarCollapsed.value) {
      settingsStore.updateShell({
        sidebarCollapsed: false,
        sidebarWidth: lastExpandedSidebarWidth.value,
      })
      return
    }

    lastExpandedSidebarWidth.value = Math.max(sidebarWidth.value, MIN_SIDEBAR_WIDTH)
    settingsStore.updateShell({ sidebarCollapsed: true })
  }

  function handleSidebarResizeStart(): void {
    sidebarResizeRevision += 1
    sidebarResizeActive.value = true
    sidebarResizeCollapsed.value = sidebarCollapsed.value
    sidebarResizeToggleAnimating.value = false
  }

  function handleSidebarResizeEnd(): void {
    const revision = sidebarResizeRevision
    const collapsed = sidebarResizeCollapsed.value ?? sidebarCollapsed.value
    settingsStore.updateShell({
      sidebarCollapsed: collapsed,
      sidebarWidth: sidebarWidth.value,
    })
    void nextTick(() => {
      if (sidebarResizeRevision !== revision) return
      sidebarResizeActive.value = false
      sidebarResizeCollapsed.value = null
      sidebarResizeToggleAnimating.value = false
    })
  }

  function handleSidebarTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName === 'grid-template-columns') sidebarResizeToggleAnimating.value = false
  }

  function handleSidebarResize(width: number) {
    const collapsed = width <= SHELL_SIDEBAR_COLLAPSE_THRESHOLD
    const previousCollapsed = sidebarResizeCollapsed.value ?? sidebarCollapsed.value
    if (collapsed !== previousCollapsed) sidebarResizeToggleAnimating.value = true
    sidebarResizeCollapsed.value = collapsed
    if (collapsed) return

    const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(width, MIN_SIDEBAR_WIDTH))
    sidebarWidth.value = nextWidth
    lastExpandedSidebarWidth.value = nextWidth
  }

  return {
    sidebarCollapsed,
    sidebarWidth,
    effectiveSidebarCollapsed,
    sidebarResizeActive,
    sidebarResizeToggleAnimating,
    sidebarPersistedLayout,
    toggleSidebarCollapsed,
    handleSidebarResizeStart,
    handleSidebarResizeEnd,
    handleSidebarTransitionEnd,
    handleSidebarResize,
    handleSidebarLayoutChange,
  }
}
