<template>
  <MonacoEditor v-if="props.mode === 'diff'" :model-value="props.modelValue ?? ''" language="json"
    :mode="props.mode" :comparison="props.comparison" :theme-id="themeId" :theme-overrides="themeOverrides" />
  <ProjectRegistryEditorShell v-else content-mode="workspace" @keydown.ctrl.s.prevent="save">
    <ProjectCustomBlockRegistryWorkbench v-if="document" :blocks="document.blocks ?? []"
      :source-completion="sourceCompletion" @update:blocks="updateBlocks" @add="addEntry"
      @configure="configureEntry" @remove="removeEntry" />
    <ProjectRegistryRepairEditor v-else :model-value="props.modelValue ?? ''" :theme-id="themeId"
      :theme-overrides="themeOverrides" :heading="t('customBlockRegistry.invalid')" :description="t('customBlockRegistry.repair')"
      @update:model-value="updateRawSource" @save="save" />
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { ContentHistoryOperationMeta } from '../../features/editor-runtime/history/contentHistory'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { EditorIssue, EditorIssueSnapshot } from '../../features/editor-runtime/model/editorIssue'
import { parseCustomBlockRegistryText, serializeCustomBlockRegistry, type CustomBlockRegistryDocument } from '../../features/workspace/model/customBlockRegistry'
import { createAvailableKey } from '../../shared/model/keySlug'
import { createCustomBlockCompletionProvider } from '../../features/workspace/services/customBlockCompletion'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import MonacoEditor from './MonacoEditor.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectRegistryRepairEditor from './ProjectRegistryRepairEditor.vue'
import ProjectCustomBlockRegistryWorkbench from './ProjectCustomBlockRegistryWorkbench.vue'

const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()
const document = ref<CustomBlockRegistryDocument | null>(null)
const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const sourceCompletion = computed(() => createCustomBlockCompletionProvider(projectStore.projectResourceEnvironment.value))
const issueSnapshot = computed<EditorIssueSnapshot>(() => {
  const seen = new Map<string, number>()
  const issues: EditorIssue[] = []
  for (const [index, entry] of (document.value?.blocks ?? []).entries()) {
    const normalized = entry.key.toLocaleLowerCase()
    if (seen.has(normalized)) {
      issues.push({ id: `custom-block-registry-key:${index}`, type: 'custom-block-registry.duplicate-key', severity: 'error',
        locationText: entry.name || entry.key, description: t('customBlockRegistry.duplicateKey', { key: entry.key }),
        navigationToken: { protocol: 'custom-block-registry', version: 1, index } })
    } else seen.set(normalized, index)
  }
  return { scopeKey: 'custom-block-registry', scopeOrder: ['custom-block-registry'], issues }
})

watch(() => props.modelValue, value => { document.value = parseCustomBlockRegistryText(value ?? '') }, { immediate: true })
watch(issueSnapshot, snapshot => emit('issue-snapshot', snapshot), { immediate: true })

function commit(next: CustomBlockRegistryDocument, history?: ContentHistoryOperationMeta): void {
  const content = serializeCustomBlockRegistry(next)
  document.value = parseCustomBlockRegistryText(content)
  emit('update:modelValue', content, history)
}

function addEntry(): void {
  const existingKeys = (document.value?.blocks ?? []).map(entry => entry.key)
  const blocks = [...(document.value?.blocks ?? []), {
    key: createAvailableKey('new-block', existingKeys, 'block'),
    name: t('customBlockRegistry.newBlock'),
    source: 'blocks/new-block.ocblock',
  }]
  commit({ blocks })
}

function updateBlocks(blocks: CustomBlockRegistryDocument['blocks']): void {
  emit('update:modelValue', JSON.stringify({ blocks }, null, 2))
}

function configureEntry(): void { /* action selects the entry; PropertyEditor is already visible */ }

function removeEntry(key: string): void {
  commit({ blocks: (document.value?.blocks ?? []).filter(entry => entry.key !== key) })
}

function updateRawSource(value: string, history?: ContentHistoryOperationMeta): void {
  emit('update:modelValue', value, history)
}

function save(): void { emit('save') }

const presentation = computed<EditorPresentation>(() => ({
  title: t('customBlockRegistry.title'),
  description: t('customBlockRegistry.description'),
  icon: 'entity.block-custom',
}))

defineExpose({ save, presentation })
</script>

<style scoped>
</style>
