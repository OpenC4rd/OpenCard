<template>
  <section :id="sectionId" class="project-config-section"
    :class="`project-config-section--indent-${sectionIndent}`">
    <header class="project-config-section__header">
      <OcButton class="project-config-section__toggle" :class="{ 'is-expanded': !collapsed }"
        icon-only size="sm" variant="ghost"
        :aria-label="collapsed ? expandLabel : collapseLabel"
        :data-tooltip="collapsed ? expandLabel : collapseLabel"
        :aria-expanded="!collapsed" :aria-controls="contentId" @click="emit('toggle')">
        <template #icon>
          <OcIcon class="project-config-section__chevron" name="tree.chevron-right" size="action" />
        </template>
      </OcButton>
      <span class="project-config-section__heading">
        <span class="project-config-section__title-row">
          <span class="project-config-section__title">{{ heading }}</span>
          <span v-if="$slots['heading-actions']" class="project-config-section__heading-actions">
            <slot name="heading-actions" />
          </span>
        </span>
        <OcText v-if="description" as="span" tone="muted" size="sm">{{ description }}</OcText>
      </span>
      <span v-if="$slots.actions" class="project-config-section__actions">
        <slot name="actions" />
      </span>
    </header>
    <div :id="contentId" class="project-config-section__content" :class="{ 'is-expanded': !collapsed }"
      :aria-hidden="collapsed" :inert="collapsed || undefined">
      <div class="project-config-section__content-clip">
        <div class="project-config-section__content-body"
          :class="`project-config-section__content-body--indent-${contentIndent}`">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcButton from '../base/OcButton.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'

const props = withDefaults(defineProps<{
  sectionId: string
  heading: string
  description?: string
  collapsed?: boolean
  expandLabel: string
  collapseLabel: string
  sectionIndent?: 'none' | 'single'
  contentIndent?: 'none' | 'single'
}>(), {
  contentIndent: 'none',
  sectionIndent: 'none',
})

const emit = defineEmits<{
  toggle: []
}>()

const contentId = computed(() => `${props.sectionId}-content`)
</script>

<style scoped>
.project-config-section {
  scroll-margin-block-start: var(--oc-space-5);
  padding-block: var(--oc-space-5);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.project-config-section--indent-single {
  margin-inline-start: calc(var(--oc-size-sm) + var(--oc-space-2));
}

.project-config-section__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: var(--oc-space-2);
}

.project-config-section__toggle {
  margin-block-start: calc((var(--oc-text-base) - var(--oc-icon-size-sm)) / 2);
}

/* 折叠箭头是这里自己的内容（走按钮的插槽），旋转也归这里，不必去改按钮的内部结构。 */
.project-config-section__chevron {
  transform: rotate(0deg);
  transition: transform var(--oc-duration-normal) var(--oc-ease);
}

.project-config-section__toggle.is-expanded .project-config-section__chevron {
  transform: rotate(90deg);
}

.project-config-section__heading {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-1);
}

.project-config-section__title {
  font-size: var(--oc-text-base);
  font-weight: var(--font-weight-ui-title);
}

.project-config-section__title-row,
.project-config-section__heading-actions {
  display: inline-flex;
  align-items: center;
}

.project-config-section__title-row {
  min-width: 0;
  gap: var(--oc-space-1);
}

.project-config-section__heading-actions { flex: 0 0 auto; }

.project-config-section__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-1);
}

.project-config-section__content {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--oc-duration-normal) var(--oc-ease),
    opacity var(--oc-duration-fast) var(--oc-ease);
}

.project-config-section__content.is-expanded {
  grid-template-rows: 1fr;
  opacity: 1;
}

.project-config-section__content-clip {
  min-height: 0;
  overflow: hidden;
}

.project-config-section__content-body {
  padding-top: var(--oc-space-4);
}

.project-config-section__content-body--indent-single {
  padding-inline-start: calc(var(--oc-size-sm) + var(--oc-space-2));
}

@media (prefers-reduced-motion: reduce) {
  .project-config-section__chevron,
  .project-config-section__content {
    transition: none;
  }
}
</style>
