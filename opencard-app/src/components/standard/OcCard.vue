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
  /** 内容区四边留白（8px）。默认 true；内容是自带留白的列表/树时传 false。 */
  padding?: boolean
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
  padding: true,
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
  { 'oc-card--fill': props.fill, 'oc-card--padded': props.padding },
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
  border-radius: var(--oc-radius-control);
  transition:
    background-color var(--oc-duration-quick) var(--oc-ease),
    border-color var(--oc-duration-quick) var(--oc-ease),
    box-shadow var(--oc-duration-quick) var(--oc-ease);
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
  border: var(--oc-border-width) solid var(--oc-border-muted);
  background: var(--oc-bg-glass);
  backdrop-filter: var(--oc-bg-glass-filter);
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
  padding: 0;
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

/* 有留白时四边同档；无留白时由内容自己（行/树行）带内缩。 */
.oc-card--padded .oc-card__content {
  padding: var(--oc-space-sm);
}

.oc-card__content > * {
  min-width: 0;
  min-height: 0;
}
</style>
