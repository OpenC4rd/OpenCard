<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import phaseLogo from '../../../assets/opencard-logo-phase-map.png'
import wordmarkBrightness from '../../../assets/opencard-wordmark-brightness-map.png'
import wordmarkPhase from '../../../assets/opencard-wordmark-phase-map.png'
import OcButton from '../../../components/base/OcButton.vue'
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue'
import WelcomeCoverWall, { type WelcomeCoverWallCover } from './WelcomeCoverWall.vue'
import WelcomeGravityField from './WelcomeGravityField.vue'

defineOptions({ name: 'WelcomePageContent' })

const emit = defineEmits<{
  'new-project': []
  'open-project': []
  'update:backgroundVisible': [value: boolean]
}>()

const props = withDefaults(defineProps<{
  /** 最近打开项目的封面；背景封面墙会与内置素材混合展示。 */
  covers?: readonly WelcomeCoverWallCover[]
  /** 侧栏"最近打开的项目"选中的项目 Key，用于突出对应封面。 */
  highlightKeys?: readonly string[]
  /** 欢迎页背景效果（桌游封面墙 + 引力背景）是否显示；由欢迎页从设置里读出。 */
  backgroundVisible?: boolean
}>(), {
  covers: () => [],
  highlightKeys: () => [],
  backgroundVisible: true,
})

const { t } = useI18n()
</script>

<template>
  <section class="page-empty-state" :aria-label="t('app.welcome.title')">
    <Transition name="welcome-cover-wall">
      <div v-if="props.backgroundVisible" class="page-empty-state__background">
        <WelcomeCoverWall :covers="props.covers" :highlight-keys="props.highlightKeys" />
        <WelcomeGravityField />
      </div>
    </Transition>
    <div class="page-empty-state__content">
      <OcPhaseImage
        class="page-empty-state__icon"
        :src="phaseLogo"
        fit="contain"
        alt="OpenCard"
      />
      <h1>
        <span>{{ t('app.welcome.prefix') }}</span>
        <OcPhaseImage
          class="page-empty-state__wordmark"
          :src="wordmarkPhase"
          :brightness-src="wordmarkBrightness"
          fit="contain"
          alt="OpenCard"
          :duration-ms="12_000"
          direction="reverse"
        />
      </h1>
      <p>{{ t('app.welcome.subtitle') }}</p>
      <div class="page-empty-state__actions">
        <OcButton data-oc-tutorial="welcome.new-project" icon="mdiPlus" variant="solid" size="lg" @click="emit('new-project')">
          {{ t('app.menu.newProject') }}
        </OcButton>
        <OcButton icon="mdiFolderOpenOutline" variant="outline" size="lg" @click="emit('open-project')">
          {{ t('sidebar.openProject') }}
        </OcButton>
      </div>
    </div>
    <!-- 左下角的小按钮：控制背景封面墙显隐；开关状态由浅色底表达，同时通过 aria-pressed 暴露给辅助技术。 -->
    <OcButton
      class="page-empty-state__wall-toggle"
      icon="mdiPanoramaVariantOutline"
      icon-only
      :variant="props.backgroundVisible ? 'soft' : 'ghost'"
      :aria-pressed="props.backgroundVisible"
      :aria-label="t('app.welcome.backgroundToggle')"
      :data-tooltip="t('app.welcome.backgroundToggle')"
      @click="emit('update:backgroundVisible', !props.backgroundVisible)"
    />
  </section>
</template>

<style scoped>
.page-empty-state {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-xs);
  padding: var(--oc-space-lg);
  color: var(--oc-fg-default);
  text-align: center;
}

/* 背景层：桌游封面墙 + 两层引力效果（次级背景色在后、页面底色在前）。 */
.page-empty-state__background {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  /* 边角渐隐到透明，让背景融进工作区而不出现硬边。 */
  mask-image: var(--oc-welcome-background-mask);
}

.page-empty-state__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: var(--oc-space-xs);
}

.page-empty-state__icon {
  --oc-phase-image-width: 72px;
  --oc-phase-image-aspect-ratio: 1;

  height: 72px;
  margin-bottom: var(--oc-space-xs);
}

.page-empty-state h1,
.page-empty-state p {
  margin: 0;
}

.page-empty-state h1 {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2xs);
  font-size: var(--oc-text-lg);
  font-weight: var(--font-weight-ui-title);
  /* 背景封面墙之上的可读性：只给文字加一层底色描边，不遮挡背景。 */
  text-shadow: var(--oc-welcome-hero-text-shadow);
}

.page-empty-state__wordmark {
  --oc-phase-image-width: 99px;
  --oc-phase-image-aspect-ratio: 3;

  height: 33px;
  flex: 0 0 auto;
}

.page-empty-state p {
  max-width: 360px;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-base);
  line-height: 1.5;
  text-shadow: var(--oc-welcome-hero-text-shadow);
}

.page-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--oc-space-xs);
  margin-top: var(--oc-space-sm);
}

/* 左下角的小按钮：控制背景封面墙显隐。 */
.page-empty-state__wall-toggle {
  position: absolute;
  left: var(--oc-space-md);
  bottom: var(--oc-space-md);
  z-index: 2;
}

/* 切换显隐时整面墙淡入淡出。 */
.welcome-cover-wall-enter-active,
.welcome-cover-wall-leave-active {
  transition: opacity var(--oc-duration) var(--oc-ease);
}

.welcome-cover-wall-enter-from,
.welcome-cover-wall-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .welcome-cover-wall-enter-active,
  .welcome-cover-wall-leave-active {
    transition: none;
  }
}
</style>
