import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import OcCompletionPopup from '../../components/standard/OcCompletionPopup.vue'
import OverlayGroupRoot from '../../components/ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'
import { useCompletionList, type CompletionList } from './useCompletionList'

type Item = { key: string, label: string }
const ITEMS: Item[] = [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }, { key: 'c', label: 'Gamma' }]

describe('useCompletionList', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null
  const hosts: ReturnType<typeof mount>[] = []

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    hosts.splice(0).forEach(host => host.unmount())
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  function mountHost(initial: Item[] = ITEMS) {
    const items = ref(initial)
    let list!: CompletionList<Item>
    const Host = defineComponent({
      setup() {
        const input = ref<HTMLInputElement | null>(null)
        list = useCompletionList(() => items.value, () => input.value)
        return () => h('div', [h('input', { ref: input }), h(OcCompletionPopup, { list })])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    hosts.push(wrapper)
    const key = (name: string) => {
      const event = new KeyboardEvent('keydown', { key: name, cancelable: true })
      return { handled: list.handleKeydown(event), prevented: event.defaultPrevented }
    }
    return { items, list: () => list, key, input: () => wrapper.get('input').element }
  }

  it('stays closed when there is nothing to show', () => {
    const { list } = mountHost([])
    list().show()
    expect(list().open.value).toBe(false)
  })

  it('starts from the first item and keeps the active item while it is still offered', async () => {
    const { items, list, key } = mountHost()
    list().show()
    key('ArrowDown')
    expect(list().activeKey.value).toBe('b')

    items.value = [ITEMS[1]!, ITEMS[2]!]
    await flushPromises()
    expect(list().activeKey.value).toBe('b')

    items.value = [ITEMS[2]!]
    await flushPromises()
    expect(list().activeKey.value).toBe('c')
  })

  it('wraps arrow navigation and leaves keys alone while closed', () => {
    const { list, key } = mountHost()
    expect(key('ArrowDown')).toEqual({ handled: false, prevented: false })
    list().show()
    key('ArrowUp')
    expect(list().activeKey.value).toBe('c')
    key('ArrowDown')
    expect(list().activeKey.value).toBe('a')
  })

  it('consumes Escape only while open', () => {
    const { list, key } = mountHost()
    expect(key('Escape')).toEqual({ handled: false, prevented: false })
    list().show()
    expect(key('Escape')).toEqual({ handled: true, prevented: true })
    expect(list().open.value).toBe(false)
  })

  it('renders options under the ids the input points at, and the pointer moves the active item', async () => {
    const { list, key } = mountHost()
    list().show()
    await flushPromises()
    key('ArrowDown')
    await flushPromises()
    const active = document.getElementById(list().activeDescendantId.value!)
    expect(active?.textContent).toContain('Beta')

    document.querySelectorAll('[role="option"]')[2]!.dispatchEvent(new Event('pointerenter'))
    expect(list().activeKey.value).toBe('c')
  })

  it('closes when the pointer goes down outside the input and the list', async () => {
    const { list } = mountHost()
    list().show()
    await flushPromises()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(list().open.value).toBe(false)
  })
})
