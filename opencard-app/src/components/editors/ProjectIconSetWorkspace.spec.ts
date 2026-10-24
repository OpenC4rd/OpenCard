import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectIconSeries } from '../../features/workspace/model/projectIcons'
import type { ProjectIconCatalogEntry } from '../../features/workspace/services/projectIconCatalog'
import OcAlbum from '../standard/OcAlbum.vue'
import ProjectIconSetWorkspace from './ProjectIconSetWorkspace.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const series: ProjectIconSeries = {
  name: 'Status icons',
  key: 'status',
  icons: [
    { iconKey: 'warning', name: 'Warning', source: '.opencard/icons/status/warning.svg', tint: 'context' },
    { iconKey: 'success', name: 'Success', source: '.opencard/icons/status/success.svg', tint: 'original' },
  ],
}
const entries: ProjectIconCatalogEntry[] = series.icons.map(icon => ({
  ...icon,
  seriesKey: series.key,
  src: `asset://${icon.source}`,
  imageWidth: 64,
  imageHeight: 32,
}))

function mountWorkspace(
  candidate: ProjectIconSeries = series,
  selectedIconIndexes: readonly number[] = [0],
  catalog: readonly ProjectIconCatalogEntry[] = entries,
) {
  return mount(ProjectIconSetWorkspace, {
    props: { series: candidate, entries: catalog, selectedIconIndexes },
  })
}

describe('ProjectIconSetWorkspace', () => {
  it('filters by icon name or key while preserving original icon indexes', async () => {
    const wrapper = mountWorkspace()
    const input = wrapper.get('input[placeholder="projectConfig.icons.filterPlaceholder"]')

    await input.setValue('success')
    expect(wrapper.getComponent(OcAlbum).props('data').rootKeys).toEqual(['icon:1'])

    await input.setValue('warning')
    wrapper.getComponent(OcAlbum).vm.$emit('selection-change', {
      triggerKey: 'icon:0', selectedKeys: ['icon:0'],
    })
    expect(wrapper.emitted('update:selectedIconIndexes')).toEqual([[[0]]])
  })

  it('emits the selection the icon grid reports', () => {
    const wrapper = mountWorkspace()
    wrapper.getComponent(OcAlbum).vm.$emit('selection-change', {
      triggerKey: 'icon:1', selectedKeys: ['icon:1'],
    })

    expect(wrapper.emitted('update:selectedIconIndexes')).toEqual([[[1]]])
    expect(wrapper.emitted('update:series')).toBeUndefined()
  })

  it('applies a card command to every selected icon when the card is part of the selection', async () => {
    const multiSeries: ProjectIconSeries = {
      ...series,
      icons: [
        ...series.icons,
        { iconKey: 'info', name: 'Info', source: '.opencard/icons/status/info.svg', tint: 'context' as const },
      ],
    }
    const wrapper = mountWorkspace(multiSeries, [0, 2], entries)

    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:2', actionKey: 'move-bottom', source: 'inline' })
    let updates = wrapper.emitted('update:series') ?? []
    let updated = updates[updates.length - 1]?.[0] as ProjectIconSeries
    expect(updated.icons.map(icon => icon.iconKey)).toEqual(['success', 'warning', 'info'])
    expect(wrapper.emitted('update:selectedIconIndexes')).toContainEqual([[1, 2]])

    await wrapper.setProps({ series: updated, selectedIconIndexes: [1, 2] })
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:2', actionKey: 'delete', source: 'inline' })
    updates = wrapper.emitted('update:series') ?? []
    updated = updates[updates.length - 1]?.[0] as ProjectIconSeries
    expect(updated.icons.map(icon => icon.iconKey)).toEqual(['success'])
    expect(wrapper.emitted('update:selectedIconIndexes')).toContainEqual([[0]])
  })

  it('acts on the card itself when the command targets an icon outside the selection', () => {
    const wrapper = mountWorkspace(series, [0])
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:1', actionKey: 'delete', source: 'inline' })

    const updates = wrapper.emitted('update:series') ?? []
    const updated = updates[updates.length - 1]?.[0] as ProjectIconSeries
    expect(updated.icons.map(icon => icon.iconKey)).toEqual(['warning'])
  })

  it('moves an icon directly to the top or bottom', async () => {
    const wrapper = mountWorkspace(series, [0])
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:0', actionKey: 'move-bottom', source: 'inline' })
    let updates = wrapper.emitted('update:series') ?? []
    expect((updates[updates.length - 1]?.[0] as ProjectIconSeries).icons.map(icon => icon.iconKey))
      .toEqual(['success', 'warning'])

    await wrapper.setProps({ selectedIconIndexes: [1] })
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:1', actionKey: 'move-top', source: 'inline' })
    updates = wrapper.emitted('update:series') ?? []
    expect((updates[updates.length - 1]?.[0] as ProjectIconSeries).icons.map(icon => icon.iconKey))
      .toEqual(['success', 'warning'])
  })

  it('duplicates an icon after its source and selects the copy', () => {
    const wrapper = mountWorkspace(series, [0])
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:0', actionKey: 'duplicate', source: 'inline' })

    const updates = wrapper.emitted('update:series') ?? []
    const updated = updates[updates.length - 1]?.[0] as ProjectIconSeries
    expect(updated.icons[1]).toEqual({ ...series.icons[0], iconKey: 'warning-2' })
    expect(wrapper.emitted('update:selectedIconIndexes')).toEqual([[[1]]])
  })

  it('selects the next neighboring icon after deleting a middle icon', () => {
    const icons = [
      series.icons[0]!,
      series.icons[1]!,
      { iconKey: 'info', name: 'Info', source: '.opencard/icons/status/info.svg', tint: 'context' as const },
    ]
    const wrapper = mountWorkspace({ ...series, icons }, [1], entries)
    wrapper.getComponent(OcAlbum).vm.$emit('action', { key: 'icon:1', actionKey: 'delete', source: 'inline' })
    const updates = wrapper.emitted('update:series') ?? []
    const updated = updates[updates.length - 1]?.[0] as ProjectIconSeries

    expect(updated.icons.map(icon => icon.iconKey)).toEqual(['warning', 'info'])
    expect(wrapper.emitted('update:selectedIconIndexes')).toEqual([[[1]]])
  })
})
