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

        <div v-if="templateInspection" class="create-project__template-editor">
          <div class="create-project__template-source">
            <span>{{ t('projectTemplates.status.creatingFromProject') }}</span>
            <code>{{ templateInspection.sourcePath }}</code>
          </div>
          <label>
            <span>{{ t('projectTemplates.fields.templateName') }}</span>
            <OcFieldInput
              :value="templateName"
              full-width
              :maxlength="80"
              :disabled="isBusy"
              @input="templateName = ($event.target as HTMLInputElement).value"
            />
          </label>
          <label>
            <span>{{ t('projectTemplates.fields.description') }}</span>
            <OcFieldInput
              as="textarea"
              :value="templateDescription"
              full-width
              resize="vertical"
              :maxlength="200"
              :disabled="isBusy"
              rows="2"
              @input="templateDescription = ($event.target as HTMLTextAreaElement).value"
            />
          </label>
          <label>
            <span>{{ t('projectTemplates.fields.entry') }}</span>
            <OcSelect
              :model-value="templateEntry"
              :options="templateEntryOptions"
              full-width
              :disabled="isBusy"
              @update:model-value="templateEntry = $event"
            />
          </label>
          <fieldset class="create-project__cover-options">
            <legend>{{ t('projectTemplates.fields.covers') }}</legend>
            <p v-if="templateInspection.coverCandidates.length === 0">
              {{ t('projectTemplates.status.noCoverCandidates') }}
            </p>
            <OcCheckbox
                v-for="cover in templateInspection.coverCandidates"
                :key="cover"
                :checked="templateCovers.includes(cover)"
                :disabled="isBusy"
                @update:checked="toggleTemplateCover(cover)"
              >
              {{ cover }}
            </OcCheckbox>
          </fieldset>
          <div class="create-project__inline-actions">
            <OcButton size="sm" variant="solid" :disabled="!canSaveTemplate" @click="confirmCreateTemplate">
              {{ t('projectTemplates.actions.saveTemplate') }}
            </OcButton>
            <OcButton size="sm" variant="ghost" :disabled="isBusy" @click="cancelTemplateCreation">
              {{ t('projectTemplates.actions.cancel') }}
            </OcButton>
          </div>
        </div>
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
import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcCheckbox from '../../../components/base/OcCheckbox.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import {
  TemplateServiceError,
  resolveProjectTemplateDescription,
  resolveProjectTemplateName,
  resolveTemplateEntries,
  validateProjectName,
  validateTemplateDescription,
  validateTemplateName,
  type CreatedProject,
  type ProjectTemplate,
  type ProjectTemplateKey,
  type TemplateProjectInspection,
} from '../model/projectTemplate'
import type { StoredResourcePackage } from '../../workspace/model/storedResourcePackage'
import { useAppSettingsStore } from '../../settings/store/appSettingsStore'
import { useProjectTemplateStore } from '../store/projectTemplateStore'
import { notifyError } from '../../notifications/titlebarNotices'
import { publishAppOutput } from '../../logging/appOutput'
import { reportCatalogWarnings } from '../../logging/catalogWarningReporter'

defineOptions({ name: 'CreateProjectWorkspace' })

const props = withDefaults(defineProps<{
  selectedKey: ProjectTemplateKey | null
  /** 创建后要装入新项目的附加包，由外壳从软件存储解析。 */
  attachedResourcePackages?: readonly StoredResourcePackage[]
  externalBusy?: boolean
}>(), {
  attachedResourcePackages: () => [],
})

const emit = defineEmits<{
  created: [project: CreatedProject]
  'update:busy': [busy: boolean]
  'update:selectedKey': [key: ProjectTemplateKey | null]
}>()

const { t, locale } = useI18n()
const store = useProjectTemplateStore()
const appSettingsStore = useAppSettingsStore()

const projectName = ref(t('projectTemplates.defaults.projectName'))
const selectedEntry = ref('')
const parentPath = ref(appSettingsStore.settings.value.projectCreation.lastParentPath)
const isCreating = ref(false)
const isImporting = ref(false)
const isSavingTemplate = ref(false)
const isInspecting = ref(false)
const isChoosingParent = ref(false)
const templateInspection = ref<TemplateProjectInspection | null>(null)
const templateName = ref('')
const templateDescription = ref('')
const templateEntry = ref('')
const templateCovers = ref<string[]>([])
const coverSlideIndex = ref(0)
let coverSlideTimer: ReturnType<typeof setInterval> | null = null

