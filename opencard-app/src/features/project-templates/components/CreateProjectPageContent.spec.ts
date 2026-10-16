import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { createProjectForm } from '../composables/createProjectForm'
import CreateProjectPageContent from './CreateProjectPageContent.vue'
import type { ProjectTemplateStore } from '../store/projectTemplateStore'
import type { ProjectTemplateKey } from '../model/projectTemplate'
import OcTutorial from '../../../components/standard/OcTutorial.vue'
import { useTutorialStore } from '../../tutorials/tutorialStore'
import { createCreateProjectPage } from '../../shell/composables/createCreateProjectPage'
import type { useAppProjectLifecycle } from '../../shell/composables/useAppProjectLifecycle'

const template = { key: 'builtin:blank', id: 'blank', source: 'builtin', name: 'Blank', description: '', entry: 'main.ocdocument',
  entries: ['main.ocdocument', 'other.ocdocument'], rootPath: '/templates/blank', contentPath: '/templates/blank/content', coverPaths: [] } as const
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
  updateSetting: vi.fn((_key: string, value: string[]) => { settings.settings.value.tutorials.seen = [...new Set(value)] }),
}
vi.mock('../../settings/store/appSettingsStore', () => ({ useAppSettingsStore: () => settings }))
vi.mock('../store/projectTemplateStore', () => ({ useProjectTemplateStore: () => store }))
vi.mock('../../app-state/store/appStateStore', () => ({ useAppStateStore: () => appState }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => path }))

vi.mock('../../workspace/store/projectStore', () => ({ useProjectStore: () => ({}) }))
vi.mock('../../shell/composables/useShellNavigation', () => ({ useShellNavigation: () => ({ isCreateProject }) }))
vi.mock('../../shell/composables/useCreateProjectPageState', () => ({ useCreateProjectPageState: () => ({
  selectedTemplateKey: ref('builtin:blank'), isCreateProjectOperationBusy: ref(false),
  installAttachedResourcePackages: async () => {}, attachedResourcePackages: ref([]), section: ref([]),
}) }))

function createPageModel(onCreated: (project: unknown) => Promise<boolean>): ReturnType<typeof createProjectForm> {
  return createCreateProjectPage({ isActivating: ref(false), activateCreatedProject: onCreated } as ReturnType<typeof useAppProjectLifecycle>)
    .page.contentProps.value.model as ReturnType<typeof createProjectForm>
}

beforeEach(() => {
  useTutorialStore().exit()
  isCreateProject.value = false
  settings.isReady.value = true
  settings.settings.value.tutorials.seen = []
  vi.mocked(store.createProject).mockClear()
})
afterEach(() => { useTutorialStore().exit(); vi.restoreAllMocks() })

