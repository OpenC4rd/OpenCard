<template>
  <MonacoEditor
    v-if="mode === 'text'"
    :model-value="textContent"
    language="plaintext"
    :theme-id="themeId"
    :theme-overrides="themeOverrides"
    read-only
  />
  <section v-else class="unsupported-file-editor" :aria-label="t('unsupportedFile.title')">
    <OcIcon :name="fileType.icon" :tone="fileType.iconTone" size="lg" />
    <h1>{{ t('unsupportedFile.title') }}</h1>
    <p>{{ t('unsupportedFile.description', { name: displayName }) }}</p>
    <div class="unsupported-file-editor__actions">
      <OcButton icon="status.eye" variant="solid" @click="openAsReadonlyText">
        {{ t('unsupportedFile.openReadonly') }}
      </OcButton>
      <OcButton icon="status.folder-open" variant="outline" @click="openWithSystem">
        {{ t('unsupportedFile.openWithSystem') }}
      </OcButton>
    </div>
    <OcText v-if="errorMessage" tone="danger" role="alert">{{ errorMessage }}</OcText>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { resolveFileType } from '../../features/workspace/model/fileTypes'
import OcButton from '../base/OcButton.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import MonacoEditor from './MonacoEditor.vue'

defineOptions({ name: 'UnsupportedFileEditor' })

const props = defineProps<EditorProps>()
const { t } = useI18n()
const mode = ref<'prompt' | 'text'>('prompt')
const textContent = ref('')
const errorMessage = ref('')
let actionPending = false

const displayName = computed(() => props.fileName || props.filePath.split(/[/\\]/).pop() || props.filePath)

/** 没有专门编辑器的文件仍由它自己的文件类型说话，于是文件树与被打开的会话认出同一个形状。 */
const fileType = computed(() => resolveFileType(props.filePath))

const presentation = computed<EditorPresentation>(() => ({
  title: displayName.value,
  description: t('unsupportedFile.title'),
  icon: fileType.value.icon,
  iconTone: fileType.value.iconTone,
}))

defineExpose({ presentation })
const absolutePath = computed(() => {
  if (/^[a-z]:[/\\]/i.test(props.filePath) || props.filePath.startsWith('/')) return props.filePath
  const root = props.resourceRootPath?.replace(/[/\\]+$/, '')
  return root ? `${root}/${props.filePath}` : props.filePath
})

async function openAsReadonlyText(): Promise<void> {
  if (actionPending) return
  actionPending = true
  errorMessage.value = ''
  try {
    textContent.value = await fileSystemService.readFile(absolutePath.value)
    mode.value = 'text'
  } catch {
    errorMessage.value = t('unsupportedFile.readFailed')
  } finally {
    actionPending = false
  }
}

async function openWithSystem(): Promise<void> {
  if (actionPending) return
  actionPending = true
  errorMessage.value = ''
  try {
    await fileSystemService.openWithDefaultApp(absolutePath.value)
  } catch {
    errorMessage.value = t('unsupportedFile.systemOpenFailed')
  } finally {
    actionPending = false
  }
}
</script>

<style scoped>
.unsupported-file-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2);
  padding: var(--oc-space-5);
  color: var(--oc-fg-default);
  text-align: center;
}

.unsupported-file-editor h1,
.unsupported-file-editor p {
  margin: 0;
}

.unsupported-file-editor h1 {
  font-size: var(--oc-text-xl);
  font-weight: var(--font-weight-ui-title);
}

.unsupported-file-editor p {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-base);
  overflow-wrap: anywhere;
}

.unsupported-file-editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--oc-space-2);
  margin-top: var(--oc-space-3);
}
</style>
