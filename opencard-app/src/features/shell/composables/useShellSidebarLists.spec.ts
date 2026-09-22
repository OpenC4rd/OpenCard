import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { OcNodeCollection } from '../../../shared/ui/node/node.types'
import type { ProjectTemplateKey } from '../../project-templates/model/projectTemplate'
import type { SettingsCategoryKey } from '../../settings/model/appSettings'
import {
  DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
  OPENED_EDITORS_LIST_KEY,
  PROJECT_FILES_LIST_KEY,
  PROJECT_MANAGEMENT_LIST_KEY,
  PROJECT_NEW_FILE_ACTION_KEY,
  PROJECT_NEW_FOLDER_ACTION_KEY,
  PROJECT_NEW_OPENCARD_ACTION_KEY,
  PROJECT_REVEAL_ACTION_KEY,
  RECENT_PROJECTS_LIST_KEY,
  RESOURCE_PACKAGES_LIST_KEY,
  SETTINGS_CATEGORIES_LIST_KEY,
  USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
  TEMPLATES_LIST_KEY,
  TEMPLATE_COVERS_LIST_KEY,
  TEMPLATE_ENTRIES_LIST_KEY,
  TIMELINE_LIST_KEY,
  TIMELINE_REFRESH_ACTION_KEY,
  USER_TEMPLATES_GROUP_KEY,
} from '../shellSidebarConfig'
import type { ShellPage } from '../shellPage'
import type { ShellList, ShellListGroup, ShellTreeContent } from '../shell.types'
import { useShellSidebarLists } from './useShellSidebarLists'

type SidebarListsOptions = Parameters<typeof useShellSidebarLists>[0]

const PROJECT_PATH = 'D:/projects/demo'
const PROJECT_FILE_PATH = 'cards/main.ocdocument'
const TEMPLATE_KEY: ProjectTemplateKey = 'builtin:starter'

const PAGES: Record<ShellPage['type'], ShellPage> = {
  welcome: { type: 'welcome' },
  workbench: { type: 'workbench' },
  'create-project': { type: 'create-project', returnPage: 'welcome' },
  'export-template': { type: 'export-template', returnPage: 'workbench' },
  about: { type: 'about', returnPage: 'welcome' },
  settings: { type: 'settings', categoryKey: 'appearance', returnPage: 'welcome' },
}

function tree(rootKeys: readonly string[] = []): OcNodeCollection {
  return { rootKeys, items: new Map(), children: new Map() }
}

function pageState(page: ShellPage['type']) {
  return {
    shellPage: ref<ShellPage>(PAGES[page]),
    isSettingsMode: ref(page === 'settings'),
    isCreateProjectMode: ref(page === 'create-project'),
    isExportTemplateMode: ref(page === 'export-template'),
    isWelcomeMode: ref(page === 'welcome'),
    isAboutMode: ref(page === 'about'),
    isAuxiliaryMode: ref(page !== 'welcome' && page !== 'workbench'),
  }
}

