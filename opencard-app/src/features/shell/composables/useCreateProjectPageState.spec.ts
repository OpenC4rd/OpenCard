import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import { useCreateProjectPageState } from './useCreateProjectPageState'

const templatePath = '/app/templates/broken'
const packagePath = '/app/packages/broken.ocpack'

const templates = {
  templates: ref<{ key: string; source: string; rootPath: string }[]>([]),
  builtinTemplates: ref([]), userTemplates: ref([]), isLoading: ref(false),
  warnings: ref([{ path: templatePath, reason: 'Invalid template JSON' }]),
  findTemplate: vi.fn<(key: string) => { key: string; source: string; rootPath: string } | null>(() => null),
  deleteUserTemplate: vi.fn(async (_path: string) => { templates.warnings.value = [] }),
}
const packages = {
  packs: ref([{ path: '/app/packages/valid.ocpack', title: 'Valid package', coordinate: 'test/valid@1', fingerprint: 'abc' }]),
  isLoading: ref(false), load: async () => {},
  findPackage: vi.fn<(path: string) => unknown>(() => null),
  warnings: ref([{ path: packagePath, reason: 'Invalid package archive' }]),
  removePackage: vi.fn(async (_path: string) => { packages.warnings.value = [] }),
}
vi.mock('../../project-templates/store/projectTemplateStore', () => ({ useProjectTemplateStore: () => templates }))
vi.mock('../../workspace/store/storedResourcePackageStore', () => ({ useStoredResourcePackageStore: () => packages }))
vi.mock('../../workspace/services/builtinResourcePackageCatalog', () => ({ loadBuiltinResourcePackages: async () => ({
  packs: [], warnings: [{ path: '/resources/packages/broken.ocpack', reason: 'Broken built-in package' }],
}) }))
vi.mock('../../notifications/titlebarNotices', () => ({
  notifyAppError: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn(),
}))
vi.mock('../../logging/appOutput', () => ({ publishAppOutput: vi.fn() }))

function mountState(isActivatingProject = ref(false)) {
  const confirm = vi.fn(async () => false)
  let state!: ReturnType<typeof useCreateProjectPageState>
  const wrapper = mount(defineComponent({ setup() {
    state = useCreateProjectPageState({
      projectStore: {} as Parameters<typeof useCreateProjectPageState>[0]['projectStore'],
      isCreateProjectMode: ref(true), isActivatingProject,
      requestConfirmation: confirm, enterCreateProject: () => {},
    })
    return () => h('div')
  } }), { global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] } })
  return { state, confirm, wrapper }
}

beforeEach(() => {
  templates.warnings.value = [{ path: templatePath, reason: 'Invalid template JSON' }]
  packages.warnings.value = [{ path: packagePath, reason: 'Invalid package archive' }]
  templates.findTemplate.mockReturnValue(null)
  packages.findPackage.mockReturnValue(null)
  templates.deleteUserTemplate.mockClear()
  packages.removePackage.mockClear()
})

it('keeps unusable catalog rows out of the template selection', async () => {
  const { state, wrapper } = mountState()
  try {
    await state.handleTemplateSelectionChange({ triggerKey: templatePath, selectedKeys: [templatePath] })
    expect(state.selectedTemplateKey.value).toBeNull()

    templates.findTemplate.mockReturnValue({
      key: 'user:valid', source: 'user', rootPath: '/app/templates/valid',
    })
    await state.handleTemplateSelectionChange({ triggerKey: 'user:valid', selectedKeys: ['user:valid'] })
    expect(state.selectedTemplateKey.value).toBe('user:valid')
  } finally { wrapper.unmount() }
})

it('asks before deleting an unusable template and then deletes it by its source path', async () => {
  const { state, confirm, wrapper } = mountState()
  try {
    await state.handleTemplateAction({ key: templatePath, actionKey: 'template.remove', source: 'inline' })
    expect(confirm).toHaveBeenCalledOnce()
    expect(templates.deleteUserTemplate).not.toHaveBeenCalled()

    confirm.mockResolvedValueOnce(true)
    await state.handleTemplateAction({ key: templatePath, actionKey: 'template.remove', source: 'inline' })

    expect(templates.deleteUserTemplate).toHaveBeenCalledExactlyOnceWith(templatePath)
  } finally { wrapper.unmount() }
})

it('ignores a package removal for a path the library never reported', async () => {
  const { state, confirm, wrapper } = mountState()
  try {
    state.handleResourcePackageAction({ key: '/app/packages/unknown.ocpack', actionKey: 'resource-package.remove', source: 'inline' })
    expect(confirm).not.toHaveBeenCalled()

    state.handleResourcePackageAction({ key: packagePath, actionKey: 'resource-package.remove', source: 'inline' })
    expect(confirm).toHaveBeenCalledOnce()
  } finally { wrapper.unmount() }
})

it('refuses catalog actions while another project operation is running', async () => {
  const { state, confirm, wrapper } = mountState(ref(true))
  try {
    await state.handleTemplateAction({ key: templatePath, actionKey: 'template.remove', source: 'inline' })
    state.handleResourcePackageAction({ key: packagePath, actionKey: 'resource-package.remove', source: 'inline' })

    expect(confirm).not.toHaveBeenCalled()
    expect(templates.deleteUserTemplate).not.toHaveBeenCalled()
    expect(packages.removePackage).not.toHaveBeenCalled()
  } finally { wrapper.unmount() }
})
