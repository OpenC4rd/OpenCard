<template>
    <div :data-block-id="block.id" :style="blockStyle" @click.stop="handleClick">
        <NativeBlockRenderer v-for="child in orderedChildren" :key="child.block.id" :block="child.block"
            :placement="{ kind: 'flow', location: child.location }" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NativeBlockRenderer from './NativeBlockRenderer.vue'
import { useCardEditorContext } from './cardEditorContext'
import type { RenderReadyFlowContainerBlock } from '../render.types'
import { getBlockRenderPlacementStyles, type BlockRenderPlacement } from './blockRenderPlacement'

const props = defineProps<{
    block: RenderReadyFlowContainerBlock
    placement: BlockRenderPlacement
}>()

const editorContext = useCardEditorContext()
const isTransformDisabled = computed(() => editorContext.transformDisabledBlockIds.value.has(props.block.id))

const directionMap: Record<RenderReadyFlowContainerBlock['direction'], string> = {
    lr: 'row',
    rl: 'row-reverse',
    tb: 'column',
    bt: 'column-reverse',
}

const blockStyle = computed(() => {
    const pos = getBlockRenderPlacementStyles(props.block, props.placement, isTransformDisabled.value)
    const flexDir = directionMap[props.block.direction]
    return `${pos}; display: flex; flex-direction: ${flexDir}; gap: ${props.block.gap}; overflow: ${props.block.clip ? 'hidden' : 'visible'}`
})

const orderedChildren = computed(() =>
    [...props.block.children].sort((a, b) => a.location.index - b.location.index)
)

function handleClick(event: MouseEvent) {
    editorContext.handleBlockClick(props.block.id, event)
}
</script>
