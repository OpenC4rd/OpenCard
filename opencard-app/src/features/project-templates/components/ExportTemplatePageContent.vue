<template>
  <section class="export-template" :aria-label="t('templateExport.title')">
    <section class="export-template__preview" :aria-label="t('templateExport.previewTitle')">
      <div class="export-template__media" aria-hidden="true">
        <Transition name="export-template-cover">
          <img v-if="activeCoverSrc" :key="activeCoverSrc" :src="activeCoverSrc" alt="" />
        </Transition>
        <div class="export-template__scrim" />
      </div>

      <div class="export-template__preview-content">
        <article class="export-template__details">
          <div class="export-template__details-heading">
            <OcIcon name="file.opencard" size="lg" />
            <div>
              <strong>{{ name.trim() || t('templateExport.unnamed') }}</strong>
              <p>{{ description.trim() || t('templateExport.previewDescription') }}</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>{{ t('projectTemplates.fields.entry') }}</dt>
              <dd>
                <code v-for="entry in entries" :key="entry">{{ entry }}</code>
                <span v-if="entries.length === 0">{{ t('templateExport.selectEntry') }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t('projectTemplates.fields.covers') }}</dt>
              <dd><code>{{ covers.length }}</code></dd>
            </div>
            <div>
              <dt>{{ t('templateExport.excluded') }}</dt>
              <dd><code>{{ excludedPaths.length }}</code></dd>
            </div>
          </dl>
        </article>
      </div>

      <p v-if="isInspecting" class="export-template__overlay-status">
        {{ t('templateExport.status.inspecting') }}
      </p>
    </section>

    <form class="export-template__form" @submit.prevent="exportTemplate">
      <label class="export-template__field">
        <span>{{ t('projectTemplates.fields.templateName') }}</span>
        <OcFieldInput
          :value="name"
          full-width
          :maxlength="80"
          :aria-invalid="nameError || undefined"
          :disabled="isBusy"
          @input="name = ($event.target as HTMLInputElement).value"
        />
        <small v-if="nameError" class="is-error">{{ t('projectTemplates.errors.invalidTemplateName') }}</small>
      </label>

      <label class="export-template__field">
        <span>{{ t('projectTemplates.fields.description') }}</span>
        <OcFieldInput
          as="textarea"
          :value="description"
          full-width
          resize="vertical"
          rows="5"
          :maxlength="200"
          :disabled="isBusy"
          @input="description = ($event.target as HTMLTextAreaElement).value"
        />
        <small>{{ description.length }} / 200</small>
      </label>

      <div class="export-template__selection-summary">
        <p v-if="entries.length === 0" class="is-error">{{ t('templateExport.selectEntry') }}</p>
        <p v-else>{{ t('templateExport.selectionHint') }}</p>
      </div>

      <footer class="export-template__footer">
        <OcButton type="submit" size="lg" variant="solid" icon="action.export" :disabled="!canExport">
          {{ isExporting ? t('templateExport.status.exporting') : t('templateExport.actions.export') }}
        </OcButton>
      </footer>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import type { createTemplateExportForm } from '../composables/createTemplateExportForm'
const props = defineProps<{ model: ReturnType<typeof createTemplateExportForm> }>()
const { t } = useI18n()
const { name, description, entries, covers, excludedPaths, isInspecting, isExporting, isBusy, nameError, canExport, coverSource, exportTemplate } = props.model
const activeCoverIndex = ref(0)
const activeCoverSrc = computed(() => {
  const cover = covers.value[activeCoverIndex.value]
  return cover ? coverSource(cover) : ''
})
let coverTimer: ReturnType<typeof setInterval> | null = null
function restartCoverTimer(): void {
  if (coverTimer) clearInterval(coverTimer)
  coverTimer = null
  activeCoverIndex.value = 0
  if (covers.value.length > 1) coverTimer = setInterval(() => {
    activeCoverIndex.value = (activeCoverIndex.value + 1) % covers.value.length
  }, 4500)
}
watch(covers, restartCoverTimer, { deep: true, immediate: true })
onUnmounted(() => { if (coverTimer) clearInterval(coverTimer) })
</script>

