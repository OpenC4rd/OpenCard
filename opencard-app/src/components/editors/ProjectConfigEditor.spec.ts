import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectConfigEditor from './ProjectConfigEditor.vue'
import ProjectConfigSection from './ProjectConfigSection.vue'
import ProjectCoverField from './ProjectCoverField.vue'
import ProjectExportTaskEditor from './ProjectExportTaskEditor.vue'
import OcOptionGroup from '../standard/OcOptionGroup.vue'
import OcButton from '../base/OcButton.vue'
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

describe('ProjectConfigEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStateStore().updateProjects({ workspaces: {} })
  })

  it('edits only project name, description, and version', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: JSON.stringify({ name: 'Demo', description: 'Info', version: '1.0.0' }) }),  },
    })

    expect(wrapper.vm.presentation).toEqual({
      title: 'projectConfig.title',
      description: 'projectConfig.description',
      icon: 'mdiFileCogOutline',
    })
    expect(wrapper.find('[data-field-key="extends"]').exists()).toBe(false)
    expect(wrapper.find('[data-field-key="globalvariables"]').exists()).toBe(false)
    expect(wrapper.find('.property-editor').exists()).toBe(false)
    await wrapper.get('[data-field-key="version"] input').setValue('2.0.0')

    const updates = wrapper.props('session').state.draftContent
    const updated = updates as string
    expect(JSON.parse(updated)).toEqual({ name: 'Demo', description: 'Info', version: '2.0.0' })
  })

  it('omits empty profile fields', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{"name":"Demo"}' }),  },
    })
    await wrapper.get('[data-field-key="name"] input').setValue('')
    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string)).toEqual({})
  })

  it('edits the project HTTPS host allowlist with custom controls', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
    })

    const modeControl = wrapper.getComponent(OcOptionGroup)
    expect(modeControl.props('fill')).toBe(true)
    expect(modeControl.classes()).toContain('project-profile-editor__remote-mode')
    modeControl.vm.$emit('update:modelValue', 'allowlist')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.project-profile-editor__field-caption [data-tooltip]').attributes('aria-label'))
      .toBe('projectConfig.remoteResources.hostHelp')
    await wrapper.get('.project-profile-editor__add-host').trigger('click')
    await wrapper.get('.project-profile-editor__host-row input').setValue('images.example.com')
    await wrapper.get('.project-profile-editor__add-host').trigger('click')
    await wrapper.findAll('.project-profile-editor__host-row input')[1]!.setValue('*.cdn.example.com')

    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string).remoteResources).toEqual({
      mode: 'allowlist',
      allowedHosts: ['images.example.com', '*.cdn.example.com'],
    })
  })

  it('stores allow-all without rendering a host list', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
    })

    wrapper.getComponent(OcOptionGroup).vm.$emit('update:modelValue', 'allow-all')
    await wrapper.vm.$nextTick()

    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string).remoteResources).toEqual({ mode: 'allow-all' })
    expect(wrapper.find('.project-profile-editor__host-list').exists()).toBe(false)
  })

  it('stores export fields only as the default export configuration', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
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
    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string).exportTask).toEqual(task)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
  })

  it('persists collapsed project-profile sections and exposes them in the outline', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
    })

    expect(wrapper.findAll('.project-profile-editor__outline-item')).toHaveLength(3)
    expect(wrapper.findAll('.project-profile-editor__outline-node')).toHaveLength(3)
    expect(wrapper.findAllComponents(ProjectConfigSection).map(section => section.props('contentIndent')))
      .toEqual(['single', 'single', 'single'])
    expect(wrapper.find('.project-profile-editor__outline').text()).not.toContain('projectConfig.outline.title')
    // 折叠箭头是这一层自己渲染的内容（走按钮的 icon 插槽），所以按元素断言而不是按钮的 prop。
    expect(wrapper.getComponent(ProjectConfigSection).getComponent(OcButton).find('.project-config-section__chevron').exists())
      .toBe(true)
    await wrapper.get('#project-profile-section-information .project-config-section__toggle').trigger('click')

    expect(wrapper.get('#project-profile-section-information-content').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[data-field-key="name"]').exists()).toBe(true)
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
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
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

  it('stores the project cover as a project-relative path', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{"name":"Demo"}' }),  },
    })

    expect(wrapper.get('[data-field-key="cover"]').text()).toContain('projectConfig.fields.cover')
    wrapper.getComponent(ProjectCoverField).vm.$emit('update:modelValue', 'assets/cover.png')
    await wrapper.vm.$nextTick()

    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string))
      .toEqual({ name: 'Demo', cover: 'assets/cover.png' })

    wrapper.getComponent(ProjectCoverField).vm.$emit('update:modelValue', '')
    await wrapper.vm.$nextTick()
    const cleared = wrapper.props('session').state.draftContent
    expect(JSON.parse(cleared as string)).toEqual({ name: 'Demo' })
  })

  it('shows the embedded JSON repair editor for invalid content', () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{broken' }),  },
    })
    expect(wrapper.find('.project-profile-editor__repair').exists()).toBe(true)
    expect(wrapper.find('.monaco-stub').exists()).toBe(true)
  })

  it('emits the standard save command from Ctrl+S for valid content', async () => {
    const wrapper = mount(ProjectConfigEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/project.json', draftContent: '{}' }),  },
    })
    const save = vi.spyOn(wrapper.props('session'), 'save').mockResolvedValue('saved')
    await wrapper.get('.project-profile-editor').trigger('keydown', { ctrlKey: true, key: 's' })
    expect(save).toHaveBeenCalledOnce()
    expect(wrapper.vm.canSave).toBe(true)
  })

})
