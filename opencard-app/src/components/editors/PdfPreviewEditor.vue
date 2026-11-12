<!-- PDF 预览：交给 WebView 自带的 PDF 查看器，翻页、缩放与搜索都由它提供。 -->
<template>
  <iframe class="pdf-preview-editor" :src="pdfSrc" :aria-label="fileName" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { EditorProps } from '../../features/editor-runtime/editorProtocol'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { useProjectStore } from '../../features/workspace/store/projectStore'

const props = defineProps<EditorProps>()
const { resolveAssetSrc } = useProjectStore()

const filePath = computed(() => props.session.state.path ?? '')
const fileName = computed(() => filePath.value.split(/[/\\]/).pop() || filePath.value)
const pdfSrc = computed(() => props.session.state.resourceKind === 'workspace'
  ? resolveAssetSrc(filePath.value)
  : convertFileSrc(filePath.value))

const presentation = computed<EditorPresentation>(() => ({
  title: fileName.value,
  description: '',
  icon: 'mdiFilePdfBox',
  iconTone: 'danger',
}))

defineExpose({ presentation })
</script>

<style scoped>
.pdf-preview-editor {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
