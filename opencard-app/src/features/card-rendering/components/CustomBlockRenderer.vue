<!-- Card custom-block boundary: delegates ready content to the native container renderer. -->
<template>
    <NativeBlockRenderer v-if="block.state === 'ready'" :block="block.content" :placement="placement" />
    <div v-else :data-block-id="block.id" :class="['oc-custom-block-placeholder', `is-${block.state}`]">
        {{ block.state === 'limited' ? t('cardDesigner.customBlock.limited') : t('cardDesigner.customBlock.sourceUnavailable') }}
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NativeBlockRenderer from './NativeBlockRenderer.vue'
import type { RenderReadyCustomBlock } from '../render.types'
import type { BlockRenderPlacement } from './blockRenderPlacement'

defineProps<{
    /** 已解析的自定义块运行时内容。决定委托的容器树与受限状态。 */
    block: RenderReadyCustomBlock
    /** 宿主布局传入的位置。ready 状态直接交给内容容器使用。 */
    placement: BlockRenderPlacement
}>()

const { t } = useI18n()
</script>
