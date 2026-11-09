/**
 * 导出空间的状态：配置列表、当前配置、运行入口。
 * 编辑时改的是内存里的草稿，预览跟着草稿走；点保存才写回文件，取消就恢复。
 */
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import type { ExportPlan, ExportPreparationResult, ExportTaskValidationIssue } from '../../exporting/exportTask'
import { createExportProfile, parseExportProfiles, type ExportProfile } from '../../workspace/model/projectExportProfile'
import { PROJECT_EXPORT_DIRECTORY } from '../../workspace/model/projectStructure'
import type { useProjectStore } from '../../workspace/store/projectStore'
import { fileSystemService } from '../../workspace/services/fileSystemService'
import { notifyAppError } from '../../notifications/titlebarNotices'
import { taskScheduler } from '../../../utils/taskScheduler'

const PROFILE_FILE_EXTENSION = '.json'

/** 每条配置是 `.opencard/exports/<id>.json`，文件名就是身份，改名不用动文件。 */
export function createProjectExportStorage(store: ReturnType<typeof useProjectStore>) {
  const directory = () => store.resolveProjectInternalPath(PROJECT_EXPORT_DIRECTORY)
  const profilePath = (id: string) => `${directory()}/${id}${PROFILE_FILE_EXTENSION}`
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
        const id = entry.name.slice(0, -PROFILE_FILE_EXTENSION.length)
        try {
          const source = JSON.parse(await fileSystemService.readFile(profilePath(id))) as Record<string, unknown>
          return parseExportProfiles([{ ...source, id }])
        } catch {
          return []
        }
      }))
      return profiles.flat().sort((left, right) => left.name.localeCompare(right.name))
    },
    saveProfile: async (profile: ExportProfile): Promise<void> => {
      await fileSystemService.createDirectory(directory())
      await fileSystemService.writeFile(profilePath(profile.id), `${JSON.stringify(profile, null, 2)}\n`)
    },
    deleteProfile: (id: string): Promise<void> => fileSystemService.deleteFile(profilePath(id)),
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
  const activeId = ref<string | null>(null)
  const documents = ref<readonly string[]>([])
  const preparing = ref(false)
  const issues = ref<readonly ExportTaskValidationIssue[]>([])
  const activeProfile = computed(() => profiles.value.find(profile => profile.id === activeId.value) ?? null)
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
      ? profiles.value.map(profile => profile.id === restored.id ? restored : profile)
      : profiles.value.filter(profile => profile.id !== activeId.value)
    if (!restored) activeId.value = profiles.value[0]?.id ?? null
  }

  async function save(): Promise<void> {
    const profile = activeProfile.value
    editing.value = false
    original = null
    if (profile) await options.saveProfile(profile).catch((error: unknown) => notifyAppError('OC-E3006', error))
  }

  /** 没保存就切走等于放弃这次编辑。 */
  function select(id: string | null): void {
    cancel()
    activeId.value = id
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
    profiles.value = draft ? [...nextProfiles.filter(profile => profile.id !== draft.id), draft] : nextProfiles
    documents.value = nextDocuments
    if (!activeProfile.value) activeId.value = nextProfiles[0]?.id ?? null
  }

  function insert(profile: ExportProfile): void {
    cancel()
    profiles.value = [...profiles.value, profile]
    activeId.value = profile.id
    issues.value = []
    editing.value = true
  }

  function add(): void {
    insert(createExportProfile(options.newProfileName()))
  }

  function duplicate(id: string): void {
    const source = profiles.value.find(profile => profile.id === id)
    if (source) insert({ ...parseExportProfiles([source])[0]!, id: crypto.randomUUID(), name: `${source.name} 2` })
  }

  function remove(id: string): void {
    const neverSaved = editing.value && id === activeId.value && !original
    if (id === activeId.value) cancel()
    if (neverSaved) return
    const index = profiles.value.findIndex(profile => profile.id === id)
    if (index < 0) return
    profiles.value = profiles.value.filter(profile => profile.id !== id)
    if (activeId.value === id) select(profiles.value[Math.min(index, profiles.value.length - 1)]?.id ?? null)
    options.deleteProfile(id).catch((error: unknown) => notifyAppError('OC-E3006', error))
  }

  function update(profile: ExportProfile): void {
    const directory = options.toProjectPath(profile.output.directory) ?? profile.output.directory
    profiles.value = profiles.value.map(candidate => candidate.id === profile.id
      ? { ...profile, output: { ...profile.output, directory } }
      : candidate)
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

  return { profiles, activeProfile, documents, busy, issues, editing, load, select, add, duplicate, remove, update, beginEdit, save, cancel, submit }
}
