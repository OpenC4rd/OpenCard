<!-- Standard 尾部行：渲染节点的尾部文本、状态徽标与命令；命令只在交互时才显示。 -->
<template>
  <span
    class="oc-node-tail"
    :class="{ 'oc-node-tail--always': props.actionVisibility === 'always' }"
    data-tooltip-group
  >
    <template v-for="(part, index) in normalizeNodeTail(props.tail)" :key="tailPartKey(part, index)">
      <OcText
        v-if="typeof part === 'string'"
        class="oc-node-tail__text"
        tone="muted"
        size="xs"
        :truncate="true"
      >{{ part }}</OcText>
      <span
        v-else-if="part.type === 'badge'"
        class="oc-node-tail__badge"
        role="img"
        :aria-label="part.label"
        :data-tooltip="part.label"
      >
        <OcIcon :name="part.icon" :tone="part.tone" size="sm" />
      </span>
      <!-- 命令不是拖拽手柄：行内按在它身上不得启动拖拽，OcTree 的拖拽守卫读这个标记。 -->
      <span v-else class="oc-node-tail__action" data-tree-interactive="true">
        <OcActionButton
          :action="part"
          size="sm"
          variant="ghost"
          :button-tabindex="props.buttonTabindex"
          @mousedown.stop
          @select="handleSelect"
        />
      </span>
    </template>
  </span>
</template>

<script setup lang="ts">
import OcActionButton from './OcActionButton.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import { isNodeTailAction, normalizeNodeTail } from '../../shared/ui/node/node.types'
import type { OcNodeTailPart } from '../../shared/ui/node/node.types'

interface OcNodeTailProps {
  /** 尾部行内容，按顺序渲染。文本与徽标始终显示，命令平时不显示。 */
  tail: OcNodeTailPart | readonly OcNodeTailPart[]
  /** 命令的显示时机。`on-interaction` 由使用方的状态规则揭示，`always` 常显。 */
  actionVisibility?: 'on-interaction' | 'always'
  /** 命令按钮的 tabindex。使用方不把命令放进 Tab 顺序时传 -1。 */
  buttonTabindex?: number
}

defineOptions({ name: 'OcNodeTail' })

const props = withDefaults(defineProps<OcNodeTailProps>(), {
  actionVisibility: 'on-interaction',
})

const emit = defineEmits<{
  action: [payload: { key: string }]
}>()

function tailPartKey(part: OcNodeTailPart, index: number): string {
  return typeof part === 'string' ? `text:${index}` : isNodeTailAction(part) ? `action:${part.key}` : `badge:${index}`
}

function handleSelect(payload: { key: string }): void {
  emit('action', { key: payload.key })
}
</script>

<style scoped>
/*
 * 根元素只做端点：行几何由使用方的 class 决定（树的尾部是 display: contents，命令继续作为行尾的
 * 直接 flex 项；相册自带尾部规则），所以这里只声明各部分的盒模型与命令的显示时机。
 */

/* 尾部文本在让位顺序里最先让出宽度。
 * min-width: 0 是必须的：flex 项的自动最小尺寸是内容的 min-content，单行不换行的文本
 * 因此永远缩不到自身宽度以下——省略号也就永远不出现，命令一显形就把整行顶宽、撑出横向滚动条。 */
.oc-node-tail__text {
  flex: 0 1000 auto;
  min-width: 0;
}

.oc-node-tail__badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

/* 命令平时不显示：状态由使用方赋值变量，组件只提供兜底。 */
.oc-node-tail__action {
  display: var(--oc-node-tail-action-display, none);
  flex: 0 0 auto;
  align-items: center;
}

/* 带子菜单的命令在菜单打开期间必须留着，否则菜单会跟着触发器一起消失。 */
.oc-node-tail__action:has(.oc-action-button.is-menu-open) {
  --oc-node-tail-action-display: inline-flex;
}

.oc-node-tail--always {
  --oc-node-tail-action-display: inline-flex;
}
</style>
