<template>
  <OcOverlayMarker :group="`completion:${list.id}`" :anchor="anchor ?? list.control.value" :owner="list.control.value"
    placement="bottom-start" :max-height="240" :open="list.open.value" @close="list.close">
    <OcAutocompleteList :id="list.id" :items="list.items.value" :active-key="list.activeKey.value"
      @activate="list.activeKey.value = $event" @select="emit('select', $event)" />
  </OcOverlayMarker>
</template>

<script setup lang="ts">
import OcAutocompleteList, { type OcAutocompleteItem } from './OcAutocompleteList.vue'
import OcOverlayMarker from './OcOverlayMarker.vue'
import type { OverlayAnchor } from '../../composables/overlayGroups'
import type { CompletionList } from '../../shared/ui/useCompletionList'

defineOptions({ name: 'OcCompletionPopup' })

defineProps<{
  list: CompletionList<OcAutocompleteItem>
  /** 缺省锚在输入控件上；多行输入跟随光标、或要锚在整个选择器上时另给。 */
  anchor?: OverlayAnchor
}>()

const emit = defineEmits<{ select: [key: string] }>()
</script>
