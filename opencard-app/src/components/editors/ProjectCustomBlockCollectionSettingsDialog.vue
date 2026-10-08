<template>
  <OcDialog :open="open" :title="isCreating ? t('customBlockRegistry.addCollection') : t('customBlockRegistry.configureCollection')" as="form" size="sm"
    close-on-backdrop @request-close="emit('close')" @submit="submit">
    <div v-if="isCreating" class="collection-settings__sources">
      <OcButton type="button" icon="nav.files" @click="pickSources(false)">{{ t('customBlockRegistry.chooseFiles') }}</OcButton>
      <OcButton type="button" icon="folder.open" @click="pickSources(true)">{{ t('customBlockRegistry.chooseFolder') }}</OcButton>
      <OcText size="sm" tone="muted">{{ t('customBlockRegistry.blockCount', { count: sources.length }) }}</OcText>
    </div>
    <label class="collection-settings__field">
      <OcText as="span" size="sm">{{ t('customBlockRegistry.collectionName') }}</OcText>
      <OcFieldInput full-width autofocus :value="draftName" @input="draftName = inputValue($event)" />
    </label>
    <label class="collection-settings__field">
      <OcText as="span" size="sm">{{ t('customBlockRegistry.collectionKey') }}</OcText>
      <OcFieldInput full-width mono :value="draftKey" @input="draftKey = inputValue($event)" />
    </label>
    <OcText v-if="!valid" tone="danger" size="sm" role="alert">{{ t('customBlockRegistry.invalidCollection') }}</OcText>
    <template #footer>
      <OcButton type="button" @click="emit('close')">{{ t('customBlockRegistry.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!valid">{{ t('customBlockRegistry.save') }}</OcButton>
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
const draftName = ref('')
const draftKey = ref('')
const sources = ref<string[]>([])
watch(() => props.open, open => {
  if (open) {
    draftName.value = props.name
    draftKey.value = props.collectionKey
    sources.value = []
  }
}, { immediate: true })
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
  if (!paths.length || !props.open) return
  sources.value = paths
  if (!draftName.value) draftName.value = name
  if (!draftKey.value) draftKey.value = createAvailableKey(name, props.existingKeys, 'blocks')
}
function submit(): void {
  if (valid.value) emit('submit', { name: draftName.value.trim(), key: draftKey.value.trim(), sources: sources.value })
}
</script>

<style scoped>
.collection-settings__field { display: grid; gap: var(--oc-space-1); margin-bottom: var(--oc-space-3); }
.collection-settings__sources { display: flex; flex-wrap: wrap; align-items: center; gap: var(--oc-space-2); margin-bottom: var(--oc-space-3); }
</style>
