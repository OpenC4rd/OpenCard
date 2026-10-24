import { defineComponent, h, ref, type VNodeChild } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { createProjectForm } from '../composables/createProjectForm'
import CreateProjectPageContent from './CreateProjectPageContent.vue'
import type { ProjectTemplateStore } from '../store/projectTemplateStore'
import type { ProjectTemplateKey } from '../model/projectTemplate'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import { tutorials } from '../../tutorials/tutorials'
import { createCreateProjectPage } from '../../shell/composables/createCreateProjectPage'
import type { useAppProjectLifecycle } from '../../shell/composables/useAppProjectLifecycle'

const template = {
  key: 'builtin:blank', id: 'blank', source: 'builtin', name: 'Blank', description: '',
  entry: 'main.ocdocument', entries: ['main.ocdocument', 'other.ocdocument'],
  rootPath: '/templates/blank', contentPath: '/templates/blank/content', coverPaths: [],
} as const
const store = {
  findTemplate: () => template, isLoading: ref(false), warnings: ref([]), load: async () => {},
  pickProjectParentDirectory: vi.fn(async () => '/projects'),
  createProject: vi.fn(async () => ({ path: '/projects/demo', entry: '/projects/demo/other.ocdocument' })),
} as unknown as ProjectTemplateStore
const isCreateProject = ref(false)
const appState = {
  state: ref({ projects: { lastParentPath: '/initial' } }),
  updateProjects: vi.fn(),
}
const settings = {
  isReady: ref(true),
  settings: ref({ tutorials: { seen: [] as string[] } }),
  updateSetting: vi.fn((_key: string, value: string[]) => {
    settings.settings.value.tutorials.seen = [...new Set(value)]
  }),
}
vi.mock('../../settings/store/appSettingsStore', () => ({ useAppSettingsStore: () => settings }))
vi.mock('../store/projectTemplateStore', () => ({ useProjectTemplateStore: () => store }))
vi.mock('../../app-state/store/appStateStore', () => ({ useAppStateStore: () => appState }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => path }))

vi.mock('../../workspace/store/projectStore', () => ({ useProjectStore: () => ({}) }))
vi.mock('../../shell/composables/useShellNavigation', () => ({ useShellNavigation: () => ({ isCreateProject }) }))
vi.mock('../../shell/composables/useCreateProjectPageState', () => ({
  useCreateProjectPageState: () => ({
    selectedTemplateKey: ref('builtin:blank'), isCreateProjectOperationBusy: ref(false),
    installAttachedResourcePackages: async () => {}, attachedResourcePackages: ref([]),
    section: ref([]),
  }),
}))

