<template>
  <section class="create-project" :aria-label="t('projectTemplates.title')">

    <div class="create-project__body">
      <section class="create-project__catalog" :aria-label="t('projectTemplates.catalogLabel')">
        <div class="create-project__catalog-cover" aria-hidden="true">
          <Transition name="create-project-cover">
            <img v-if="activeCoverSrc" :key="activeCoverSrc" :src="activeCoverSrc" alt="" />
          </Transition>
          <div class="create-project__catalog-scrim" />
        </div>
        <div class="create-project__catalog-content">
        <p v-if="store.isLoading.value" class="create-project__status">
          {{ t('projectTemplates.status.loading') }}
        </p>
        <article v-else-if="selectedTemplate" class="create-project__details">
          <div class="create-project__details-heading">
            <OcIcon name="file.opencard" size="sm" />
            <div>
              <div class="create-project__template-title">
                <strong>{{ localizedTemplateName(selectedTemplate) }}</strong>
                <span class="create-project__template-source-label">
                  {{ t(`projectTemplates.sources.${selectedTemplate.source}`) }}
                </span>
              </div>
              <p>{{ localizedTemplateDescription(selectedTemplate) || t('projectTemplates.status.noDescription') }}</p>
            </div>
          </div>
          <dl class="create-project__details-list">
            <div>
              <dt>{{ t('projectTemplates.fields.entry') }}</dt>
              <dd><code>{{ selectedTemplateEntryName(selectedEntry) }}</code></dd>
            </div>
            <div>
              <dt>{{ t('projectTemplates.fields.resourcePackages') }}</dt>
              <dd>
                <ul v-if="attachedResourcePackages.length" class="create-project__resource-package-list">
                  <li v-for="pack in attachedResourcePackages" :key="pack.path">
                    {{ pack.title }}
                  </li>
                </ul>
                <span v-else>{{ t('projectTemplates.status.noResourcePackagesSelected') }}</span>
              </dd>
            </div>
          </dl>
        </article>
        <p v-else class="create-project__status">
          {{ t('projectTemplates.status.selectTemplate') }}
        </p>

        </div>
      </section>
      <form class="create-project__form" @submit.prevent="createProject">
        <div class="create-project__form-heading">
          <strong>{{ t('projectTemplates.formTitle') }}</strong>
          <span>{{ selectedTemplate ? localizedTemplateName(selectedTemplate) : t('projectTemplates.status.selectTemplate') }}</span>
        </div>

        <label>
          <span>{{ t('projectTemplates.fields.projectName') }}</span>
          <OcFieldInput
            :value="projectName"
            full-width
            :maxlength="80"
            :aria-invalid="projectNameError || undefined"
            @input="projectName = ($event.target as HTMLInputElement).value"
          />
          <small v-if="projectNameError" class="is-error">{{ t('projectTemplates.errors.invalidProjectName') }}</small>
        </label>

        <label v-if="selectedTemplate">
          <span>{{ t('projectTemplates.fields.entry') }}</span>
          <OcSelect
            :model-value="selectedEntry"
            :options="selectedEntryOptions"
            full-width
            :disabled="isBusy"
            @update:model-value="selectedEntry = $event"
          />
        </label>

        <label>
          <span>{{ t('projectTemplates.fields.location') }}</span>
          <div class="create-project__path-field">
            <OcFieldInput class="create-project__location-input" :value="parentPath" readonly full-width mono />
            <OcButton class="create-project__browse" type="button" variant="outline" icon="status.folder-open" :disabled="isBusy" @click="chooseParentDirectory">
              {{ t('projectTemplates.actions.browse') }}
            </OcButton>
          </div>
        </label>

        <div class="create-project__target">
          <span>{{ t('projectTemplates.fields.target') }}</span>
          <code>{{ targetPreview || t('projectTemplates.status.chooseLocation') }}</code>
        </div>

        <div class="create-project__form-actions">
          <OcButton type="submit" variant="solid" icon="action.folder-plus" :disabled="!canCreate">
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
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
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


