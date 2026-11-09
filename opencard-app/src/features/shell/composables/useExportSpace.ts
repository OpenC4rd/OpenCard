/**
 * 导出空间的状态：配置列表、当前配置、运行入口。
 * 编辑时改的是内存里的草稿，预览跟着草稿走；点保存才写回文件，取消就恢复。
 */
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import type { ExportPlan, ExportPreparationResult, ExportTaskValidationIssue } from '../../exporting/exportTask'
import { createExportProfile, isValidExportProfileName, parseExportProfiles, serializeExportProfile, type ExportProfile } from '../../workspace/model/projectExportProfile'
import { PROJECT_EXPORT_DIRECTORY } from '../../workspace/model/projectStructure'
import type { useProjectStore } from '../../workspace/store/projectStore'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { notifyAppError } from '../../notifications/titlebarNotices'
import { taskScheduler } from '../../../utils/taskScheduler'

const PROFILE_FILE_EXTENSION = '.json'

/** 每条配置是 `.opencard/exports/<配置名>.json`，文件名就是配置名，改名就是换文件。 */
export function createProjectExportStorage(store: ReturnType<typeof useProjectStore>) {
  const directory = () => store.resolveProjectInternalPath(PROJECT_EXPORT_DIRECTORY)
  const profilePath = (name: string) => `${directory()}/${name}${PROFILE_FILE_EXTENSION}`
  return {
    listDocuments: async (signal: AbortSignal): Promise<string[]> => {
      const paths: string[] = []
      await taskScheduler.forEach(await store.scanProjectEntries(signal), (entry) => {
        if (entry.isFile && entry.name.toLowerCase().endsWith('.ocdocument')) paths.push(entry.name.replace(/\\/g, '/'))
      }, signal)
      return paths
    },
    listProfiles: async (): Promise<ExportProfile[]> => {
      if (!await fileSystemService.fileExists(directory())) return []
      const entries = await fileSystemService.readDirectory(directory())
      const files = entries.filter(entry => entry.isFile && entry.name.endsWith(PROFILE_FILE_EXTENSION))
      const profiles = await Promise.all(files.map(async (entry) => {
        const name = entry.name.slice(0, -PROFILE_FILE_EXTENSION.length)
        try {
          const source = JSON.parse(await fileSystemService.readFile(profilePath(name))) as Record<string, unknown>
          return parseExportProfiles([{ ...source, name }])
        } catch {
          return []
        }
      }))
      return profiles.flat().sort((left, right) => left.name.localeCompare(right.name))
    },
    /** `previousName` 是改名前的配置名；名字变了就删掉旧文件。 */
    saveProfile: async (profile: ExportProfile, previousName?: string): Promise<void> => {
      await fileSystemService.createDirectory(directory())
      await fileSystemService.writeFile(profilePath(profile.name), serializeExportProfile(profile))
      if (previousName && previousName !== profile.name) await fileSystemService.deleteFile(profilePath(previousName))
    },
    deleteProfile: (name: string): Promise<void> => fileSystemService.deleteFile(profilePath(name)),
    /** 项目内的路径改写成相对路径；项目外返回 null。 */
    toProjectPath: (path: string): string | null => store.getRelativeProjectPathIfInside(path),
  }
}

export type ProjectExportStorage = ReturnType<typeof createProjectExportStorage>

export type ExportSpaceOptions = ProjectExportStorage & {
  running: Readonly<Ref<boolean>>
  prepare: (profile: ExportProfile) => Promise<ExportPreparationResult>
  run: (plan: ExportPlan) => Promise<unknown> | void
  newProfileName: () => string
}

