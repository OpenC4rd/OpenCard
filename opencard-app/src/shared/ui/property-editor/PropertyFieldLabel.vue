<!-- 属性行标签：宿主开启后，点属性名复制稳定的属性 Key。 -->
<template>
  <button v-if="copyable" type="button" class="property-field-label__copy"
    :data-tooltip="t('propertyEditor.actions.copyFieldKeyTooltip', { key: fieldKey })"
    :aria-label="t('propertyEditor.actions.copyFieldKey', { key: fieldKey })"
    @click.stop="copyFieldKey">
    <OcText class="property-field-label__text" :truncate="true">{{ label }}</OcText>
  </button>
  <OcText v-else class="property-field-label__text" :truncate="true">{{ label }}</OcText>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OcText from '../../../components/base/OcText.vue'
import { notifyAppError } from '../../../features/notifications/titlebarNotices'

const props = defineProps<{
  label: string
  fieldKey: string
  copyable?: boolean
}>()

const { t } = useI18n()

async function copyFieldKey(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.fieldKey)
  } catch (error) {
    notifyAppError('OC-E1002', { source: 'property-field-key', fieldKey: props.fieldKey, error })
  }
}
</script>

<style scoped>
.property-field-label__text {
  min-width: 0;
}

.property-field-label__copy {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 1px;
  background: transparent;
  color: inherit;
  font: inherit;
  transition: color var(--oc-duration-quick) var(--oc-ease);
}

.property-field-label__copy:hover,
.property-field-label__copy:focus-visible {
  color: var(--oc-fg-default);
}

.property-field-label__copy:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}
</style>