function createSidebarLists(
  page: ShellPage['type'] = 'workbench',
  overrides: Partial<SidebarListsOptions> = {},
) {
  const options: SidebarListsOptions = {
    translate: (key, paramsOrFallback) => typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
    ...pageState(page),
    isProjectTemplateBusy: ref(false),
    isExportTemplateBusy: ref(false),
    isCommittingVersion: ref(false),
    isInitializingRepository: ref(false),
    projectOpen: ref(false),
    projectPath: ref(''),
    projectFolderName: ref(''),
    repositoryReady: ref(false),
    repositoryNeedsInitialization: ref(false),
    projectTreeRef: ref<{ beginRename: (key: string) => Promise<void> } | null>(null),
    settingsCategoryKey: ref<SettingsCategoryKey>('appearance'),
    settingsCategoryTreeData: ref(tree()),
    selectedTemplateKey: ref<ProjectTemplateKey | null>(null),
    templateTreeData: ref(tree()),
    resourcePackageStore: { isLoading: ref(false) },
    resourcePackageTreeData: ref(tree()),
    exportTemplateTreeData: ref(tree()),
    exportTemplateExpandedKeys: ref<string[]>([]),
    exportTemplateEntryTreeData: ref(tree()),
    exportTemplateCoverTreeData: ref(tree()),
    recentProjectTreeData: ref(tree()),
    selectedRecentProjectKeys: ref<string[]>([]),
    openedEditorTreeData: ref(tree()),
    openedEditorSelectedKeys: ref<string[]>([]),
    projectManagementTreeData: ref(tree()),
    selectedManagementKeys: ref<string[]>([]),
    projectManagementExpandedKeys: ref<string[]>([]),
    projectTreeData: ref(tree()),
    selectedProjectEntryKeys: ref<string[]>([]),
    projectExpandedKeys: ref<string[]>([]),
    timelinePlaceholder: ref(''),
    timelineFilePath: ref<string | null>(null),
    timelineLoading: ref(false),
    timelineTreeData: ref(tree()),
    timelineProjectTreeData: ref(tree()),
    changesTreeData: ref(tree()),
    selectedChangeCount: ref(0),
    versionGraphExpandedKeys: ref<string[]>([]),
    changesExpandedKeys: ref<string[]>([]),
    handleChangesExpansionChange: vi.fn(),
    handleChangesExpansionSync: vi.fn(),
    handleChangesNodeActivate: vi.fn(),
    handleChangesAction: vi.fn(),
    handleSettingsCategorySelectionChange: vi.fn(),
    handleTemplateSelectionChange: vi.fn(),
    handleTemplateAction: vi.fn(),
    handleResourcePackageAction: vi.fn(),
    handleExportTemplateAction: vi.fn(),
    handleExportSelectionAction: vi.fn(),
    handleRecentProjectSelectionChange: vi.fn(),
    handleRecentProjectNodeActivate: vi.fn(),
    handleRecentProjectAction: vi.fn(),
    handleOpenedEditorSelectionChange: vi.fn(),
    handleOpenedEditorAction: vi.fn(),
    handleOpenedEditorAuxClick: vi.fn(),
    handleProjectManagementSelectionChange: vi.fn(),
    handleProjectManagementExpansionChange: vi.fn(),
    handleProjectManagementAction: vi.fn(),
    handleProjectSelectionChange: vi.fn(),
    handleProjectExpansionChange: vi.fn(),
    handleProjectRenameCommit: vi.fn(),
    handleProjectMove: vi.fn(),
    handleProjectExternalDrop: vi.fn(),
    handleProjectAction: vi.fn(),
    handleProjectNodeActivate: vi.fn(),
    handleTimelineAction: vi.fn(),
    handleVersionGraphExpansionChange: vi.fn(),
    handleVersionGraphExpansionSync: vi.fn(),
    ...overrides,
  }
  const sidebar = useShellSidebarLists(options)
  return { sidebar, options }
}

function listKeysOf(groups: readonly ShellListGroup[]): string[] {
  return groups.flatMap(group => group.lists.map(list => list.key))
}

function listOf(groups: readonly ShellListGroup[], key: string): ShellList {
  const list = groups.flatMap(group => group.lists).find(candidate => candidate.key === key)
  if (!list) throw new Error(`Sidebar list ${key} is missing`)
  return list
}

function groupOf(groups: readonly ShellListGroup[], key: string): ShellListGroup {
  const group = groups.find(candidate => candidate.key === key)
  if (!group) throw new Error(`Sidebar group ${key} is missing`)
  return group
}

function treeContentOf(groups: readonly ShellListGroup[], key: string): ShellTreeContent {
  const content = listOf(groups, key).content
  if (content?.type !== 'tree') throw new Error(`Sidebar list ${key} has no tree content`)
  return content
}

