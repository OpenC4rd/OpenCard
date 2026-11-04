<!-- 菜单栏的一个入口：文字按钮带可选徽标；菜单本身由 OcActionBar 统一渲染。 -->
<template>
  <OcButton
    variant="ghost"
    :size="size"
    :icon="action.icon"
    :icon-only="iconOnly"
    :aria-label="actionAccessibleLabel(title, action.badgeLabel)"
    aria-haspopup="menu"
    :aria-expanded="open"
  >
    {{ iconOnly ? '' : title }}
    <span v-if="!iconOnly && hasActionBadge(action.badge)" class="oc-number-badge" aria-hidden="true">
      {{ formatActionBadge(action.badge) }}
    </span>
  </OcButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import OcButton from '../base/OcButton.vue'
import { inlineMarkupToText } from '../../shared/ui/inline-markup/inlineMarkup'
import type { ActionButtonSize, OcActionDefinition } from '../../shared/ui/action/action.types'
import { actionAccessibleLabel, actionTitleText, formatActionBadge, hasActionBadge } from './actionBadge'

defineOptions({ name: 'OcMenubarButton' })

const props = defineProps<{
  action: OcActionDefinition
  open: boolean
  size: ActionButtonSize
  iconOnly?: boolean
}>()

const title = computed(() => inlineMarkupToText(actionTitleText(props.action) ?? props.action.key))
</script>
