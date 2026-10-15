<script setup lang="ts">
import OcTree from '../../../components/standard/OcTree.vue'
import type { ShellList } from '../shell.types'

const props = defineProps<{
  list: ShellList
}>()
</script>

<template>
  <OcTree
    v-if="props.list.content"
    fill
    :ref="props.list.content.captureInstance"
    class="open-card-shell__sidebar-tree"
    :data="props.list.content.data"
    :selected-keys="props.list.content.selectedKeys"
    :expanded-keys="props.list.content.expandedKeys"
    :role="props.list.content.role"
    :selection-mode="props.list.content.selectionMode"
    :activation-mode="props.list.content.activationMode"
    :selection-expansion-mode="props.list.content.selectionExpansionMode"
    :scroll-to-selection="props.list.content.scrollToSelection"
    :virtualized="props.list.content.virtualized"
    :action-visibility="props.list.content.actionVisibility"
    :tab-navigation="props.list.content.tabNavigation"
    :placeholder="props.list.placeholder"
    :external-drop="props.list.content.externalDrop"
    @selection-change="props.list.content.onSelectionChange"
    @expansion-change="props.list.content.onExpansionChange"
    @expansion-sync="props.list.content.onExpansionSync"
    @node-activate="props.list.content.onNodeActivate"
    @action="props.list.content.onAction"
    @rename-commit="props.list.content.onRenameCommit"
    @move="props.list.content.onMove"
    @external-drop="props.list.content.onExternalDrop"
    @auxclick="props.list.content.onAuxclick"
  />
</template>
