/** Workspace entry lookup and OcNode collection projection. */
import { computed, ref, watch, type Ref } from 'vue'
import type { EditorSession } from '../../workspace/store/editorSessionStore'
import { resolveEntryIcon, resolveFileTypeById, type EntryIconPresentation } from '../../workspace/model/fileTypes'
import { normalizeNodeTail, type OcNode, type OcNodeAction, type OcNodeCollection, type OcNodeRenameSelection } from '../../../shared/ui/node/node.types'
import type { IconToken } from '../../../shared/ui/icon/iconRegistry'
import { RESOURCE_PACKAGE_SUFFIX } from '../../workspace/model/resourcePackage'
import { notifyAppError } from '../../notifications/titlebarNotices'
import {
  PROJECT_DICTIONARY_FILE_NAME,
  PROJECT_FONT_DIRECTORY,
  PROJECT_FONT_REGISTRY_FILE_NAME,
  PROJECT_ICON_DIRECTORY,
  PROJECT_ICON_REGISTRY_FILE_NAME,
  PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME,
  PROJECT_CUSTOM_BLOCK_DIRECTORY,
  PROJECT_INTERNAL_DIRECTORY_NAME,
  PROJECT_PROFILE_FILE_NAME,
  PROJECT_PACKAGE_DIRECTORY,
} from '../../workspace/model/projectStructure'

export const OPENED_EDITOR_CLOSE_ACTION_KEY = 'close-editor'
export const PROJECT_ENTRY_RENAME_ACTION_KEY = 'project-entry-rename'
export const PROJECT_ENTRY_REVEAL_ACTION_KEY = 'project-entry-reveal'
export const PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY = 'project-entry-copy-relative-path'
export const PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY = 'project-entry-copy-absolute-path'
export const PROJECT_ENTRY_MORE_ACTION_KEY = 'project-entry-more'
export const PROJECT_ENTRY_DELETE_ACTION_KEY = 'project-entry-delete'
export const PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY = 'project-entry-confirm-delete'
export const PROJECT_PACKAGE_ADD_ACTION_KEY = 'project-package-add'

type ProjectManagementEntry = {
  path: string
  labelKey: string
  assetDirectory?: string
  packageDirectory?: boolean
}

const PROJECT_MANAGEMENT_ENTRIES: readonly ProjectManagementEntry[] = [
  { path: PROJECT_PROFILE_FILE_NAME, labelKey: 'fileTypes.opencardProjectProfile' },
  { path: PROJECT_DICTIONARY_FILE_NAME, labelKey: 'fileTypes.opencardDictionary' },
  { path: PROJECT_FONT_REGISTRY_FILE_NAME, labelKey: 'fileTypes.opencardFontRegistry', assetDirectory: PROJECT_FONT_DIRECTORY },
  { path: PROJECT_ICON_REGISTRY_FILE_NAME, labelKey: 'fileTypes.opencardIconRegistry', assetDirectory: PROJECT_ICON_DIRECTORY },
  { path: PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME, labelKey: 'fileTypes.opencardCustomBlockRegistry', assetDirectory: PROJECT_CUSTOM_BLOCK_DIRECTORY },
  {
    path: `${PROJECT_INTERNAL_DIRECTORY_NAME}/${PROJECT_PACKAGE_DIRECTORY}`,
    labelKey: 'fileTypes.opencardResourcePackage',
    packageDirectory: true,
  },
] as const

type IndexedEntry = {
  name: string
  isDirectory?: boolean | null
}

type ProjectEntryView = {
  key: string
  relativePath: string
  label: string
  isDirectory: boolean
  isExpanded: boolean
  children: ProjectEntryView[]
}

