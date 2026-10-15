<template>
  <span class="oc-data-grid-column-resize" role="separator" tabindex="0"
    aria-orientation="vertical" :aria-valuemin="minimum" :aria-valuemax="maximum"
    :aria-valuenow="value" :aria-label="label" :data-tooltip="label"
    @pointerdown="emit('resize-start', $event)" @keydown="emit('resize-keydown', $event)" />
</template>

<script setup lang="ts">
defineOptions({ name: 'OcDataGridColumnResizeHandle' })

defineProps<{
  minimum: number
  maximum: number
  value: number
  label: string
}>()

const emit = defineEmits<{
  'resize-start': [event: PointerEvent]
  'resize-keydown': [event: KeyboardEvent]
}>()
</script>

<style scoped>
.oc-data-grid-column-resize {
  position: absolute;
  inset-block: 0;
  inset-inline-end: calc(var(--oc-space-2xs) * -1);
  z-index: 1;
  width: var(--oc-space-sm);
  cursor: col-resize;
  touch-action: none;
}

.oc-data-grid-column-resize::after {
  position: absolute;
  inset-block: var(--oc-space-sm);
  inset-inline-end: calc((var(--oc-space-sm) - var(--oc-border-width)) / 2);
  width: var(--oc-border-width);
  background: var(--oc-border-accent);
  content: '';
  opacity: 0;
  transition: opacity var(--oc-duration-quick) var(--oc-ease);
}

.oc-data-grid-column-resize:hover::after,
.oc-data-grid-column-resize:focus-visible::after,
:global(.is-resizing-column) .oc-data-grid-column-resize::after {
  opacity: 1;
}

.oc-data-grid-column-resize:focus-visible {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .oc-data-grid-column-resize::after {
    transition: none;
  }
}
</style>
