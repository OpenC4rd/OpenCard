<template>
  <MonacoEditor v-if="editorState.mode === 'diff'" :model-value="editorState.draftContent ?? ''" language="json"
    :mode="editorState.mode" :comparison="props.comparison" :theme-id="themeId" :theme-overrides="themeOverrides" />
  <ProjectRegistryEditorShell v-else content-mode="workspace" @keydown.ctrl.s.prevent="save">
    <template v-if="document">
      <ProjectCustomBlockRegistryWorkbench :resource-environment="props.resourceEnvironment" :collections="document.collections ?? []"
        @update:collections="updateCollections" @add-collection="addCollection"
        @add-block="addBlock" @configure-collection="configureCollection"
        @remove-collection="removeCollection" @remove-block="removeBlock" />
      <ProjectCustomBlockCollectionSettingsDialog :open="settingsCollectionKey !== null"
        :name="settingsCollection?.name" :collection-key="settingsCollection?.key"
        :is-creating="settingsCollectionKey === ''"
        :existing-keys="(document?.collections ?? []).map(collection => collection.key)"
        @close="settingsCollectionKey = null" @submit="saveCollectionSettings" />
    </template>
    <ProjectRegistryRepairEditor v-else :model-value="editorState.draftContent ?? ''" :theme-id="themeId"
      :theme-overrides="themeOverrides" :heading="t('customBlockRegistry.invalid')" :description="t('customBlockRegistry.repairDescription')"
      @update:model-value="updateRawSource" @save="save" />
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/editorProtocol'
import type { ContentHistoryOperationMeta } from '../../features/editor-runtime/history/contentHistory'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { EditorIssue, EditorIssueSnapshot } from '../../features/editor-runtime/model/editorIssue'
import { parseCustomBlockRegistryText, serializeCustomBlockRegistry, type CustomBlockRegistryDocument } from '../../features/workspace/model/customBlockRegistry'
import { createAvailableKey } from '../../shared/model/keySlug'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import { parseOcBlock } from '../../features/card-rendering/customBlockRuntime'
import { PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME, PROJECT_INTERNAL_DIRECTORY_NAME } from '../../features/workspace/model/projectStructure'
import MonacoEditor from './MonacoEditor.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectRegistryRepairEditor from './ProjectRegistryRepairEditor.vue'
import ProjectCustomBlockRegistryWorkbench from './ProjectCustomBlockRegistryWorkbench.vue'
import ProjectCustomBlockCollectionSettingsDialog from './ProjectCustomBlockCollectionSettingsDialog.vue'
import { notifyAppError } from '../../features/notifications/titlebarNotices'

const props = defineProps<EditorProps>()
const editorState = computed(() => props.session.state)
const filePath = computed(() => editorState.value.path ?? `draft://${editorState.value.id}`)
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const document = ref<CustomBlockRegistryDocument | null>(null)
const settingsCollectionKey = ref<string | null>(null)
const importing = ref(false)
const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const projectDirectory = computed(() => {
  const path = filePath.value.replace(/\\/g, '/').replace(/\/+$/, '')
  return path.endsWith(`/${PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME}`)
    ? path.slice(0, -PROJECT_CUSTOM_BLOCK_REGISTRY_FILE_NAME.length - 1)
    : path
})
const settingsCollection = computed(() => document.value?.collections?.find(collection => collection.key === settingsCollectionKey.value) ?? null)
const issueSnapshot = computed<EditorIssueSnapshot>(() => {
  const seen = new Map<string, number>()
  const issues: EditorIssue[] = []
  for (const [collectionIndex, collection] of (document.value?.collections ?? []).entries()) {
    const collectionIdentity = collection.key.toLocaleLowerCase()
    if (seen.has(collectionIdentity)) {
      issues.push({ id: `custom-block-registry-collection:${collectionIndex}`, type: 'custom-block-registry.duplicate-collection-key', severity: 'error',
        locationText: collection.name, description: t('customBlockRegistry.duplicateCollectionKey', { key: collection.key }),
        navigationToken: { protocol: 'custom-block-registry', version: 1, collectionIndex } })
    } else seen.set(collectionIdentity, collectionIndex)
    const blockKeys = new Map<string, number>()
    for (const [blockIndex, entry] of collection.blocks.entries()) {
      const normalized = entry.key.toLocaleLowerCase()
      if (blockKeys.has(normalized)) {
        issues.push({ id: `custom-block-registry-key:${collectionIndex}:${blockIndex}`, type: 'custom-block-registry.duplicate-key', severity: 'error',
          locationText: entry.key, description: t('customBlockRegistry.duplicateKey', { key: entry.key }),
          navigationToken: { protocol: 'custom-block-registry', version: 1, collectionIndex, blockIndex } })
      } else blockKeys.set(normalized, blockIndex)
    }
  }
  return { scopeKey: 'custom-block-registry', scopeOrder: ['custom-block-registry'], issues }
})

