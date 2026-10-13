<!-- Base 卡片：带标题栏与内容区的结构化容器。 -->
<template>
  <section class="oc-card" :class="cardClasses" :style="attrs.style" v-bind="forwardedAttrs">
      <!-- Header (if title or icon or actions exist) -->
      <div v-if="hasHeader" class="oc-card__header">
        <OcBar :icon="icon" :title="title">
          <template #append>
            <OcActionRail :actions="actions" @select="handleActionSelect" />
          </template>
        </OcBar>
      </div>
      <!-- Content -->
      <div class="oc-card__content">
        <slot />
      </div>
  </section>
</template>

<script lang="ts">
import type { OcActionDefinition, OcActionSelectPayload } from '../../shared/ui/action/action.types'

export type OcCardAction = OcActionDefinition
</script>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import OcActionRail from './OcActionRail.vue'
import OcBar from './OcBar.vue'

interface OcCardProps {
  /** 标题文案 */
  title?: string
  /** 标题图标 */
  icon?: IconToken
  /** 外观变体。默认 'surface' */
  variant?: 'plain' | 'surface' | 'glass'
  /** 头部操作按钮定义 */
  actions?: OcCardAction[]
  /** 占满容器。默认 false */
  fill?: boolean
}

interface OcCardEmits {
  /** 卡片动作触发时抛出 action key */
  action: [payload: { key: string }]
}

defineOptions({
  name: 'OcCard',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<OcCardProps>(), {
  title: undefined,
  icon: undefined,
  variant: 'surface',
  actions: () => [],
  fill: false,
})

const emit = defineEmits<OcCardEmits>()
const attrs = useAttrs()

const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const hasHeader = computed(() => Boolean(props.title || props.icon || props.actions?.length))
const cardClasses = computed(() => [
  `oc-card--variant-${props.variant}`,
  { 'oc-card--fill': props.fill },
  attrs.class,
])

function handleActionSelect(payload: OcActionSelectPayload): void {
  emit('action', { key: payload.key })
}

</script>

<style scoped>
.oc-card {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--oc-radius-md);
  transition:
    background-color var(--oc-duration-fast) var(--oc-ease),
    border-color var(--oc-duration-fast) var(--oc-ease),
    box-shadow var(--oc-duration-fast) var(--oc-ease);
}

.oc-card--variant-plain {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.oc-card--variant-surface {
  border: var(--oc-border-width) solid var(--oc-border-default);
  background: var(--oc-bg-surface);
  box-shadow: none;
}

.oc-card--variant-glass {
  --oc-card-content-padding: var(--oc-floating-surface-padding);

  border: var(--oc-border-width) solid var(--oc-border-muted);
  background: var(--oc-bg-glass);
  backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
  box-shadow: var(--oc-shadow-md);
}

.oc-card--fill {
  width: 100%;
  height: 100%;
}

.oc-card__header {
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.oc-card__content {
  padding: var(--oc-card-content-padding, var(--oc-space-1));
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.oc-card__content > * {
  min-width: 0;
  min-height: 0;
}
</style>
