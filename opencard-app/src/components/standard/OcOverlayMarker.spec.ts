import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import OverlayGroupRoot from '../ui/OverlayGroupRoot.vue'
import { disposeGroup, overlayGroups } from '../../composables/overlayGroups'

describe('OcOverlayMarker', () => {
  let overlayRoot: ReturnType<typeof mount> | null = null

  beforeEach(() => {
    overlayRoot = mount(OverlayGroupRoot, { attachTo: document.body })
  })

  afterEach(() => {
    overlayRoot?.unmount()
    overlayRoot = null
    for (const group of [...overlayGroups.keys()]) disposeGroup(group)
    document.body.innerHTML = ''
  })

  function mountMarker() {
    const first = document.body.appendChild(document.createElement('button'))
    const second = document.body.appendChild(document.createElement('button'))
    const shown = ref(true)
    const open = ref(true)
    const anchor = ref<HTMLElement>(first)
    const emitted: boolean[] = []
    const host = mount(defineComponent({
      setup: () => () => shown.value
        ? h(OcOverlayMarker, {
          group: 'spec',
          anchor: anchor.value,
          open: open.value,
          'onUpdate:open': (next: boolean) => { emitted.push(next); open.value = next },
        }, () => h('p', 'content'))
        : null,
    }), { attachTo: document.body })
    return { host, first, second, shown, open, anchor, emitted, group: () => overlayGroups.get('spec') }
  }

  it('leaves the group when unmounted while open', async () => {
    const { shown, group } = mountMarker()
    await flushPromises()
    expect(group()?.visible).toBe(true)
    shown.value = false
    await flushPromises()
    expect(group()?.visible).toBeFalsy()
  })

  it('follows a new anchor while it stays open', async () => {
    const { anchor, second, open, group } = mountMarker()
    await flushPromises()
    anchor.value = second
    await flushPromises()
    expect(open.value).toBe(true)
    expect(group()?.anchor).toBe(second)
    expect(group()?.visible).toBe(true)
  })

  it('does not reopen when it closes and changes anchor in the same tick', async () => {
    const { anchor, second, open, emitted, group } = mountMarker()
    await flushPromises()
    emitted.length = 0
    open.value = false
    anchor.value = second
    await flushPromises()
    expect(emitted).toEqual([false])
    expect(group()?.visible).toBeFalsy()
  })
})
