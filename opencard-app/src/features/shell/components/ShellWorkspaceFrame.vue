<script setup lang="ts">
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcText from '../../../components/base/OcText.vue'
import OcSkeleton from '../../../components/base/OcSkeleton.vue'
import type { OcActionDefinition } from '../../../shared/ui/action/action.types'
import type { ShellAction } from '../shell.types'
import type { ShellHeaderModel } from '../shell.types'

const props = defineProps<{
  header: ShellHeaderModel
  lockBodyScroll?: boolean
  flushBody?: boolean
}>()

defineSlots<{
  default: () => unknown
}>()

function toActionDefinition(action: ShellAction): OcActionDefinition {
  return {
    key: action.key ?? action.icon,
    title: action.hoverTip ?? action.value,
    icon: action.icon,
    disabled: action.disabled,
    badge: action.badge,
    badgeLabel: action.badgeLabel,
    children: action.options ?? action.children,
  }
}
</script>

<template>
  <section class="workspace-frame" :aria-busy="props.header.titleLoading || undefined">
    <header class="workspace-header">
      <div class="workspace-heading">
        <OcIcon v-if="props.header.icon" :name="props.header.icon" :tone="props.header.iconTone" size="md" />
        <h1 class="workspace-title">
          <OcSkeleton v-if="props.header.titleLoading" width="md" height="md" />
          <template v-else>{{ props.header.title }}</template>
        </h1>
        <OcText v-if="props.header.subtitle" class="workspace-subtitle" size="xs" tone="muted" :truncate="true">
          {{ props.header.subtitle }}
        </OcText>
      </div>
      <div class="workspace-actions">
        <template v-for="(action, index) in props.header.actions" :key="typeof action === 'string' ? `text:${index}:${action}` : action.key ?? action.icon">
          <OcText v-if="typeof action === 'string'" class="workspace-action-text" size="xs" tone="muted">
            {{ action }}
          </OcText>
          <OcActionButton v-else :action="toActionDefinition(action)" size="sm" variant="ghost"
            @select="props.header.onAction?.($event.key)" />
        </template>
      </div>
    </header>

    <div class="workspace-body" :class="{ locked: lockBodyScroll, flush: flushBody }">
      <slot />
    </div>
  </section>
</template>
