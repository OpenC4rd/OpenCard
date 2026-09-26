<!-- 业务 项目封面字段：整幅封面横幅，点击选择项目内图片；路径与移除收在底部信息条（路径为标题、移除为尾部操作），与相册卡片同一套语言。操作失败通过标题栏即时消息反馈。 -->
<template>
  <div class="project-cover-field">
    <div class="project-cover-field__stage" data-tooltip-group>
      <button type="button" class="project-cover-field__banner"
        :data-tooltip="actionHint" :aria-label="actionHint" @click="chooseProjectFile">
        <OcCover v-if="coverVisual" :visual="coverVisual" />
        <span v-else class="project-cover-field__placeholder">
          <OcIcon name="file.image" size="lg" tone="muted" />
          <OcText tone="muted" size="sm">{{ t('projectConfig.cover.empty') }}</OcText>
        </span>
      </button>
      <span v-if="relativePath" class="project-cover-field__info">
        <span class="project-cover-field__title">
          <OcIcon name="file.image" size="sm" tone="muted" />
          <OcText class="project-cover-field__path" tone="muted" size="xs" :truncate="true">
            {{ relativePath }}
          </OcText>
        </span>
        <span class="project-cover-field__remove">
          <OcButton icon-only size="sm" variant="ghost" type="button" icon="action.image-minus" icon-tone="danger"
            :data-tooltip="t('projectConfig.cover.remove')" :aria-label="t('projectConfig.cover.remove')"
            @click="clear" />
        </span>
      </span>
    </div>
    <OcText v-if="stateNote" tone="muted" size="sm">{{ stateNote }}</OcText>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../base/OcButton.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcCover from '../standard/OcCover.vue'
import { notifyError } from '../../features/notifications/titlebarNotices'
import {
  COVER_IMAGE_EXTENSIONS,
  coverImageExtension,
  projectRelativePathFromAbsolute,
  type ProjectCover,
} from '../../features/workspace/model/projectCover'
import { resolveProjectCover } from '../../features/workspace/services/projectCoverService'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import type { OcVisual } from '../../shared/ui/visual/visual.types'

defineOptions({ name: 'ProjectCoverField' })

const props = withDefaults(defineProps<{
  /** 当前封面：项目根相对路径；空字符串表示该项目尚未设置封面。 */
  modelValue?: string
  /** 项目根目录，用于解析封面文件与文件选择的默认位置。 */
  projectRootPath: string
}>(), {
  modelValue: '',
})

const emit = defineEmits<{
  /** 封面路径变化；空字符串表示移除封面引用。 */
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const projectStore = useProjectStore()
const cover = ref<ProjectCover | null>(null)
let coverRevision = 0

const relativePath = computed(() => props.modelValue.trim())
const actionHint = computed(() => (
  relativePath.value ? t('projectConfig.cover.replaceHint') : t('projectConfig.cover.chooseHint')
))
const coverVisual = computed<OcVisual | null>(() => (
  cover.value ? { type: 'image', src: cover.value.src, label: t('projectConfig.cover.previewAlt') } : null
))
/** 引用已写入配置但文件不可用时的状态说明（不是操作失败，因此只做说明）。 */
const stateNote = computed(() => {
  if (!relativePath.value) return ''
  if (!coverImageExtension(relativePath.value)) {
    return t('projectConfig.cover.unsupported', { path: relativePath.value })
  }
  return cover.value ? '' : t('projectConfig.cover.missing', { path: relativePath.value })
})

watch(
  [() => props.modelValue, () => props.projectRootPath, () => projectStore.fileChangeRevision],
  async () => {
    const revision = ++coverRevision
    const resolved = relativePath.value
      ? await resolveProjectCover({
        fs: fileSystemService,
        rootPath: props.projectRootPath,
        relativePath: relativePath.value,
      })
      : null
    if (revision !== coverRevision) return
    cover.value = resolved
  },
  { immediate: true },
)

async function chooseProjectFile(): Promise<void> {
  const picked = await fileSystemService.pickFile({
    title: t('projectConfig.cover.choose'),
    fileTypeName: t('projectConfig.cover.fileTypeName'),
    extensions: [...COVER_IMAGE_EXTENSIONS],
    defaultPath: props.projectRootPath,
  })
  if (!picked) return
  const relative = projectRelativePathFromAbsolute(props.projectRootPath, picked)
  if (!relative) {
    notifyError(t('projectConfig.cover.outsideProject'))
    return
  }
  if (!coverImageExtension(relative)) {
    notifyError(t('projectConfig.cover.unsupported', { path: relative }))
    return
  }
  emit('update:modelValue', relative)
}

function clear(): void {
  emit('update:modelValue', '')
}
</script>

<style scoped>
.project-cover-field {
  display: grid;
  gap: var(--oc-space-2);
}

.project-cover-field__stage {
  position: relative;
}

.project-cover-field__banner {
  display: flex;
  width: 100%;
  height: var(--oc-cover-banner-height);
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-md);
  background: var(--oc-bg-surface);
  cursor: pointer;
  transition: border-color var(--oc-duration-fast) var(--oc-ease);
}

/* 与相册卡片同一套边框语言：悬停加深边框，键盘聚焦才用主题色。 */
.project-cover-field__banner:hover {
  border-color: var(--oc-border-strong);
}

.project-cover-field__banner:focus-visible {
  border-color: var(--oc-border-accent);
  outline: none;
}

.project-cover-field__placeholder {
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-2);
}

/* 相册卡片的信息条语言：路径是标题、移除是尾部操作，悬停整幅横幅才出现。 */
.project-cover-field__info {
  position: absolute;
  /* 信息条挂在 stage 上（按钮里放不下按钮），所以按边框宽度内缩一格才贴到横幅内缘；
     否则它会压在那 1px 边框上，圆角也跟卡片内缘对不上。 */
  inset-inline: var(--oc-border-width);
  inset-block-end: var(--oc-border-width);
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--oc-space-1);
  /* 全局 border-box 下 min-height 包含纵向 padding，直接写按钮高度会被 padding 吞掉而撑开。 */
  min-height: calc(var(--oc-size-sm) + var(--oc-space-1) * 2);
  padding: var(--oc-space-1) var(--oc-space-3);
  border-end-start-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  border-end-end-radius: calc(var(--oc-radius-md) - var(--oc-border-width));
  background: var(--oc-bg-glass);
  -webkit-backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
  backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
}

.project-cover-field__title {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--oc-space-1);
}

.project-cover-field__path {
  min-width: 0;
}

.project-cover-field__remove {
  display: none;
  flex: 0 0 auto;
  align-items: center;
}

.project-cover-field__stage:hover .project-cover-field__remove,
.project-cover-field__stage:focus-within .project-cover-field__remove,
.project-cover-field__remove:has(.oc-button.is-menu-open) {
  display: inline-flex;
}
</style>
