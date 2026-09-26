<!-- 业务 包清单预览：内容特征码、清单与封面都读自被打开的那个归档，不查项目包表，也不解开它。 -->
<template>
  <ProjectRegistryEditorShell>
    <OcEmpty v-if="!manifest" tone="muted" inset="comfortable">
      {{ t('packageManifest.unavailable') }}
    </OcEmpty>
    <div v-else class="package-manifest-editor">
      <OcCard v-if="coverSrc" :title="t('packageManifest.cover')" icon="file.image">
        <div class="package-manifest-editor__cover">
          <OcCover :visual="{ type: 'image', src: coverSrc, label: t('packageManifest.coverAlt') }" />
        </div>
      </OcCard>

      <OcCard
        :title="t('packageManifest.information')"
        icon="file.package"
        :actions="identityActions"
        @action="handleIdentityAction"
      >
        <OcRow v-for="row in identityRows" :key="row.key">
          <template #title>
            <OcText tone="muted">{{ row.label }}</OcText>
          </template>
          <template #append>
            <OcText mono size="sm" truncate>{{ row.value }}</OcText>
          </template>
        </OcRow>
      </OcCard>

      <OcCard :title="t('packageManifest.fonts')" icon="data.symbol-string">
        <OcEmpty v-if="manifest.public.fonts.length === 0" tone="muted" inset="compact">
          {{ t('packageManifest.noFonts') }}
        </OcEmpty>
        <OcRow v-for="font in manifest.public.fonts" :key="font.key">
          <template #title>{{ font.title }}</template>
          <template #append>
            <OcText tone="muted" size="sm" mono>{{ font.key }}</OcText>
          </template>
        </OcRow>
      </OcCard>

      <OcCard :title="t('packageManifest.iconSeries')" icon="file.project-icon">
        <OcEmpty v-if="manifest.public.iconSeries.length === 0" tone="muted" inset="compact">
          {{ t('packageManifest.noIconSeries') }}
        </OcEmpty>
        <OcRow v-for="series in manifest.public.iconSeries" :key="series.key">
          <template #title>{{ series.title }}</template>
          <template #append>
            <OcText tone="muted" size="sm">{{ t('packageManifest.iconCount', { count: series.count }) }}</OcText>
            <OcText tone="muted" size="sm" mono>{{ series.key }}</OcText>
          </template>
        </OcRow>
      </OcCard>
    </div>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import { getPathBasename } from '../../shared/model/filePath'
import { coverImageMimeType } from '../../features/workspace/model/projectCover'
import {
  readResourcePackageArchive,
  readResourcePackageCover,
  type ResourcePackageArchive,
} from '../../features/workspace/services/resourcePackageArchive'
import OcEmpty from '../base/OcEmpty.vue'
import OcText from '../base/OcText.vue'
import type { OcActionButtonAction, OcActionButtonSelectPayload } from '../standard/OcActionButton.vue'
import OcCard from '../standard/OcCard.vue'
import OcCover from '../standard/OcCover.vue'
import OcRow from '../standard/OcRow.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

const COPY_COORDINATE_ACTION_KEY = 'manifest.copy-coordinate'
const COPY_FINGERPRINT_ACTION_KEY = 'manifest.copy-fingerprint'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()

/**
 * 预览回答的是"这个文件是什么"，所以读的就是这个文件 —— 不查项目的包表。
 * 项目里是不是装了它、它是重复件还是还没解开，都不该改变它是什么。
 */
const archive = ref<ResourcePackageArchive | null>(null)
const coverSrc = ref('')
watch(() => props.filePath, async path => {
  archive.value = await readResourcePackageArchive(path).catch(() => null)
  releaseCover()
  // 封面也只读这个归档里的那一个条目：没解开也能看，重复件看的也是自己那份。
  const coverPath = archive.value?.manifest.cover
  coverSrc.value = coverPath
    ? await readResourcePackageCover(path, coverImageMimeType(coverPath)).catch(() => '')
    : ''
}, { immediate: true })
onBeforeUnmount(releaseCover)

/** blob 地址要自己回收，否则每换一个文件都会留下一份图片字节。 */
function releaseCover(): void {
  if (!coverSrc.value) return
  URL.revokeObjectURL?.(coverSrc.value)
  coverSrc.value = ''
}

const manifest = computed(() => archive.value?.manifest ?? null)
const coordinate = computed(() => archive.value?.coordinate ?? '')
const fingerprint = computed(() => archive.value?.fingerprint ?? '')

const identityRows = computed(() => [
  { key: 'coordinate', label: t('packageManifest.coordinate'), value: coordinate.value },
  { key: 'name', label: t('packageManifest.name'), value: manifest.value?.title ?? '' },
  { key: 'fingerprint', label: t('packageManifest.fingerprint'), value: fingerprint.value },
])

const identityActions = computed<OcActionButtonAction[]>(() => [
  { key: COPY_COORDINATE_ACTION_KEY, title: t('packageManager.copyCoordinate'), icon: 'action.copy' },
  { key: COPY_FINGERPRINT_ACTION_KEY, title: t('packageManifest.copyFingerprint'), icon: 'action.copy' },
])

/** 复制动作跟相册卡片上那两条同款：坐标照抄，特征码也照抄一次好贴给别人比对。 */
function handleIdentityAction(payload: OcActionButtonSelectPayload): void {
  if (payload.key === COPY_COORDINATE_ACTION_KEY) void navigator.clipboard.writeText(coordinate.value)
  else if (payload.key === COPY_FINGERPRINT_ACTION_KEY) void navigator.clipboard.writeText(fingerprint.value)
}

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

/* 几何与边框归这个框所有；OcCover 只负责把封面铺满框内。 */
.package-manifest-editor__cover {
  width: var(--oc-cover-preview-width);
  height: var(--oc-cover-preview-height);
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
}
</style>
