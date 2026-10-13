<template>
  <div
    class="oc-resize-track"
    :class="[
      `oc-resize-track--${props.orientation}`,
      props.edge ? `oc-resize-track--edge-${props.edge}` : null,
      props.edge ? `oc-resize-track--placement-${props.placement}` : null,
      { 'oc-resize-track--positioned': props.edge },
      attrs.class,
    ]"
    :style="attrs.style"
    v-bind="forwardedAttrs"
    @dblclick="handleDoubleClick"
  >
    <OcResizeHandle
      :minimum="props.minimum"
      :maximum="props.maximum"
      :value="props.value"
      :label="props.label"
      :tooltip="props.tooltip"
      :orientation="props.orientation"
      :appearance="props.appearance"
      :direction="props.direction"
      :step="props.step"
      :disabled="props.disabled"
      @update:value="emit('update:value', $event)"
      @resize="emit('resize', $event)"
      @resize-start="emit('resize-start', $event)"
      @resize-end="emit('resize-end', $event)"
      @resize-cancel="emit('resize-cancel', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import OcResizeHandle, { type OcResizeHandleChange } from './OcResizeHandle.vue'

defineOptions({ name: 'OcResizeTrack', inheritAttrs: false })

type ResizeOrientation = 'horizontal' | 'vertical'
type ResizeDirection = 'normal' | 'reverse'
type ResizeEdge = 'top' | 'right' | 'bottom' | 'left'
type ResizePlacement = 'inside' | 'center' | 'outside'

const props = withDefaults(defineProps<{
  minimum: number
  maximum: number
  value: number
  label: string
  tooltip?: string
  orientation?: ResizeOrientation
  appearance?: 'grip' | 'gradient' | 'invisible'
  direction?: ResizeDirection
  edge?: ResizeEdge
  placement?: ResizePlacement
  step?: number
  disabled?: boolean
}>(), {
  orientation: 'horizontal',
  appearance: 'grip',
  direction: 'normal',
  edge: undefined,
  placement: 'center',
  tooltip: undefined,
  step: 16,
  disabled: false,
})

const emit = defineEmits<{
  'update:value': [value: number]
  resize: [change: OcResizeHandleChange]
  'resize-start': [event: PointerEvent]
  'resize-end': [event: PointerEvent]
  'resize-cancel': [event: PointerEvent | KeyboardEvent]
  'double-click': [event: MouseEvent]
}>()

const attrs = useAttrs()
const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

function handleDoubleClick(event: MouseEvent): void {
  emit('double-click', event)
}
</script>

<style scoped>
.oc-resize-track {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.oc-resize-track--horizontal {
  width: 100%;
  height: var(--oc-resize-track-size, var(--oc-space-3));
}

.oc-resize-track--vertical {
  width: var(--oc-resize-track-size, var(--oc-space-3));
  height: 100%;
}

.oc-resize-track--positioned {
  position: absolute;
  pointer-events: auto;
}

.oc-resize-track--edge-top {
  top: 0;
  right: 0;
  left: 0;
}

.oc-resize-track--edge-right {
  top: 0;
  right: 0;
  bottom: 0;
}

.oc-resize-track--edge-bottom {
  right: 0;
  bottom: 0;
  left: 0;
}

.oc-resize-track--edge-left {
  top: 0;
  bottom: 0;
  left: 0;
}

.oc-resize-track--edge-top.oc-resize-track--placement-center {
  transform: translateY(-50%);
}

.oc-resize-track--edge-right.oc-resize-track--placement-center {
  transform: translateX(50%);
}

.oc-resize-track--edge-bottom.oc-resize-track--placement-center {
  transform: translateY(50%);
}

.oc-resize-track--edge-left.oc-resize-track--placement-center {
  transform: translateX(-50%);
}

.oc-resize-track--edge-top.oc-resize-track--placement-outside {
  transform: translateY(-100%);
}

.oc-resize-track--edge-right.oc-resize-track--placement-outside {
  transform: translateX(100%);
}

.oc-resize-track--edge-bottom.oc-resize-track--placement-outside {
  transform: translateY(100%);
}

.oc-resize-track--edge-left.oc-resize-track--placement-outside {
  transform: translateX(-100%);
}
</style>
