import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectIconSeries } from '../../features/workspace/model/projectIcons'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import OcTree from '../standard/OcTree.vue'
import ProjectIconPreview from './ProjectIconPreview.vue'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'
import ProjectIconRegistryWorkbench from './ProjectIconRegistryWorkbench.vue'
import ProjectIconSetSettingsDialog from './ProjectIconSetSettingsDialog.vue'
import ProjectIconSetWorkspace from './ProjectIconSetWorkspace.vue'

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../features/workspace/services/projectIconCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/workspace/services/projectIconCatalog')>()
  return {
    ...actual,
    buildProjectIconCatalog: vi.fn((series: readonly ProjectIconSeries[], resolve: (source: string) => string) => {
      const entries: ProjectIconCatalogEntry[] = []
      const runtimeSeries = series.map(candidate => {
        for (const icon of candidate.icons) {
          entries.push({
            ...icon, seriesKey: candidate.key, src: resolve(icon.source), imageWidth: 24, imageHeight: 24,
          })
        }
        return { name: candidate.name, key: candidate.key }
      })
      return { series: runtimeSeries, entries }
    }),
  }
})

const series: ProjectIconSeries[] = [
  {
    name: 'Status icons', key: 'status',
    icons: [{ iconKey: 'warning', name: 'Warning', source: '.opencard/icons/status/warning.svg', tint: 'context' }],
  },
  { name: 'Action icons', key: 'actions', icons: [] },
]
const projectIconCatalog = {
  series: [{ name: 'Status icons', key: 'status' }],
  entries: [],
}
const baseProps = {
  series,
  resolveAssetSrc: (source: string) => `asset://${source}`,
}
/** The given set plus two more icons, so a delete leaves a neighbor for the selection to move to. */
function iconsOf(candidate: ProjectIconSeries): ProjectIconSeries['icons'] {
  return [
    ...candidate.icons,
    { iconKey: 'success', name: 'Success', source: '.opencard/icons/status/success.svg', tint: 'original' },
    { iconKey: 'info', name: 'Info', source: '.opencard/icons/status/info.svg', tint: 'context' },
  ]
}
async function selectSeries(wrapper: ReturnType<typeof mount>, key: string): Promise<void> {
  await (wrapper.vm as unknown as { selectSeries(key: string): Promise<boolean> }).selectSeries(key)
  await wrapper.vm.$nextTick()
}

