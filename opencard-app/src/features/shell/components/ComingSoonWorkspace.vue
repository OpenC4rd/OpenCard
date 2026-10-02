<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcText from '../../../components/base/OcText.vue'
import type { IconToken } from '../../../shared/ui/icon/iconRegistry'

defineOptions({ name: 'ComingSoonWorkspace' })

defineProps<{
  title: string
  icon: IconToken
}>()

const { t } = useI18n()
</script>

<template>
  <section class="coming-soon-workspace" :aria-label="title">
    <OcIcon :name="icon" tone="muted" size="display" />
    <h2 class="coming-soon-workspace__title">{{ title }}</h2>
    <OcText tone="muted">{{ t('app.shell.space.comingSoon') }}</OcText>
  </section>
</template>

<style scoped>
.coming-soon-workspace {
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--oc-space-3);
  min-height: 100%;
  padding: var(--oc-space-8);
  text-align: center;
}

.coming-soon-workspace__title {
  margin: 0;
  font-size: var(--oc-font-size-xl);
  font-weight: 600;
}
</style>