describe('useShellSidebarLists', () => {
  it('shows only the recent projects list on the welcome page', () => {
    const { sidebar, options } = createSidebarLists('welcome', {
      recentProjectTreeData: ref(tree(['recent-project:D:/projects/demo'])),
      selectedRecentProjectKeys: ref(['recent-project:D:/projects/demo']),
    })
    const groups = sidebar.sidebarBodyGroups.value

    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('primary')
    expect(groups[0]!.transitionKey).toBe('page:welcome')
    expect(listKeysOf(groups)).toEqual([RECENT_PROJECTS_LIST_KEY])

    const list = listOf(groups, RECENT_PROJECTS_LIST_KEY)
    expect(list.title).toBe('sidebar.recentProjects')
    expect(list.placeholder).toBe('sidebar.noRecentProjects')
    expect(list.actions).toEqual([])

    const content = treeContentOf(groups, RECENT_PROJECTS_LIST_KEY)
    expect(content.data).toBe(options.recentProjectTreeData.value)
    expect(content.selectedKeys).toEqual(['recent-project:D:/projects/demo'])
    expect(content.role).toBe('listbox')
    expect(content.activationMode).toBe('double-click')
    expect(content.onSelectionChange).toBe(options.handleRecentProjectSelectionChange)
    expect(content.onNodeActivate).toBe(options.handleRecentProjectNodeActivate)
    expect(content.onAction).toBe(options.handleRecentProjectAction)
  })

  it('offers new and open project from the welcome page head buttons', () => {
    const { sidebar } = createSidebarLists('welcome')

    expect(sidebar.sidebarBodyGroups.value[0]!.headButtons).toEqual([
      { key: 'new-project', icon: 'action.folder-plus', title: 'app.menu.newProject' },
      { key: 'open-project', icon: 'status.folder-open', title: 'sidebar.openProject' },
    ])
  })

  it('shows the settings categories with the active category selected', () => {
    const { sidebar, options } = createSidebarLists('settings', {
      settingsCategoryKey: ref<SettingsCategoryKey>('workspace'),
    })
    const groups = sidebar.sidebarBodyGroups.value

    expect(listKeysOf(groups)).toEqual([SETTINGS_CATEGORIES_LIST_KEY])
    expect(groups[0]!.headButtons).toEqual([
      { key: 'return-primary-page', icon: 'nav.arrow-left', title: 'Back' },
    ])

    const list = listOf(groups, SETTINGS_CATEGORIES_LIST_KEY)
    expect(list.title).toBe('Settings')
    expect(list.placeholder).toBe('')

    const content = treeContentOf(groups, SETTINGS_CATEGORIES_LIST_KEY)
    expect(content.data).toBe(options.settingsCategoryTreeData.value)
    expect(content.selectedKeys).toEqual(['workspace'])
    expect(content.selectionMode).toBe('single')
    expect(content.onSelectionChange).toBe(options.handleSettingsCategorySelectionChange)
  })

  it('shows the template and resource package lists on the create project page', () => {
    const { sidebar, options } = createSidebarLists('create-project', {
      selectedTemplateKey: ref<ProjectTemplateKey | null>(TEMPLATE_KEY),
    })
    const groups = sidebar.sidebarBodyGroups.value

    expect(listKeysOf(groups)).toEqual([TEMPLATES_LIST_KEY, RESOURCE_PACKAGES_LIST_KEY])

    const templates = treeContentOf(groups, TEMPLATES_LIST_KEY)
    expect(templates.data).toBe(options.templateTreeData.value)
    expect(templates.selectedKeys).toEqual([TEMPLATE_KEY])
    expect(templates.expandedKeys).toEqual([USER_TEMPLATES_GROUP_KEY])
    expect(templates.onSelectionChange).toBe(options.handleTemplateSelectionChange)
    expect(templates.onAction).toBe(options.handleTemplateAction)

    const resourcePackages = listOf(groups, RESOURCE_PACKAGES_LIST_KEY)
    expect(resourcePackages.placeholder).toBe('projectTemplates.status.noResourcePackages')
    expect(resourcePackages.actions).toEqual([
      {
        key: IMPORT_RESOURCE_PACKAGE_ACTION_KEY,
        icon: 'action.import',
        hoverTip: 'projectTemplates.actions.importResourcePackage',
        disabled: false,
      },
      // 没有接入选中的包时，两个批量动作保持不可用。
      {
        key: USE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
        icon: 'action.check',
        hoverTip: 'projectTemplates.actions.useSelectedResourcePackages',
        disabled: true,
      },
      {
        key: DISABLE_SELECTED_RESOURCE_PACKAGES_ACTION_KEY,
        icon: 'action.close',
        hoverTip: 'projectTemplates.actions.disableSelectedResourcePackages',
        disabled: true,
      },
    ])
  })

  it('reports loading resource packages through the placeholder and the import action', () => {
    const isLoading = ref(false)
    const isProjectTemplateBusy = ref(false)
    const { sidebar } = createSidebarLists('create-project', {
      resourcePackageStore: { isLoading },
      isProjectTemplateBusy,
    })
    const placeholder = () => listOf(sidebar.sidebarBodyGroups.value, RESOURCE_PACKAGES_LIST_KEY).placeholder
    const importAction = () => listOf(sidebar.sidebarBodyGroups.value, RESOURCE_PACKAGES_LIST_KEY).actions[0]

    expect(placeholder()).toBe('projectTemplates.status.noResourcePackages')
    expect(importAction()?.disabled).toBe(false)

    isLoading.value = true
    expect(placeholder()).toBe('projectTemplates.status.loadingResourcePackages')
    expect(importAction()?.disabled).toBe(true)

    isProjectTemplateBusy.value = true
    isLoading.value = false
    expect(importAction()?.disabled).toBe(true)
  })

  it('shows the export template lists bound to the export tree', () => {
    const { sidebar, options } = createSidebarLists('export-template', {
      projectFolderName: ref('demo'),
      selectedProjectEntryKeys: ref([PROJECT_FILE_PATH]),
      exportTemplateExpandedKeys: ref([PROJECT_PATH]),
    })
    const groups = sidebar.sidebarBodyGroups.value

    expect(listKeysOf(groups)).toEqual([
      PROJECT_FILES_LIST_KEY,
      TEMPLATE_ENTRIES_LIST_KEY,
      TEMPLATE_COVERS_LIST_KEY,
    ])

    const projectFiles = listOf(groups, PROJECT_FILES_LIST_KEY)
    expect(projectFiles.title).toBe('demo')
    expect(projectFiles.placeholder).toBe('Folder is empty')
    expect(projectFiles.actions).toEqual([])

    const projectContent = treeContentOf(groups, PROJECT_FILES_LIST_KEY)
    expect(projectContent.data).toBe(options.exportTemplateTreeData.value)
    expect(projectContent.selectedKeys).toEqual([PROJECT_FILE_PATH])
    expect(projectContent.expandedKeys).toEqual([PROJECT_PATH])
    expect(projectContent.onAction).toBe(options.handleExportTemplateAction)
    expect(typeof projectContent.captureInstance).toBe('function')

    expect(listOf(groups, TEMPLATE_ENTRIES_LIST_KEY).placeholder).toBe('templateExport.noSelectedEntries')
    expect(listOf(groups, TEMPLATE_COVERS_LIST_KEY).placeholder).toBe('templateExport.noSelectedCovers')
    expect(treeContentOf(groups, TEMPLATE_ENTRIES_LIST_KEY).onAction).toBe(options.handleExportSelectionAction)
    expect(treeContentOf(groups, TEMPLATE_COVERS_LIST_KEY).onAction).toBe(options.handleExportSelectionAction)
  })

  it('captures the project tree instance with a bound beginRename', async () => {
    const projectTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
    const { sidebar } = createSidebarLists('export-template', { projectTreeRef })
    const captureInstance = treeContentOf(sidebar.sidebarBodyGroups.value, PROJECT_FILES_LIST_KEY).captureInstance
    const treeInstance = {
      beginRename: vi.fn(async () => undefined),
      unrelated: true,
    }

    captureInstance?.(treeInstance)
    await projectTreeRef.value?.beginRename(PROJECT_FILE_PATH)

    expect(treeInstance.beginRename).toHaveBeenCalledWith(PROJECT_FILE_PATH)

    captureInstance?.({ unrelated: true })
    expect(projectTreeRef.value).toBeNull()
  })

  it('locks the about page to a single empty primary group', () => {
    const { sidebar } = createSidebarLists('about')
    const groups = sidebar.sidebarBodyGroups.value

    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('primary')
    expect(listKeysOf(groups)).toEqual([])
    expect(groups[0]!.headButtons).toEqual([
      { key: 'return-primary-page', icon: 'nav.arrow-left', title: 'app.about.back' },
    ])
  })

  it('lists the workbench trees without version control until the repository is ready', () => {
    const { sidebar } = createSidebarLists()
    const groups = sidebar.sidebarBodyGroups.value

    expect(groups.map(group => group.key)).toEqual(['workspace', 'version-control'])
    expect(groupOf(groups, 'workspace').lists.map(list => list.key)).toEqual([
      OPENED_EDITORS_LIST_KEY,
      PROJECT_MANAGEMENT_LIST_KEY,
      PROJECT_FILES_LIST_KEY,
    ])
    expect(groupOf(groups, 'workspace').headButtons).toEqual([
      { key: 'new-open-card', icon: 'action.file-plus', title: 'app.menu.newOpenCard' },
    ])
    expect(groupOf(groups, 'version-control').lists).toEqual([])
    expect(groupOf(groups, 'version-control').headButtons).toEqual([])
  })

  it('attaches the project file tree actions and callbacks', () => {
    const { sidebar, options } = createSidebarLists('workbench', {
      projectOpen: ref(true),
      projectPath: ref(PROJECT_PATH),
      projectFolderName: ref('demo'),
      projectTreeData: ref(tree([PROJECT_PATH])),
      selectedProjectEntryKeys: ref([PROJECT_FILE_PATH]),
      projectExpandedKeys: ref([PROJECT_PATH]),
    })
    const groups = sidebar.sidebarBodyGroups.value
    const list = listOf(groups, PROJECT_FILES_LIST_KEY)

    expect(list.title).toBe('demo')
    expect(list.placeholder).toBe('Folder is empty')
    expect(list.actions.map(action => action.key)).toEqual([
      PROJECT_REVEAL_ACTION_KEY,
      PROJECT_NEW_FILE_ACTION_KEY,
      PROJECT_NEW_FOLDER_ACTION_KEY,
    ])
    expect(list.actions.map(action => action.disabled)).toEqual([false, false, false])
    expect(list.actions[1]!.children).toEqual([{
      key: PROJECT_NEW_OPENCARD_ACTION_KEY,
      title: 'sidebar.fileActions.newOpenCard',
      icon: 'file.opencard',
    }])

    const content = treeContentOf(groups, PROJECT_FILES_LIST_KEY)
    expect(content.data).toBe(options.projectTreeData.value)
    expect(content.selectedKeys).toEqual([PROJECT_FILE_PATH])
    expect(content.expandedKeys).toEqual([PROJECT_PATH])
    expect(content.externalDrop).toBe(true)
    expect(content.onSelectionChange).toBe(options.handleProjectSelectionChange)
    expect(content.onExpansionChange).toBe(options.handleProjectExpansionChange)
    expect(content.onRenameCommit).toBe(options.handleProjectRenameCommit)
    expect(content.onMove).toBe(options.handleProjectMove)
    expect(content.onExternalDrop).toBe(options.handleProjectExternalDrop)
    expect(content.onAction).toBe(options.handleProjectAction)
    expect(content.onNodeActivate).toBe(options.handleProjectNodeActivate)
    expect(typeof content.captureInstance).toBe('function')
  })

  it('asks for a project folder while no project is open', () => {
    const { sidebar } = createSidebarLists()
    const groups = sidebar.sidebarBodyGroups.value

    const list = listOf(groups, PROJECT_FILES_LIST_KEY)
    expect(list.title).toBe('sidebar.files')
    expect(list.placeholder).toBe('Open Project Folder')
    expect(list.actions.map(action => action.disabled)).toEqual([true, true, true])
    expect(treeContentOf(groups, PROJECT_FILES_LIST_KEY).externalDrop).toBe(false)
  })

  it('keeps the opened editors and project management callbacks on the workbench lists', () => {
    const { sidebar, options } = createSidebarLists()
    const groups = sidebar.sidebarBodyGroups.value

    const openedEditors = treeContentOf(groups, OPENED_EDITORS_LIST_KEY)
    expect(openedEditors.onSelectionChange).toBe(options.handleOpenedEditorSelectionChange)
    expect(openedEditors.onAction).toBe(options.handleOpenedEditorAction)
    expect(openedEditors.onAuxclick).toBe(options.handleOpenedEditorAuxClick)

    const projectManagement = treeContentOf(groups, PROJECT_MANAGEMENT_LIST_KEY)
    expect(projectManagement.onSelectionChange).toBe(options.handleProjectManagementSelectionChange)
    expect(projectManagement.onExpansionChange).toBe(options.handleProjectManagementExpansionChange)
    expect(projectManagement.onAction).toBe(options.handleProjectManagementAction)
  })

  it('pushes the timeline list with its refresh action once the repository is ready', () => {
    const timelineLoading = ref(false)
    const { sidebar, options } = createSidebarLists('workbench', {
      repositoryReady: ref(true),
      timelineFilePath: ref(PROJECT_FILE_PATH),
      timelinePlaceholder: ref('sidebar.timelineNoCommits'),
      timelineLoading,
    })
    const groups = sidebar.sidebarBodyGroups.value
    const list = listOf(groups, TIMELINE_LIST_KEY)

    expect(groupOf(groups, 'workspace').lists.map(candidate => candidate.key)).toEqual([
      OPENED_EDITORS_LIST_KEY,
      PROJECT_MANAGEMENT_LIST_KEY,
      PROJECT_FILES_LIST_KEY,
      TIMELINE_LIST_KEY,
    ])
    expect(list.placeholder).toBe('sidebar.timelineNoCommits')
    expect(list.actions).toEqual([{
      key: TIMELINE_REFRESH_ACTION_KEY,
      icon: 'action.refresh',
      hoverTip: 'sidebar.timelineRefresh',
      disabled: false,
    }])

    const content = treeContentOf(groups, TIMELINE_LIST_KEY)
    expect(content.data).toBe(options.timelineTreeData.value)
    expect(content.selectionMode).toBe('none')
    expect(content.onAction).toBe(options.handleTimelineAction)

    timelineLoading.value = true
    expect(listOf(sidebar.sidebarBodyGroups.value, TIMELINE_LIST_KEY).actions[0]?.disabled).toBe(true)
  })

  it('shows the changes and version graph lists in the version control group', () => {
    const { sidebar, options } = createSidebarLists('workbench', {
      repositoryReady: ref(true),
      versionGraphExpandedKeys: ref(['commit:1']),
    })
    const groups = sidebar.sidebarBodyGroups.value
    const versionControl = groupOf(groups, 'version-control')

    expect(versionControl.lists.map(list => list.key)).toEqual(['changes', 'version-graph'])
    expect(versionControl.lists[0]!.title).toBe('Changes')
    expect(versionControl.lists[0]!.placeholder).toBe('Uncommitted project files appear here')
    expect(versionControl.lists[1]!.title).toBe('Version graph')
    expect(versionControl.lists[1]!.placeholder).toBe('Project commits appear here')

    expect(treeContentOf(groups, 'changes').data).toBe(options.changesTreeData.value)
    const versionGraph = treeContentOf(groups, 'version-graph')
    expect(versionGraph.data).toBe(options.timelineProjectTreeData.value)
    expect(versionGraph.expandedKeys).toEqual(['commit:1'])
    expect(versionGraph.onExpansionChange).toBe(options.handleVersionGraphExpansionChange)
    expect(versionGraph.onExpansionSync).toBe(options.handleVersionGraphExpansionSync)
  })

  it('offers initialize or publish from the version control group head', () => {
    const initializing = createSidebarLists('workbench', {
      repositoryNeedsInitialization: ref(true),
      isInitializingRepository: ref(true),
    })
    expect(groupOf(initializing.sidebar.sidebarBodyGroups.value, 'version-control').headButtons).toEqual([{
      key: 'initialize-repository',
      icon: 'file.git',
      title: 'Initialize repository',
      disabled: true,
    }])

    const unpublished = createSidebarLists('workbench', {
      repositoryReady: ref(true),
      selectedChangeCount: ref(2),
    })
    expect(groupOf(unpublished.sidebar.sidebarBodyGroups.value, 'version-control').headButtons).toEqual([{
      key: 'publish-version',
      icon: 'action.publish',
      title: 'Commit version',
      hoverTip: 'sidebar.commitSelectedCount',
      badge: 2,
      disabled: false,
    }])

    const clean = createSidebarLists('workbench', { repositoryReady: ref(true) })
    expect(groupOf(clean.sidebar.sidebarBodyGroups.value, 'version-control').headButtons?.[0]?.disabled).toBe(true)
  })

  it('shows the settings tail button except on auxiliary pages', () => {
    expect(createSidebarLists('workbench').sidebar.sidebarTailButtons.value).toEqual([
      { key: 'open-settings', icon: 'tool.settings', title: 'Settings' },
    ])
    expect(createSidebarLists('welcome').sidebar.sidebarTailButtons.value).toEqual([
      { key: 'open-settings', icon: 'tool.settings', title: 'Settings' },
    ])

    for (const page of ['settings', 'create-project', 'export-template', 'about'] as const) {
      expect(createSidebarLists(page).sidebar.sidebarTailButtons.value).toEqual([])
    }
  })
})
