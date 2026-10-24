import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectConfigEditor from './ProjectConfigEditor.vue'
import ProjectCoverField from './ProjectCoverField.vue'
import ProjectExportTaskEditor from './ProjectExportTaskEditor.vue'
import OcOptionGroup from '../standard/OcOptionGroup.vue'
import { useAppStateStore } from '../../features/app-state/store/appStateStore'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, te: () => false }) }))
vi.mock('./MonacoEditor.vue', () => ({ default: { template: '<div class="monaco-stub" />' } }))
vi.mock('../../features/workspace/store/projectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/store/projectStore')>()
  const store = actual.useProjectStore()
  return { ...actual, useProjectStore: () => store }
})
vi.mock('../../features/workspace/services/projectIconCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconCatalog')>()
  return {
    ...actual,
    buildProjectIconCatalog: vi.fn(() => ({ series: [], entries: [] })),
  }
})

function draft(wrapper: ReturnType<typeof mount>) {
  const session = (wrapper as unknown as { props: (name: string) => { state: { draftContent: string } } }).props('session')
  return JSON.parse(session.state.draftContent)
}

describe('ProjectConfigEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStateStore().updateProjects({ workspaces: {} })
  })

  it('edits the project name, description, and version', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: JSON.stringify({ name: 'Demo', description: 'Info', version: '1.0.0' }) }) },
    })

    await wrapper.get('[data-field-key="version"] input').setValue('2.0.0')

    expect(draft(wrapper)).toEqual({ name: 'Demo', description: 'Info', version: '2.0.0' })
  })

  it('omits empty profile fields', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{"name":"Demo"}' }) },
    })

    await wrapper.get('[data-field-key="name"] input').setValue('')

    expect(draft(wrapper)).toEqual({})
  })

  it('edits the project HTTPS host allowlist with custom controls', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })

    wrapper.getComponent(OcOptionGroup).vm.$emit('update:modelValue', 'allowlist')
    await wrapper.vm.$nextTick()
    await wrapper.get('.project-profile-editor__add-host').trigger('click')
    await wrapper.get('.project-profile-editor__host-row input').setValue('images.example.com')
    await wrapper.get('.project-profile-editor__add-host').trigger('click')
    await wrapper.findAll('.project-profile-editor__host-row input')[1]!.setValue('*.cdn.example.com')

    expect(draft(wrapper).remoteResources).toEqual({
      mode: 'allowlist',
      allowedHosts: ['images.example.com', '*.cdn.example.com'],
    })
  })

  it('stores allow-all without host entries', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })

    wrapper.getComponent(OcOptionGroup).vm.$emit('update:modelValue', 'allow-all')
    await wrapper.vm.$nextTick()

    expect(draft(wrapper).remoteResources).toEqual({ mode: 'allow-all' })
  })

  it('stores export fields as the default export configuration', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })
    const task = {
      documentPaths: ['cards/main.ocdocument'],
      selectionMode: 'blueprint',
      scale: 1,
      layoutMode: 'none',
      outputDirectory: 'D:/exports',
      conflictMode: 'replace',
      errorPolicy: 'continue',
    } as const

    wrapper.getComponent(ProjectExportTaskEditor).vm.$emit('update:modelValue', task)
    await wrapper.vm.$nextTick()

    expect(draft(wrapper).exportTask).toEqual(task)
  })

  it('persists collapsed profile sections outside the document', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })

    await wrapper.get('#project-profile-section-information .project-config-section__toggle').trigger('click')

    expect(wrapper.get('#project-profile-section-information-content').attributes('aria-hidden')).toBe('true')
    expect(wrapper.props('session').state.isDirty).toBe(false)
    expect(useAppStateStore().state.value.projects.workspaces['D:/Demo']).toEqual({
      expandedDirectories: [],
      projectProfile: { collapsedSections: ['information'] },
    })
  })

  it('expands a collapsed section when navigating from the outline', async () => {
    useAppStateStore().updateProjects({
      workspaces: {
        'D:/Demo': {
          expandedDirectories: [],
          projectProfile: { collapsedSections: ['remote-resources'] },
        },
      },
    })
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })

    expect(wrapper.get('#project-profile-section-remote-resources-content').attributes('aria-hidden')).toBe('true')
    await wrapper.findAll('.project-profile-editor__outline-item')[1]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('#project-profile-section-remote-resources-content').attributes('aria-hidden')).toBe('false')
    expect(wrapper.props('session').state.isDirty).toBe(false)
    expect(useAppStateStore().state.value.projects.workspaces['D:/Demo']).toEqual({
      expandedDirectories: [],
    })
  })

  it('stores the cover as a project-relative path and clears it', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{"name":"Demo"}' }) },
    })

    wrapper.getComponent(ProjectCoverField).vm.$emit('update:modelValue', 'assets/cover.png')
    await wrapper.vm.$nextTick()
    expect(draft(wrapper)).toEqual({ name: 'Demo', cover: 'assets/cover.png' })

    wrapper.getComponent(ProjectCoverField).vm.$emit('update:modelValue', '')
    await wrapper.vm.$nextTick()
    expect(draft(wrapper)).toEqual({ name: 'Demo' })
  })

  it('emits the standard save command from Ctrl+S', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }) },
    })
    const save = vi.spyOn(wrapper.props('session'), 'save').mockResolvedValue('saved')

    await wrapper.get('.project-profile-editor').trigger('keydown', { ctrlKey: true, key: 's' })

    expect(save).toHaveBeenCalledOnce()
    expect(wrapper.vm.canSave).toBe(true)
  })
})
