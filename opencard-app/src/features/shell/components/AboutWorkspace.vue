<script setup lang="ts">
import packageMetadata from '../../../../package.json'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import staticLogo from '../../../assets/opencard-logo.svg'
import OcButton from '../../../components/base/OcButton.vue'
import { renderMarkdown } from '../../card-rendering/markdown/renderMarkdown'
import type { CurrentReleaseNotes } from '../composables/updateStatePersistence'

defineOptions({ name: 'AboutWorkspace' })

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
  <section class="about-workspace" :aria-label="t('app.about.title')">
    <div class="about-workspace__content">
      <div class="about-workspace__brand">
        <img :src="staticLogo" alt="OpenCard" />
        <div>
          <h1>OpenCard</h1>
          <div class="about-workspace__version-row">
            <p class="about-workspace__version">{{ t('app.about.version', { version }) }}</p>
            <OcButton
              v-if="availableUpdateVersion"
              size="sm"
              variant="ghost"
              icon="action.download"
              :aria-label="t('app.updater.available', { version: availableUpdateVersion })"
              :data-tooltip="t('app.updater.available', { version: availableUpdateVersion })"
              @click="emit('showAvailableRelease')"
            />
          </div>
        </div>
      </div>

      <div class="about-workspace__copy">
        <p>{{ t('app.about.description') }}</p>
        <p>{{ t('app.about.detail') }}</p>
      </div>

      <section v-if="currentReleaseNotes?.body" class="about-workspace__release-notes">
        <h2>{{ t('app.about.releaseNotes') }}</h2>
        <div v-html="renderedReleaseNotes" />
      </section>

      <footer>
        <span>{{ t('app.about.copyright') }}</span>
        <div class="about-workspace__footer-actions">
          <OcButton icon="action.edit" variant="outline" @click="emit('sendFeedback')">
            {{ t('app.menu.sendFeedback') }}
          </OcButton>
          <OcButton icon="data.list-selection" variant="outline" @click="emit('viewFeedback')">
            {{ t('app.menu.viewFeedback') }}
          </OcButton>
          <OcButton icon="nav.arrow-left" variant="outline" @click="emit('back')">
            {{ t('app.shell.back') }}
          </OcButton>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.about-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  color: var(--oc-fg-default);
}

.about-workspace__content {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--oc-content-width-md);
  margin-inline: auto;
  padding: 48px var(--oc-space-5);
  animation: about-workspace-enter var(--oc-duration-normal, 180ms) var(--oc-ease, ease) both;
}

.about-workspace__brand {
  display: flex;
  align-items: center;
  gap: var(--oc-space-5);
  padding-bottom: var(--oc-space-5);
  border-bottom: 1px solid var(--oc-border-muted);
}

.about-workspace__brand img {
  width: 72px;
  height: 72px;
  flex: 0 0 auto;
  object-fit: contain;
}

.about-workspace__version,
.about-workspace__copy p,
.about-workspace h1 {
  margin: 0;
}

.about-workspace h1 {
  font-size: calc(var(--oc-text-xl) * 1.75);
  font-weight: var(--font-weight-ui-title);
  line-height: 1.15;
}

.about-workspace__version {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-base);
}

.about-workspace__version-row {
  display: flex;
  align-items: center;
  gap: var(--oc-space-1);
  margin-top: var(--oc-space-2);
}

.about-workspace__copy {
  display: grid;
  gap: var(--oc-space-3);
  max-width: 560px;
  padding: var(--oc-space-6) 0;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-base);
  line-height: 1.7;
}

.about-workspace__release-notes {
  padding: 0 0 var(--oc-space-6);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-base);
  line-height: 1.65;
}

.about-workspace__release-notes h2 {
  margin: 0 0 var(--oc-space-3);
  color: var(--oc-fg-default);
  font-size: var(--oc-text-lg);
}

.about-workspace__release-notes :deep(:first-child) {
  margin-top: 0;
}

.about-workspace__release-notes :deep(:last-child) {
  margin-bottom: 0;
}

.about-workspace__release-notes :deep(ul),
.about-workspace__release-notes :deep(ol) {
  padding-inline-start: var(--oc-space-5);
}

.about-workspace__release-notes :deep(h1),
.about-workspace__release-notes :deep(h2),
.about-workspace__release-notes :deep(h3) {
  color: var(--oc-fg-default);
  font-size: var(--oc-text-base);
}

.about-workspace footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-4);
  padding-top: var(--oc-space-4);
  border-top: 1px solid var(--oc-border-muted);
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
}

.about-workspace__footer-actions {
  display: flex;
  gap: var(--oc-space-2);
}

@keyframes about-workspace-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (max-width: 640px) {
  .about-workspace__content {
    padding: 32px var(--oc-space-4);
  }

  .about-workspace__brand {
    align-items: flex-start;
  }

  .about-workspace footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .about-workspace__footer-actions {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about-workspace__content {
    animation: none;
  }
}
</style>
