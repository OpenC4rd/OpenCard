<script setup lang="ts">
import packageMetadata from '../../../../package.json'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import staticLogo from '../../../assets/opencard-logo.png'
import OcButton from '../../../components/base/OcButton.vue'
import { renderMarkdown } from '../../card-rendering/markdown/renderMarkdown'
import type { CurrentReleaseNotes } from '../composables/updateStatePersistence'

defineOptions({ name: 'AboutPageContent' })

const props = defineProps<{
  currentReleaseNotes?: CurrentReleaseNotes | null
  availableUpdateVersion?: string
}>()

const emit = defineEmits<{
  back: []
  showAvailableRelease: []
  sendFeedback: []
  viewFeedback: []
}>()

const { t } = useI18n()
const version = packageMetadata.version
const renderedReleaseNotes = computed(() => renderMarkdown(props.currentReleaseNotes?.body ?? ''))
</script>

<template>
  <section class="about-content" :aria-label="t('app.about.title')">
    <div class="about-content__content">
      <div class="about-content__brand">
        <img :src="staticLogo" alt="OpenCard" />
        <div>
          <h1>OpenCard</h1>
          <div class="about-content__version-row">
            <p class="about-content__version">{{ t('app.about.version', { version }) }}</p>
            <OcButton
              v-if="availableUpdateVersion"
              size="sm"
              variant="ghost"
              icon="mdiDownload"
              :aria-label="t('app.updater.available', { version: availableUpdateVersion })"
              :data-tooltip="t('app.updater.available', { version: availableUpdateVersion })"
              @click="emit('showAvailableRelease')"
            />
          </div>
        </div>
      </div>

      <div class="about-content__copy">
        <p>{{ t('app.about.description') }}</p>
        <p>{{ t('app.about.detail') }}</p>
      </div>

      <section v-if="currentReleaseNotes?.body" class="about-content__release-notes">
        <h2>{{ t('app.about.releaseNotes') }}</h2>
        <div class="oc-markdown" v-html="renderedReleaseNotes" />
      </section>

      <footer>
        <span>{{ t('app.about.copyright') }}</span>
        <div class="about-content__footer-actions">
          <OcButton icon="mdiPencilOutline" variant="outline" @click="emit('sendFeedback')">
            {{ t('app.menu.sendFeedback') }}
          </OcButton>
          <OcButton icon="mdiFormatListBulletedSquare" variant="outline" @click="emit('viewFeedback')">
            {{ t('app.menu.viewFeedback') }}
          </OcButton>
          <OcButton icon="mdiArrowLeft" variant="outline" @click="emit('back')">
            {{ t('app.shell.back') }}
          </OcButton>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.about-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--oc-fg-default);
}

.about-content__content {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--oc-content-width-md);
  margin-inline: auto;
  padding: 48px var(--oc-space-lg);
  animation: about-content-enter var(--oc-duration) var(--oc-ease) both;
}

.about-content__brand {
  display: flex;
  align-items: center;
  gap: var(--oc-space-lg);
  padding-bottom: var(--oc-space-lg);
  border-bottom: 1px solid var(--oc-border-muted);
}

.about-content__brand img {
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  object-fit: contain;
}

.about-content__version,
.about-content__copy p,
.about-content h1 {
  margin: 0;
}

.about-content h1 {
  font-size: calc(var(--oc-text-xl) * 1.75);
  font-weight: var(--font-weight-ui-title);
  line-height: 1.15;
}

.about-content__version {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-base);
}

.about-content__version-row {
  display: flex;
  align-items: center;
  gap: var(--oc-space-2xs);
  margin-top: var(--oc-space-xs);
}

.about-content__copy {
  display: grid;
  gap: var(--oc-space-sm);
  max-width: 560px;
  padding: var(--oc-space-lg) 0;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-base);
  line-height: 1.7;
}

.about-content__release-notes {
  padding: 0 0 var(--oc-space-lg);
}

.about-content__release-notes h2 {
  margin: 0 0 var(--oc-space-sm);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-lg);
}

.about-content footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-md);
  padding-top: var(--oc-space-md);
  border-top: 1px solid var(--oc-border-muted);
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
}

.about-content__footer-actions {
  display: flex;
  gap: var(--oc-space-xs);
}

@keyframes about-content-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (max-width: 640px) {
  .about-content__content {
    padding: 32px var(--oc-space-md);
  }

  .about-content__brand {
    align-items: flex-start;
  }

  .about-content footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .about-content__footer-actions {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about-content__content {
    animation: none;
  }
}
</style>
