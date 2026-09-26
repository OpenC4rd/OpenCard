<template>
    <div :data-block-id="block.id" :style="blockStyle" @click.stop="handleClick">
        <NativeBlockRenderer v-for="child in block.children" :key="child.block.id" :block="child.block"
            :placement="{ kind: 'absolute', location: child.location }" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NativeBlockRenderer from './NativeBlockRenderer.vue'
import { useCardEditorContext } from './cardEditorContext'
import type { RenderReadySimpleContainerBlock } from '../render.types'
import { getBlockRenderPlacementStyles, type BlockRenderPlacement } from './blockRenderPlacement'

const props = defineProps<{
    block: RenderReadySimpleContainerBlock
    placement: BlockRenderPlacement
}>()

const editorContext = useCardEditorContext()
const isTransformDisabled = computed(() => editorContext.transformDisabledBlockIds.value.has(props.block.id))

const blockStyle = computed(() => {
    const style = getBlockRenderPlacementStyles(props.block, props.placement, isTransformDisabled.value)
    return `${style}; overflow: ${props.block.clip ? 'hidden' : 'visible'}`
})

function handleClick(event: MouseEvent) {
    editorContext.handleBlockClick(props.block.id, event)
}
</script>
