<!--
  字体预览的悬停信息层：只描述被悬停的一段预览文字所属的字体。

  职责边界：
  - 不创建浮层、不做定位、不判断打开状态；位置与显隐由 OcOverlayMarker 提供。
  - 参数是打开那一刻的快照（font / face / coverageFailed），这里不读编辑器状态。
-->
<template>
  <section v-if="font" class="project-font-registry-workbench__font-info" role="tooltip">
    <strong>{{ font.name }}</strong>
    <dl>
      <div>
        <dt>{{ t('projectConfig.fonts.previewFontKey') }}</dt>
        <dd>{{ font.key }}</dd>
      </div>
      <div>
        <dt>{{ t('projectConfig.fonts.previewFontSource') }}</dt>
        <dd>{{ face?.source ?? projectFontFileEntries(font).map(slot => slot.source).join('; ') }}</dd>
      </div>
    </dl>
  </section>
  <section v-else class="project-font-registry-workbench__font-info" role="tooltip">
    <strong>{{ coverageFailed ? t('projectConfig.fonts.previewCoverageUnavailable')
      : t('projectConfig.fonts.previewSystemFallback') }}</strong>
    <OcText tone="muted" size="sm">{{ coverageFailed
      ? t('projectConfig.fonts.previewCoverageUnavailableDescription')
      : t('projectConfig.fonts.previewSystemFallbackDescription') }}</OcText>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { projectFontFileEntries, type ProjectFont } from '../../features/workspace/model/projectFontRegistry'
import OcText from '../base/OcText.vue'

type FontFileEntry = ReturnType<typeof projectFontFileEntries>[number]

defineProps<{
  font: ProjectFont | null
  face?: FontFileEntry | null
  coverageFailed: boolean
}>()

const { t } = useI18n()
</script>

<style scoped>
/* 提示类浮层不带宿主统一的浮层外观，边框、圆角与阴影由这一层自己给出。 */
.project-font-registry-workbench__font-info {
  max-width: var(--oc-content-width-sm);
  padding: var(--oc-space-sm);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-md);
  pointer-events: none;
}
.project-font-registry-workbench__font-info strong { display: block; margin-bottom: var(--oc-space-xs); }
.project-font-registry-workbench__font-info dl { display: grid; gap: var(--oc-space-2xs); margin: 0; }
.project-font-registry-workbench__font-info dl > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--oc-space-xs);
}
.project-font-registry-workbench__font-info dt { color: var(--oc-fg-muted); }
.project-font-registry-workbench__font-info dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
</style>

<style>
/* 层根由浮层组宿主渲染，scoped 规则到不了它；提示层必须整块不吃指针。 */
.overlay-group-layer:has(> .overlay-group-content > .project-font-registry-workbench__font-info) {
  pointer-events: none;
}
</style>
