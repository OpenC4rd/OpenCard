<script setup lang="ts">
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcText from '../../../components/base/OcText.vue'
import type { OcActionDefinition } from '../../../shared/ui/action/action.types'
import type { IconToken, IconTone } from '../../../shared/ui/icon/iconRegistry'
import type { ShellAction, ShellWorkspaceAction } from '../shell.types'

const props = defineProps<{
  title: string
  icon?: IconToken
  iconTone?: IconTone
  subtitle?: string
  actions: ShellWorkspaceAction[]
  lockBodyScroll?: boolean
  flushBody?: boolean
}>()

defineSlots<{
  default: () => unknown
}>()

const emit = defineEmits<{
  action: [actionKey: string]
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
  <section class="workspace-frame">
    <header class="workspace-header">
      <div class="workspace-heading">
        <OcIcon v-if="props.icon" :name="props.icon" :tone="props.iconTone" size="md" />
        <h1 class="workspace-title">{{ title }}</h1>
        <OcText v-if="props.subtitle" class="workspace-subtitle" size="xs" tone="muted" :truncate="true">
          {{ props.subtitle }}
        </OcText>
      </div>
      <div class="workspace-actions">
        <template v-for="(action, index) in props.actions" :key="typeof action === 'string' ? `text:${index}:${action}` : action.key ?? action.icon">
          <OcText v-if="typeof action === 'string'" class="workspace-action-text" size="xs" tone="muted">
            {{ action }}
          </OcText>
          <OcActionButton v-else :action="toActionDefinition(action)" size="sm" variant="ghost"
            @select="emit('action', $event.key)" />
        </template>
      </div>
    </header>

    <div class="workspace-body" :class="{ locked: lockBodyScroll, flush: flushBody }">
      <slot />
    </div>
  </section>
</template>
