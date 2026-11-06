<!-- 数据表页悬浮卡旁的卡牌名：和设计模式的卡面信息同款淡显文字，悬停变清晰。 -->
<template>
  <section class="cde-table-preview-info" :aria-label="t('cardDesigner.info.title')">{{ cardName }}</section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ cardName: string }>()
const { t } = useI18n()
</script>

<style scoped>
.cde-table-preview-info {
  overflow: hidden;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-sm);
  line-height: 1.55;
  opacity: 0.34;
  text-overflow: ellipsis;
  transition: opacity 140ms ease-out;
  white-space: nowrap;
}

.cde-table-preview-info:hover {
  opacity: 1;
}
</style>