<style scoped>
.export-template {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
  container-type: inline-size;
  overflow: hidden;
  background: var(--oc-bg-base);
  color: var(--oc-fg-default);
}

.export-template__preview {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  padding: var(--oc-space-5);
  overflow: hidden;
  border-right: 1px solid var(--oc-border-muted);
  background: var(--oc-bg-base);
}

.export-template__media,
.export-template__media > img,
.export-template__scrim {
  position: absolute;
  inset: 0;
}

.export-template__media {
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.export-template__media > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .38;
}

.export-template__scrim {
  background: linear-gradient(
    180deg,
    var(--oc-bg-base),
    color-mix(in srgb, var(--oc-bg-base) 88%, transparent) 42%,
    color-mix(in srgb, var(--oc-bg-base) 46%, transparent)
  );
}

.export-template__preview-content {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.export-template__details {
  margin-top: var(--oc-space-4);
  padding: var(--oc-space-4) 0;
  display: grid;
  gap: var(--oc-space-4);
  border-bottom: 1px solid var(--oc-border-muted);
}

.export-template__details-heading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--oc-space-3);
}

.export-template__details-heading > div {
  min-width: 0;
  display: grid;
  gap: var(--oc-space-1);
}

.export-template__details-heading strong {
  overflow-wrap: anywhere;
  font-size: var(--oc-text-lg);
}

.export-template__details-heading p {
  margin: 0;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
  line-height: 1.5;
}

.export-template__details dl,
.export-template__details dd {
  margin: 0;
}

.export-template__details dl {
  display: grid;
  gap: var(--oc-space-3);
}

.export-template__details dl > div,
.export-template__details dd {
  display: grid;
  gap: var(--oc-space-1);
}

.export-template__details dt {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.export-template__details code,
.export-template__details dd > span {
  overflow-wrap: anywhere;
  color: var(--oc-fg-default);
  font-family: var(--oc-font-mono);
  font-size: var(--oc-text-sm);
}

.export-template__overlay-status {
  position: absolute;
  right: var(--oc-space-4);
  bottom: var(--oc-space-4);
  z-index: 2;
  margin: 0;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.export-template__form {
  min-width: 0;
  min-height: 0;
  padding: var(--oc-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-4);
  overflow-y: auto;
  background: var(--oc-bg-surface);
}

.export-template__field {
  display: grid;
  gap: var(--oc-space-2);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.export-template__field > span {
  color: var(--oc-fg-default);
  font-weight: 600;
}

.export-template__field small {
  justify-self: end;
  color: var(--oc-fg-subtle);
}

.export-template__selection-summary p {
  margin: 0;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
  line-height: 1.5;
}

.export-template__footer {
  margin-top: auto;
  padding-top: var(--oc-space-4);
  display: grid;
  gap: var(--oc-space-4);
  border-top: 1px solid var(--oc-border-muted);
}

.is-error {
  margin: 0;
  color: var(--oc-fg-danger) !important;
  font-size: var(--oc-text-sm);
}

.export-template__media > img.export-template-cover-enter-active,
.export-template__media > img.export-template-cover-leave-active {
  transition: opacity 360ms ease;
}

.export-template__media > img.export-template-cover-enter-from,
.export-template__media > img.export-template-cover-leave-to {
  opacity: 0;
}

@container (max-width: 800px) {
  .export-template {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .export-template__preview {
    min-height: 420px;
    border-right: 0;
    border-bottom: 1px solid var(--oc-border-muted);
  }

  .export-template__form {
    overflow: visible;
  }
}

@container (max-width: 480px) {
  .export-template__preview {
    min-height: 360px;
  }

  .export-template__preview,
  .export-template__form {
    padding: var(--oc-space-4);
  }
}
</style>