type UseShellFileTreeOptions = {
  projectPath: Readonly<Ref<string>>
  indexedEntries: Readonly<Ref<readonly IndexedEntry[]>>
  sessions: Readonly<Ref<readonly EditorSession[]>>
  /** 会话在列表里的显示名，由壳层决定文案（作用域前缀、未保存标记）。 */
  formatSessionTitle: (session: EditorSession) => string
  activeSession: Readonly<Ref<EditorSession | null>>
  hideDotFiles?: Readonly<Ref<boolean>>
  isDirectoryExpanded: (path: string) => boolean
  activateSession: (sessionId: string) => void
  openPreviewFile: (path: string) => Promise<unknown>
  ensureProjectManagementStructure: () => Promise<void>
  translate: (key: string, params?: Record<string, unknown>) => string
  registeredFontSources?: Readonly<Ref<readonly string[] | null>>
  /** 归档路径 → 它自述的坐标。包列表的小字用它；读不出身份的包不在表里。 */
  packageCoordinates?: Readonly<Ref<ReadonlyMap<string, string>>>
}

function normalizeShellPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function resolveFilenameRenameSelection(name: string): OcNodeRenameSelection {
  const extensionSeparator = name.lastIndexOf('.')
  const hasExtension = extensionSeparator > 0 && extensionSeparator < name.length - 1
  return { start: 0, end: hasExtension ? extensionSeparator : name.length }
}

function isDotPath(path: string): boolean {
  return path.split('/').some(part => part.startsWith('.') && part.length > 1)
}