watch(() => editorState.value.draftContent, value => { document.value = parseCustomBlockRegistryText(value ?? '') }, { immediate: true })
watch(issueSnapshot, snapshot => emit('issue-snapshot', snapshot), { immediate: true })

function commit(next: CustomBlockRegistryDocument, history?: ContentHistoryOperationMeta): void {
  const content = serializeCustomBlockRegistry(next)
  document.value = parseCustomBlockRegistryText(content)
  props.session.updateContent(content, history)
}

function addCollection(): void {
  settingsCollectionKey.value = ''
}

function createCollection(request: { name: string; key: string }): void {
  const collections = document.value?.collections ?? []
  commit({ collections: [...collections, { key: request.key, name: request.name, blocks: [] }] })
}

function updateCollections(collections: CustomBlockRegistryDocument['collections']): void {
  commit({ collections })
}

async function addBlock(collectionKey: string): Promise<void> {
  const paths = await fileSystemService.pickFiles?.({
    title: t('customBlockRegistry.chooseSource'),
    fileTypeName: t('customBlockRegistry.source'),
    extensions: ['ocblock'],
    defaultPath: projectDirectory.value,
  }) ?? []
  await importBlocks(collectionKey, paths)
}

async function importBlocks(collectionKey: string, paths: readonly string[]): Promise<void> {
  if (!paths.length || importing.value) return
  const session = props.session
  const directory = projectDirectory.value
  importing.value = true
  try {
    for (const sourcePath of paths) {
      const parsed = parseOcBlock(JSON.parse(await fileSystemService.readFile(sourcePath)))
      if (!parsed) throw new Error(`${t('customBlockRegistry.invalid')}: ${sourcePath}`)
    }
    for (const sourcePath of paths) {
      const current = parseCustomBlockRegistryText(session.state.draftContent ?? '')
      const collection = current?.collections?.find(item => item.key === collectionKey)
      if (!collection) return
      const stem = sourcePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.ocblock$/i, '') ?? 'custom-block'
      const targetDirectory = `${directory}/${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/${collectionKey}`
      await fileSystemService.createDirectory(targetDirectory)
      let targetName = `${stem}.ocblock`
      let suffix = 2
      while (await fileSystemService.fileExists(`${targetDirectory}/${targetName}`)) targetName = `${stem}-${suffix++}.ocblock`
      await fileSystemService.copyFile(sourcePath, `${targetDirectory}/${targetName}`)
      // Read again after the copy so unrelated edits made during file I/O remain in the registry.
      const latest = parseCustomBlockRegistryText(session.state.draftContent ?? '')
      session.updateContent(serializeCustomBlockRegistry({ collections: (latest?.collections ?? []).map(item => item.key === collectionKey
        ? { ...item, blocks: [...item.blocks, {
          key: createAvailableKey(targetName.replace(/\.ocblock$/i, ''), item.blocks.map(entry => entry.key), 'block'),
          source: `${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/${collectionKey}/${targetName}`,
        }] }
        : item) }))
    }
  } catch (error) { notifyAppError('OC-E4002', error) }
  finally { importing.value = false }
}
function configureCollection(key: string): void { settingsCollectionKey.value = key }