it('starts the guide on the first creation-page visit after state is ready and does not reopen after exit', async () => {
  const tutorial = useTutorialStore()
  settings.isReady.value = false
  const wrapper = mount(defineComponent({ setup() {
    const model = createPageModel(async () => true)
    return () => isCreateProject.value ? h(CreateProjectPageContent, { model, attachedResourcePackages: [] }) : null
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
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
  for (let index = 0; index < 7; index++) {
    const session = tutorial.session.value!
    tutorial.completeStep('overview', session.step.id, session.run)
  }
  expect(tutorial.session.value?.step.id).toBe('new-project')
  const wrapper = mount(defineComponent({ setup() {
    createPageModel(async () => true)
    return () => null
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  try {
    isCreateProject.value = true
    await flushPromises()
    expect(tutorial.session.value?.tutorialId).toBe('welcome')
    expect(tutorial.session.value?.step.id).toBe('template')
  } finally { wrapper.unmount() }
})

it('retains edited form state through content remount and submits the selected entry', async () => {
  const visible = ref(true)
  const onCreated = vi.fn(async () => true)
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mount(defineComponent({ setup() {
    model = createProjectForm({ selectedKey: ref<ProjectTemplateKey | null>('builtin:blank'), externalBusy: ref(false), onBusy: () => {}, onCreated })
    return () => visible.value ? h(CreateProjectPageContent, { model, attachedResourcePackages: [] }) : null
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  try {
    await flushPromises()
    await wrapper.get('input').setValue('bad/name')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    await wrapper.get('input').setValue('demo')
    const entry = wrapper.get('[role="combobox"]')
    await entry.trigger('keydown', { key: 'ArrowDown' })
    await entry.trigger('keydown', { key: 'End' })
    await entry.trigger('keydown', { key: 'Enter' })
    await wrapper.get('[data-oc-tutorial="create-project.location"] button').trigger('click')
    await flushPromises()
    visible.value = false
    await flushPromises()
    visible.value = true
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('demo')
    expect(model.selectedEntry.value).toBe('other.ocdocument')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(store.createProject).toHaveBeenCalledWith({ template, parentPath: '/projects', projectName: 'demo', entry: 'other.ocdocument' })
    expect(onCreated).toHaveBeenCalledWith({ path: '/projects/demo', entry: '/projects/demo/other.ocdocument' })
    model.reset()
    expect(model.projectName.value).toBe('Untitled Project')
  } finally { wrapper.unmount() }
})

it('shows real form targets, handles remounts, and finishes only after successful creation and activation', async () => {
  // jsdom 只提供可见性，实际几何另在浏览器复核。
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 100, 30)] as unknown as DOMRectList)
  const tutorial = useTutorialStore()
  tutorial.start('welcome')
  tutorial.completeStep('welcome', 'template')
  tutorial.completeStep('welcome', 'packages')
  const visible = ref(true)
  const onCreated = vi.fn(async () => false)
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mount(defineComponent({ setup() {
    model = createPageModel(onCreated)
    return () => h('div', [
      visible.value ? h(CreateProjectPageContent, { model, attachedResourcePackages: [] }) : null,
      h(OcTutorial, { session: tutorial.session.value, onExit: tutorial.exit,
        onComplete: value => tutorial.completeStep(value.tutorialId, value.stepId, value.run) }),
    ])
  } }), { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  try {
    await flushPromises()
    visible.value = false
    await flushPromises()
    expect(document.querySelector('.oc-tutorial')?.textContent).toContain(enUS.tutorial.targetMissing)
    visible.value = true
    await flushPromises()
    expect(document.querySelectorAll('.oc-tutorial__mask mask rect[fill="black"]')).toHaveLength(2)
    expect(document.querySelectorAll('.oc-tutorial__connector')).toHaveLength(2)
    const surface = document.querySelector('.oc-tutorial')
    const next = [...document.querySelectorAll<HTMLButtonElement>('.oc-tutorial button')].find(button => button.textContent?.trim() === 'Next')!
    next.click()
    await flushPromises()
    expect(tutorial.session.value?.step.id).toBe('create-project')
    expect(document.querySelector('.oc-tutorial')).toBe(surface)
    vi.mocked(store.createProject).mockRejectedValueOnce(new Error('write failed'))
    await model.createProject()
    expect(onCreated).not.toHaveBeenCalled()
    expect(tutorial.session.value?.step.id).toBe('create-project')
    await model.createProject()
    expect(tutorial.session.value?.step.id).toBe('create-project')
    onCreated.mockResolvedValue(true)
    await model.createProject()
    await flushPromises()
    expect(tutorial.session.value).toBeNull()
    expect(document.querySelector('.oc-tutorial__mask')).toBeNull()
  } finally { wrapper.unmount() }
})

it('does not let an in-flight creation finish a restarted welcome guide', async () => {
  const tutorial = useTutorialStore()
  tutorial.start('welcome')
  let activate!: (value: boolean) => void
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mount(defineComponent({ setup() {
    model = createPageModel(() => new Promise<boolean>(resolve => { activate = resolve }))
    return () => h(CreateProjectPageContent, { model, attachedResourcePackages: [] })
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
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