export function useShellFileTree(options: UseShellFileTreeOptions) {
  const selectedProjectEntryKeys = ref<string[]>([])
  const selectedManagementKeys = ref<string[]>([])
  const openedEditorSelectedKeys = ref<string[]>([])
  const collapsedProjectManagementKeys = ref<ReadonlySet<string>>(new Set())
  /** Registered sources are project-relative; `resolveEntryIcon` matches them in that same space. */
  const registeredFontSourceSet = computed(() => new Set(
    (options.registeredFontSources?.value ?? []).map(source => (
      normalizeShellPath(source).replace(/^\/+/, '')
    )),
  ))

  function setSelectedKeys(target: Ref<string[]>, nextKeys: string[]): void {
    if (target.value.length === nextKeys.length
      && target.value.every((key, index) => key === nextKeys[index])) return
    target.value = nextKeys
  }

  const projectProjection = computed(() => {
    const roots: ProjectEntryView[] = []
    const byRelativePath = new Map<string, ProjectEntryView>()
    const byKey = new Map<string, ProjectEntryView>()

    for (const file of options.indexedEntries.value) {
      const relativePath = normalizeShellPath(file.name)
      if ((options.hideDotFiles?.value ?? true) && isDotPath(relativePath)) continue
      const key = normalizeShellPath(`${options.projectPath.value}/${relativePath}`)
      const parts = relativePath.split('/')
      const isDirectory = Boolean(file.isDirectory)
      const entry: ProjectEntryView = {
        key,
        relativePath,
        label: parts[parts.length - 1] ?? relativePath,
        isDirectory,
        isExpanded: isDirectory && options.isDirectoryExpanded(key),
        children: [],
      }
      byRelativePath.set(relativePath, entry)
      byKey.set(key, entry)
    }

    for (const [relativePath, entry] of byRelativePath) {
      const separatorIndex = relativePath.lastIndexOf('/')
      if (separatorIndex < 0) roots.push(entry)
      else byRelativePath.get(relativePath.slice(0, separatorIndex))?.children.push(entry)
    }

    return { roots, byKey }
  })

  /** Inline actions always target the row that carries them, so keys are node-local and static. */
  function createProjectEntryNode(entry: ProjectEntryView): OcNode {
    const presentation = resolveEntryIcon(
      entry.key,
      entry.isDirectory,
      entry.isExpanded,
      options.projectPath.value,
      registeredFontSourceSet.value,
    )
    const rename: OcNodeAction = {
      key: PROJECT_ENTRY_RENAME_ACTION_KEY,
      title: options.translate('sidebar.fileActions.rename'),
      icon: 'action.edit',
    }
    const reveal: OcNodeAction = {
      key: PROJECT_ENTRY_REVEAL_ACTION_KEY,
      title: options.translate('sidebar.fileActions.reveal'),
      icon: 'status.folder-open',
    }
    const copyRelativePath: OcNodeAction = {
      key: PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY,
      title: options.translate('sidebar.fileActions.copyRelativePath'),
      icon: 'action.copy',
    }
    const copyAbsolutePath: OcNodeAction = {
      key: PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY,
      title: options.translate('sidebar.fileActions.copyAbsolutePath'),
      icon: 'action.copy',
    }
    const moveToTrash: OcNodeAction = {
      key: PROJECT_ENTRY_DELETE_ACTION_KEY,
      title: options.translate('sidebar.fileActions.delete'),
      icon: 'action.delete',
      children: [{
        key: PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY,
        title: options.translate('sidebar.fileActions.confirmDeleteFile', { fileName: entry.label }),
        icon: 'action.delete',
        iconTone: 'danger',
      }],
    }

    return {
      label: entry.label,
      renameSelection: !entry.isDirectory
        ? resolveFilenameRenameSelection(entry.label)
        : undefined,
      visual: { type: 'icon', icon: presentation.icon, iconTone: presentation.tone },
      renamable: true,
      draggable: true,
      tail: [{
        key: PROJECT_ENTRY_MORE_ACTION_KEY,
        title: options.translate('sidebar.fileActions.more'),
        icon: 'nav.more',
        children: [rename, moveToTrash, reveal, copyRelativePath, copyAbsolutePath],
      }],
      contextActions: [
        rename,
        reveal,
        copyRelativePath,
        copyAbsolutePath,
        { type: 'divider', key: 'project-entry-delete-divider' },
        moveToTrash,
      ],
    }
  }

  const projectTreeData = computed<OcNodeCollection>(() => {
    const items = new Map<string, OcNode>()
    const children = new Map<string, readonly string[]>()

    for (const entry of projectProjection.value.byKey.values()) {
      items.set(entry.key, createProjectEntryNode(entry))
      if (entry.children.length > 0) {
        children.set(entry.key, entry.children.map((child) => child.key))
      }
    }

    return {
      rootKeys: projectProjection.value.roots.map((entry) => entry.key),
      items,
      children,
    }
  })

  const projectManagementProjection = computed(() => {
    const emptyTreeData: OcNodeCollection = { rootKeys: [], items: new Map(), children: new Map() }
    if (!options.projectPath.value) return {
      treeData: emptyTreeData,
      targetByNodeKey: new Map<string, string>(),
      nodeKeyByTargetPath: new Map<string, string>(),
    }
    const items = new Map<string, OcNode>()
    const children = new Map<string, readonly string[]>()
    const targetByNodeKey = new Map<string, string>()
    const nodeKeyByTargetPath = new Map<string, string>()
    const rootKeys = PROJECT_MANAGEMENT_ENTRIES.map((entry) => {
      const key = normalizeShellPath(`${options.projectPath.value}/${entry.path}`)
      const presentation = entry.packageDirectory
        ? { icon: 'file.package' as IconToken, tone: 'file-config' as const }
        : resolveEntryIcon(key, false, false, options.projectPath.value)
      items.set(key, {
        label: options.translate(entry.labelKey),
        tail: entry.packageDirectory
          ? [entry.path, {
            key: PROJECT_PACKAGE_ADD_ACTION_KEY,
            title: options.translate('packageManager.add'),
            icon: 'action.add',
          }]
          : entry.path,
        visual: { type: 'icon', icon: presentation.icon, iconTone: presentation.tone },
      })
      // 点包目录这一行打开包管理器整页：项目里装了哪些包，就是那个文件夹里有哪几个归档。
      // 其余目录行不是一个文件，选中只是选中，不该去"打开"它。
      if (!entry.packageDirectory) {
        targetByNodeKey.set(key, key)
        nodeKeyByTargetPath.set(key, key)
      }
      if (entry.packageDirectory) {
        // 项目里装了哪些包就是文件夹里有哪几个 `.ocpack`。每一行都用文件树那一行的节点：
        // 同样的图标、同样的重命名/回收站/在文件管理器显示/复制路径，动作只有一套。
        const packageNodeKeys = options.indexedEntries.value
          .map(candidate => normalizeShellPath(candidate.name))
          .filter(relative => relative.startsWith(`${entry.path}/`))
          .filter(relative => !relative.slice(entry.path.length + 1).includes('/'))
          .filter(relative => relative.toLocaleLowerCase().endsWith(RESOURCE_PACKAGE_SUFFIX))
          .sort((left, right) => left.localeCompare(right))
          .map((relative) => {
            const nodeKey = normalizeShellPath(`${options.projectPath.value}/${relative}`)
            const parts = relative.split('/')
            const node = createProjectEntryNode({
              key: nodeKey,
              relativePath: relative,
              label: parts[parts.length - 1] ?? relative,
              isDirectory: false,
              isExpanded: false,
              children: [],
            })
            // 小字是包自述的坐标：文件叫什么名字不算数，所以列表里这两件事各说各的。
            const coordinate = options.packageCoordinates?.value.get(nodeKey)
            items.set(nodeKey, {
              ...node,
              tail: [...(coordinate ? [coordinate] : []), ...normalizeNodeTail(node.tail)],
            })
            targetByNodeKey.set(nodeKey, nodeKey)
            nodeKeyByTargetPath.set(nodeKey, nodeKey)
            return nodeKey
          })
        if (packageNodeKeys.length > 0) children.set(key, packageNodeKeys)
        targetByNodeKey.set(key, key)
        nodeKeyByTargetPath.set(key, key)
      }
      return key
    })
    return {
      treeData: { rootKeys, items, children },
      targetByNodeKey,
      nodeKeyByTargetPath,
    }
  })

  const projectManagementTreeData = computed<OcNodeCollection>(() => projectManagementProjection.value.treeData)

  const projectManagementExpandedKeys = computed(() => (
    [...projectManagementTreeData.value.children.keys()].filter(
      key => !collapsedProjectManagementKeys.value.has(key),
    )
  ))

  function setProjectManagementEntryExpanded(key: string, expanded: boolean): boolean {
    if ((projectManagementTreeData.value.children.get(key)?.length ?? 0) === 0) return false
    const nextCollapsedKeys = new Set(collapsedProjectManagementKeys.value)
    if (expanded) nextCollapsedKeys.delete(key)
    else nextCollapsedKeys.add(key)
    collapsedProjectManagementKeys.value = nextCollapsedKeys
    return true
  }

  const projectExpandedKeys = computed(() =>
    [...projectProjection.value.byKey.values()]
      .filter((entry) => entry.isExpanded && entry.children.length > 0)
      .map((entry) => entry.key),
  )

  /**
   * 图标分两半：形状听编辑器声明的（它声明的是"我是什么"），色调按项目条目算（是否登记在项目里
   * 这类信息只有项目知道）；编辑器也声明了色调时才以它为准。没声明的会话整份按条目或文件类型算。
   */
  function resolveSessionVisual(session: EditorSession): EntryIconPresentation {
    const fileType = resolveFileTypeById(session.fileTypeId)
    const entry = session.resourceKind === 'workspace' && session.path
      ? resolveEntryIcon(
          session.path,
          false,
          false,
          options.projectPath.value,
          registeredFontSourceSet.value,
        )
      : { icon: fileType.icon, tone: fileType.iconTone }
    if (!session.presentation) return entry
    return {
      icon: session.presentation.icon,
      tone: session.presentation.iconTone ?? entry.tone,
    }
  }

  const openedEditorTreeData = computed<OcNodeCollection>(() => {
    const closeAction: OcNodeAction = {
      key: OPENED_EDITOR_CLOSE_ACTION_KEY,
      title: options.translate('sidebar.closeEditor'),
      icon: 'action.close',
    }
    const items = new Map<string, OcNode>()
    for (const session of options.sessions.value) {
      const visual = resolveSessionVisual(session)
      items.set(session.id, {
        label: options.formatSessionTitle(session),
        loading: session.presentation === undefined,
        visual: { type: 'icon', icon: visual.icon, iconTone: visual.tone },
        tail: [closeAction],
        contextActions: [closeAction],
      })
    }
    return {
      rootKeys: options.sessions.value.map((session) => session.id),
      items,
      children: new Map(),
    }
  })

  function findProjectEntryByKey(key: string): ProjectEntryView | null {
    return projectProjection.value.byKey.get(normalizeShellPath(key)) ?? null
  }

  function setProjectEntryExpanded(key: string, expanded: boolean): boolean {
    const entry = findProjectEntryByKey(key)
    if (!entry?.isDirectory || entry.children.length === 0) return false
    return options.isDirectoryExpanded(key) === expanded
  }

  async function handleProjectManagementSelect(nextSelectedKeys: string[]): Promise<void> {
    selectedManagementKeys.value = nextSelectedKeys
    const selectedKey = nextSelectedKeys[0]
    if (!selectedKey) return
    try {
      const isManagementRoot = projectManagementTreeData.value.rootKeys.includes(selectedKey)
      if (isManagementRoot) await options.ensureProjectManagementStructure()
      const targetPath = projectManagementProjection.value.targetByNodeKey.get(selectedKey)
      if (targetPath) await options.openPreviewFile(targetPath)
    } catch (error) {
      notifyAppError('OC-E4001', { path: selectedKey, error })
    }
  }

  function syncSelectionFromActiveSession(session: EditorSession | null): void {
    if (!session) {
      setSelectedKeys(openedEditorSelectedKeys, [])
      setSelectedKeys(selectedProjectEntryKeys, [])
      setSelectedKeys(selectedManagementKeys, [])
      return
    }

    const opened = options.sessions.value.some((candidate) => candidate.id === session.id)
    setSelectedKeys(openedEditorSelectedKeys, opened ? [session.id] : [])

    if (session.resourceKind !== 'workspace' || !session.path) {
      setSelectedKeys(selectedProjectEntryKeys, [])
      setSelectedKeys(selectedManagementKeys, [])
      return
    }

    const normalizedSessionPath = normalizeShellPath(session.path)
    const entry = findProjectEntryByKey(normalizedSessionPath)
    const managedKey = projectManagementProjection.value.nodeKeyByTargetPath.get(normalizedSessionPath)
    setSelectedKeys(selectedProjectEntryKeys, entry ? [normalizedSessionPath] : [])
    setSelectedKeys(selectedManagementKeys, managedKey ? [managedKey] : [])
  }

  function handleOpenedEditorsSelect(nextSelectedKeys: string[]): void {
    openedEditorSelectedKeys.value = nextSelectedKeys
    const selectedSessionId = nextSelectedKeys[0]
    if (selectedSessionId) options.activateSession(selectedSessionId)
  }

  async function handleFileTreeSelect(nextSelectedKeys: string[]): Promise<void> {
    selectedProjectEntryKeys.value = nextSelectedKeys
    if (nextSelectedKeys.length !== 1) return
    const selectedEntry = findProjectEntryByKey(nextSelectedKeys[0])
    if (!selectedEntry || selectedEntry.isDirectory) return
    try {
      await options.openPreviewFile(selectedEntry.key)
    } catch (error) {
      notifyAppError('OC-E4001', { path: selectedEntry.key, error })
    }
  }

  watch(
    [() => {
      const session = options.activeSession.value
      return session ? `${session.id}\0${session.resourceKind}\0${session.path ?? ''}` : ''
    }, () => projectProjection.value.byKey, () => projectManagementProjection.value.nodeKeyByTargetPath],
    () => syncSelectionFromActiveSession(options.activeSession.value),
    { immediate: true },
  )

  return {
    projectTreeData,
    projectManagementTreeData,
    projectManagementExpandedKeys,
    projectExpandedKeys,
    openedEditorTreeData,
    selectedProjectEntryKeys,
    selectedManagementKeys,
    openedEditorSelectedKeys,
    handleOpenedEditorsSelect,
    handleFileTreeSelect,
    handleProjectManagementSelect,
    findProjectEntryByKey,
    setProjectManagementEntryExpanded,
    setProjectEntryExpanded,
  }
}