const selectedTemplate = computed(() => props.selectedKey ? store.findTemplate(props.selectedKey) : null)
const selectedTemplateEntries = computed(() => (
  selectedTemplate.value ? resolveTemplateEntries(selectedTemplate.value) : []
))
const selectedEntryOptions = computed(() => [
  { value: '', label: t('projectTemplates.status.noInitialPage') },
  ...selectedTemplateEntries.value.map(entry => ({
    value: entry,
    label: selectedTemplateEntryName(entry),
  })),
])
const templateEntryOptions = computed(() => templateInspection.value?.entries.map(entry => ({
  value: entry,
  label: templateInspection.value?.entryNames[entry] ?? entry,
})) ?? [])

function selectedTemplateEntryName(entry: string): string {
  return entry
    ? selectedTemplate.value?.entryNames?.[entry] ?? entry
    : t('projectTemplates.status.noInitialPage')
}
function localizedTemplateName(template: ProjectTemplate): string {
  return resolveProjectTemplateName(template, locale.value)
}
function localizedTemplateDescription(template: ProjectTemplate): string {
  return resolveProjectTemplateDescription(template, locale.value)
}
const selectedCoverSources = computed(() => (
  selectedTemplate.value?.coverPaths.map((path) => convertFileSrc(path)) ?? []
))
const activeCoverSrc = computed(() => selectedCoverSources.value[coverSlideIndex.value] ?? '')
const projectNameError = computed(() => projectName.value.length > 0 && validateProjectName(projectName.value) !== null)
const localBusy = computed(() => (
  isCreating.value
  || isImporting.value
  || isSavingTemplate.value
  || isInspecting.value
  || isChoosingParent.value
))
const isBusy = computed(() => localBusy.value || props.externalBusy === true)
const targetPreview = computed(() => {
  if (!parentPath.value || !projectName.value.trim()) return ''
  const separator = parentPath.value.includes('\\') ? '\\' : '/'
  const parent = parentPath.value.replace(/[\\/]+$/, '')
  return parent
    ? `${parent}${separator}${projectName.value.trim()}`
    : `${separator}${projectName.value.trim()}`
})
const canCreate = computed(() => Boolean(
  selectedTemplate.value
  && (selectedTemplateEntries.value.length === 0 || selectedEntry.value)
  && parentPath.value
  && projectName.value.trim()
  && !projectNameError.value
  && !isBusy.value,
))
const canSaveTemplate = computed(() => Boolean(
  templateInspection.value
  && templateEntry.value
  && !validateTemplateName(templateName.value)
  && !validateTemplateDescription(templateDescription.value)
  && !isBusy.value,
))

watch(() => props.selectedKey, () => {
  selectedEntry.value = selectedTemplateEntries.value[0] ?? ''
}, { immediate: true })

watch(selectedCoverSources, (sources) => {
  stopCoverSlideshow()
  coverSlideIndex.value = 0
  if (sources.length > 1) {
    coverSlideTimer = setInterval(() => {
      coverSlideIndex.value = (coverSlideIndex.value + 1) % sources.length
    }, 4500)
  }
}, { immediate: true })

watch(localBusy, (busy) => {
  emit('update:busy', busy)
}, { immediate: true, flush: 'sync' })

onMounted(async () => {
  await loadTemplateCatalog()
})

async function loadTemplateCatalog(): Promise<void> {
  try {
    await store.load()
    // 模板目录里用不了的模板只上报一次，具体原因留在输出里。
    reportCatalogWarnings({
      warnings: store.warnings.value,
      summaryKey: 'projectTemplates.status.skippedTemplates',
      itemKey: 'projectTemplates.status.skippedTemplate',
      translate: t,
    })
  } catch (cause) {
    reportFailure(cause)
  }
}

onBeforeUnmount(stopCoverSlideshow)

function stopCoverSlideshow(): void {
  if (coverSlideTimer === null) return
  clearInterval(coverSlideTimer)
  coverSlideTimer = null
}

async function chooseParentDirectory(): Promise<void> {
  if (isBusy.value) return
  isChoosingParent.value = true
  try {
    const selected = await store.pickProjectParentDirectory(t('projectTemplates.dialogs.chooseParent'))
    if (selected) {
      parentPath.value = selected
      appSettingsStore.updateProjectCreation({ lastParentPath: selected })
    }
  } catch (cause) {
    reportFailure(cause)
  } finally {
    isChoosingParent.value = false
  }
}

async function beginImport(): Promise<void> {
  if (isBusy.value || store.isLoading.value) return
  isImporting.value = true
  try {
    const sourcePath = await store.pickTemplateSourceFile(t('projectTemplates.dialogs.chooseTemplatePackage'))
    if (!sourcePath) return
    const imported = await store.importUserTemplate(sourcePath)
    emit('update:selectedKey', imported.key)
  } catch (cause) {
    reportFailure(cause)
  } finally {
    isImporting.value = false
  }
}

