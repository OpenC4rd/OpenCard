<script setup lang="ts">
import { computed } from 'vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import type { ShellTitleBarNotice } from '../../notifications/titlebarNotices'

const props = defineProps<{ notices: readonly ShellTitleBarNotice[] }>()

// 根元素必须是唯一的 section 且不声明指针事件：调用方透传的
// pointerenter / pointerleave 靠属性透传落在它上面，用来维持浮层打开。

/** 调用方按时间正序给，面板里最新一条在最上面。 */
const rows = computed(() => [...props.notices].reverse())
</script>

<template>
  <section class="titlebar-notice-panel" aria-label="Title bar messages">
    <div v-for="notice in rows" :key="notice.id" class="titlebar-notice-history-row">
      <OcIcon v-if="notice.icon" :name="notice.icon" size="sm" :tone="notice.tone" />
      <span>{{ notice.message }}</span>
    </div>
  </section>
</template>
