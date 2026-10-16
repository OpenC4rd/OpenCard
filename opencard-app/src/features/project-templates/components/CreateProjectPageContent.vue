<template>
  <section class="create-project" :aria-label="t('projectTemplates.title')">

    <div class="create-project__backdrop" aria-hidden="true">
      <Transition name="create-project-cover">
        <img v-if="activeCoverSrc" :key="activeCoverSrc" class="create-project__cover-image" :src="activeCoverSrc" alt="" />
      </Transition>
    </div>
    <div class="create-project__body">
      <section class="create-project__catalog" :aria-label="t('projectTemplates.catalogLabel')">
        <div class="create-project__catalog-cover" aria-hidden="true">
          <Transition name="create-project-cover">
            <img v-if="activeCoverSrc" :key="activeCoverSrc" class="create-project__cover-image" :src="activeCoverSrc" alt="" />
          </Transition>
          <div class="create-project__catalog-scrim" />
        </div>
        <div class="create-project__catalog-content">
          <OcText v-if="store.isLoading.value" as="p" size="sm" tone="muted">
            {{ t('projectTemplates.status.loading') }}
          </OcText>
          <OcPanel v-else-if="selectedTemplate" as="article" class="create-project__details" gap="3" padding="none" tone="transparent" border="none" radius="none">
            <OcPanel gap="1" padding="none" tone="transparent" border="none" radius="none">
              <div class="create-project__template-title">
                <OcText as="strong" size="lg" bold>{{ localizedTemplateName(selectedTemplate) }}</OcText>
                <OcText size="xs" tone="muted">{{ t(`projectTemplates.sources.${selectedTemplate.source}`) }}</OcText>
              </div>
              <OcText size="sm" tone="subtle">{{ localizedTemplateDescription(selectedTemplate) || t('projectTemplates.status.noDescription') }}</OcText>
            </OcPanel>
            <dl class="create-project__details-list">
              <div>
                <OcText as="dt" size="sm" tone="muted">{{ t('projectTemplates.fields.entry') }}</OcText>
                <OcText as="dd" size="sm" :mono="Boolean(selectedEntry)">{{ selectedTemplateEntryName(selectedEntry) }}</OcText>
              </div>
              <div>
                <OcText as="dt" size="sm" tone="muted">{{ t('projectTemplates.fields.resourcePackages') }}</OcText>
                <dd class="create-project__packages">
                  <ul v-if="attachedResourcePackages.length" class="create-project__resource-package-list">
                    <OcText v-for="pack in attachedResourcePackages" :key="pack.path" as="li" size="sm" truncate>{{ pack.title }}</OcText>
                  </ul>
                  <OcText v-else size="sm">{{ t('projectTemplates.status.noResourcePackagesSelected') }}</OcText>
                </dd>
              </div>
            </dl>
          </OcPanel>
          <OcText v-else as="p" size="sm" tone="muted">{{ t('projectTemplates.status.selectTemplate') }}</OcText>

        </div>
      </section>
      <form class="create-project__form" @submit.prevent="createProject">
        <OcPanel gap="1" padding="none" tone="transparent" border="none" radius="none">
          <OcText as="strong" size="lg" bold>{{ t('projectTemplates.formTitle') }}</OcText>
          <OcText size="sm" tone="muted">{{ selectedTemplate ? localizedTemplateName(selectedTemplate) : t('projectTemplates.status.selectTemplate') }}</OcText>
        </OcPanel>
        <fieldset class="create-project__fields" :disabled="isBusy">
          <OcPanel as="label" data-oc-tutorial="create-project.name" gap="2" padding="none" tone="transparent" border="none" radius="none">
            <OcText size="sm">{{ t('projectTemplates.fields.projectName') }}</OcText>
            <OcFieldFrame full-width :invalid="projectNameError">
              <OcFieldInput variant="plain" full-width :value="projectName" :maxlength="80"
                :aria-label="t('projectTemplates.fields.projectName')" :aria-invalid="projectNameError || undefined"
                @input="projectName = ($event.target as HTMLInputElement).value" />
            </OcFieldFrame>
            <OcText v-if="projectNameError" as="small" size="sm" tone="danger">{{ t('projectTemplates.errors.invalidProjectName') }}</OcText>
          </OcPanel>
          <OcPanel v-if="selectedTemplate" as="label" gap="2" padding="none" tone="transparent" border="none" radius="none">
            <OcText size="sm">{{ t('projectTemplates.fields.entry') }}</OcText>
            <OcSelect :model-value="selectedEntry" :options="selectedEntryOptions" full-width :disabled="isBusy"
              :aria-label="t('projectTemplates.fields.entry')" @update:model-value="selectedEntry = $event" />
          </OcPanel>
          <OcPanel as="label" data-oc-tutorial="create-project.location" gap="2" padding="none" tone="transparent" border="none" radius="none">
            <OcText size="sm">{{ t('projectTemplates.fields.location') }}</OcText>
            <div class="create-project__path-field">
              <OcFieldFrame full-width readonly>
                <OcFieldInput variant="plain" full-width mono readonly :value="parentPath" :aria-label="t('projectTemplates.fields.location')" />
              </OcFieldFrame>
              <OcButton type="button" size="md" variant="outline" icon="status.folder-open" :disabled="isBusy" @click="chooseParentDirectory">
                {{ t('projectTemplates.actions.browse') }}
              </OcButton>
            </div>
          </OcPanel>
          <OcPanel gap="2" padding="none" tone="transparent" border="none" radius="none">
            <OcText size="sm">{{ t('projectTemplates.fields.target') }}</OcText>
            <OcText class="create-project__target" size="sm" tone="muted" :mono="Boolean(targetPreview)">{{ targetPreview || t('projectTemplates.status.chooseLocation') }}</OcText>
          </OcPanel>
        </fieldset>
        <div class="create-project__form-actions">
          <OcButton data-oc-tutorial="create-project.submit" type="submit" variant="solid" icon="action.folder-plus" :disabled="!canCreate">
            {{ isCreating ? t('projectTemplates.status.creating') : t('projectTemplates.actions.create') }}
          </OcButton>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcPanel from '../../../components/base/OcPanel.vue'
