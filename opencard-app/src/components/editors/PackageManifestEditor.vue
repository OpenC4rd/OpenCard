<!-- 业务 包清单预览：把被打开的归档交给 PackageManifestContent，自己只管标签页的标题。 -->
<template>
  <ProjectRegistryEditorShell>
    <PackageManifestContent :path="filePath" @update:coordinate="coordinate = $event" />
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorProps } from '../../features/editor-runtime/editorProtocol'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { getPathBasename } from '../../shared/model/filePath'
import PackageManifestContent from './PackageManifestContent.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

const props = defineProps<EditorProps>()
const editorState = computed(() => props.session.state)
const filePath = computed(() => editorState.value.path ?? `draft://${editorState.value.id}`)
const { t } = useI18n()
const coordinate = ref('')

const presentation = computed<EditorPresentation>(() => ({
  // 主标题是这个文件本身叫什么，小字是它自述的坐标。文件叫什么名字不算数 —— 那是"它是谁"，
  // 不是"你打开的是哪一个文件"。
  title: getPathBasename(filePath.value),
  description: coordinate.value || t('packageManifest.description'),
  icon: 'mdiPackageVariantClosed',
}))

defineExpose({ presentation })
</script>
