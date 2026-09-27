<template>
  <OcDialog class="project-icon-registration-dialog" :open="open"
    :title="appendMode ? t('projectConfig.icons.addIconsToSet', { name: targetSeries?.name ?? '' })
      : t('projectConfig.icons.createPack')"
    as="form" size="md" close-on-backdrop @request-close="close" @submit="submit">
    <section class="project-icon-registration-dialog__summary">
      <template v-if="hasSelection">
        <OcText as="strong">{{ t('projectConfig.icons.selectedIconsCount', { count: icons.length }) }}</OcText>
        <OcText tone="muted" size="sm">{{ summaryTarget }}</OcText>
      </template>
      <OcText v-else tone="muted" size="sm">{{ t('projectConfig.icons.chooseFileHint') }}</OcText>
      <div class="project-icon-registration-dialog__summary-actions">
        <OcButton type="button" icon="nav.files" variant="outline" @click="pickFiles">
          {{ hasSelection ? t('projectConfig.icons.chooseAgain') : t('projectConfig.icons.chooseFiles') }}
        </OcButton>
        <OcButton type="button" icon="folder.open" variant="outline" @click="pickFolder">
          {{ t('projectConfig.icons.chooseFolder') }}
        </OcButton>
        <OcButton v-if="!appendMode" type="button" variant="ghost" icon="tool.settings"
          @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? t('projectConfig.icons.simpleSettings') : t('projectConfig.icons.advancedSettings') }}
        </OcButton>
      </div>
    </section>

    <template v-if="advancedOpen && !appendMode">
      <label class="project-icon-registration-dialog__field">
        <span>{{ t('projectConfig.icons.packName') }}</span>
        <OcFieldInput full-width autofocus :value="iconSetName"
          :aria-invalid="hasSelection && !validName" @input="updateText('name', $event)" />
      </label>
      <label class="project-icon-registration-dialog__field">
        <span>{{ t('projectConfig.icons.packKey') }}</span>
        <OcFieldInput full-width mono :value="iconSetKey" :placeholder="generatedKey"
          :aria-invalid="Boolean(iconSetKey) && (!validKey || !uniqueKey)" @input="updateText('key', $event)" />
      </label>
    </template>

    <section v-if="icons.length" class="project-icon-registration-dialog__preview" aria-live="polite">
      <div class="project-icon-registration-dialog__preview-heading">
        <OcText as="strong">{{ t('projectConfig.icons.previewTitle') }}</OcText>
        <OcText tone="muted" size="sm">{{ t('projectConfig.icons.previewHint') }}</OcText>
      </div>
      <ul class="project-icon-registration-dialog__icon-list">
        <li v-for="icon in icons" :key="icon.iconKey" class="project-icon-registration-dialog__icon-row">
          <OcText as="span" size="sm" mono>{{ icon.iconKey }}</OcText>
          <OcText as="span" tone="muted" size="sm">{{ icon.name }}</OcText>
        </li>
      </ul>
    </section>

    <OcText v-if="localError" tone="danger" size="sm" role="alert">{{ localError }}</OcText>
    <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">{{ validationMessage }}</OcText>

    <template #footer>
      <OcButton type="button" @click="close">{{ t('projectConfig.icons.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!canSubmit">
        {{ appendMode ? t('projectConfig.icons.addIcons') : t('projectConfig.icons.createPack') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script lang="ts">
/**
 * One selected file. Copying it into the project and deriving what the file itself decides (its tint,
 * and whether a raster is pixel art) is the owner's job, so the dialog never has to read the files and
 * can close as soon as the user confirms.
 */
export type ProjectIconImport = {
  sourcePath: string
  iconKey: string
  name: string
}

export type ProjectIconRegistrationRequest = {
  name: string
  key: string
  icons: readonly ProjectIconImport[]
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createAvailableProjectIconKey,
  createAvailableProjectIconSeriesKey,
  PROJECT_ICON_FILE_EXTENSIONS,
  projectIconKeyPattern,
  projectIconSourcePattern,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  series?: readonly ProjectIconSeries[]
  defaultOpenPath?: string
  /**
   * 给了目标图标集就是"追加"：图标集已经存在，名称与 Key 不再由这个对话框决定，
   * 新图标的引用名称也必须避开它已有的那些。
   */
  targetSeries?: ProjectIconSeries
}>(), {
  series: () => [],
  defaultOpenPath: undefined,
  targetSeries: undefined,
})
const emit = defineEmits<{
  close: []
  submit: [request: ProjectIconRegistrationRequest]
}>()

type RegistrationDraft = { name: string; key: string; keyEdited: boolean }

const { t } = useI18n()
const advancedOpen = ref(false)
const draft = ref<RegistrationDraft>({ name: '', key: '', keyEdited: false })
const selectedPaths = ref<readonly string[]>([])
const localError = ref('')

const appendMode = computed(() => props.targetSeries !== undefined)
const reservedIconKeys = computed(() => (props.targetSeries?.icons ?? []).map(icon => ({ iconKey: icon.iconKey })))
/** Identity only: the Key is derived from the file name, which needs no read. */
const icons = computed<readonly ProjectIconImport[]>(() => {
  const next: ProjectIconImport[] = []
  for (const path of selectedPaths.value) {
    const name = fileStem(path) || 'Icon'
    next.push({ sourcePath: path, iconKey: createAvailableProjectIconKey(name, [...reservedIconKeys.value, ...next]), name })
  }
  return next
})
const iconSetName = computed(() => draft.value.name)
const iconSetKey = computed(() => draft.value.key)
const normalizedName = computed(() => iconSetName.value.trim())
const hasSelection = computed(() => selectedPaths.value.length > 0)
const generatedKey = computed(() => createAvailableProjectIconSeriesKey(iconSetName.value, props.series))
const effectiveKey = computed(() => iconSetKey.value || generatedKey.value)
const validName = computed(() => appendMode.value || normalizedName.value.length > 0)
const validKey = computed(() => appendMode.value || projectIconKeyPattern.test(effectiveKey.value))
const uniqueKey = computed(() => appendMode.value || !props.series.some(series => (
  series.key.toLocaleLowerCase() === effectiveKey.value.toLocaleLowerCase()
)))
const summaryTarget = computed(() => appendMode.value
  ? `${props.targetSeries!.name} / ${props.targetSeries!.key}`
  : `${iconSetName.value} / ${effectiveKey.value}`)
const canSubmit = computed(() => hasSelection.value && validName.value && validKey.value && uniqueKey.value)
const validationMessage = computed(() => {
  if (!hasSelection.value) return ''
  if (!validName.value) return t('projectConfig.icons.invalidIconSetName')
  if (!validKey.value) return t('projectConfig.icons.invalidIconSetKey')
  if (!uniqueKey.value) return t('projectConfig.icons.iconSetKeyExists')
  return ''
})

watch(() => props.open, open => {
  if (!open) return
  advancedOpen.value = false
  draft.value = { name: '', key: '', keyEdited: false }
  selectedPaths.value = []
  localError.value = ''
}, { immediate: true })

async function pickFiles(): Promise<void> {
  if (!fileSystemService.pickFiles) return
  const paths = await fileSystemService.pickFiles({
    title: t('projectConfig.icons.pickFilesTitle'),
    fileTypeName: t('projectConfig.icons.fileType'),
    extensions: [...PROJECT_ICON_FILE_EXTENSIONS],
    defaultPath: props.defaultOpenPath,
  })
  if (paths.length === 0) return
  localError.value = ''
  assignDerivedName(fileName(paths[0] ?? ''))
  selectedPaths.value = paths
}

/** Takes every supported icon file directly inside the chosen folder, skipping nested folders. */
async function pickFolder(): Promise<void> {
  const directory = await fileSystemService.pickDirectory(t('projectConfig.icons.pickFolderTitle'))
  if (!directory) return
  const separator = directory.includes('\\') ? '\\' : '/'
  const base = directory.replace(/[\\/]+$/, '')
  const paths = (await fileSystemService.readDirectory(base))
    .filter(entry => entry.isFile && projectIconSourcePattern.test(entry.name))
    .map(entry => `${base}${separator}${entry.name}`)
  if (paths.length === 0) {
    localError.value = t('projectConfig.icons.noIconsInFolder')
    return
  }
  localError.value = ''
  // A folder names the set better than whichever icon happens to sort first inside it.
  assignDerivedName(fileName(base))
  selectedPaths.value = paths
}

function assignDerivedName(name: string): void {
  const stem = name.replace(projectIconSourcePattern, '')
  draft.value.name = stem
  if (!draft.value.keyEdited) draft.value.key = createAvailableProjectIconSeriesKey(stem, props.series)
}

function updateText(field: 'name' | 'key', event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  if (field === 'name') {
    draft.value.name = event.target.value
    if (!draft.value.keyEdited) {
      draft.value.key = createAvailableProjectIconSeriesKey(draft.value.name, props.series)
    }
    return
  }
  const value = event.target.value
  draft.value.keyEdited = Boolean(value)
  draft.value.key = value || createAvailableProjectIconSeriesKey(draft.value.name, props.series)
}

function close(): void {
  emit('close')
}

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', {
    name: appendMode.value ? props.targetSeries!.name : normalizedName.value,
    key: appendMode.value ? props.targetSeries!.key : effectiveKey.value,
    icons: icons.value,
  })
}

function fileName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1] ?? path
}

function fileStem(path: string): string {
  return fileName(path).replace(projectIconSourcePattern, '')
}
</script>

<style scoped>
.project-icon-registration-dialog__summary { display: grid; gap: var(--oc-space-1); }
.project-icon-registration-dialog__summary-actions { display: flex; flex-wrap: wrap; gap: var(--oc-space-2); margin-top: var(--oc-space-2); }
.project-icon-registration-dialog__preview {
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-sm);
  background: var(--oc-bg-inset);
  display: grid;
  gap: var(--oc-space-2);
  padding: var(--oc-space-3);
}
.project-icon-registration-dialog__preview-heading { display: flex; justify-content: space-between; gap: var(--oc-space-2); }
.project-icon-registration-dialog__icon-list {
  max-height: var(--oc-list-max-height-sm);
  margin: 0;
  padding-left: var(--oc-space-4);
  overflow: auto;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-xs);
}
.project-icon-registration-dialog__icon-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--oc-space-2);
}

.project-icon-registration-dialog__field {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-2);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}
</style>
