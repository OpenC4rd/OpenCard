/** Workspace entry lookup and OcNode collection projection. */
import { computed, ref, shallowRef, markRaw, watch, getCurrentScope, onScopeDispose, type Ref } from 'vue'
import { taskScheduler } from '../../../utils/taskScheduler'
import { sortProjectDirectory } from '../../workspace/services/projectIndexWorker'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import type { EditorSession } from '../../editor-runtime/session/editorSession'
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
const PROJECT_ENTRY_MORE_ACTION_KEY = 'project-entry-more'
const PROJECT_ENTRY_DELETE_ACTION_KEY = 'project-entry-delete'
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
  readonly isExpanded: boolean
  children: ProjectEntryView[]
}

type UseWorkbenchFileTreeOptions = {
  projectPath: Readonly<Ref<string>>
  indexedEntries: Readonly<Ref<readonly IndexedEntry[]>>
  sessions: Readonly<Ref<readonly EditorSession[]>>
  /** 会话在列表里的显示名，由壳层决定文案（作用域前缀、未保存标记）。 */
  formatSessionTitle: (session: EditorSession) => string
  activeSession: Readonly<Ref<EditorSession | null>>
  hideDotFiles?: Readonly<Ref<boolean>>
  isDirectoryExpanded: (path: string) => boolean
  getDirectoryState?: (path: string) => { status: string; error?: string } | undefined
  expandedDirectories?: Readonly<Ref<ReadonlySet<string>>>
  activateSession: (sessionId: string) => void
  openPreviewFile: (path: string) => Promise<unknown>
  translate: (key: string, params?: Record<string, unknown>) => string
  registeredFontSources?: Readonly<Ref<readonly string[] | null>>
  /** 归档路径 → 它自述的坐标。包列表的小字用它；读不出身份的包不在表里。 */
  packageCoordinates?: Readonly<Ref<ReadonlyMap<string, string>>>
  packagePaths?: Readonly<Ref<readonly string[]>>
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

export function useWorkbenchFileTree(options: UseWorkbenchFileTreeOptions) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
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

  const projectProjection = shallowRef<{ roots: ProjectEntryView[]; byKey: Map<string, ProjectEntryView> }>({ roots: [], byKey: new Map() })
  const projectTreeData = shallowRef<OcNodeCollection>({ rootKeys: [], items: new Map(), children: new Map() })
  let projectionRequest: AbortController | undefined
  const compareEntries = (left: ProjectEntryView, right: ProjectEntryView) =>
    Number(right.isDirectory) - Number(left.isDirectory) || collator.compare(left.label, right.label)

  function* buildProjectTree(): Generator<void | Promise<void>> {
    const signal = projectionRequest?.signal
    const roots: ProjectEntryView[] = []
    const byRelativePath = new Map<string, ProjectEntryView>()
    const byKey = new Map<string, ProjectEntryView>()
    const items = new Map<string, OcNode>()
    const children = new Map<string, readonly string[]>()
    const old = projectProjection.value.byKey
    for (const file of options.indexedEntries.value) {
      const relativePath = normalizeShellPath(file.name)
      if ((options.hideDotFiles?.value ?? true) && isDotPath(relativePath)) { yield; continue }
      const key = normalizeShellPath(`${options.projectPath.value}/${relativePath}`)
      const label = relativePath.slice(relativePath.lastIndexOf('/') + 1)
      const entry: ProjectEntryView = { key, relativePath, label, isDirectory: Boolean(file.isDirectory), get isExpanded() { return options.isDirectoryExpanded(key) }, children: [] }
      byRelativePath.set(relativePath, entry); byKey.set(key, entry)
      const before = old.get(key)
      items.set(key, before?.isDirectory === entry.isDirectory && before.label === label
        ? projectTreeData.value.items.get(key)! : createProjectEntryNode(entry))
      yield
    }
    for (const [relativePath, entry] of byRelativePath) {
      const separator = relativePath.lastIndexOf('/')
      if (separator < 0) roots.push(entry)
      else byRelativePath.get(relativePath.slice(0, separator))?.children.push(entry)
      yield
    }
    const groups = [roots]
    for (const entry of byKey.values()) {
      if (entry.children.length) groups.push(entry.children)
      yield
    }
    for (const group of groups) {
      if (group.length <= 256) group.sort(compareEntries)
      else yield (async () => {
        const input: DirEntry[] = []
        const lookup = new Map<string, ProjectEntryView>()
        await taskScheduler.forEach(group, entry => {
          input.push({ name: entry.label, isDirectory: entry.isDirectory, isFile: !entry.isDirectory, isSymlink: false })
          lookup.set(entry.label, entry)
        }, signal)
        const sorted = await sortProjectDirectory(input, signal)
        let index = 0
        await taskScheduler.forEach(sorted, entry => { group[index++] = lookup.get(entry.name)! }, signal)
      })()
      yield
    }
    for (const entry of byKey.values()) {
      if (entry.children.length) {
        const keys: string[] = []
        for (const child of entry.children) { keys.push(child.key); yield }
        children.set(entry.key, keys)
      }
      yield
    }
    const rootKeys: string[] = []
    for (const entry of roots) { rootKeys.push(entry.key); yield }
    projectProjection.value = markRaw({ roots, byKey })
    projectTreeData.value = markRaw({ rootKeys, items, children })
  }

  const projectEntryLabels = computed(() => ({
    rename: options.translate('sidebar.fileActions.rename'),
    reveal: options.translate('sidebar.fileActions.reveal'),
    copyRelativePath: options.translate('sidebar.fileActions.copyRelativePath'),
    copyAbsolutePath: options.translate('sidebar.fileActions.copyAbsolutePath'),
    delete: options.translate('sidebar.fileActions.delete'),
    more: options.translate('sidebar.fileActions.more'),
    confirmDeleteSelected: options.translate('sidebar.fileActions.confirmDeleteSelected', { count: selectedProjectEntryKeys.value.length }),
  }))

  /** Inline actions always target the row that carries them, so keys are node-local and static. */
  function createProjectEntryNode(entry: ProjectEntryView): OcNode {
    const menus = () => {
      const selectionCount = selectedProjectEntryKeys.value.includes(entry.key) ? selectedProjectEntryKeys.value.length : 1
    const rename: OcNodeAction = {
      key: PROJECT_ENTRY_RENAME_ACTION_KEY,
      title: projectEntryLabels.value.rename,
      icon: 'mdiPencilOutline',
      disabled: selectionCount > 1,
    }
    const reveal: OcNodeAction = {
      key: PROJECT_ENTRY_REVEAL_ACTION_KEY,
      title: projectEntryLabels.value.reveal,
      icon: 'mdiFolderOpenOutline',
    }
    const copyRelativePath: OcNodeAction = {
      key: PROJECT_ENTRY_COPY_RELATIVE_PATH_ACTION_KEY,
      title: projectEntryLabels.value.copyRelativePath,
      icon: 'mdiContentCopy',
    }
    const copyAbsolutePath: OcNodeAction = {
      key: PROJECT_ENTRY_COPY_ABSOLUTE_PATH_ACTION_KEY,
      title: projectEntryLabels.value.copyAbsolutePath,
      icon: 'mdiContentCopy',
    }
    const moveToTrash: OcNodeAction = {
      key: PROJECT_ENTRY_DELETE_ACTION_KEY,
      title: projectEntryLabels.value.delete,
      icon: 'mdiTrashCanOutline',
      children: [{
        key: PROJECT_ENTRY_CONFIRM_DELETE_ACTION_KEY,
        title: selectionCount > 1
          ? projectEntryLabels.value.confirmDeleteSelected
          : options.translate('sidebar.fileActions.confirmDeleteFile', { fileName: entry.label }),
        icon: 'mdiTrashCanOutline',
        iconTone: 'danger',
      }],
    }

      return { inline: [rename, moveToTrash, reveal, copyRelativePath, copyAbsolutePath],
        context: [rename, reveal, copyRelativePath, copyAbsolutePath, { type: 'divider' as const, key: 'project-entry-delete-divider' }, moveToTrash] }
    }
    return markRaw({
      label: entry.label,
      renameSelection: !entry.isDirectory ? resolveFilenameRenameSelection(entry.label) : undefined,
      get visual() {
        const presentation = resolveEntryIcon(entry.key, entry.isDirectory, options.isDirectoryExpanded(entry.key), options.projectPath.value, registeredFontSourceSet.value)
        return { type: 'icon' as const, icon: presentation.icon, iconTone: presentation.tone }
      },
      get expandable() {
        return entry.isDirectory && (options.getDirectoryState?.(entry.key)?.status !== 'ready'
          || (projectProjection.value.byKey.get(entry.key)?.children.length ?? 0) > 0)
      },
      get loading() { return entry.isDirectory && options.getDirectoryState?.(entry.key)?.status === 'loading' },
      get disabledReason() { return options.getDirectoryState?.(entry.key)?.error },
      renamable: true, draggable: true,
      tail: [{ key: PROJECT_ENTRY_MORE_ACTION_KEY, get title() { return projectEntryLabels.value.more }, icon: 'mdiDotsHorizontal', children: () => menus().inline }],
      contextActions: () => menus().context,
    })
  }

  watch([() => options.indexedEntries.value, () => options.projectPath.value, () => options.hideDotFiles?.value], () => {
    projectionRequest?.abort()
    const request = new AbortController()
    projectionRequest = request
    void taskScheduler.runBatched(buildProjectTree(), request.signal).catch(error => {
      if (!request.signal.aborted) notifyAppError('OC-E2005', error)
    })
  }, { immediate: true, flush: 'sync' })
  if (getCurrentScope()) onScopeDispose(() => projectionRequest?.abort())

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
        ? { icon: 'mdiPackageVariantClosed' as IconToken, tone: 'file-config' as const }
        : resolveEntryIcon(key, false, false, options.projectPath.value)
      items.set(key, {
        label: options.translate(entry.labelKey),
        tail: entry.packageDirectory
          ? [entry.path, {
            key: PROJECT_PACKAGE_ADD_ACTION_KEY,
            title: options.translate('packageManager.add'),
            icon: 'mdiPlus',
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
        const packageNodeKeys = (options.packagePaths?.value ?? [])
          .map(path => path.slice(normalizeShellPath(options.projectPath.value).length + 1))
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
    options.expandedDirectories
      ? [...options.expandedDirectories.value].map(path => normalizeShellPath(`${options.projectPath.value}/${path}`))
      : [...projectProjection.value.byKey.values()]
      .filter((entry) => entry.isDirectory && options.isDirectoryExpanded(entry.key))
      .map((entry) => entry.key),
  )

  /**
   * 图标分两半：形状听编辑器声明的（它声明的是"我是什么"），色调按项目条目算（是否登记在项目里
   * 这类信息只有项目知道）；编辑器也声明了色调时才以它为准。没声明的会话整份按条目或文件类型算。
   */
  function resolveSessionVisual(session: EditorSession): EntryIconPresentation {
    const fileType = resolveFileTypeById(session.state.fileTypeId)
    const entry = session.state.resourceKind === 'workspace' && session.state.path
      ? resolveEntryIcon(
          session.state.path,
          false,
          false,
          options.projectPath.value,
          registeredFontSourceSet.value,
        )
      : { icon: fileType.icon, tone: fileType.iconTone }
    if (!session.state.presentation) return entry
    return {
      icon: session.state.presentation.icon,
      tone: session.state.presentation.iconTone ?? entry.tone,
    }
  }

  const openedEditorTreeData = computed<OcNodeCollection>(() => {
    const closeAction: OcNodeAction = {
      key: OPENED_EDITOR_CLOSE_ACTION_KEY,
      title: options.translate('sidebar.closeEditor'),
      icon: 'mdiClose',
    }
    const items = new Map<string, OcNode>()
    for (const session of options.sessions.value) {
      const visual = resolveSessionVisual(session)
      items.set(session.state.id, {
        label: options.formatSessionTitle(session),
        loading: session.state.presentation === undefined,
        visual: { type: 'icon', icon: visual.icon, iconTone: visual.tone },
        tail: [closeAction],
        contextActions: [closeAction],
      })
    }
    return {
      rootKeys: options.sessions.value.map((session) => session.state.id),
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

    const opened = options.sessions.value.some((candidate) => candidate.state.id === session.state.id)
    setSelectedKeys(openedEditorSelectedKeys, opened ? [session.state.id] : [])

    if (session.state.resourceKind !== 'workspace' || !session.state.path) {
      setSelectedKeys(selectedProjectEntryKeys, [])
      setSelectedKeys(selectedManagementKeys, [])
      return
    }

    const normalizedSessionPath = normalizeShellPath(session.state.path)
    const entry = findProjectEntryByKey(normalizedSessionPath)
    const managedKey = projectManagementProjection.value.nodeKeyByTargetPath.get(normalizedSessionPath)
    const selection = selectedProjectEntryKeys.value.filter(key => projectProjection.value.byKey.has(key))
    setSelectedKeys(selectedProjectEntryKeys, entry
      ? selection.includes(normalizedSessionPath) ? selection : [normalizedSessionPath]
      : [])
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
      return session ? `${session.state.id}\0${session.state.resourceKind}\0${session.state.path ?? ''}` : ''
    }, () => projectProjection.value.byKey, () => projectManagementProjection.value.nodeKeyByTargetPath],
    (next, previous) => {
      if (previous && next[0] === previous[0] && selectedProjectEntryKeys.value.length > 1) {
        setSelectedKeys(selectedProjectEntryKeys, selectedProjectEntryKeys.value.filter(key => projectProjection.value.byKey.has(key)))
      } else syncSelectionFromActiveSession(options.activeSession.value)
    },
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
