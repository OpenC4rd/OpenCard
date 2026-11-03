<template>
  <OcOverlayMarker ref="markerRef" v-model:open="view.open" group="context-menu"
    :anchor="view.anchor" :owner="view.owner" @close="handleClose">
    <OcActionMenu :actions="view.items" overlay-key="context-menu" :on-select="select" @close="handleClose" />
  </OcOverlayMarker>
</template>

<script setup lang="ts">
import OcActionMenu from './OcActionMenu.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import type { ContextMenu } from '../../shared/ui/useContextMenu'

defineOptions({ name: 'OcContextMenu' })

const props = defineProps<{ menu: ContextMenu }>()
// 宿主整个生命周期只持有同一个 menu，解构一次即可。
const { markerRef, view, select, handleClose } = props.menu.binding
</script>
