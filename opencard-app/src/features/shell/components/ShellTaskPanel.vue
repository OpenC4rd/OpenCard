<script setup lang="ts">
import OcButton from '../../../components/base/OcButton.vue'
import type { ShellProgressTask } from '../shell.types'

const props = defineProps<{
  tasks: readonly ShellProgressTask[]
  cancelTaskLabel?: string
}>()

// 根元素必须是唯一的 section 且不声明指针事件：调用方透传的
// pointerenter / pointerleave 靠属性透传落在它上面，用来维持浮层打开。
const emit = defineEmits<{
  'cancel-task': [taskKey: string]
}>()

function taskProgressPercent(task: ShellProgressTask): number {
  return Math.round(Math.min(1, Math.max(0, task.progress)) * 100)
}
</script>

<template>
  <section class="titlebar-task-panel" aria-live="polite">
    <div v-for="task in props.tasks" :key="task.key" class="titlebar-task-row">
      <div class="titlebar-task-row__header">
        <span class="titlebar-task-row__title">{{ task.title }}</span>
        <span class="titlebar-task-row__actions">
          <span class="titlebar-task-row__value">{{ taskProgressPercent(task) }}%</span>
          <OcButton
            v-if="task.cancellable"
            icon-only
            size="sm"
            variant="ghost"
            icon="mdiClose"
            :aria-label="props.cancelTaskLabel || 'Cancel task'"
            :data-tooltip="props.cancelTaskLabel || 'Cancel task'"
            @click="emit('cancel-task', task.key)"
          />
        </span>
      </div>
      <span v-if="task.detail" class="titlebar-task-row__detail">{{ task.detail }}</span>
      <div
        class="titlebar-task-row__track"
        role="progressbar"
        :aria-label="task.title"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="taskProgressPercent(task)"
      >
        <span
          class="titlebar-task-row__fill"
          :style="{ width: `${taskProgressPercent(task)}%` }"
        />
      </div>
    </div>
  </section>
</template>