async function saveCollectionSettings(request: { name: string; key: string; sources: string[] }): Promise<void> {
  const current = settingsCollection.value
  if (!current) {
    createCollection(request)
    settingsCollectionKey.value = null
    await importBlocks(request.key, request.sources)
    return
  }
  const oldPrefix = `${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/${current.key}/`
  const nextPrefix = `${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/${request.key}/`
  if (current.key !== request.key) {
    await fileSystemService.createDirectory(`${projectDirectory.value}/${nextPrefix}`)
    for (const entry of current.blocks) {
      if (!entry.source.toLocaleLowerCase().startsWith(oldPrefix.toLocaleLowerCase())) continue
      const fileName = entry.source.slice(oldPrefix.length)
      await fileSystemService.renameFile(
        `${projectDirectory.value}/${entry.source}`,
        `${projectDirectory.value}/${nextPrefix}${fileName}`,
      )
    }
  }
  commit({ collections: (document.value?.collections ?? []).map(collection => collection.key === current.key
    ? { ...collection, key: request.key, name: request.name, blocks: collection.blocks.map(entry => ({
      ...entry,
      source: entry.source.toLocaleLowerCase().startsWith(oldPrefix.toLocaleLowerCase())
        ? `${nextPrefix}${entry.source.slice(oldPrefix.length)}`
        : entry.source,
    })) }
    : collection) })
  settingsCollectionKey.value = null
}

async function removeCollection(key: string): Promise<void> {
  const removed = document.value?.collections?.find(collection => collection.key === key)
  if (!removed) return
  const remainingSources = new Set((document.value?.collections ?? [])
    .filter(collection => collection.key !== key)
    .flatMap(collection => collection.blocks.map(entry => entry.source.toLocaleLowerCase())))
  commit({ collections: (document.value?.collections ?? []).filter(collection => collection.key !== key) })
  for (const entry of removed.blocks) {
    if (remainingSources.has(entry.source.toLocaleLowerCase())) continue
    if (!entry.source.toLocaleLowerCase().startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/`)) continue
    const path = `${projectDirectory.value}/${entry.source}`
    if (await fileSystemService.fileExists(path)) await fileSystemService.deleteFile(path)
  }
}

async function removeBlock(collectionKey: string, key: string): Promise<void> {
  const removed = document.value?.collections?.find(collection => collection.key === collectionKey)?.blocks.find(entry => entry.key === key)
  if (!removed) return
  const remainingSources = new Set((document.value?.collections ?? [])
    .flatMap(collection => collection.blocks.filter(entry => entry.key !== key || collection.key !== collectionKey).map(entry => entry.source.toLocaleLowerCase())))
  commit({ collections: (document.value?.collections ?? []).map(collection => collection.key === collectionKey
    ? { ...collection, blocks: collection.blocks.filter(entry => entry.key !== key) }
    : collection) })
  if (!remainingSources.has(removed.source.toLocaleLowerCase())
    && removed.source.toLocaleLowerCase().startsWith(`${PROJECT_INTERNAL_DIRECTORY_NAME}/blocks/`)) {
    const path = `${projectDirectory.value}/${removed.source}`
    if (await fileSystemService.fileExists(path)) await fileSystemService.deleteFile(path)
  }
}

function updateRawSource(value: string, history?: ContentHistoryOperationMeta): void {
  props.session.updateContent(value, history)
}

const canSave = computed(() => Boolean(document.value))
async function save(): Promise<void> { await props.session.save().catch(error => notifyAppError('OC-E4002', error)) }

const presentation = computed<EditorPresentation>(() => ({
  title: t('customBlockRegistry.title'),
  description: t('customBlockRegistry.description'),
  icon: 'entity.block-custom',
}))

const WORKSPACE_ADD_COLLECTION_ACTION_KEY = 'custom-block-registry.add-collection'
const headerActions = computed<OcActionDefinition[]>(() => [{
  key: WORKSPACE_ADD_COLLECTION_ACTION_KEY,
  icon: 'action.add',
  title: t('customBlockRegistry.addCollection'),
  disabled: !document.value || importing.value,
}])

function onHeaderAction(actionKey: string): void {
  if (actionKey !== WORKSPACE_ADD_COLLECTION_ACTION_KEY || !document.value) return
  addCollection()
  return
}

defineExpose({ canSave, presentation, headerActions, onHeaderAction })
</script>

<style scoped>
</style>
