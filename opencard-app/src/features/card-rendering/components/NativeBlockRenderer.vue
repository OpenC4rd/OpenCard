<template>
  <TextBlockRenderer v-if="block.type === 'text-block'" :block="block" :placement="placement" />
  <MarkdownTextBlockRenderer v-else-if="block.type === 'markdown-text-block'" :block="block" :placement="placement" />
  <ImageBlockRenderer v-else-if="block.type === 'image-block'" :block="block" :placement="placement" />
  <QrCodeBlockRenderer v-else-if="block.type === 'qrcode-block'" :block="block" :placement="placement" />
  <ShapeBlockRenderer v-else-if="block.type === 'shape-block'" :block="block" :placement="placement" />
  <SimpleContainerBlockRenderer v-else-if="block.type === 'simple-container-block'" :block="block" :placement="placement" />
  <FlowContainerBlockRenderer v-else-if="block.type === 'flow-container-block'" :block="block" :placement="placement" />
  <CustomBlockRenderer v-else-if="block.type === 'custom-block'" :block="block" :placement="placement" />
</template>

<script setup lang="ts">
import type { RenderReadyCardBlock } from '../render.types'
import FlowContainerBlockRenderer from './FlowContainerBlockRenderer.vue'
import ImageBlockRenderer from './ImageBlockRenderer.vue'
import MarkdownTextBlockRenderer from './MarkdownTextBlockRenderer.vue'
import QrCodeBlockRenderer from './QrCodeBlockRenderer.vue'
import ShapeBlockRenderer from './ShapeBlockRenderer.vue'
import SimpleContainerBlockRenderer from './SimpleContainerBlockRenderer.vue'
import TextBlockRenderer from './TextBlockRenderer.vue'
import CustomBlockRenderer from './CustomBlockRenderer.vue'
import type { BlockRenderPlacement } from './blockRenderPlacement'

defineProps<{
  block: RenderReadyCardBlock
  placement: BlockRenderPlacement
}>()
</script>