async function beginCreateTemplate(sourcePath: string): Promise<void> {
  if (!sourcePath || isBusy.value || store.isLoading.value) return
  isInspecting.value = true
  try {
    const inspection = await store.inspectProjectSource(sourcePath)
    templateInspection.value = inspection
    templateName.value = inspection.suggestedName
    templateDescription.value = ''
    templateEntry.value = inspection.entries[0] ?? ''
    templateCovers.value = []
  } catch (cause) {
    reportFailure(cause)
  } finally {
    isInspecting.value = false
  }
}

function toggleTemplateCover(cover: string): void {
  templateCovers.value = templateCovers.value.includes(cover)
    ? templateCovers.value.filter((item) => item !== cover)
    : [...templateCovers.value, cover]
}

function cancelTemplateCreation(): void {
  templateInspection.value = null
  templateName.value = ''
  templateDescription.value = ''
  templateEntry.value = ''
  templateCovers.value = []
}

async function confirmCreateTemplate(): Promise<void> {
  if (!canSaveTemplate.value || !templateInspection.value) return
  isSavingTemplate.value = true
  try {
    const created = await store.createUserTemplate({
      sourcePath: templateInspection.value.sourcePath,
      name: templateName.value,
      description: templateDescription.value,
      entry: templateEntry.value,
      entries: [templateEntry.value],
      covers: templateCovers.value,
    })
    emit('update:selectedKey', created.key)
    cancelTemplateCreation()
  } catch (cause) {
    reportFailure(cause)
  } finally {
    isSavingTemplate.value = false
  }
}

defineExpose({ beginCreateTemplate, beginImport })

async function createProject(): Promise<void> {
  if (!canCreate.value || !selectedTemplate.value) return
  isCreating.value = true
  try {
    const project = await store.createProject({
      template: selectedTemplate.value,
      parentPath: parentPath.value,
      projectName: projectName.value,
      entry: selectedEntry.value || undefined,
    })
    emit('created', project)
  } catch (cause) {
    reportFailure(cause)
  } finally {
    isCreating.value = false
  }
}

/** 一次性失败交给即时信息，具体原因留在输出里，页面不再长期挂一段过期报错。 */
function reportFailure(cause: unknown): void {
  const message = resolveErrorMessage(cause)
  notifyError(message)
  publishAppOutput({ severity: 'error', message, detail: describeFailure(cause) })
}

function describeFailure(cause: unknown): string {
  if (cause instanceof TemplateServiceError) return `${cause.code}: ${cause.message}`
  return cause instanceof Error ? cause.message : String(cause)
}

function resolveErrorMessage(cause: unknown): string {
  if (!(cause instanceof TemplateServiceError)) return t('projectTemplates.errors.unknown')
  const keyByCode: Record<TemplateServiceError['code'], string> = {
    'invalid-catalog': 'invalidCatalog',
    'invalid-manifest': 'invalidManifest',
    'invalid-project-name': 'invalidProjectName',
    'invalid-template-name': 'invalidTemplateName',
    'description-too-long': 'descriptionTooLong',
    'source-not-project': 'sourceNotProject',
    'source-not-template': 'sourceNotTemplate',
    'source-has-symlink': 'sourceHasSymlink',
    'entry-not-found': 'entryNotFound',
    'cover-not-found': 'coverNotFound',
    'template-exists': 'templateExists',
    'parent-not-found': 'parentNotFound',
    'target-exists': 'targetExists',
    'builtin-delete-forbidden': 'builtinDeleteForbidden',
    'copy-failed': 'copyFailed',
    'invalid-package': 'invalidPackage',
    'archive-failed': 'archiveFailed',
  }
  return t(`projectTemplates.errors.${keyByCode[cause.code]}`)
}
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

.create-project__template-editor {
  margin-top: var(--oc-space-3);
  padding-top: var(--oc-space-3);
  display: grid;
  gap: var(--oc-space-3);
  border-top: 1px solid var(--oc-border-default);
}

.create-project__template-source {
  display: grid;
  gap: var(--oc-space-1);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.create-project__template-source code,
.create-project__cover-options span {
  overflow-wrap: anywhere;
}

.create-project__cover-options {
  min-width: 0;
  max-height: 180px;
  margin: 0;
  padding: var(--oc-space-2) 0;
  display: grid;
  gap: var(--oc-space-2);
  overflow-y: auto;
  border: 0;
  border-block: 1px solid var(--oc-border-muted);
}

.create-project__cover-options legend {
  padding: 0;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.create-project__cover-options p {
  margin: 0;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
}

.create-project__cover-options label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-2);
}

.create-project__template-editor label,
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

.create-project__inline-actions,
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

  .create-project__inline-actions {
    flex-wrap: wrap;
  }

}
</style>
