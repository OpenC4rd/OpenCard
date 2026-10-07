<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcText from '../../../components/base/OcText.vue'
import OcSkeleton from '../../../components/base/OcSkeleton.vue'
import type { ShellHeaderModel } from '../shell.types'

const props = defineProps<{
  header: ShellHeaderModel | null
  lockBodyScroll?: boolean
  flushBody?: boolean
}>()

defineSlots<{
  default: () => unknown
}>()
const actionRevision = ref(0)
watch(() => props.header?.onAction, () => { actionRevision.value++ })
const actionItems = computed(() => props.header?.actions.map(action => ({ action, onAction: props.header?.onAction })) ?? [])

</script>

<template>
  <section class="page-frame" :aria-busy="props.header?.titleLoading || undefined">
    <header v-if="props.header" class="page-header">
      <div class="page-heading">
        <OcIcon v-if="props.header.icon" :name="props.header.icon" :tone="props.header.iconTone" size="md" />
        <h1 class="page-title">
          <OcSkeleton v-if="props.header.titleLoading" width="md" height="md" />
          <template v-else>{{ props.header.title }}</template>
        </h1>
        <OcText v-if="props.header.subtitle" class="page-subtitle" size="xs" tone="muted" :truncate="true">
          {{ props.header.subtitle }}
        </OcText>
      </div>
      <div class="page-actions">
        <template v-for="({ action, onAction }, index) in actionItems" :key="typeof action === 'string' ? `text:${index}:${action}` : `${actionRevision}:${action.key}`">
          <OcText v-if="typeof action === 'string'" class="page-action-text" size="xs" tone="muted">
            {{ action }}
          </OcText>
          <OcActionButton v-else :action="action" size="sm" variant="ghost"
            @select="onAction?.($event.key)" />
        </template>
      </div>
    </header>

    <div class="page-body" :class="{ locked: lockBodyScroll, flush: flushBody }">
      <slot />
    </div>
  </section>
</template>
