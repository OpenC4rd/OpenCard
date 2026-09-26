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
      <Transition
        @before-enter="beforeContentEnter"
        @enter="enterContent"
        @after-enter="clearContentTransition"
        @enter-cancelled="clearContentTransition"
        @before-leave="beforeContentLeave"
        @leave="leaveContent"
        @after-leave="clearContentTransition"
        @leave-cancelled="clearContentTransition"
      >
        <div v-if="!collapsed" class="oc-card__content-shell">
          <div class="oc-card__content">
            <slot />
          </div>
        </div>
      </Transition>
  </section>
</template>

<script lang="ts">
import type { OcActionButtonAction } from './OcActionButton.vue'

export type OcCardAction = OcActionButtonAction
</script>

<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import { prefersReducedMotion } from '../../shared/ui/foundation'
import type { OcActionButtonSelectPayload } from './OcActionButton.vue'
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
  /** 是否折叠内容。默认 false */
  collapsed?: boolean
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
  collapsed: false,
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
  { 'oc-card--fill': props.fill, 'oc-card--collapsed': props.collapsed },
  attrs.class,
])

function handleActionSelect(payload: OcActionButtonSelectPayload): void {
  emit('action', { key: payload.key })
}

function asContentElement(element: Element): HTMLElement | null {
  return element instanceof HTMLElement ? element : null
}

function setContentTransition(element: HTMLElement): void {
  element.style.transition = prefersReducedMotion()
    ? 'none'
    : 'height var(--oc-duration-slow) var(--oc-ease), opacity var(--oc-duration-normal) var(--oc-ease)'
}

function clearContentTransition(element: Element): void {
  const content = asContentElement(element)
  if (!content) return

  content.style.height = ''
  content.style.opacity = ''
  content.style.overflow = ''
  content.style.transition = ''
}

function beforeContentEnter(element: Element): void {
  const content = asContentElement(element)
  if (!content) return

  content.style.height = '0'
  content.style.opacity = '0'
  content.style.overflow = 'hidden'
}

function enterContent(element: Element, done: () => void): void {
  const content = asContentElement(element)
  if (!content || prefersReducedMotion()) {
    done()
    return
  }

  setContentTransition(content)
  requestAnimationFrame(() => {
    content.style.height = `${content.scrollHeight}px`
    content.style.opacity = '1'
  })
  window.setTimeout(done, 250)
}

function beforeContentLeave(element: Element): void {
  const content = asContentElement(element)
  if (!content) return

  content.style.height = `${content.getBoundingClientRect().height}px`
  content.style.opacity = '1'
  content.style.overflow = 'hidden'
}

function leaveContent(element: Element, done: () => void): void {
  const content = asContentElement(element)
  if (!content || prefersReducedMotion()) {
    done()
    return
  }

  setContentTransition(content)
  content.getBoundingClientRect()
  requestAnimationFrame(() => {
    content.style.height = '0'
    content.style.opacity = '0'
  })
  window.setTimeout(done, 250)
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

.oc-card--collapsed.oc-card--fill {
  height: auto;
  flex: 0 0 auto;
}

.oc-card__header {
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.oc-card--collapsed .oc-card__header,
.oc-card__header:last-child {
  border-bottom: none;
}

.oc-card__content-shell {
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
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
