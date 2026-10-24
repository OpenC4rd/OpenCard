import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import OcResizeTrack from '../../../components/standard/OcResizeTrack.vue'
import { useShellBottomPanelLayout } from './useShellBottomPanelLayout'

it('skips layout animations when the transition duration is zero', async () => {
  const stack = document.createElement('div')
  stack.innerHTML = '<div class="open-card-shell__page-content"><div data-oc-layout-anchor="bottom"></div></div>'
  document.body.append(stack)
  const content = stack.firstElementChild as HTMLElement
  const anchor = content.firstElementChild as HTMLElement
  let contentHeight = 300
  Object.defineProperty(content, 'clientHeight', { get: () => contentHeight })
  const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }))
  Object.defineProperty(anchor, 'animate', { value: animate })
  let layout!: ReturnType<typeof useShellBottomPanelLayout>
  const wrapper = mount(defineComponent({ setup() {
    layout = useShellBottomPanelLayout(ref(stack))
    return () => h('div')
  } }))
  content.style.setProperty('--oc-duration', '0ms')
  const disabledChange = layout.animateLayoutChange()
  contentHeight = 200
  await disabledChange
  expect(animate).not.toHaveBeenCalled()
  content.style.setProperty('--oc-duration', '75ms')
  const enabledChange = layout.animateLayoutChange()
  contentHeight = 100
  await enabledChange
  expect(animate).toHaveBeenCalledWith(expect.any(Object), { duration: 75, easing: 'ease' })
  wrapper.unmount()
  stack.remove()
})

it('previews reverse dragging, cancels without committing, and commits pointer or keyboard changes', async () => {
  const stack = document.createElement('div')
  Object.defineProperty(stack, 'clientHeight', { value: 600 })
  let layout!: ReturnType<typeof useShellBottomPanelLayout>
  const wrapper = mount(defineComponent({
    setup() {
      layout = useShellBottomPanelLayout(ref(stack))
      layout.measure()
      return () => h(OcResizeTrack, {
        label: 'Resize bottom panel', direction: 'reverse', value: layout.height.value,
        minimum: layout.minimum.value, maximum: layout.maximum.value,
        onResizeStart: layout.startResize,
        'onUpdate:value': layout.resize,
        onResizeEnd: () => layout.finishResize(true),
        onResizeCancel: () => layout.finishResize(false),
      })
    },
  }))
  const handle = wrapper.get('[role=separator]')
  const pointer = (type: string, clientY: number) => handle.element.dispatchEvent(
    new PointerEvent(type, { button: 0, pointerId: 1, clientY, bubbles: true }),
  )
  pointer('pointerdown', 400)
  pointer('pointermove', 350)
  await nextTick()
  expect(layout.height.value).toBe(180)
  expect(layout.previewHeight.value).toBe(230)
  expect(layout.previewPercentage.value).toBe(38)
  await handle.trigger('keydown', { key: 'Escape' })
  expect(layout.height.value).toBe(180)
  expect(layout.previewHeight.value).toBe(180)
  pointer('pointerdown', 400)
  pointer('pointermove', 200)
  pointer('pointerup', 200)
  await nextTick()
  expect(layout.height.value).toBe(300)
  expect(layout.isResizing.value).toBe(false)
  await handle.trigger('keydown', { key: 'ArrowDown' })
  expect(layout.height.value).toBe(284)
  wrapper.unmount()
})