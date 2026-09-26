<!-- Base 条目栏：icon + title + append 的水平结构行。 -->

<template>
  <div class="oc-bar" v-bind="$attrs">
    <div class="oc-bar__leading">
      <div v-if="hasIcon" class="oc-bar__icon">
        <slot name="icon">
          <OcIcon v-if="icon" :name="icon" />
        </slot>
      </div>

      <div v-if="hasTitle" class="oc-bar__title">
        <slot name="title">
          <OcText truncate>
            {{ title }}
          </OcText>
        </slot>
      </div>
    </div>

    <div v-if="$slots.append" class="oc-bar__append">
      <slot name="append" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'

interface Props {
  icon?: IconToken
  title?: string
}

defineOptions({ name: 'OcBar', inheritAttrs: false })

const props = defineProps<Props>()

const slots = defineSlots<{
  icon?: () => any
  title?: () => any
  append?: () => any
}>()

const hasIcon = computed(() => Boolean(props.icon) || Boolean(slots.icon))
const hasTitle = computed(() => Boolean(props.title) || Boolean(slots.title))
</script>

<style scoped>
.oc-bar {
  display: flex;
  align-items: center;
  min-height: var(--oc-size-md);
  gap: var(--oc-space-2);
  padding-inline: var(--oc-space-3);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-base);
}

.oc-bar__leading {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--oc-space-2);
}

.oc-bar__icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.oc-bar__title {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
}

.oc-bar__append {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-2);
  flex: 0 0 auto;
}

.oc-bar:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}
</style>
