import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { createProjectForm } from '../composables/createProjectForm'
import CreateProjectWorkspace from './CreateProjectWorkspace.vue'
import type { ProjectTemplateStore } from '../store/projectTemplateStore'
import type { ProjectTemplateKey } from '../model/projectTemplate'

const template = { key: 'builtin:blank', id: 'blank', source: 'builtin', name: 'Blank', description: '', entry: 'main.ocdocument',
  entries: ['main.ocdocument', 'other.ocdocument'], rootPath: '/templates/blank', contentPath: '/templates/blank/content', coverPaths: [] } as const
const store = {
  findTemplate: () => template, isLoading: ref(false), warnings: ref([]), load: async () => {},
  pickProjectParentDirectory: vi.fn(async () => '/projects'),
  createProject: vi.fn(async () => ({ path: '/projects/demo', entry: '/projects/demo/other.ocdocument' })),
} as unknown as ProjectTemplateStore
const settings = { settings: ref({ projectCreation: { lastParentPath: '/initial' } }), updateProjectCreation: vi.fn() }
vi.mock('../store/projectTemplateStore', () => ({ useProjectTemplateStore: () => store }))
vi.mock('../../settings/store/appSettingsStore', () => ({ useAppSettingsStore: () => settings }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => path }))

it('retains edited form state through content remount and submits the selected entry', async () => {
  const visible = ref(true)
  const onCreated = vi.fn(async () => {})
  let model!: ReturnType<typeof createProjectForm>
  const wrapper = mount(defineComponent({ setup() {
    model = createProjectForm({ selectedKey: ref<ProjectTemplateKey | null>('builtin:blank'), externalBusy: ref(false), onBusy: () => {}, onCreated })
    return () => visible.value ? h(CreateProjectWorkspace, { model, attachedResourcePackages: [] }) : null
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  try {
    await flushPromises()
    model.projectName.value = 'demo'
    model.selectedEntry.value = 'other.ocdocument'
    await model.chooseParentDirectory()
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
