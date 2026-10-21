import { createTestSession } from '../../features/editor-runtime/editorTestSession'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectIconRegistryFileEditor from './ProjectIconRegistryFileEditor.vue'
import ProjectIconRegistryWorkbench from './ProjectIconRegistryWorkbench.vue'
import ProjectIconRegistrationDialog from './ProjectIconRegistrationDialog.vue'
import OcButton from '../base/OcButton.vue'

const mocks = vi.hoisted(() => ({
  stageProjectAssetFiles: vi.fn(),
  historyResource: { undo: vi.fn(), redo: vi.fn(), release: vi.fn() },
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./MonacoEditor.vue', () => ({ default: { template: '<div class="monaco-stub" />' } }))
vi.mock('../../features/workspace/services/projectAssetFileHistory', () => ({
  stageProjectAssetFiles: mocks.stageProjectAssetFiles,
}))
vi.mock('../../features/workspace/services/projectIconCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconCatalog')>()
  return {
    ...actual,
    buildProjectIconCatalog: vi.fn(() => ({ series: [], entries: [] })),
  }
})

function mountEditor(modelValue: unknown) {
  return mount(ProjectIconRegistryFileEditor, {
    props: { session: createTestSession({ path: 'D:/Demo/.opencard/icons/icons.json', draftContent: JSON.stringify(modelValue) }),  },
    global: { stubs: { Teleport: true } },
  })
}

function lastRegistry(wrapper: ReturnType<typeof mountEditor>) {
  const updates = wrapper.props('session').state.draftContent
  return JSON.parse(updates as string)
}

function confirmRemoval(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAllComponents(OcButton)
    .find(candidate => candidate.text() === 'projectConfig.icons.removeSeriesConfirm')!
}

describe('ProjectIconRegistryFileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stageProjectAssetFiles.mockResolvedValue(mocks.historyResource)
  })

  it('owns icon-series edits', async () => {
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/icons/icons.json', draftContent: '{}' }),  },
    })
    const registrationDialog = wrapper.getComponent(ProjectIconRegistrationDialog)
    expect(registrationDialog.props('defaultOpenPath')).toBe('D:/Demo/.opencard/icons')
    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('update:series', [{
      name: 'Status icons', key: 'status',
      icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/status/warn.svg', tint: 'context' }],
    }])
    await wrapper.vm.$nextTick()

    const updates = wrapper.props('session').state.draftContent
    expect(JSON.parse(updates as string)).toEqual({
      iconSeries: [{
        name: 'Status icons', key: 'status',
        icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/status/warn.svg', tint: 'context' }],
      }],
    })
  })

  it('confirms set removal and binds only the unshared files to the history entry', async () => {
    const wrapper = mountEditor({
      iconSeries: [
        {
          name: 'Status icons', key: 'status',
          icons: [
            { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/status/warn.svg', tint: 'context' },
            { iconKey: 'keep', name: 'Keep', source: '.opencard/icons/shared/keep.svg', tint: 'context' },
          ],
        },
        {
          name: 'Shared icons', key: 'shared',
          icons: [
            { iconKey: 'keep', name: 'Keep', source: '.opencard/icons/shared/keep.svg', tint: 'context' },
            { iconKey: 'only', name: 'Only', source: '.opencard/icons/shared/only.svg', tint: 'context' },
          ],
        },
      ],
    })

    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('remove-series', 'shared')
    await wrapper.vm.$nextTick()
    // The set is still there until the user confirms.
    expect(wrapper.props('session').state.isDirty).toBe(false)
    await confirmRemoval(wrapper).trigger('click')
    await flushPromises()

    // `keep.svg` is still referenced by the remaining set, so only the unshared file is staged.
    expect(mocks.stageProjectAssetFiles).toHaveBeenCalledWith(
      ['D:/Demo/.opencard/icons/shared/only.svg'], undefined, undefined, 'icon',
    )
    expect(lastRegistry(wrapper).iconSeries.map((entry: { key: string }) => entry.key)).toEqual(['status'])
  })

  it('keeps every file and skips staging when the user clears the cleanup option', async () => {
    const wrapper = mountEditor({
      iconSeries: [
        { name: 'Status icons', key: 'status', icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/status/warn.svg', tint: 'context' }] },
      ],
    })
    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('remove-series', 'status')
    await wrapper.vm.$nextTick()

    await wrapper.findComponent({ name: 'OcCheckbox' }).vm.$emit('update:checked', false)
    await confirmRemoval(wrapper).trigger('click')
    await flushPromises()

    expect(mocks.stageProjectAssetFiles).not.toHaveBeenCalled()
    expect(lastRegistry(wrapper)).toEqual({})
  })

  it('leaves no orphaned files to clean when a set owns only external sources', async () => {
    const wrapper = mountEditor({
      iconSeries: [
        { name: 'Status icons', key: 'status', icons: [{ iconKey: 'warn', name: 'Warn', source: 'assets/warn.svg', tint: 'context' }] },
      ],
    })
    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('remove-series', 'status')
    await wrapper.vm.$nextTick()

    // A source outside the managed icon folder is never staged or deleted.
    expect(wrapper.text()).not.toContain('projectConfig.icons.cleanupOrphanedFiles')
    await confirmRemoval(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.stageProjectAssetFiles).not.toHaveBeenCalled()
  })

  it('reports a failed cleanup and keeps the set instead of dropping it', async () => {
    // A file can be locked or removed by another program between opening and confirming; the set must
    // survive that, or the registry would lose icons whose files are still on disk.
    mocks.stageProjectAssetFiles.mockRejectedValue(new Error('file is locked'))
    const wrapper = mountEditor({
      iconSeries: [
        { name: 'Status icons', key: 'status', icons: [{ iconKey: 'warn', name: 'Warn', source: '.opencard/icons/status/warn.svg', tint: 'context' }] },
      ],
    })
    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('remove-series', 'status')
    await wrapper.vm.$nextTick()

    await confirmRemoval(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.props('session').state.isDirty).toBe(false)
    // The dialog stays open with the reason, and the set is still listed.
    expect(wrapper.text()).toContain('projectConfig.icons.cleanupFailed')
  })

  it('reports duplicate keys and blocks save', async () => {
    const icon = { iconKey: 'same', name: 'Same', source: '.opencard/icons/status/same.svg', tint: 'context' }
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/icons/icons.json', draftContent: JSON.stringify({
          iconSeries: [{ name: 'Status icons', key: 'status', icons: [icon, { ...icon, source: '.opencard/icons/status/same-2.svg' }] }],
        }) }),  },
    })
    wrapper.getComponent(ProjectIconRegistryWorkbench).vm.$emit('key-conflicts', [
      { kind: 'icon', seriesIndex: 0, iconIndex: 0, key: 'same' },
      { kind: 'icon', seriesIndex: 0, iconIndex: 1, key: 'same' },
    ])
    await wrapper.vm.$nextTick()

    const snapshots = wrapper.emitted('issue-snapshot') ?? []
    const latest = snapshots[snapshots.length - 1]?.[0] as { issues: Array<{ type: string }> }
    expect(latest.issues).toHaveLength(2)
    expect(latest.issues[0]?.type).toBe('project-icon-registry.icon.duplicate-key')
    expect(wrapper.vm.canSave).toBe(false)
  })

  it('uses raw repair mode for invalid JSON', () => {
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/icons/icons.json', draftContent: '{broken' }),  },
    })
    expect(wrapper.find('.monaco-stub').exists()).toBe(true)
  })

  it('offers creating and importing icon packs from the workspace header', async () => {
    const wrapper = mount(ProjectIconRegistryFileEditor, {
      props: { session: createTestSession({ path: 'D:/Demo/.opencard/icons/icons.json', draftContent: JSON.stringify({ iconSeries: [{ name: 'Status icons', key: 'status', source: 'status.png', icons: [] }] }) }),  },
    })

    expect(wrapper.vm.presentation).toMatchObject({ title: 'iconRegistry.title', icon: 'mdiStickerEmoji' })
    expect(wrapper.getComponent(ProjectIconRegistrationDialog).props('open')).toBe(false)

    await wrapper.vm.onHeaderAction('project-icon-registry.create-collection')
    expect(wrapper.getComponent(ProjectIconRegistrationDialog).props('open')).toBe(true)
  })
})
