import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { computed, ref, type Ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import { TemplateServiceError } from '../model/projectTemplate'
import type {
  CreatedProject,
  ProjectTemplate,
  ProjectTemplateKey,
  TemplateCatalogWarning,
  TemplateProjectInspection,
} from '../model/projectTemplate'
import type { ProjectTemplateStore } from '../store/projectTemplateStore'
import CreateProjectWorkspace from './CreateProjectWorkspace.vue'

let store: ProjectTemplateStore
let catalogWarnings: Ref<TemplateCatalogWarning[]>
let appSettingsStore: {
  settings: Ref<{ projectCreation: { lastParentPath: string } }>
  updateProjectCreation: ReturnType<typeof vi.fn>
}

const notifications = vi.hoisted(() => ({ notifyError: vi.fn(), notifyWarning: vi.fn() }))
const output = vi.hoisted(() => ({ publishAppOutput: vi.fn() }))

vi.mock('../../notifications/titlebarNotices', () => ({
  notifyError: notifications.notifyError,
  notifyWarning: notifications.notifyWarning,
}))

vi.mock('../../logging/appOutput', () => ({ publishAppOutput: output.publishAppOutput }))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => 'asset://' + path,
}))

vi.mock('../../settings/store/appSettingsStore', () => ({
  useAppSettingsStore: () => appSettingsStore,
}))

vi.mock('../store/projectTemplateStore', () => ({
  useProjectTemplateStore: () => store,
}))


const messages = {
  projectTemplates: {
    title: 'New Project',
    subtitle: 'Create from a template',
    catalogLabel: 'Template details',
    formTitle: 'Project',
    sections: {
      builtin: 'Built-in templates', user: 'My templates',
    },
    actions: {
      back: 'Back',
      saveTemplate: 'Save template',
      import: 'Import template',
      confirmImport: 'Import',
      cancel: 'Cancel',
      delete: 'Delete',
      browse: 'Browse',
      create: 'Create project',
    },
    status: {
      loading: 'Loading',
      noResourcePackagesSelected: 'None',
      selectTemplate: 'Select a template',
      noDescription: 'No description',
      noInitialPage: 'None',
      chooseLocation: 'Choose a location',
      creating: 'Creating',
      skippedTemplates: 'Skipped {count}',
      skippedTemplate: 'Skipped {name}',
      creatingFromProject: 'Creating from project',
      noCoverCandidates: 'No covers',
    },
    sources: { builtin: 'Built in', user: 'Mine' },
    fields: {
      entry: 'Entry',
      templateName: 'Template name',
      description: 'Description',
      covers: 'Covers',
      projectName: 'Project name',
      location: 'Location',
      target: 'Target',
      resourcePackages: 'Add-on packages',
    },
    confirmDelete: 'Delete this template?',
    defaults: { projectName: 'Untitled Project' },
    dialogs: {
      chooseParent: 'Choose parent',
      chooseTemplatePackage: 'Choose package',
    },
    errors: {
      invalidCatalog: 'Invalid catalog',
      invalidManifest: 'Invalid manifest',
      invalidProjectName: 'Invalid project name',
      invalidTemplateName: 'Invalid template name',
      descriptionTooLong: 'Description too long',
      sourceNotProject: 'Source is not a project',
      sourceNotTemplate: 'Source is not a template',
      sourceHasSymlink: 'Source has a symlink',
      entryNotFound: 'Entry not found',
      coverNotFound: 'Cover not found',
      templateExists: 'Template exists',
      parentNotFound: 'Parent not found',
      targetExists: 'Target exists',
      builtinDeleteForbidden: 'Cannot delete built-in template',
      copyFailed: 'Copy failed',
      unknown: 'Unknown error',
    },
  },
}

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
    description: `${name} description`,
    entry: 'main.ocdocument',
    rootPath: `/${source}/${id}`,
    contentPath: `/${source}/${id}/content`,
    coverPaths: [],
  }
}

function createStore(templates: ProjectTemplate[]): ProjectTemplateStore {
  const templateList = ref(templates)
  catalogWarnings = ref<TemplateCatalogWarning[]>([])
  return {
    templates: templateList,
    builtinTemplates: computed(() => templateList.value.filter((item) => item.source === 'builtin')),
    userTemplates: computed(() => templateList.value.filter((item) => item.source === 'user')),
    warnings: catalogWarnings,
    isLoading: ref(false),
    error: ref(null),
    load: vi.fn(async () => undefined),
    pickProjectParentDirectory: vi.fn(async () => null),
    pickTemplateSourceFile: vi.fn(async () => null),
    pickTemplateExportPath: vi.fn(async () => null),
    findTemplate: vi.fn((key: ProjectTemplateKey) => (
      templateList.value.find((item) => item.key === key) ?? null
    )),
    inspectProjectSource: vi.fn(),
    importUserTemplate: vi.fn(),
    createUserTemplate: vi.fn(),
    exportProjectTemplate: vi.fn(),
    deleteUserTemplate: vi.fn(async () => undefined),
    createProject: vi.fn(async () => ({ path: '/projects/example', entry: '/projects/example/main.ocdocument' })),
  }
}

