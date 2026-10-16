import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'
import {
  projectTemplateService,
  type ProjectTemplateService,
} from '../services/projectTemplateService'
import type {
  CreateProjectFromTemplateRequest,
  CreatedProject,
  CreateUserTemplateRequest,
  ExportProjectTemplateRequest,
  ProjectTemplate,
  ProjectTemplateKey,
  TemplateCatalogWarning,
  TemplateProjectInspection,
} from '../model/projectTemplate'

export interface ProjectTemplateStore {
  templates: Readonly<Ref<readonly ProjectTemplate[]>>
  builtinTemplates: ComputedRef<readonly ProjectTemplate[]>
  userTemplates: ComputedRef<readonly ProjectTemplate[]>
  warnings: Readonly<Ref<readonly TemplateCatalogWarning[]>>
  isLoading: Readonly<Ref<boolean>>
  error: Readonly<Ref<unknown>>
  load(): Promise<void>
  pickProjectParentDirectory(title: string): Promise<string | null>
  pickTemplateSourceFile(title: string): Promise<string | null>
  pickTemplateExportPath(defaultPath: string, title: string): Promise<string | null>
  findTemplate(key: ProjectTemplateKey): ProjectTemplate | null
  inspectProjectSource(sourcePath: string): Promise<TemplateProjectInspection>
  importUserTemplate(sourcePath: string): Promise<ProjectTemplate>
  createUserTemplate(request: CreateUserTemplateRequest): Promise<ProjectTemplate>
  exportProjectTemplate(request: ExportProjectTemplateRequest): Promise<string>
  deleteUserTemplate(path: string): Promise<void>
  createProject(request: CreateProjectFromTemplateRequest): Promise<CreatedProject>
}

export function createProjectTemplateStore(
  service: ProjectTemplateService = projectTemplateService,
): ProjectTemplateStore {
  const templates = ref<ProjectTemplate[]>([])
  const warnings = ref<TemplateCatalogWarning[]>([])
  const isLoading = ref(false)
  const error = ref<unknown>(null)
  let loadPromise: Promise<void> | null = null

  const builtinTemplates = computed(() => templates.value.filter((template) => template.source === 'builtin'))
  const userTemplates = computed(() => templates.value.filter((template) => template.source === 'user'))

  async function load(): Promise<void> {
    if (loadPromise) return await loadPromise
    isLoading.value = true
    loadPromise = (async () => {
      try {
        const catalog = await service.loadCatalog()
        templates.value = catalog.templates
        warnings.value = catalog.warnings
        error.value = null
      } catch (cause) {
        error.value = cause
        throw cause
      } finally {
        isLoading.value = false
        loadPromise = null
      }
    })()
    await loadPromise
  }

  async function waitForCatalogIdle(): Promise<void> {
    while (loadPromise) {
      await loadPromise
    }
  }

  function findTemplate(key: ProjectTemplateKey): ProjectTemplate | null {
    return templates.value.find((template) => template.key === key) ?? null
  }

  async function inspectProjectSource(sourcePath: string): Promise<TemplateProjectInspection> {
    return await service.inspectProjectSource(sourcePath)
  }

  async function pickProjectParentDirectory(title: string): Promise<string | null> {
    return await service.pickProjectParentDirectory(title)
  }

  async function pickTemplateSourceFile(title: string): Promise<string | null> {
    return await service.pickTemplateSourceFile(title)
  }

  async function pickTemplateExportPath(defaultPath: string, title: string): Promise<string | null> {
    return await service.pickTemplateExportPath(defaultPath, title)
  }

  async function importUserTemplate(sourcePath: string): Promise<ProjectTemplate> {
    await waitForCatalogIdle()
    const imported = await service.importUserTemplate(sourcePath)
    await waitForCatalogIdle()
    await load()
    return findTemplate(imported.key) ?? imported
  }

  async function createUserTemplate(request: CreateUserTemplateRequest): Promise<ProjectTemplate> {
    await waitForCatalogIdle()
    const created = await service.createUserTemplate(request)
    await waitForCatalogIdle()
    await load()
    return findTemplate(created.key) ?? created
  }

  async function exportProjectTemplate(request: ExportProjectTemplateRequest): Promise<string> {
    return await service.exportProjectTemplate(request)
  }

  async function deleteUserTemplate(path: string): Promise<void> {
    await waitForCatalogIdle()
    await service.deleteUserTemplate(path)
    await waitForCatalogIdle()
    await load()
  }

  async function createProject(request: CreateProjectFromTemplateRequest): Promise<CreatedProject> {
    return await service.createProject(request)
  }

  return {
    templates: readonly(templates),
    builtinTemplates,
    userTemplates,
    warnings: readonly(warnings),
    isLoading: readonly(isLoading),
    error: readonly(error),
    load,
    pickProjectParentDirectory,
    pickTemplateSourceFile,
    pickTemplateExportPath,
    findTemplate,
    inspectProjectSource,
    importUserTemplate,
    createUserTemplate,
    exportProjectTemplate,
    deleteUserTemplate,
    createProject,
  }
}

const projectTemplateStore = createProjectTemplateStore()

export function useProjectTemplateStore(): ProjectTemplateStore {
  return projectTemplateStore
}
