<template>
  <ProjectRegistryEditorShell>
    <OcEmpty v-if="!manifest" tone="muted" inset="comfortable">
      {{ t('packageManifest.unavailable') }}
    </OcEmpty>
    <div v-else class="package-manifest-editor">
      <OcPanel v-if="cover" gap="3" padding="4" border="muted" radius="md">
        <h2>{{ t('packageManifest.cover') }}</h2>
        <div class="package-manifest-editor__cover">
          <OcCover :visual="{ type: 'image', src: cover.src, label: t('packageManifest.coverAlt') }" />
        </div>
      </OcPanel>

      <OcPanel gap="3" padding="4" border="muted" radius="md">
        <h2>{{ t('packageManifest.information') }}</h2>
        <dl class="package-manifest-editor__details">
          <div><dt>{{ t('packageManifest.coordinate') }}</dt><dd><code>{{ coordinate }}</code></dd></div>
          <div><dt>{{ t('packageManifest.name') }}</dt><dd>{{ manifest.title }}</dd></div>
          <div><dt>{{ t('packageManifest.fingerprint') }}</dt><dd><code>{{ fingerprint }}</code></dd></div>
        </dl>
      </OcPanel>

      <OcPanel gap="3" padding="4" border="muted" radius="md">
        <h2>{{ t('packageManifest.fonts') }}</h2>
        <OcEmpty v-if="manifest.public.fonts.length === 0" tone="muted" inset="compact">
          {{ t('packageManifest.noFonts') }}
        </OcEmpty>
        <ul v-else class="package-manifest-editor__resources">
          <li v-for="font in manifest.public.fonts" :key="font.key">
            <span>{{ font.title }}</span><code>{{ font.key }}</code>
          </li>
        </ul>
      </OcPanel>

      <OcPanel gap="3" padding="4" border="muted" radius="md">
        <h2>{{ t('packageManifest.iconSeries') }}</h2>
        <OcEmpty v-if="manifest.public.iconSeries.length === 0" tone="muted" inset="compact">
          {{ t('packageManifest.noIconSeries') }}
        </OcEmpty>
        <ul v-else class="package-manifest-editor__resources">
          <li v-for="series in manifest.public.iconSeries" :key="series.key">
            <span>{{ series.title }}</span>
            <code>{{ series.key }}</code>
            <span>{{ t('packageManifest.iconCount', { count: series.count }) }}</span>
          </li>
        </ul>
      </OcPanel>
    </div>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { getPathBasename } from '../../shared/model/filePath'
import { readResourcePackageArchive, type ResourcePackageArchive } from '../../features/workspace/services/resourcePackageArchive'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import OcEmpty from '../base/OcEmpty.vue'
import OcPanel from '../base/OcPanel.vue'
import OcCover from '../standard/OcCover.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()

/**
 * 预览回答的是"这个文件是什么"，所以读的就是这个文件 —— 不查项目的包表。
 * 项目里是不是装了它、它是重复件还是还没解开，都不该改变它是什么。
 */
const archive = ref<ResourcePackageArchive | null>(null)
watch(() => props.filePath, async path => {
  archive.value = await readResourcePackageArchive(path).catch(() => null)
}, { immediate: true })

const manifest = computed(() => archive.value?.manifest ?? null)
const coordinate = computed(() => archive.value?.coordinate ?? '')
const fingerprint = computed(() => archive.value?.fingerprint ?? '')
// 封面是唯一需要解开目录的东西：包表里认得这个文件就顺手显示，不认得就不显示。
const cover = computed(() => projectStore.findProjectResourcePackage(props.filePath)?.cover ?? null)

const presentation = computed<EditorPresentation>(() => ({
  // 主标题是这个文件本身叫什么，小字是它自述的坐标。文件叫什么名字不算数 —— 那是"它是谁"，
  // 不是"你打开的是哪一个文件"。
  title: getPathBasename(props.filePath),
  description: coordinate.value || t('packageManifest.description'),
  icon: 'file.package',
}))

defineExpose({ presentation })

watch(() => props.filePath, () => emit('modified', false), { immediate: true })
</script>

<style scoped>
.package-manifest-editor {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-4);
}

.package-manifest-editor h2,
.package-manifest-editor dl,
.package-manifest-editor dd,
.package-manifest-editor ul {
  margin: 0;
}

.package-manifest-editor h2 {
  font-size: var(--oc-text-md);
  color: var(--oc-fg-default);
}

/* 几何与边框归这个框所有；OcCover 只负责把封面铺满框内。 */
.package-manifest-editor__cover {
  width: var(--oc-cover-preview-width);
  height: var(--oc-cover-preview-height);
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
}

.package-manifest-editor__details,
.package-manifest-editor__resources {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-2);
  padding: 0;
}

.package-manifest-editor__details > div,
.package-manifest-editor__resources > li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--oc-space-2);
}

.package-manifest-editor__details dt {
  color: var(--oc-fg-muted);
}

.package-manifest-editor__resources > li {
  list-style: none;
}

.package-manifest-editor code {
  overflow-wrap: anywhere;
  color: var(--oc-fg-muted);
}
</style>
