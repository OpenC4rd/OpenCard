<!--
  选中项目图标节点时的行内编辑层：内容只有一个动作按钮。

  职责边界：
  - 不创建浮层、不做定位、不判断打开状态；位置与显隐由 OverlayHost 提供。
  - 按钮按下时不让焦点离开编辑器，选择因此留在被编辑的节点上。
-->
<template>
  <div class="rich-text-node-edit-layer">
    <OcActionButton :action="action" size="sm" variant="ghost"
      @mousedown.prevent @select="emit('select', $event)" />
  </div>
</template>

<script setup lang="ts">
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import type { OcActionDefinition, OcActionSelectPayload } from '../action/action.types'

defineProps<{ action: OcActionDefinition }>()
const emit = defineEmits<{ select: [payload: OcActionSelectPayload] }>()
</script>

<style scoped>
.rich-text-node-edit-layer {
  display: grid;
  max-width: var(--oc-dialog-width-md);
  max-height: inherit;
  gap: var(--oc-space-xs);
  padding: var(--oc-space-2xs);
  overflow: auto;
}
</style>
