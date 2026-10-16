import { describe, expect, it, vi } from 'vitest'
import type { ProjectTemplate } from '../model/projectTemplate'
import type { ProjectTemplateService } from '../services/projectTemplateService'
import { createProjectTemplateStore } from './projectTemplateStore'

function template(
  id: string,
  source: ProjectTemplate['source'],
  name: string,
): ProjectTemplate {
  return {
    schemaVersion: 1,
    id,
    key: `${source}:${id}`,
    source,
    name,
    description: '',
    entry: 'main.ocdocument',
    rootPath: `/${source}/${id}`,
    contentPath: `/${source}/${id}/content`,

    coverPaths: [],
  }
}

function mockService(overrides: Record<string, unknown> = {}): ProjectTemplateService {
  return {
    loadCatalog: vi.fn(async () => ({ templates: [], warnings: [] })),
    pickProjectParentDirectory: vi.fn(async () => null),
    pickTemplateSourceFile: vi.fn(async () => null),
    pickTemplateExportPath: vi.fn(async () => null),
    inspectProjectSource: vi.fn(),
    importUserTemplate: vi.fn(),
    createUserTemplate: vi.fn(),
    exportProjectTemplate: vi.fn(),
    deleteUserTemplate: vi.fn(),
    createProject: vi.fn(),
    ...overrides,
  } as unknown as ProjectTemplateService
}

describe('projectTemplateStore', () => {
  it('loads catalog state and exposes source-specific views', async () => {
    const builtin = template('shared', 'builtin', 'Built in')
    const user = template('shared', 'user', 'Personal')
    const service = mockService({
      loadCatalog: vi.fn(async () => ({
        templates: [builtin, user],
        warnings: [{ path: '/bad', reason: 'Invalid manifest' }],
      })),
    })
    const store = createProjectTemplateStore(service)

    await store.load()

    expect(store.builtinTemplates.value).toEqual([builtin])
    expect(store.userTemplates.value).toEqual([user])
    expect(store.findTemplate('builtin:shared')).toEqual(builtin)
    expect(store.findTemplate('user:shared')).toEqual(user)
    expect(store.warnings.value).toHaveLength(1)
    expect(store.error.value).toBeNull()
  })

  it('reloads catalog after importing and deleting a user template', async () => {
    const builtin = template('blank', 'builtin', 'Blank')
    const imported = template('personal', 'user', 'Personal')
    const catalogImported = { ...imported, description: 'Reloaded from disk' }
    const loadCatalog = vi.fn()
      .mockResolvedValueOnce({ templates: [builtin], warnings: [] })
      .mockResolvedValueOnce({ templates: [builtin, catalogImported], warnings: [] })
      .mockResolvedValueOnce({ templates: [builtin], warnings: [] })
    const service = mockService({
      loadCatalog,
      importUserTemplate: vi.fn(async () => imported),
      deleteUserTemplate: vi.fn(async () => undefined),
    })
    const store = createProjectTemplateStore(service)
    await store.load()

    const result = await store.importUserTemplate('/source')
    expect(result).toEqual(catalogImported)
    expect(store.userTemplates.value).toEqual([catalogImported])

    await store.deleteUserTemplate(catalogImported.rootPath)
    expect(store.userTemplates.value).toEqual([])
    expect(loadCatalog).toHaveBeenCalledTimes(3)
  })

  it('waits for an in-flight catalog load before mutating and then reloads', async () => {
    const builtin = template('blank', 'builtin', 'Blank')
    const imported = template('personal', 'user', 'Personal')
    let resolveInitialLoad: ((value: { templates: ProjectTemplate[]; warnings: never[] }) => void) | undefined
    const initialLoad = new Promise<{ templates: ProjectTemplate[]; warnings: never[] }>((resolve) => {
      resolveInitialLoad = resolve
    })
    const loadCatalog = vi.fn()
      .mockReturnValueOnce(initialLoad)
      .mockResolvedValueOnce({ templates: [builtin, imported], warnings: [] })
    const importUserTemplate = vi.fn(async () => imported)
    const store = createProjectTemplateStore(mockService({ loadCatalog, importUserTemplate }))

    const loading = store.load()
    const importing = store.importUserTemplate('/source')
    await Promise.resolve()
    expect(importUserTemplate).not.toHaveBeenCalled()

    resolveInitialLoad?.({ templates: [builtin], warnings: [] })
    await loading
    await importing

    expect(loadCatalog).toHaveBeenCalledTimes(2)
    expect(store.userTemplates.value).toEqual([imported])
  })
})
