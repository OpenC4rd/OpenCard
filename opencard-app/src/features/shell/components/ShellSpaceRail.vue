<!-- Feature 空间栏：提供一级空间切换，并把当前空间暴露给辅助技术。 -->
<script setup lang="ts">
import { computed } from 'vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import type { ShellSpaceDefinition } from '../shellSection'
import type { SpaceKey } from '../shellLocation'

interface ShellSpaceRailProps {
  /** 当前激活的空间。决定 aria-current 与选中外观。 */
  activeSpace: SpaceKey
  /** 空间的静态身份列表。只包含图标、名称键和空间 key。 */
  spaces: readonly ShellSpaceDefinition[]
  /** 空间栏的可访问名称。用于区分页面内的其他导航。 */
  label: string
  /** 将静态名称键转换为当前语言的可见名称。 */
  translate: (key: string) => string
}

const props = defineProps<ShellSpaceRailProps>()

const spaceGroups = computed(() => (['primary', 'secondary'] as const).map(key => ({
  key,
  spaces: props.spaces.filter(space => (space.railGroup ?? 'primary') === key),
})).filter(group => group.spaces.length > 0))

const emit = defineEmits<{
  select: [space: SpaceKey]
}>()
</script>

<template>
  <nav class="shell-space-rail" :aria-label="props.label" data-tooltip-placement="right" data-tooltip-group>
    <div
      v-for="group in spaceGroups"
      :key="group.key"
      class="shell-space-rail__items"
      :class="{ 'shell-space-rail__items--secondary': group.key === 'secondary' }"
    >
      <button
        v-for="space in group.spaces"
        :key="space.key"
        class="shell-space-rail__item"
        :class="{ 'is-active': space.key === props.activeSpace }"
        type="button"
        :aria-label="props.translate(space.labelKey)"
        :aria-current="space.key === props.activeSpace ? 'page' : undefined"
        :data-tooltip="props.translate(space.labelKey)"
        @click="emit('select', space.key)"
      >
        <OcIcon :name="space.icon" :tone="space.key === props.activeSpace ? 'accent' : 'muted'" size="md" />
      </button>
    </div>
  </nav>
</template>