export function useExportSpace(options: ExportSpaceOptions) {
  const profiles = ref<ExportProfile[]>([])
  /** 当前配置的配置名；编辑中改名时跟着草稿走。 */
  const activeName = ref<string | null>(null)
  /** 每次换到另一条配置就加一；编辑中改名不算。 */
  const switched = ref(0)
  const documents = ref<readonly string[]>([])
  const preparing = ref(false)
  const issues = ref<readonly ExportTaskValidationIssue[]>([])
  const activeProfile = computed(() => profiles.value.find(profile => profile.name === activeName.value) ?? null)
  const busy = computed(() => preparing.value || options.running.value)
  const editing = ref(false)
  /** 进入编辑时的配置；新建的配置还没写过文件，这里是 null，取消就直接丢掉。 */
  let original: ExportProfile | null = null
  let request: AbortController | undefined

  onScopeDispose(() => request?.abort())

  function beginEdit(): void {
    original = activeProfile.value
    editing.value = Boolean(original)
  }

  function cancel(): void {
    if (!editing.value) return
    const restored = original
    editing.value = false
    original = null
    issues.value = []
    profiles.value = restored
      ? profiles.value.map(profile => profile.name === activeName.value ? restored : profile)
      : profiles.value.filter(profile => profile.name !== activeName.value)
    activeName.value = restored?.name ?? profiles.value[0]?.name ?? null
  }

  async function save(): Promise<void> {
    const profile = activeProfile.value
    if (!profile) return
    const taken = profiles.value.some(candidate => candidate !== profile && candidate.name === profile.name)
    if (!isValidExportProfileName(profile.name) || taken) {
      issues.value = [{ code: 'invalid-profile-name' }]
      return
    }
    const previousName = original?.name
    editing.value = false
    original = null
    await options.saveProfile(profile, previousName).catch((error: unknown) => notifyAppError('OC-E3006', error))
  }

  /** 没保存就切走等于放弃这次编辑。 */
  function select(name: string | null): void {
    cancel()
    activeName.value = name
    switched.value += 1
    issues.value = []
  }

  async function load(): Promise<void> {
    request?.abort()
    const owner = new AbortController()
    request = owner
    const [nextProfiles, nextDocuments] = await Promise.all([options.listProfiles(), options.listDocuments(owner.signal)])
    if (owner.signal.aborted) return
    // 离开空间再回来不丢草稿。
    const draft = editing.value ? activeProfile.value : null
    profiles.value = draft
      ? [...nextProfiles.filter(profile => profile.name !== draft.name && profile.name !== original?.name), draft]
      : nextProfiles
    documents.value = nextDocuments
    if (!activeProfile.value) activeName.value = nextProfiles[0]?.name ?? null
  }

  function insert(profile: ExportProfile): void {
    cancel()
    profiles.value = [...profiles.value, profile]
    activeName.value = profile.name
    switched.value += 1
    issues.value = []
    editing.value = true
  }

  /** 重名时在后面加数字：`配置`、`配置 2`、`配置 3`。 */
  function uniqueName(base: string): string {
    const used = new Set(profiles.value.map(profile => profile.name))
    let name = base
    for (let index = 2; used.has(name); index += 1) name = `${base} ${index}`
    return name
  }

  function add(): void {
    insert(createExportProfile(uniqueName(options.newProfileName())))
  }

  function duplicate(name: string): void {
    const source = profiles.value.find(profile => profile.name === name)
    if (source) insert({ ...parseExportProfiles([source])[0]!, name: uniqueName(source.name) })
  }

  function remove(name: string): void {
    const neverSaved = editing.value && name === activeName.value && !original
    if (name === activeName.value) cancel()
    if (neverSaved) return
    const index = profiles.value.findIndex(profile => profile.name === name)
    if (index < 0) return
    profiles.value = profiles.value.filter(profile => profile.name !== name)
    if (activeName.value === name) select(profiles.value[Math.min(index, profiles.value.length - 1)]?.name ?? null)
    options.deleteProfile(name).catch((error: unknown) => notifyAppError('OC-E3006', error))
  }

  function update(profile: ExportProfile): void {
    const directory = options.toProjectPath(profile.output.directory) ?? profile.output.directory
    profiles.value = profiles.value.map(candidate => candidate.name === activeName.value
      ? { ...profile, output: { ...profile.output, directory } }
      : candidate)
    activeName.value = profile.name
    issues.value = []
  }

  async function submit(): Promise<boolean> {
    const profile = activeProfile.value
    if (!profile || busy.value) return false
    preparing.value = true
    issues.value = []
    try {
      const result = await options.prepare(profile)
      if (!result.ok) {
        issues.value = result.issues
        return false
      }
      void options.run(result.plan)
      return true
    } finally {
      preparing.value = false
    }
  }

  return { profiles, activeProfile, switched, documents, busy, issues, editing, load, select, add, duplicate, remove, update, beginEdit, save, cancel, submit }
}
