import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { expect, it, vi } from 'vitest'
import enUS from '../../../locales/en-US'
import ShellSidebarContent from '../components/ShellSidebarContent.vue'
import { useCreateProjectPageState } from './useCreateProjectPageState'

const templatePath = '/app/templates/broken'
const packagePath = '/app/packages/broken.ocpack'
const templates = {
  templates: ref([]), builtinTemplates: ref([]), userTemplates: ref([]), isLoading: ref(false),
  warnings: ref([{ path: templatePath, reason: 'Invalid template JSON' }]),
  findTemplate: () => null,
  deleteUserTemplate: vi.fn(async (_path: string) => { templates.warnings.value = [] }),
}
const packages = {
  packs: ref([{ path: '/app/packages/valid.ocpack', title: 'Valid package', coordinate: 'test/valid@1', fingerprint: 'abc' }]),
  isLoading: ref(false), load: async () => {}, findPackage: () => null,
  warnings: ref([{ path: packagePath, reason: 'Invalid package archive' }]),
  removePackage: vi.fn(async (_path: string) => { packages.warnings.value = [] }),
}
vi.mock('../../project-templates/store/projectTemplateStore', () => ({ useProjectTemplateStore: () => templates }))
vi.mock('../../workspace/store/storedResourcePackageStore', () => ({ useStoredResourcePackageStore: () => packages }))
vi.mock('../../workspace/services/builtinResourcePackageCatalog', () => ({ loadBuiltinResourcePackages: async () => ({
  packs: [], warnings: [{ path: '/resources/packages/broken.ocpack', reason: 'Broken built-in package' }],
}) }))
vi.mock('../../notifications/titlebarNotices', () => ({ notifyAppError: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn() }))
vi.mock('../../logging/appOutput', () => ({ publishAppOutput: vi.fn() }))

it('keeps unusable rows unselectable while allowing confirmed deletion by path through real sidebar trees', async () => {
  const confirm = vi.fn(async () => false)
  let state!: ReturnType<typeof useCreateProjectPageState>
  const wrapper = mount(defineComponent({ setup() {
    state = useCreateProjectPageState({
      projectStore: {} as Parameters<typeof useCreateProjectPageState>[0]['projectStore'],
      isCreateProjectMode: ref(true), isActivatingProject: ref(false),
      requestConfirmation: confirm, enterCreateProject: () => {},
    })
    return () => h('div', state.section.value.flatMap(group => group.lists.map(list => h(ShellSidebarContent, { key: list.key, list }))))
  } }), { attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })] },
  })
  try {
    await flushPromises()
    const valid = wrapper.findAll('.oc-tree__row').find(row => row.text().includes('Valid package'))!
    expect(valid.findAll('.oc-node-tail__action')).toHaveLength(2)
    expect(valid.findAll('.oc-node-tail__action--always')).toHaveLength(1)
    const invalidRows = wrapper.findAll('.oc-tree__row').filter(row => row.attributes('aria-disabled') === 'true' && row.attributes('data-tooltip'))
    expect(invalidRows).toHaveLength(3)
    for (const row of invalidRows) expect(row.find('.oc-text--tone-danger').exists()).toBe(true)
    const builtin = invalidRows.find(row => row.attributes('data-tooltip') === 'Broken built-in package')!
    expect(builtin.find('button').exists()).toBe(false)
    for (const [reason, path, remove] of [
      ['Invalid template JSON', templatePath, templates.deleteUserTemplate],
      ['Invalid package archive', packagePath, packages.removePackage],
    ] as const) {
      const row = invalidRows.find(candidate => candidate.attributes('data-tooltip') === reason)!
      await row.trigger('click')
      expect(state.selectedTemplateKey.value).toBeNull()
      expect(state.selectedResourcePackageKeys.value).toEqual([])
      expect(row.findAll('button')).toHaveLength(1)
      await row.get('button').trigger('click')
      await flushPromises()
      expect(remove).not.toHaveBeenCalled()
      confirm.mockResolvedValueOnce(true)
      await row.get('button').trigger('click')
      await flushPromises()
      expect(remove).toHaveBeenCalledExactlyOnceWith(path)
      expect(wrapper.findAll('.oc-tree__row').some(candidate => candidate.attributes('data-tooltip') === reason)).toBe(false)
    }
  } finally { wrapper.unmount() }
})