import OcText from '../../../components/base/OcText.vue'
import OcFieldFrame from '../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import type { StoredResourcePackage } from '../../workspace/model/storedResourcePackage'
import type { createProjectForm } from '../composables/createProjectForm'

const props = defineProps<{ model: ReturnType<typeof createProjectForm>; attachedResourcePackages: readonly StoredResourcePackage[] }>()
const { t } = useI18n()
const { store, projectName, selectedEntry, parentPath, isCreating, selectedTemplate, selectedEntryOptions, selectedTemplateEntryName, localizedTemplateName, localizedTemplateDescription, selectedCoverSources, projectNameError, isBusy, targetPreview, canCreate, chooseParentDirectory, createProject } = props.model
const coverSlideIndex = ref(0)
const activeCoverSrc = computed(() => selectedCoverSources.value[coverSlideIndex.value] ?? '')
let coverSlideTimer: ReturnType<typeof setInterval> | null = null
function stopCoverSlideshow(): void {
  if (coverSlideTimer !== null) clearInterval(coverSlideTimer)
  coverSlideTimer = null
}
watch(selectedCoverSources, sources => {
  stopCoverSlideshow()
  coverSlideIndex.value = 0
  if (sources.length > 1) coverSlideTimer = setInterval(() => {
    coverSlideIndex.value = (coverSlideIndex.value + 1) % sources.length
  }, 4500)
}, { immediate: true })
onBeforeUnmount(stopCoverSlideshow)
</script>

<style scoped>
.create-project {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  container-type: inline-size;
  background: var(--oc-bg-base);
  color: var(--oc-fg-default);
}


.create-project__backdrop {
  position: absolute;
  z-index: 0;
  inset: calc(-1 * var(--oc-bg-glass-blur));
  pointer-events: none;
}

.create-project__backdrop .create-project__cover-image {
  filter: blur(var(--oc-bg-glass-blur));
  opacity: 0.08;
}

.create-project__body {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(340px, 440px);
  overflow: hidden;
}

.create-project__form {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-lg);
  padding: var(--oc-space-lg);
  overflow-y: auto;
}

.create-project__form > * {
  flex-shrink: 0;
}

.create-project__catalog {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  padding: var(--oc-space-lg);
  overflow: hidden;
  border-right: 1px solid var(--oc-border-muted);
}

.create-project__catalog-cover {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.create-project__cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.38;
}

.create-project__catalog-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent, var(--oc-bg-base));
}

.create-project__catalog-content {
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.create-project-cover-enter-active,
.create-project-cover-leave-active {
  transition: opacity 360ms ease;
}

.create-project__cover-image.create-project-cover-enter-from,
.create-project__cover-image.create-project-cover-leave-to {
  opacity: 0;
}

.create-project__details {
  margin-top: auto;
  padding-block: var(--oc-space-md);
}

.create-project__template-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--oc-space-xs);
  overflow-wrap: anywhere;
}

.create-project__details-list {
  margin: 0;
}

.create-project__details-list > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--oc-space-md);
  padding-block: var(--oc-space-xs);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__details-list dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.create-project__packages {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: var(--oc-size-md);
}

.create-project__resource-package-list {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--oc-space-2xs);
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.create-project__resource-package-list > li {
  min-width: 0;
  max-width: 100%;
  padding-inline: var(--oc-space-xs);
  border-radius: var(--oc-radius-control);
  background-image: var(--oc-overlay-hover);
  line-height: var(--oc-size-sm);
}

.create-project__fields {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: var(--oc-space-lg);
}

.create-project__path-field {
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
}

.create-project__path-field > .oc-field-frame {
  flex: 1 1 0;
}

.create-project__path-field > .oc-button {
  flex-shrink: 0;
}

.create-project__target {
  overflow-wrap: anywhere;
}

.create-project__form-actions {
  display: flex;
  justify-content: flex-end;
}

@container (max-width: 860px) {
  .create-project__body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .create-project__catalog {
    overflow: visible;
  }

  .create-project__catalog {
    border-right: 0;
    border-bottom: 1px solid var(--oc-border-muted);
  }

  .create-project__catalog-content {
    height: auto;
    overflow: visible;
  }

  .create-project__details {
    margin-top: 0;
  }
}

@container (max-width: 520px) {

  .create-project__catalog,
  .create-project__form {
    padding: var(--oc-space-md);
  }
}
</style>