.create-project__body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(340px, 440px);
  overflow: hidden;
}

.create-project__catalog,
.create-project__location-input {
  flex: 1 1 0;
}

.create-project__browse {
  flex: 0 0 auto;
}

.create-project__form {
  min-width: 0;
  min-height: 0;
  padding: var(--oc-space-5);
  overflow-y: auto;
}

.create-project__catalog {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  padding: var(--oc-space-5);
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

.create-project__catalog-cover img {
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

.create-project__catalog-cover img.create-project-cover-enter-from,
.create-project__catalog-cover img.create-project-cover-leave-to {
  opacity: 0;
}

.create-project__details {
  margin-top: auto;
  padding: var(--oc-space-4) 0;
  display: grid;
  gap: var(--oc-space-3);
}

.create-project__details-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--oc-space-2);
}

.create-project__details-heading > div {
  min-width: 0;
  display: grid;
  gap: var(--oc-space-1);
}

.create-project__details-heading strong {
  overflow-wrap: anywhere;
  font-size: var(--oc-text-lg);
}

.create-project__template-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--oc-space-2);
}

.create-project__template-source-label {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.create-project__details-heading p {
  margin: 0;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
  line-height: 1.5;
}

.create-project__details-list {
  display: grid;
  border-top: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__details dl,
.create-project__details dd {
  margin: 0;
}

.create-project__details dl > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: var(--oc-space-4);
  padding: var(--oc-space-2) 0;
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__details dt {
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.create-project__details code {
  overflow-wrap: anywhere;
  color: var(--oc-fg-default);
  font-family: var(--oc-font-mono);
  font-size: var(--oc-text-sm);
}

.create-project__details dd {
  min-width: 0;
  justify-self: end;
  overflow-wrap: anywhere;
  text-align: right;
  font-size: var(--oc-text-sm);
}

/* 预装的包显示成 chips：一行放不下就换行，单个名字过宽时省略号截断。 */
.create-project__resource-package-list {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--oc-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.create-project__resource-package-list li {
  min-width: 0;
  max-width: 100%;
  padding: var(--oc-space-1) var(--oc-space-2);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-hover);
  color: var(--oc-fg-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.create-project__form label {
  display: grid;
  gap: var(--oc-space-2);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.create-project__form label {
  padding: var(--oc-space-4) 0;
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__form label > span,
.create-project__target > span {
  color: var(--oc-fg-default);
  font-weight: 600;
}

.create-project__form-actions,
.create-project__path-field {
  display: flex;
  align-items: center;
  gap: var(--oc-space-2);
}

.create-project__form {
  display: grid;
  align-content: start;
  background: var(--oc-bg-surface);
}

.create-project__form-heading {
  display: grid;
  gap: var(--oc-space-1);
  padding-bottom: var(--oc-space-4);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__form-heading span {
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
}

.create-project__form-heading strong {
  font-size: var(--oc-text-lg);
}

.create-project__target {
  display: grid;
  gap: var(--oc-space-2);
  padding: var(--oc-space-4) 0;
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.create-project__target code {
  overflow-wrap: anywhere;
  color: var(--oc-fg-muted);
  font-family: var(--oc-font-mono);
  font-size: var(--oc-text-sm);
}

.create-project__form-actions {
  padding-top: var(--oc-space-4);
  justify-content: flex-end;
}

.create-project__status {
  margin: var(--oc-space-2) 0 0;
}

.is-error {
  color: var(--oc-fg-danger);
  font-size: var(--oc-text-sm);
}


@container (max-width: 860px) {
  .create-project__body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .create-project__catalog,
  .create-project__form {
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
    padding: var(--oc-space-4);
  }

  .create-project__path-field {
    align-items: stretch;
    flex-direction: column;
  }


}
</style>
