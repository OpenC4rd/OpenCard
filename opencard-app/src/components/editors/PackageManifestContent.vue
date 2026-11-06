<!-- 业务 包清单内容：内容特征码、清单与封面都读自给定的那个归档，不查项目包表，也不解开它。 -->
<template>
  <OcEmpty v-if="!manifest" tone="muted" :inset="compact ? 'none' : 'comfortable'">
    {{ t('packageManifest.unavailable') }}
  </OcEmpty>
  <div v-else class="package-manifest-content" :class="{ 'is-compact': compact }">
    <OcCard :variant="cardVariant" v-if="coverSrc" :title="t('packageManifest.cover')" icon="mdiFileImageOutline">
      <div class="package-manifest-content__cover">
        <OcCover :visual="{ type: 'image', src: coverSrc, label: t('packageManifest.coverAlt') }" />
      </div>
    </OcCard>

    <OcCard :variant="cardVariant" :title="t('packageManifest.information')" icon="mdiPackageVariantClosed">
      <OcRow v-for="row in identityRows" :key="row.key" as="button" type="button"
        :aria-label="t('packageManifest.copyRow', { label: row.label, value: row.value })"
        @click="copyRowValue(row)">
        <template #title>
          <OcText tone="muted">{{ row.label }}</OcText>
        </template>
        <template #append>
          <OcText mono size="sm" truncate>{{ row.value }}</OcText>
        </template>
      </OcRow>
    </OcCard>

    <OcCard :variant="cardVariant" :title="t('packageManifest.fonts')" icon="mdiFormatText">
      <OcEmpty v-if="manifest.public.fonts.length === 0" tone="muted" inset="compact">
        {{ t('packageManifest.noFonts') }}
      </OcEmpty>
      <OcRow v-for="font in manifest.public.fonts" :key="font.key">
        <template #title><OcText>{{ font.title }}</OcText></template>
        <template #append>
          <OcText size="sm" mono>{{ font.key }}</OcText>
        </template>
      </OcRow>
    </OcCard>

    <OcCard :variant="cardVariant" :title="t('packageManifest.iconSeries')" icon="mdiStickerEmoji">
      <OcEmpty v-if="manifest.public.iconSeries.length === 0" tone="muted" inset="compact">
        {{ t('packageManifest.noIconSeries') }}
      </OcEmpty>
      <OcRow v-for="series in manifest.public.iconSeries" :key="series.key">
        <template #title><OcText>{{ series.title }}</OcText></template>
        <template #append>
          <OcText tone="muted" size="sm">{{ t('packageManifest.iconCount', { count: series.count }) }}</OcText>
          <OcText size="sm" mono>{{ series.key }}</OcText>
        </template>
      </OcRow>
    </OcCard>

    <OcCard :variant="cardVariant" :title="t('packageManifest.blocks')" icon="mdiToyBrickOutline">
      <OcEmpty v-if="!(manifest.public.blockCollections?.length)" tone="muted" inset="compact">
        {{ t('packageManifest.noBlocks') }}
      </OcEmpty>
      <OcRow v-for="collection in manifest.public.blockCollections ?? []" :key="collection.key">
        <template #title><OcText>{{ collection.title }}</OcText></template>
        <template #append>
          <OcText tone="muted" size="sm">{{ t('packageManifest.blockCount', { count: collection.count }) }}</OcText>
          <OcText size="sm" mono>{{ collection.key }}</OcText>
        </template>
      </OcRow>
    </OcCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { notifyAppError } from '../../features/notifications/titlebarNotices'
import { coverImageMimeType } from '../../features/workspace/model/projectCover'
import {
  readResourcePackageArchive,
  readResourcePackageCover,
  type ResourcePackageArchive,
} from '../../features/workspace/services/resourcePackageArchive'
import OcEmpty from '../base/OcEmpty.vue'
import OcText from '../base/OcText.vue'
import OcCard from '../standard/OcCard.vue'
import OcCover from '../standard/OcCover.vue'
import OcRow from '../standard/OcRow.vue'

const props = defineProps<{
  /** 要展示的归档路径。 */
  path: string
  /** 窄面板里去掉分组的卡片表面，只留标题与行。 */
  compact?: boolean
}>()
const emit = defineEmits<{
  /** 归档自述的坐标；读不出来时为空串。 */
  'update:coordinate': [coordinate: string]
}>()
const { t } = useI18n()
const cardVariant = computed(() => props.compact ? 'plain' : 'surface')

/**
 * 预览回答的是"这个文件是什么"，所以读的就是这个文件 —— 不查项目的包表。
 * 项目里是不是装了它、它是重复件还是还没解开，都不该改变它是什么。
 */
const archive = ref<ResourcePackageArchive | null>(null)
const coverSrc = ref('')
watch(() => props.path, async path => {
  const next = await readResourcePackageArchive(path).catch(() => null)
  // 检视器里连续换选中时，慢的那次读取不得盖住后来选中的包。
  if (path !== props.path) return
  archive.value = next
  emit('update:coordinate', next?.coordinate ?? '')
  releaseCover()
  // 封面也只读这个归档里的那一个条目：没解开也能看，重复件看的也是自己那份。
  const coverPath = next?.manifest.cover
  const cover = coverPath
    ? await readResourcePackageCover(path, coverImageMimeType(coverPath)).catch(() => '')
    : ''
  if (path === props.path) coverSrc.value = cover
  else if (cover) URL.revokeObjectURL?.(cover)
}, { immediate: true })
onBeforeUnmount(releaseCover)

/** blob 地址要自己回收，否则每换一个文件都会留下一份图片字节。 */
function releaseCover(): void {
  if (!coverSrc.value) return
  URL.revokeObjectURL?.(coverSrc.value)
  coverSrc.value = ''
}

const manifest = computed(() => archive.value?.manifest ?? null)

const identityRows = computed(() => [
  { key: 'coordinate', label: t('packageManifest.coordinate'), value: archive.value?.coordinate ?? '' },
  { key: 'name', label: t('packageManifest.name'), value: manifest.value?.title ?? '' },
  { key: 'fingerprint', label: t('packageManifest.fingerprint'), value: archive.value?.fingerprint ?? '' },
])

/**
 * 行本身就是复制触点：坐标与内容特征码是拿来贴给别人的，选中再按复制不如点一下。
 * 成功不提示，和仓库里其余复制动作一样；失败才报，把是哪一行说清楚。
 */
async function copyRowValue(row: { label: string; value: string }): Promise<void> {
  try {
    await navigator.clipboard.writeText(row.value)
  } catch (error) {
    notifyAppError('OC-E1002', { source: 'package-manifest-row', label: row.label, error })
  }
}
</script>

<style scoped>
.package-manifest-content {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-md);
}

.package-manifest-content.is-compact {
  gap: var(--oc-space-xs);
}

/* 几何与边框归这个框所有；OcCover 只负责把封面铺满框内。 */
.package-manifest-content__cover {
  width: 180px;
  height: 100px;
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
}

.is-compact .package-manifest-content__cover {
  width: 100%;
}
</style>
