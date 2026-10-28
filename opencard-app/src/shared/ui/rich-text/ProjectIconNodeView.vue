<template>
  <NodeViewWrapper as="span" class="project-icon-node"
    :class="{ 'is-selected': selected, 'is-missing': !entry }"
    contenteditable="false" tabindex="-1"
    :aria-label="tr('propertyEditor.richText.selectProjectIcon', '点击选中项目图标')" @mousedown.stop @click="selectIconNode">
    <span v-if="entry" class="project-icon-node__image oc-project-icon" :style="entry.inlineStyle" role="img"
      :aria-label="entry.name" :data-tooltip="entry.name" />
    <span v-else class="project-icon-node__missing">{{ tr('propertyEditor.richText.iconUnavailable', '图标不可用') }}</span>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { computed, getCurrentInstance } from 'vue'
import type { ProjectIconNodeOptions } from './projectIconNode'

const props = defineProps<NodeViewProps>()

const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const options = computed(() => props.extension.options as ProjectIconNodeOptions)
const entry = computed(() => {
  const reference = String(props.node.attrs.iconPath ?? '')
  return reference ? options.value.resolve?.(reference) ?? null : null
})

function selectIconNode(): void {
  const position = props.getPos()
  if (typeof position !== 'number') return
  props.editor.view.dispatch(
    props.editor.state.tr.setSelection(NodeSelection.create(props.editor.state.doc, position)),
  )
  props.editor.view.focus()
}
</script>

<style scoped>
.project-icon-node {
  display: inline-flex;
  align-items: center;
  border-radius: var(--oc-radius-control);
  vertical-align: text-bottom;
  cursor: default;
}
.project-icon-node__image { display: inline-block; flex: none; background-repeat: no-repeat; vertical-align: text-bottom; }
.project-icon-node__missing { color: var(--oc-fg-danger); font-family: var(--oc-font-mono); }
.project-icon-node.is-selected { box-shadow: var(--oc-focus-ring); }
</style>