function mountPage(setup: () => () => VNodeChild) {
  return mount(defineComponent({ setup }), {
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
}

function createPageModel(onCreated: (project: unknown) => Promise<boolean>): ReturnType<typeof createProjectForm> {
  return createCreateProjectPage({
    isActivating: ref(false), activateCreatedProject: onCreated,
  } as ReturnType<typeof useAppProjectLifecycle>).page.contentProps.value.model as ReturnType<typeof createProjectForm>
}

beforeEach(() => {
  useTutorialStore().exit()
  isCreateProject.value = false
  settings.isReady.value = true
  settings.settings.value.tutorials.seen = []
  vi.mocked(store.createProject).mockClear()
  appState.updateProjects.mockClear()
})
afterEach(() => { useTutorialStore().exit(); vi.restoreAllMocks() })

it('starts the guide on the first creation-page visit after state is ready and does not reopen after exit', async () => {
  const tutorial = useTutorialStore()
  settings.isReady.value = false
  const wrapper = mountPage(() => {
    const model = createPageModel(async () => true)
    return () => isCreateProject.value ? h(CreateProjectPageContent, { model, attachedResourcePackages: [] }) : null
  })
  try {
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
    isCreateProject.value = true
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
    settings.isReady.value = true
    await flushPromises()
    expect(tutorial.session.value?.step.id).toBe('template')
    expect(settings.settings.value.tutorials.seen).toEqual(['welcome'])
    tutorial.exit()
    isCreateProject.value = false
    await flushPromises()
    isCreateProject.value = true
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
  } finally { wrapper.unmount() }
})

it('hands the final overview step over to the creation guide on entering the creation page', async () => {
  const tutorial = useTutorialStore()
  tutorial.start('overview')
  for (const step of tutorials.overview.steps) {
    if (step.id === 'new-project') break
    const session = tutorial.session.value!
    tutorial.completeStep('overview', session.step.id, session.run)
  }
  expect(tutorial.session.value?.step.id).toBe('new-project')

  const wrapper = mountPage(() => {
    createPageModel(async () => true)
    return () => null
  })
  try {
    isCreateProject.value = true
    await flushPromises()

    expect(tutorial.session.value?.tutorialId).toBe('welcome')
    expect(tutorial.session.value?.step.id).toBe('template')
  } finally { wrapper.unmount() }
})

it('keeps the edited form state across a remount and submits the selected entry', async () => {
  const visible = ref(true)
  const onCreated = vi.fn(async () => true)
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mountPage(() => {
    model = createProjectForm({
      selectedKey: ref<ProjectTemplateKey | null>('builtin:blank'),
      externalBusy: ref(false), onBusy: () => {}, onCreated,
    })
    return () => visible.value ? h(CreateProjectPageContent, { model, attachedResourcePackages: [] }) : null
  })
  try {
    await flushPromises()
    await wrapper.get('input').setValue('bad/name')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    await wrapper.get('input').setValue('demo')
    const entry = wrapper.get('[role="combobox"]')
    await entry.trigger('keydown', { key: 'ArrowDown' })
    await entry.trigger('keydown', { key: 'End' })
    await entry.trigger('keydown', { key: 'Enter' })
    expect(model.selectedEntry.value).toBe('other.ocdocument')
    await model.chooseParentDirectory()
    expect(appState.updateProjects).toHaveBeenCalledWith({ lastParentPath: '/projects' })
    visible.value = false
    await flushPromises()
    visible.value = true
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('demo')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.createProject).toHaveBeenCalledWith({
      template, parentPath: '/projects', projectName: 'demo', entry: 'other.ocdocument',
    })
    expect(onCreated).toHaveBeenCalledWith({ path: '/projects/demo', entry: '/projects/demo/other.ocdocument' })
    model.reset()
    expect(model.projectName.value).toBe('Untitled Project')
  } finally { wrapper.unmount() }
})

it('finishes the welcome guide only after the project is created and activated', async () => {
  const tutorial = useTutorialStore()
  tutorial.start('welcome')
  let activate!: (value: boolean) => void
  const onCreated = vi.fn(() => new Promise<boolean>(resolve => { activate = resolve }))
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mountPage(() => {
    model = createPageModel(onCreated)
    return () => h('div')
  })
  try {
    await flushPromises()
    const declined = model.createProject()
    await flushPromises()
    expect(tutorial.session.value?.step.id).toBe('create-project')
    // 用户在打开项目的确认里选择"不打开"：创建成功但向导不结束。
    activate(false)
    expect(await declined).toBe(false)
    expect(tutorial.session.value?.step.id).toBe('create-project')

    const accepted = model.createProject()
    await flushPromises()
    activate(true)
    await accepted
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
  } finally { wrapper.unmount() }
})

it('does not let an in-flight creation finish a restarted welcome guide', async () => {
  const tutorial = useTutorialStore()
  tutorial.start('welcome')
  let activate!: (value: boolean) => void
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mountPage(() => {
    model = createPageModel(() => new Promise<boolean>(resolve => { activate = resolve }))
    return () => h(CreateProjectPageContent, { model, attachedResourcePackages: [] })
  })
  try {
    await flushPromises()
    const pending = model.createProject()
    await flushPromises()
    expect(tutorial.session.value?.step.id).toBe('create-project')

    tutorial.exit()
    tutorial.start('welcome')
    activate(true)
    await pending

    expect(tutorial.session.value?.step.id).toBe('template')
  } finally { wrapper.unmount() }
})