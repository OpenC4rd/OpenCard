<template>
  <section class="font-diff-view" aria-label="Diff">
    <article v-for="side in sides" :key="side.key" class="font-diff-view__panel">
      <header>{{ side.label }}</header>
      <div v-if="side.loading" class="font-diff-view__status">
        <OcText tone="muted">{{ t('fontPreview.loading') }}</OcText>
      </div>
      <div v-else-if="side.failed" class="font-diff-view__status">
        <OcText tone="danger" role="alert">{{ t('fontPreview.loadFailed') }}</OcText>
      </div>
      <p v-else class="font-diff-view__sample" :style="{ fontFamily: side.family }">
        {{ sample }}
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorComparisonInput } from '../../features/editor-runtime/editorProtocol'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import OcText from '../base/OcText.vue'

const props = defineProps<{
  comparison?: EditorComparisonInput
  filePath: string
  projectRootPath?: string | null
}>()
const { t } = useI18n()
const sample = t('fontPreview.sample')
const sides = reactive([
  createSide('before'),
  createSide('after'),
])
let loadVersion = 0

function createSide(key: 'before' | 'after') {
  return {
    key,
    label: '',
    family: `OpenCardFontDiff-${key}-${crypto.randomUUID()}`,
    loading: true,
    failed: false,
    face: null as FontFace | null,
    objectUrl: null as string | null,
  }
}

function snapshotPath(root: string | null | undefined): string {
  const normalizedRoot = root?.replace(/[/\\]+$/, '')
  if (!normalizedRoot) return props.filePath

  const normalizedPath = props.filePath.replace(/\\/g, '/')
  const normalizedProjectRoot = props.projectRootPath?.replace(/\\/g, '/').replace(/\/+$/, '')
  const relativePath = normalizedProjectRoot
    && normalizedPath.toLocaleLowerCase().startsWith(`${normalizedProjectRoot.toLocaleLowerCase()}/`)
    ? normalizedPath.slice(normalizedProjectRoot.length + 1)
    : normalizedPath.replace(/^[/\\]+/, '')
  return `${normalizedRoot}/${relativePath}`
}

function releaseSide(side: typeof sides[number]): void {
  if (side.face) document.fonts.delete(side.face)
  if (side.objectUrl) URL.revokeObjectURL(side.objectUrl)
  side.face = null
  side.objectUrl = null
}

async function loadSide(side: typeof sides[number], version: number): Promise<void> {
  releaseSide(side)
  side.loading = true
  side.failed = false
  const snapshot = props.comparison?.[side.key]
  side.label = snapshot?.label ?? (side.key === 'before' ? 'Before' : 'After')
  if (!snapshot) {
    side.loading = false
    side.failed = true
    return
  }
  try {
    const bytes = await fileSystemService.readBinaryFile(snapshotPath(snapshot.resourceRootPath))
    const source = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: resolveFontMimeType(props.filePath) }))
    if (version !== loadVersion) {
      URL.revokeObjectURL(source)
      return
    }
    side.objectUrl = source
    const face = await new FontFace(side.family, `url(${JSON.stringify(source)})`).load()
    if (version !== loadVersion) return
    side.face = face
    document.fonts.add(face)
  } catch {
    if (version === loadVersion) side.failed = true
  } finally {
    if (version === loadVersion) side.loading = false
  }
}

function resolveFontMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'woff2') return 'font/woff2'
  if (extension === 'woff') return 'font/woff'
  if (extension === 'otf') return 'font/otf'
  return 'font/ttf'
}

watch(
  () => [props.comparison, props.filePath] as const,
  () => {
    const version = ++loadVersion
    void Promise.all(sides.map(side => loadSide(side, version)))
  },
  { immediate: true, deep: true },
)

onBeforeUnmount(() => {
  loadVersion += 1
  sides.forEach(releaseSide)
})
</script>

<style scoped>
.font-diff-view {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--oc-bg-base);
  color: var(--oc-fg-default);
}

.font-diff-view__panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  margin: 0;
}

.font-diff-view__panel + .font-diff-view__panel {
  border-left: var(--oc-border-width) solid var(--oc-border-muted);
}

.font-diff-view__panel header {
  padding: var(--oc-space-xs) var(--oc-space-sm);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.font-diff-view__status,
.font-diff-view__sample {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  margin: 0;
  padding: var(--oc-space-lg);
  overflow: auto;
}

.font-diff-view__sample {
  align-content: center;
  font-size: var(--oc-font-preview-size);
  line-height: normal;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
