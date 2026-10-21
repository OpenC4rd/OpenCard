<template>
  <FontDiffView v-if="editorState.mode === 'diff'" :comparison="props.comparison" :file-path="filePath"
    :project-root-path="props.resourceRootPath" />
  <ProjectRegistryEditorShell v-else content-mode="workspace">
    <section class="font-preview-editor" :aria-label="t('fontPreview.title', { name: displayName })">
      <div v-if="loading" class="font-preview-editor__status">
        <OcText tone="muted">{{ t('fontPreview.loading') }}</OcText>
      </div>
      <div v-else-if="loadFailed" class="font-preview-editor__status">
        <OcText tone="danger" role="alert">{{ repairError || t('fontPreview.loadFailed') }}</OcText>
        <OcText tone="muted" size="sm">{{ t('fontPreview.repairDescription') }}</OcText>
        <OcButton icon="mdiRefresh" variant="soft" :disabled="repairing" @click="attemptRepair">
          {{ repairing ? t('fontPreview.repairing') : t('fontPreview.attemptRepair') }}
        </OcButton>
      </div>
      <main v-else class="font-preview-editor__workspace">
        <label for="font-preview-input">{{ t('fontPreview.tryLabel') }}</label>
        <OcFieldInput
          id="font-preview-input"
          class="font-preview-editor__input"
          as="textarea"
          full-width
          :value="previewText"
          :placeholder="t('fontPreview.tryPlaceholder')"
          :style="specimenStyle"
          @input="previewText = ($event.target as HTMLTextAreaElement).value"
        />
      </main>
    </section>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorProps } from '../../features/editor-runtime/editorProtocol'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { repairTrueTypeFont } from '../../features/workspace/services/trueTypeFontRepair'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import FontDiffView from './FontDiffView.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

defineOptions({ name: 'FontPreviewEditor' })

const props = defineProps<EditorProps>()
const editorState = computed(() => props.session.state)
const filePath = computed(() => editorState.value.path ?? `draft://${editorState.value.id}`)
const { t } = useI18n()
const previewFamily = `OpenCardFontPreview-${crypto.randomUUID()}`
const loading = ref(true)
const loadFailed = ref(false)
const repairing = ref(false)
const repairError = ref('')
const previewText = ref(t('fontPreview.sample'))
let loadedFace: FontFace | null = null
let fontObjectUrl: string | null = null
let loadVersion = 0

const displayName = computed(() => editorState.value.name || filePath.value.split(/[/\\]/).pop() || filePath.value)

const presentation = computed<EditorPresentation>(() => ({
  title: displayName.value,
  description: t('fontPreview.subtitle'),
  icon: 'mdiFormatFont',
}))

defineExpose({ presentation })
const specimenStyle = computed<CSSProperties>(() => ({ fontFamily: previewFamily }))
const absolutePath = computed(() => {
  if (/^[a-z]:[/\\]/i.test(filePath.value) || filePath.value.startsWith('/')) return filePath.value
  const root = props.resourceRootPath?.replace(/[/\\]+$/, '')
  return root ? `${root}/${filePath.value}` : filePath.value
})

function removeLoadedFace(): void {
  if (loadedFace) {
    document.fonts.delete(loadedFace)
    loadedFace = null
  }
  if (fontObjectUrl) {
    URL.revokeObjectURL(fontObjectUrl)
    fontObjectUrl = null
  }
}

async function loadFont(): Promise<void> {
  const version = ++loadVersion
  removeLoadedFace()
  loading.value = true
  loadFailed.value = false
  repairError.value = ''

  try {
    const bytes = await fileSystemService.readBinaryFile(absolutePath.value)
    const blob = new Blob([new Uint8Array(bytes)], { type: resolveFontMimeType(filePath.value) })
    const source = URL.createObjectURL(blob)
    if (version !== loadVersion) {
      URL.revokeObjectURL(source)
      return
    }
    fontObjectUrl = source
    const face = await new FontFace(previewFamily, `url(${JSON.stringify(source)})`).load()
    if (version !== loadVersion) return
    loadedFace = face
    document.fonts.add(face)
  } catch {
    if (version === loadVersion) {
      removeLoadedFace()
      loadFailed.value = true
    }
  } finally {
    if (version === loadVersion) {
      loading.value = false

    }
  }
}

async function attemptRepair(): Promise<void> {
  if (repairing.value) return
  repairing.value = true
  repairError.value = ''
  try {
    const source = await fileSystemService.readBinaryFile(absolutePath.value)
    const repaired = await repairTrueTypeFont(source)
    const verified = await createLoadedFace(repaired)
    const outputPath = await fileSystemService.pickSavePath({
      defaultPath: createRepairOutputPath(absolutePath.value),
      fileTypeName: t('fileTypes.font'),
      extensions: ['ttf'],
      title: t('fontPreview.saveRepairedTitle'),
    })
    if (!outputPath) {
      document.fonts.delete(verified.face)
      URL.revokeObjectURL(verified.source)
      return
    }
    removeLoadedFace()
    loadedFace = verified.face
    fontObjectUrl = verified.source
    await fileSystemService.writeBinaryFile(outputPath, repaired)
    loadFailed.value = false
  } catch (error) {
    repairError.value = t('fontPreview.repairFailed', {
      message: error instanceof DOMException && error.name === 'NetworkError'
        ? t('fontPreview.repairedFontRejected')
        : error instanceof Error ? error.message : String(error),
    })
  } finally {
    repairing.value = false
  }
}

async function createLoadedFace(bytes: Uint8Array): Promise<{ face: FontFace; source: string }> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'font/ttf' })
  const source = URL.createObjectURL(blob)
  try {
    const face = await new FontFace(previewFamily, `url(${JSON.stringify(source)})`).load()
    document.fonts.add(face)
    return { face, source }
  } catch (error) {
    URL.revokeObjectURL(source)
    throw error
  }
}

function createRepairOutputPath(path: string): string {
  return path.replace(/\.ttf$/i, '') + t('fontPreview.repairedSuffix') + '.ttf'
}

function resolveFontMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'woff2') return 'font/woff2'
  if (extension === 'woff') return 'font/woff'
  if (extension === 'otf') return 'font/otf'
  return 'font/ttf'
}

watch(() => filePath.value, () => void loadFont(), { immediate: true })

onBeforeUnmount(() => {
  loadVersion += 1
  removeLoadedFace()
})
</script>

<style scoped>
.font-preview-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  background: var(--oc-bg-base);
  color: var(--oc-fg-default);
}

.font-preview-editor__status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: var(--oc-space-lg);
  flex-direction: column;
  gap: var(--oc-space-sm);
  text-align: center;
}

.font-preview-editor__workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--oc-space-xs);
  min-height: 0;
  padding: var(--oc-space-lg);
}

.font-preview-editor__workspace label {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.font-preview-editor__input {
  height: 100%;
  min-height: 0;
  padding: var(--oc-space-lg);
  font-size: var(--oc-font-preview-size);
  line-height: normal;
}

</style>