function mountWorkspace(
  selectedKey: ProjectTemplateKey | null,
): VueWrapper {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
  return mount(CreateProjectWorkspace, {
    props: { selectedKey },
    global: { plugins: [i18n] },
  })
}

describe('CreateProjectWorkspace', () => {
  const builtin = template('blank', 'builtin', 'Blank')
  const user = template('personal', 'user', 'Personal')

  beforeEach(() => {
    store = createStore([builtin, user])
    appSettingsStore = {
      settings: ref({ projectCreation: { lastParentPath: '/cached-projects' } }),
      updateProjectCreation: vi.fn(),
    }
    notifications.notifyError.mockClear()
    notifications.notifyWarning.mockClear()
    output.publishAppOutput.mockClear()
  })

  it('reports skipped catalog templates as a notice and output detail instead of page text', async () => {
    catalogWarnings.value = [
      { path: '/appdata/templates/broken-pack', reason: 'Invalid manifest' },
    ]
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    expect(notifications.notifyWarning).toHaveBeenCalledWith('Skipped 1')
    expect(output.publishAppOutput).toHaveBeenCalledWith({
      severity: 'warning',
      message: 'Skipped broken-pack',
      detail: '/appdata/templates/broken-pack: Invalid manifest',
    })
    expect(wrapper.text()).not.toContain('Skipped')
  })

  it('reports a catalog load failure as a notice and output detail instead of page text', async () => {
    vi.mocked(store.load).mockRejectedValueOnce(
      new TemplateServiceError('invalid-catalog', 'catalog unreadable'),
    )
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    expect(notifications.notifyError).toHaveBeenCalledWith('Invalid catalog')
    expect(output.publishAppOutput).toHaveBeenCalledWith({
      severity: 'error',
      message: 'Invalid catalog',
      detail: 'invalid-catalog: catalog unreadable',
    })
    expect(wrapper.text()).not.toContain('Invalid catalog')
  })

  it('starts with a default name and restores and updates the last parent path', async () => {
    vi.mocked(store.pickProjectParentDirectory).mockResolvedValue('/next-projects')
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    expect(wrapper.get<HTMLInputElement>('input[maxlength="80"]').element.value).toBe('Untitled Project')
    expect(wrapper.get<HTMLInputElement>('input[readonly]').element.value).toBe('/cached-projects')

    await wrapper.findAll('button').find((button) => button.text().includes('Browse'))!.trigger('click')
    await flushPromises()

    expect(appSettingsStore.updateProjectCreation).toHaveBeenCalledWith({
      lastParentPath: '/next-projects',
    })
    expect(wrapper.get<HTMLInputElement>('input[readonly]').element.value).toBe('/next-projects')
  })

  it('uses selectedKey for the details panel', async () => {
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    expect(wrapper.get('.create-project__details').text()).toContain('Blank')

    await wrapper.setProps({ selectedKey: user.key })

    expect(wrapper.get('.create-project__details').text()).toContain('Personal')
  })

  it('lists the add-on packages that will be installed into the new project', async () => {
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    expect(wrapper.find('.create-project__resource-package-list').exists()).toBe(false)

    await wrapper.setProps({
      attachedResourcePackages: [
        { path: '/app/packages/theme.ocpack', key: 'theme', name: 'Theme Pack', version: '1.0.0' },
        { path: '/app/packages/extra.ocpack', key: 'extra', name: 'Extra Pack', version: '2.1.0' },
      ],
    })
    await flushPromises()

    const list = wrapper.get('.create-project__resource-package-list')
    expect(list.findAll('li').map((item) => item.text())).toEqual(['Theme Pack', 'Extra Pack'])
  })

  it('disables creation until template, project name, and parent location are complete', async () => {
    appSettingsStore.settings.value.projectCreation.lastParentPath = ''
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()
    const submit = () => wrapper.get<HTMLButtonElement>('button[type="submit"]')

    expect(submit().element.disabled).toBe(true)
    await wrapper.get<HTMLInputElement>('input[maxlength="80"]').setValue('Example')
    expect(submit().element.disabled).toBe(true)

    vi.mocked(store.pickProjectParentDirectory).mockResolvedValue('/projects')
    await wrapper.findAll('button').find((button) => button.text().includes('Browse'))!.trigger('click')
    await flushPromises()
    expect(submit().element.disabled).toBe(false)

    await wrapper.setProps({ selectedKey: null })
    expect(submit().element.disabled).toBe(true)
  })

  it('imports a prepared template package without opening a metadata form', async () => {
    vi.mocked(store.pickTemplateSourceFile).mockResolvedValue('/packages/prepared.octemplate')
    vi.mocked(store.importUserTemplate).mockResolvedValue(user)
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    await (wrapper.vm as unknown as { beginImport(): Promise<void> }).beginImport()
    await flushPromises()

    expect(store.pickTemplateSourceFile).toHaveBeenCalledWith('Choose package')
    expect(store.importUserTemplate).toHaveBeenCalledWith('/packages/prepared.octemplate')
    expect(wrapper.emitted('update:selectedKey')).toEqual([[user.key]])
    expect(wrapper.find('.create-project__template-editor').exists()).toBe(false)
  })

  it('creates a template from the current project with selected cover images', async () => {
    const inspection: TemplateProjectInspection = {
      sourcePath: '/source/project',
      suggestedName: 'Imported project',
      entries: ['cards.ocdocument', 'tokens.ocdocument'],
      entryNames: { 'cards.ocdocument': 'Cards', 'tokens.ocdocument': 'Tokens' },
      coverCandidates: ['assets/cover-a.png', 'assets/cover-b.webp'],
    }
    vi.mocked(store.inspectProjectSource).mockResolvedValue(inspection)
    vi.mocked(store.createUserTemplate).mockResolvedValue(user)
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    await (wrapper.vm as unknown as { beginCreateTemplate(path: string): Promise<void> })
      .beginCreateTemplate(inspection.sourcePath)
    await flushPromises()

    const editor = wrapper.get('.create-project__template-editor')
    expect(store.inspectProjectSource).toHaveBeenCalledWith(inspection.sourcePath)
    expect(editor.getComponent(OcSelect).props('options')).toEqual([
      { value: 'cards.ocdocument', label: 'Cards' },
      { value: 'tokens.ocdocument', label: 'Tokens' },
    ])

    await editor.findAllComponents(OcCheckbox)[1]!.get('input').setValue(true)
    await editor.findAll('button').find((button) => button.text() === 'Save template')!.trigger('click')
    await flushPromises()

    expect(store.createUserTemplate).toHaveBeenCalledWith({
      sourcePath: inspection.sourcePath,
      name: inspection.suggestedName,
      description: '',
      entry: inspection.entries[0],
      entries: [inspection.entries[0]],
      covers: ['assets/cover-b.webp'],
    })
    expect(wrapper.emitted('update:selectedKey')).toEqual([[user.key]])
    expect(wrapper.find('.create-project__template-editor').exists()).toBe(false)
  })

  it('crossfades through all covers of the selected template', async () => {
    vi.useFakeTimers()
    const covered = {
      ...builtin,
      coverPaths: ['/covers/first.png', '/covers/second.webp'],
    }
    store = createStore([covered])
    const wrapper = mountWorkspace(covered.key)

    try {
      await flushPromises()
      expect(wrapper.get('.create-project__catalog-cover img').attributes('src'))
        .toBe('asset:///covers/first.png')

      await vi.advanceTimersByTimeAsync(4500)
      await wrapper.vm.$nextTick()

      expect(wrapper.get('.create-project__catalog-cover img').attributes('src'))
        .toBe('asset:///covers/second.webp')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('emits the created project returned by the store', async () => {
    const created: CreatedProject = {
      path: '/projects/example',
      entry: '/projects/example/main.ocdocument',
    }
    vi.mocked(store.pickProjectParentDirectory).mockResolvedValue('/projects')
    vi.mocked(store.createProject).mockResolvedValue(created)
    const wrapper = mountWorkspace(builtin.key)
    await flushPromises()

    await wrapper.get<HTMLInputElement>('input[maxlength="80"]').setValue('Example')
    await wrapper.findAll('button').find((button) => button.text().includes('Browse'))!.trigger('click')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('created')).toEqual([[created]])
  })

  it('creates a project with the selected candidate entry', async () => {
    const multiEntry = {
      ...builtin,
      entries: ['main.ocdocument', 'alternate.ocdocument'],
      entryNames: { 'main.ocdocument': 'Main Blueprint', 'alternate.ocdocument': 'Alternate Blueprint' },
    }
    store = createStore([multiEntry])
    const wrapper = mountWorkspace(multiEntry.key)
    await flushPromises()

    const entrySelect = wrapper.get('.create-project__form').getComponent(OcSelect)
    expect(entrySelect.props('options')).toEqual([
      { value: '', label: 'None' },
      { value: 'main.ocdocument', label: 'Main Blueprint' },
      { value: 'alternate.ocdocument', label: 'Alternate Blueprint' },
    ])

    entrySelect.vm.$emit('update:modelValue', 'alternate.ocdocument')
    await wrapper.vm.$nextTick()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(store.createProject).toHaveBeenCalledWith(expect.objectContaining({
      template: multiEntry,
      entry: 'alternate.ocdocument',
    }))
  })

})