describe('ProjectIconRegistryWorkbench', () => {
  it('rebuilds its catalog on every edit, so a changed display option reaches the preview', async () => {
    const { buildProjectIconCatalog } = await import('../../features/workspace/services/projectIconCatalog')
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    vi.mocked(buildProjectIconCatalog).mockClear()
    const changed = [{ ...series[0]!, icons: [{ ...series[0]!.icons[0]!, tint: 'original' as const }] }, series[1]!]
    await wrapper.setProps({ series: changed })
    expect(vi.mocked(buildProjectIconCatalog)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(buildProjectIconCatalog).mock.calls[0]?.[0]).toEqual(changed)
  })

  it('keeps the property panel for a multiple selection and applies an edit to every selected icon', async () => {
    const raster = (iconKey: string, pixelated: boolean) => ({ iconKey, name: iconKey, source: `.opencard/icons/status/${iconKey}.png`, tint: 'original' as const, pixelated })
    const sheet = [{ name: 'Status icons', key: 'status', icons: [raster('a', true), raster('b', false), raster('c', false)] }]
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: { ...baseProps, series: sheet } })
    await selectSeries(wrapper, 'status')
    wrapper.getComponent(ProjectIconSetWorkspace).vm.$emit('update:selectedIconIndexes', [0, 1])
    await wrapper.vm.$nextTick()

    const input = wrapper.getComponent(PropertyEditor).props('inputs')[0]!
    expect(input.fields.pixelated?.valueState).toBe('mixed')
    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', { key: input.key, fieldKey: 'pixelated', value: 'true' })
    await wrapper.vm.$nextTick()
    const updates = wrapper.emitted('update:series') ?? []
    const icons = (updates[updates.length - 1]?.[0] as ProjectIconSeries[])[0]!.icons
    expect(icons.map(icon => icon.pixelated)).toEqual([true, true, false])
  })

  it('gives its catalog a size reader, which is what cuts a sprite out of its sheet', async () => {
    const { buildProjectIconCatalog } = await import('../../features/workspace/services/projectIconCatalog')
    vi.mocked(buildProjectIconCatalog).mockClear()
    mount(ProjectIconRegistryWorkbench, { props: baseProps })
    expect(vi.mocked(buildProjectIconCatalog).mock.calls[0]?.[2]).toBeTypeOf('function')
  })

  it('opens the first set with its first icon selected', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, {
      props: { ...baseProps, projectIconCatalog },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.getComponent(OcTree).props('selectedKeys')).toEqual(['status'])
    expect(wrapper.getComponent(ProjectIconSetWorkspace).props()).toMatchObject({
      series: series[0],
      selectedIconIndexes: [0],
    })
    expect(wrapper.getComponent(ProjectIconPreview).props('entry')).toMatchObject({ iconKey: 'warning' })
  })

  it('disables the import commands while an icon import task owns the progress bar', () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, {
      props: { ...baseProps, projectIconCatalog, importBusy: true },
    })

    const actions = wrapper.getComponent(ProjectResourceWorkbench).props('leadingActions') as { disabled?: boolean }[]
    expect(actions[actions.length - 1]?.disabled).toBe(true)
  })

  it('replaces only the selected series when one set changes', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await selectSeries(wrapper, 'status')
    const updatedStatus = { ...series[0]!, icons: [{ ...series[0]!.icons[0]!, name: 'Alert' }] }
    wrapper.getComponent(ProjectIconSetWorkspace).vm.$emit('update:series', updatedStatus)
    await wrapper.vm.$nextTick()

    const updates = wrapper.emitted('update:series') ?? []
    expect(updates[updates.length - 1]?.[0]).toEqual([updatedStatus, series[1]])
  })

  it('switches the icon grid with the selected set', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await selectSeries(wrapper, 'actions')

    expect(wrapper.getComponent(ProjectIconSetWorkspace).props('series')).toMatchObject({ key: 'actions' })
  })

  it('requests removal from the owner instead of dropping a set on its own', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    wrapper.getComponent(OcTree).vm.$emit('action', { key: 'status', actionKey: 'remove', source: 'inline' })
    await wrapper.vm.$nextTick()

    // Removing files needs confirmation and staging, so the owner decides; the workbench only asks.
    expect(wrapper.emitted('remove-series')).toEqual([[series[0]!.key]])
    expect(wrapper.emitted('update:series')).toBeUndefined()
  })

  it('asks the owner to copy new icons into the selected set from the list card', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await selectSeries(wrapper, 'actions')
    const bench = wrapper.getComponent(ProjectResourceWorkbench)
    const actions = bench.props('leadingActions') as { key: string }[]
    bench.vm.$emit('action', { key: actions[actions.length - 1]!.key })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('add-icons')).toEqual([['actions']])
  })

  it('hands card commands it does not own back to the owner', async () => {
    const leadingActions = [{ key: 'create-set', icon: 'mdiPlus' as const, title: 'Create' }]
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: { ...baseProps, leadingActions } })
    wrapper.getComponent(ProjectResourceWorkbench).vm.$emit('action', { key: 'create-set' })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('leading-action')).toEqual([['create-set']])
  })

  it('selects the target set and icon for issue navigation', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    const result = await (wrapper.vm as unknown as {
      navigateToKeyConflict(conflict: { kind: 'icon'; seriesIndex: number; iconIndex: number; key: string }): Promise<boolean>
    }).navigateToKeyConflict({ kind: 'icon', seriesIndex: 0, iconIndex: 0, key: 'warning' })
    await wrapper.vm.$nextTick()

    expect(result).toBe(true)
    expect(wrapper.getComponent(ProjectIconSetWorkspace).props('selectedIconIndexes')).toEqual([0])
    expect(wrapper.getComponent(OcTree).props('selectedKeys')).toEqual(['status'])
  })

  it('edits the selected icon through the inspector without mutating the incoming set', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await wrapper.vm.$nextTick()

    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', {
      key: 'icon:0', fieldKey: 'name', value: 'Alert',
    })
    await wrapper.vm.$nextTick()
    const renamedUpdates = wrapper.emitted('update:series') ?? []
    const renamed = renamedUpdates[renamedUpdates.length - 1]?.[0] as ProjectIconSeries[]
    expect(renamed[0]?.icons[0]?.name).toBe('Alert')
    expect(series[0]?.icons[0]?.name).toBe('Warning')
  })

  it('applies tint to any icon and lets a raster icon opt into pixelation', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await wrapper.vm.$nextTick()

    wrapper.getComponent(PropertyEditor).vm.$emit('update-property', {
      key: 'icon:0', fieldKey: 'tint', value: 'original',
    })
    await wrapper.vm.$nextTick()
    let updates = wrapper.emitted('update:series') ?? []
    let updated = updates[updates.length - 1]?.[0] as ProjectIconSeries[]
    expect(updated[0]?.icons[0]).toMatchObject({ tint: 'original' })

    const raster = mount(ProjectIconRegistryWorkbench, {
      props: {
        ...baseProps,
        series: [{
          name: 'Pixels', key: 'pixels',
          icons: [{ iconKey: 'coin', name: 'Coin', source: '.opencard/icons/pixels/coin.png', tint: 'original' }],
        }],
      },
    })
    await raster.vm.$nextTick()

    raster.getComponent(PropertyEditor).vm.$emit('update-property', {
      key: 'icon:0', fieldKey: 'pixelated', value: 'true',
    })
    await raster.vm.$nextTick()
    updates = raster.emitted('update:series') ?? []
    updated = updates[updates.length - 1]?.[0] as ProjectIconSeries[]
    expect(updated[0]?.icons[0]).toMatchObject({ pixelated: true })
  })

  it('follows the icon selection the grid reports after a delete', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, {
      props: { ...baseProps, series: [{ ...series[0]!, icons: iconsOf(series[0]!) }] },
    })
    await wrapper.vm.$nextTick()
    const workspace = wrapper.getComponent(ProjectIconSetWorkspace)

    workspace.vm.$emit('update:selectedIconIndexes', [1])
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(PropertyEditor).props('inputs')[0]?.record.name).toBe('Success')

    // The grid reports the icon it deleted and the neighbor it moved the selection to, in that order.
    workspace.vm.$emit('update:series', { ...series[0]!, icons: [series[0]!.icons[0]!, iconsOf(series[0]!)[2]!] })
    workspace.vm.$emit('update:selectedIconIndexes', [1])
    await wrapper.vm.$nextTick()
    const updates = wrapper.emitted('update:series') ?? []
    const nextSeries = updates[updates.length - 1]?.[0] as ProjectIconSeries[]
    expect(nextSeries[0]?.icons.map(icon => icon.iconKey)).toEqual(['warning', 'info'])

    await wrapper.setProps({ series: nextSeries })
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(PropertyEditor).props('inputs')[0]?.record.name).toBe('Info')
  })

  it('renames a set through its settings without touching its Key or icon files', async () => {
    const wrapper = mount(ProjectIconRegistryWorkbench, { props: baseProps })
    await selectSeries(wrapper, 'status')
    wrapper.getComponent(OcTree).vm.$emit('action', { key: 'status', actionKey: 'configure', source: 'inline' })
    await wrapper.vm.$nextTick()

    const dialog = wrapper.getComponent(ProjectIconSetSettingsDialog)
    dialog.vm.$emit('submit', { name: 'Renamed' })
    await wrapper.vm.$nextTick()

    const updates = wrapper.emitted('update:series') ?? []
    expect(updates[updates.length - 1]?.[0]).toEqual([
      { ...series[0], name: 'Renamed' },
      series[1],
    ])
  })
})
