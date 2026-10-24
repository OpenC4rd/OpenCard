import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShellSidebar from './ShellSidebar.vue'
import OverlayGroupRoot from '../../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../../composables/overlayGroups'
import type { ShellButton, ShellList, ShellListGroup } from '../shell.types'

function primaryGroup(lists: ShellList[], headButtons: ShellButton[] = []): ShellListGroup {
  return { key: 'primary', title: '', headButtons, lists }
}

function twoLists(): ShellList[] {
  return [
    { key: 'files', title: 'Files', placeholder: 'Empty', actions: [] },
    { key: 'timeline', title: 'Timeline', placeholder: 'Empty', actions: [] },
  ]
}

/** 组宿主是共享单例，每个用例退出时都要卸载并清空组，否则下一个用例会看到上一个的空面板。 */
function disposeAllGroups(): void {
  for (const group of [...overlayGroups.keys()]) disposeGroup(group)
}

describe('ShellSidebar', () => {
  afterEach(() => {
    disposeAllGroups()
    document.body.innerHTML = ''
  })

  it('returns the chosen submenu action key to the list owner', async () => {
    const onAction = vi.fn()
    const overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([{
          onAction, key: 'project-files', title: 'Files', placeholder: 'Empty',
          actions: [{
            key: 'project.new-file',
            icon: 'mdiFilePlusOutline',
            hoverTip: 'New File',
            children: [
              { key: 'project.new-file.ocdocument', title: 'OpenCard (.ocdocument)' },
              { key: 'project.new-file.project-configuration', title: 'Project Configuration' },
            ],
          }],
        }]),
      },
    })

    try {
      await wrapper.get('button[aria-label="New File"]').trigger('click')
      await flushPromises()
      document.body
        .querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="OpenCard (.ocdocument)"]')
        ?.click()
      await flushPromises()

      expect(onAction).toHaveBeenCalledWith('project.new-file.ocdocument')
    } finally {
      wrapper.unmount()
      overlayRoot.unmount()
    }
  })

  it('keeps each list share after collapsing and expanding the list', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: { collapsed: false, width: 260, bodyGroup: primaryGroup(twoLists()) },
    })
    const sections = wrapper.findAll('.shell-sidebar-list')
    sections[0]!.element.getBoundingClientRect = () => ({ height: 200 } as DOMRect)
    sections[1]!.element.getBoundingClientRect = () => ({ height: 200 } as DOMRect)

    const resizer = wrapper.get('.shell-sidebar-list-resizer')
    resizer.element.dispatchEvent(new PointerEvent('pointerdown', { clientY: 200, bubbles: true }))
    // 拖动比例在 resize-start 之后的一次渲染才传给握柄。
    await nextTick()
    resizer.element.dispatchEvent(new PointerEvent('pointermove', { clientY: 250 }))
    resizer.element.dispatchEvent(new PointerEvent('pointerup', { clientY: 250 }))
    await nextTick()

    const toggle = wrapper.findAll('.shell-sidebar-list-toggle')[0]!
    await toggle.trigger('click')
    await toggle.trigger('click')

    expect(wrapper.emitted('layout-change')).toEqual([
      [{ collapsedLists: [], listWeights: { files: 1.25, timeline: 0.75 } }],
      [{ collapsedLists: ['files'], listWeights: { files: 1.25, timeline: 0.75 } }],
      [{ collapsedLists: [], listWeights: { files: 1.25, timeline: 0.75 } }],
    ])
  })

  it('forwards a declarative tree selection as one intent', async () => {
    const intents: unknown[] = []
    const wrapper = mount(ShellSidebar, {
      props: {
        collapsed: false,
        width: 260,
        bodyGroup: primaryGroup([{
          key: 'files',
          title: 'Files',
          placeholder: 'Empty',
          actions: [],
          content: {
            type: 'tree',
            data: {
              rootKeys: ['file'],
              items: new Map([['file', { label: 'Card', icon: 'mdiCardsOutline' }]]),
              children: new Map(),
            },
            role: 'tree',
            selectionMode: 'single',
            activationMode: 'none',
            onSelectionChange: event => intents.push(event),
          },
        }]),
      },
    })

    await wrapper.get('[role="treeitem"]').trigger('click')

    expect(intents).toEqual([{ triggerKey: 'file', selectedKeys: ['file'] }])
  })

  it('reports a clamped horizontal resize from start through end', async () => {
    const wrapper = mount(ShellSidebar, {
      attachTo: document.body,
      props: { collapsed: false, width: 260, maxResizeWidth: 420, bodyGroup: primaryGroup([]) },
    })
    const handle = wrapper.get('.shell-sidebar-resizer [role="separator"]')

    handle.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 260, pointerId: 4 }))
    await nextTick()
    expect(wrapper.emitted('resize-start')).toHaveLength(1)

    handle.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 4 }))
    handle.element.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, pointerId: 4 }))
    handle.element.dispatchEvent(new PointerEvent('pointerup', { clientX: 900, pointerId: 4 }))
    await nextTick()

    expect(wrapper.emitted('resize')).toEqual([[300], [420]])
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })
})