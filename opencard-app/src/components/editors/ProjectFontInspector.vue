<!-- 业务 字体检视器：只读列出字体的字面文件，或组合的成员顺序与覆盖范围；修改走配置对话框。 -->
<template>
  <div class="project-font-inspector">
    <div class="project-font-inspector__content">
      <OcRow v-for="row in identityRows" :key="row.label">
        <template #title><OcText tone="muted">{{ row.label }}</OcText></template>
        <template #append><OcText mono size="sm" truncate :data-tooltip="row.value" data-tooltip-overflow>{{ row.value }}</OcText></template>
      </OcRow>

      <OcText class="project-font-inspector__heading" as="strong" size="sm">{{ listHeading }}</OcText>
      <OcRow v-for="row in listRows" :key="row.key" :subtitle="row.detail">
        <template #leading><OcText v-if="row.order" tone="muted" size="xs">{{ row.order }}</OcText></template>
        <template #title><OcText truncate>{{ row.label }}</OcText></template>
      </OcRow>
    </div>
    <footer class="project-font-inspector__footer">
      <OcButton full-width icon="mdiCogOutline" @click="emit('configure')">
        {{ family ? t('projectConfig.fonts.configure') : t('projectConfig.fonts.configureSet') }}
      </OcButton>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatUnicodeRanges,
  projectFontFileEntries,
  type ProjectFont,
  type ProjectFontComposition,
} from '../../features/workspace/model/projectFontRegistry'
import OcButton from '../base/OcButton.vue'
import OcText from '../base/OcText.vue'
import OcRow from '../standard/OcRow.vue'

const props = defineProps<{
  families: readonly ProjectFont[]
  /** 被检视的单个字体；与 `composition` 互斥。 */
  family?: ProjectFont | null
  /** 被检视的字体组合；与 `family` 互斥。 */
  composition?: ProjectFontComposition | null
}>()
const emit = defineEmits<{ configure: [] }>()
const { t } = useI18n()

const identityRows = computed(() => {
  const entry = props.family ?? props.composition
  return entry ? [
    { label: t('projectConfig.fonts.key'), value: entry.key },
    { label: t('projectConfig.fonts.name'), value: entry.name },
  ] : []
})
const listHeading = computed(() => t(props.family ? 'projectConfig.fonts.faces' : 'projectConfig.fonts.members'))
const listRows = computed(() => {
  if (props.family) {
    return projectFontFileEntries(props.family).map(slot => ({
      key: `${slot.weight}:${slot.style}`,
      order: '',
      label: faceLabel(slot.weight, slot.style),
      detail: slot.source,
    }))
  }
  return (props.composition?.members ?? []).map((member, index) => ({
    key: member.fontKey,
    order: String(index + 1),
    label: props.families.find(font => font.key.toLocaleLowerCase() === member.fontKey.toLocaleLowerCase())?.name ?? member.fontKey,
    detail: formatUnicodeRanges(member.ranges) || t('projectConfig.fonts.memberRangeRest'),
  }))
})

function faceLabel(weight: string, style: string): string {
  const weightKey = { light: 'weightLight', normal: 'weightNormal', bold: 'weightBold' }[weight] ?? 'weightNormal'
  return `${t(`projectConfig.fonts.${weightKey}`)} · ${t(`projectConfig.fonts.${style === 'italic' ? 'styleItalic' : 'styleNormal'}`)}`
}
</script>

<style scoped>
.project-font-inspector {
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}
.project-font-inspector__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--oc-space-xs);
}
.project-font-inspector__heading {
  display: block;
  padding: var(--oc-space-sm) var(--oc-space-sm) var(--oc-space-2xs);
}
.project-font-inspector__footer {
  padding: var(--oc-space-xs);
  border-top: var(--oc-border-width) solid var(--oc-border-muted);
}
</style>
