import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { OcNodeCollection } from '../../shared/ui/node/node.types'
import type { SettingsCategoryKey } from '../settings/model/appSettings'
import { createCreateProjectSection } from './sections/createProjectSection'
import { createExportTemplateSection } from './sections/exportTemplateSection'
import { createSettingsSection } from './sections/settingsSection'
import { createWelcomeSection } from './sections/welcomeSection'
import { createWorkbenchSection } from './sections/workbenchSection'
import { resolveShellSection } from './shellSections'
import { shellSpaceDefinitions, shellSpaceKeys } from './shellSection'
import type { ShellListGroup } from './shell.types'
import type { ShellFlowKey, SpaceKey } from './shellLocation'

function tree(rootKeys: readonly string[] = []): OcNodeCollection {
  return { rootKeys, items: new Map(), children: new Map() }
}

const translate = (key: string, fallback?: Record<string, unknown> | string) =>
  typeof fallback === 'string' ? fallback : key

function listKeys(groups: readonly ShellListGroup[]): string[] {
  return groups.flatMap(group => group.lists.map(list => list.key))
}

describe('shell section projections', () => {
  it('keeps the static space registry exhaustive', () => {
    expect(shellSpaceKeys).toEqual(['welcome', 'workbench', 'settings'])
    expect(Object.keys(shellSpaceDefinitions).sort()).toEqual([...shellSpaceKeys].sort())
  })

  it('selects the projection by space or flow without interpreting business state', () => {
    const welcome = computed(() => [{ key: 'welcome', title: '', lists: [] }])
    const workbench = computed(() => [{ key: 'workbench', title: '', lists: [] }])
    const settings = computed(() => [{ key: 'settings', title: '', lists: [] }])
    const createProject = computed(() => [{ key: 'create-project', title: '', lists: [] }])
    const exportTemplate = computed(() => [{ key: 'export-template', title: '', lists: [] }])
    const about = computed(() => [{ key: 'about', title: '', lists: [] }])
    const spaces: Record<SpaceKey, typeof welcome> = { welcome, workbench, settings }
    const flows: Record<ShellFlowKey, typeof welcome> = { 'create-project': createProject, 'export-template': exportTemplate, about }

    expect(resolveShellSection({ base: { space: 'welcome' } }, spaces, flows)).toBe(welcome.value)
    expect(resolveShellSection({ base: { space: 'workbench' }, flow: { type: 'export-template' } }, spaces, flows)).toBe(exportTemplate.value)
  })

  it('projects welcome and settings inputs into their own tree models', () => {
    const recent = ref(tree(['recent']))
    const selected = ref(['recent'])
    const onRecentSelection = vi.fn()
    const welcome = createWelcomeSection({
      translate,
      recentProjectTreeData: recent,
      selectedRecentProjectKeys: selected,
      onSelectionChange: onRecentSelection,
      onNodeActivate: vi.fn(),
      onAction: vi.fn(),
    }).value

    expect(listKeys(welcome)).toEqual(['recent-projects'])
    expect(welcome[0]!.transitionKey).toBe('space:welcome:none')
    expect(welcome[0]!.lists[0]!.content).toMatchObject({ data: recent.value, selectedKeys: ['recent'] })

    const category = ref<SettingsCategoryKey>('appearance')
    const settings = createSettingsSection({
      translate,
      categoryKey: category,
      categoryTreeData: ref(tree(['appearance'])),
      onSelectionChange: vi.fn(),
    }).value

    expect(listKeys(settings)).toEqual(['settings-categories'])
    expect(settings[0]!.lists[0]!.content).toMatchObject({ selectedKeys: ['appearance'], selectionMode: 'single' })
  })

  it('projects create-project inputs and busy state into actions', () => {
    const busy = ref(false)
    const section = createCreateProjectSection({
      translate,
      busy,
      templateTreeData: ref(tree(['starter'])),
      selectedTemplateKey: ref('builtin:starter'),
      onTemplateSelectionChange: vi.fn(async () => undefined),
      onTemplateAction: vi.fn(async () => undefined),
      resourcePackageStore: { isLoading: ref(false) },
      resourcePackageTreeData: ref(tree()),
      onResourcePackageAction: vi.fn(),
    })

    expect(listKeys(section.value)).toEqual(['templates', 'resource-packages'])
    expect(section.value[0]!.headButtons?.[0]?.disabled).toBe(false)
    busy.value = true
    expect(section.value[0]!.headButtons?.[0]?.disabled).toBe(true)
    expect(section.value[0]!.lists[1]!.actions.every(action => action.disabled)).toBe(true)
  })

  it('projects export-template inputs without sharing the workbench projection', () => {
    const section = createExportTemplateSection({
      translate,
      busy: ref(false),
      projectFolderName: ref('demo'),
      projectTreeData: ref(tree(['demo'])),
      selectedProjectEntryKeys: ref(['demo/main.ocdocument']),
      expandedKeys: ref(['demo']),
      entryTreeData: ref(tree()),
      coverTreeData: ref(tree()),
      onProjectAction: vi.fn(),
      onSelectionAction: vi.fn(),
      captureProjectTree: vi.fn(),
    }).value

    expect(listKeys(section)).toEqual(['project-files', 'template-entries', 'template-covers'])
    expect(section[0]!.transitionKey).toBe('flow:export-template')
    expect(section[0]!.lists[0]!.title).toBe('demo')
  })

  it('keeps project and version projections as separate workbench groups', () => {
    const node = () => ref(tree())
    const selected = () => ref<string[]>([])
    const expanded = () => ref<string[]>([])
    const section = createWorkbenchSection({
      translate,
      project: {
        open: ref(true),
        path: ref('D:/projects/demo'),
        folderName: ref('demo'),
        openedEditors: { data: node(), selectedKeys: selected(), onSelectionChange: vi.fn(), onAction: vi.fn(), onAuxclick: vi.fn() },
        management: {
          data: node(), selectedKeys: selected(), expandedKeys: expanded(), onSelectionChange: vi.fn(), onExpansionChange: vi.fn(),
          onAction: vi.fn(), onRenameCommit: vi.fn(), onMove: vi.fn(), onExternalDrop: vi.fn(), captureInstance: () => undefined,
        },
        files: {
          data: node(), selectedKeys: selected(), expandedKeys: expanded(), onSelectionChange: vi.fn(), onExpansionChange: vi.fn(),
          onAction: vi.fn(), onNodeActivate: vi.fn(), onRenameCommit: vi.fn(), onMove: vi.fn(), onExternalDrop: vi.fn(), captureInstance: () => undefined,
        },
      },
      version: {
        ready: ref(true), needsInitialization: ref(false), initializing: ref(false), committing: ref(false), selectedChangeCount: ref(2),
        timeline: { placeholder: ref(''), filePath: ref('main.ocdocument'), loading: ref(false), data: node(), onAction: vi.fn() },
        changes: { data: node(), expandedKeys: expanded(), onExpansionChange: vi.fn(), onExpansionSync: vi.fn(), onNodeActivate: vi.fn(), onAction: vi.fn() },
        graph: { data: node(), expandedKeys: expanded(), onExpansionChange: vi.fn(), onExpansionSync: vi.fn() },
      },
    }).value

    expect(section.map(group => group.key)).toEqual(['workspace', 'version-control'])
    expect(section[0]!.lists.map(list => list.key)).toContain('project-files')
    expect(section[1]!.lists.map(list => list.key)).toEqual(['changes', 'version-graph'])
    expect(section[1]!.headButtons?.[0]).toMatchObject({ key: 'publish-version', badge: 2, disabled: false })
  })

  it('shows only the open-project entry before a project is opened', () => {
    const node = () => ref(tree())
    const selected = () => ref<string[]>([])
    const expanded = () => ref<string[]>([])
    const section = createWorkbenchSection({
      translate,
      project: {
        open: ref(false), path: ref(''), folderName: ref(''),
        openedEditors: { data: node(), selectedKeys: selected(), onSelectionChange: vi.fn(), onAction: vi.fn(), onAuxclick: vi.fn() },
        management: {
          data: node(), selectedKeys: selected(), expandedKeys: expanded(), onSelectionChange: vi.fn(), onExpansionChange: vi.fn(),
          onAction: vi.fn(), onRenameCommit: vi.fn(), onMove: vi.fn(), onExternalDrop: vi.fn(), captureInstance: () => undefined,
        },
        files: {
          data: node(), selectedKeys: selected(), expandedKeys: expanded(), onSelectionChange: vi.fn(), onExpansionChange: vi.fn(),
          onAction: vi.fn(), onNodeActivate: vi.fn(), onRenameCommit: vi.fn(), onMove: vi.fn(), onExternalDrop: vi.fn(), captureInstance: () => undefined,
        },
      },
      version: {
        ready: ref(false), needsInitialization: ref(false), initializing: ref(false), committing: ref(false), selectedChangeCount: ref(0),
        timeline: { placeholder: ref(''), filePath: ref(null), loading: ref(false), data: node(), onAction: vi.fn() },
        changes: { data: node(), expandedKeys: expanded(), onExpansionChange: vi.fn(), onExpansionSync: vi.fn(), onNodeActivate: vi.fn(), onAction: vi.fn() },
        graph: { data: node(), expandedKeys: expanded(), onExpansionChange: vi.fn(), onExpansionSync: vi.fn() },
      },
    }).value

    expect(section).toHaveLength(1)
    expect(section[0]!.lists.map(list => list.key)).toEqual(['opened-editors'])
    expect(section[0]!.headButtons).toMatchObject([{ key: 'open-project' }])
  })
})
