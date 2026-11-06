<template>
  <OcDialog :open="open" :title="isCreating ? t('customBlockRegistry.addCollection') : t('customBlockRegistry.configureCollection')" as="form" :size="choosingSource ? 'md' : 'sm'"
    close-on-backdrop @request-close="emit('close')" @submit="submit">
    <ProjectImportSourceChoice v-if="choosingSource" :options="sourceOptions" glyph="{ }" @select="pickSource" />
    <template v-else>
    <div v-if="isCreating" class="collection-settings__sources">
      <OcText as="strong" size="sm">{{ t('customBlockRegistry.blockCount', { count: sources.length }) }}</OcText>
      <OcButton type="button" size="sm" variant="ghost" icon="mdiArrowLeft" @click="chooseAgain">{{ t('customBlockRegistry.chooseAgain') }}</OcButton>
    </div>
    <label class="collection-settings__field">
      <OcText as="span" size="sm">{{ t('customBlockRegistry.collectionName') }}</OcText>
      <OcFieldInput full-width autofocus :value="draftName" @input="draftName = inputValue($event)" />
    </label>
    <label class="collection-settings__field">
      <OcText as="span" size="sm">{{ t('customBlockRegistry.collectionKey') }}</OcText>
      <OcFieldInput full-width mono :value="draftKey" @input="draftKey = inputValue($event)" />
    </label>
    <OcText v-if="!valid && (draftName || draftKey)" tone="danger" size="sm" role="alert">{{ t('customBlockRegistry.invalidCollection') }}</OcText>
    </template>
    <OcText v-if="choosingSource && sourceError" tone="danger" size="sm" role="alert">{{ sourceError }}</OcText>
    <template #footer>
      <OcButton type="button" @click="emit('close')">{{ t('customBlockRegistry.cancel') }}</OcButton>
      <OcButton v-if="!choosingSource" type="submit" variant="solid" :disabled="!valid">{{ t('customBlockRegistry.save') }}</OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { customBlockKeyPattern } from '../../features/workspace/model/customBlockRegistry'
import { createAvailableKey } from '../../shared/model/keySlug'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'
import ProjectImportSourceChoice, { type ProjectImportSourceOption } from './ProjectImportSourceChoice.vue'

const props = withDefaults(defineProps<{
  /** Whether the collection settings dialog is visible. */
  open: boolean
  /** Current collection display name. */
  name?: string
  /** Current collection reference key. */
  collectionKey?: string
  /** Whether this dialog creates a new collection. */
  isCreating?: boolean
  /** Keys reserved by sibling collections. */
  existingKeys?: readonly string[]
}>(), { name: '', collectionKey: '', isCreating: false, existingKeys: () => [] })
const emit = defineEmits<{
  close: []
  submit: [request: { name: string; key: string; sources: string[] }]
}>()
const { t } = useI18n()
const chooseAgain = (): void => resetDraft()
const draftName = ref('')
const draftKey = ref('')
const sources = ref<string[]>([])
const sourceDecided = ref(false)
const sourceError = ref('')
const choosingSource = computed(() => props.isCreating && !sourceDecided.value)
const sourceOptions = computed<ProjectImportSourceOption[]>(() => [
  { key: 'files', art: 'files', title: t('customBlockRegistry.sourceFiles'), description: t('customBlockRegistry.chooseFilesHint') },
  { key: 'folder', art: 'folder', title: t('customBlockRegistry.sourceFolder'), description: t('customBlockRegistry.chooseFolderHint') },
  { key: 'empty', art: 'empty', title: t('customBlockRegistry.createEmpty'), description: t('customBlockRegistry.createEmptyHint') },
])
function resetDraft(): void {
  draftName.value = props.name
  draftKey.value = props.collectionKey
  sources.value = []
  sourceDecided.value = false
  sourceError.value = ''
}
watch(() => props.open, open => { if (open) resetDraft() }, { immediate: true })
function pickSource(key: string): void {
  if (key === 'empty') sourceDecided.value = true
  else void pickSources(key === 'folder')
}
const valid = computed(() => draftName.value.trim().length > 0
  && customBlockKeyPattern.test(draftKey.value.trim())
  && !props.existingKeys.some(key => key.toLocaleLowerCase() === draftKey.value.trim().toLocaleLowerCase()
    && key.toLocaleLowerCase() !== props.collectionKey.toLocaleLowerCase()))
function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}
async function pickSources(folder: boolean): Promise<void> {
  let paths: string[]
  let name: string
  if (folder) {
    const directory = await fileSystemService.pickDirectory(t('customBlockRegistry.chooseFolder'))
    if (!directory) return
    const base = directory.replace(/[\\/]+$/, '')
    paths = (await fileSystemService.readDirectory(base))
      .filter(entry => entry.isFile && /\.ocblock$/i.test(entry.name))
      .map(entry => `${base}/${entry.name}`)
    name = base.replace(/\\/g, '/').split('/').pop() ?? ''
  } else {
    paths = await fileSystemService.pickFiles?.({ title: t('customBlockRegistry.chooseFiles'),
      fileTypeName: t('customBlockRegistry.source'), extensions: ['ocblock'] }) ?? []
    name = paths[0]?.replace(/\\/g, '/').split('/').pop()?.replace(/\.ocblock$/i, '') ?? ''
  }
  if (!props.open) return
  sourceError.value = paths.length || !folder ? '' : t('customBlockRegistry.noBlocksInFolder')
  if (!paths.length) return
  sources.value = paths
  sourceDecided.value = true
  if (!draftName.value) draftName.value = name
  if (!draftKey.value) draftKey.value = createAvailableKey(name, props.existingKeys, 'blocks')
}
function submit(): void {
  if (valid.value) emit('submit', { name: draftName.value.trim(), key: draftKey.value.trim(), sources: sources.value })
}
</script>

<style scoped>
.collection-settings__field { display: grid; gap: var(--oc-space-2xs); margin-bottom: var(--oc-space-sm); }
.collection-settings__sources { display: flex; align-items: center; justify-content: space-between; gap: var(--oc-space-xs); margin-bottom: var(--oc-space-sm); }
</style>
