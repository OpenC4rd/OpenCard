<!--
  使用说明：
  - 输入已解析的 filePath definition 与当前值。
  - 动态候选完全由 definition.completion.provider 提供。

  职责边界：
  - 负责路径文本、候选菜单、键盘选择和异步请求竞态处理。
  - 不读取 Project Store，不查询文件系统，不解释 extension 业务规则。
-->
<template>
  <div class="file-path-field">
    <OcFieldInput
      as="input"
      full-width
      :value="stringValue"
      :readonly="definition.isReadonly"
      autocomplete="off"
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      :aria-expanded="isMenuOpen && items.length > 0"
      :aria-controls="autocompleteId"
      :aria-activedescendant="activeDescendantId"
      @focus="handleFocus"
      @blur="handleBlur"
      @click="handleCursorChange"
      @input="handleInput"
      @keydown="handleKeydown"
      @keyup="handleCursorKeyup"
    />

    <OcOverlayMarker
      ref="layer"
      :group="`completion:${autocompleteId}`"
      :anchor="completionAnchor"
      :owner="completionControl"
      placement="bottom-start"
      :max-height="220"
      :open="isMenuOpen"
      @update:open="isMenuOpen = $event"
      @close="isMenuOpen = false"
    >
      <OcAutocompleteList :id="autocompleteId" :items="items" :active-key="activeKey"
        @select="applySuggestionByKey" />
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { reportAppError } from '../../../../features/logging/appErrorCatalog'
import type {
  PropertyCompletionItem,
  PropertyCompletionResult,
  PropertyEditorFieldDefinition,
} from '../propertyEditor.types'
import type {
  FilePathDirectoryEntry,
  FilePathFilter,
} from '../../../model/filePath'
import OcAutocompleteList from '../../../../components/standard/OcAutocompleteList.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import OcOverlayMarker from '../../../../components/standard/OcOverlayMarker.vue'

import { usePropertyCompletion } from './usePropertyCompletion'

type FilePathDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'filePath' }>
type PathBrowseContext = {
  directory: string
  fragment: string
}

const props = defineProps<{
  definition: FilePathDefinition
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()
const { t } = useI18n()

const activeInput = ref<HTMLInputElement | null>(null)
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
const completion = usePropertyCompletion(() => activeInput.value)
const { completionState: completionResult, suggestions: items, isMenuOpen, activeKey,
  autocompleteId, activeDescendantId, anchor: completionAnchor, control: completionControl,
  clear: clearCompletion } = completion
// 卸载时关掉自己那一层：组宿主活在别处，不留空面板。
onBeforeUnmount(() => layer.value?.close())

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).replace(/\\/g, '/'))
watch(
  [
    () => props.definition.completion?.provider,
    () => props.definition.directoryProvider,
    () => props.definition.filter,
  ],
  () => {
    const control = activeInput.value
    if (control && document.activeElement === control && (isMenuOpen.value || completion.isPending.value)) {
      void refreshCompletion(control.value.replace(/\\/g, '/'), control.selectionStart ?? control.value.length)
    } else clearCompletion()
  },
  { deep: true },
)

async function refreshCompletion(
  value: string,
  cursor: number,
): Promise<void> {
  if (props.definition.isReadonly) return clearCompletion()
  try {
    await completion.refresh(async () => {
      const genericResult = await props.definition.completion?.provider?.({ value, cursor })
      if (genericResult) return genericResult
      const directoryProvider = props.definition.directoryProvider
      const context = resolveBrowseContext(value)
      if (!directoryProvider || !context) return null
      const entries = await directoryProvider(context.directory)
      return createPathCompletionResult(value, context, entries, props.definition.filter)
    })
  } catch (error) {
    reportAppError('OC-E4005', error)
    clearCompletion()
  }
}

function handleInput(event: Event): void {
  const control = event.target as HTMLInputElement
  activeInput.value = control
  const value = control.value.replace(/\\/g, '/')
  emit('update:value', value)
  void refreshCompletion(value, control.selectionStart ?? value.length)
}

function handleFocus(event: FocusEvent): void {
  const control = event.target as HTMLInputElement
  activeInput.value = control
  void refreshCompletion(stringValue.value, control.selectionStart ?? stringValue.value.length)
}

function handleCursorChange(event: MouseEvent): void {
  const control = event.target as HTMLInputElement
  void refreshCompletion(control.value.replace(/\\/g, '/'), control.selectionStart ?? control.value.length)
}

function handleCursorKeyup(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const control = event.target as HTMLInputElement
  void refreshCompletion(control.value.replace(/\\/g, '/'), control.selectionStart ?? control.value.length)
}

function handleBlur(): void {
  clearCompletion()
}

function applySuggestionByKey(key: string): void {
  const item = items.value.find((candidate) => candidate.key === key)
  const result = completionResult.value
  if (!item || !result) return

  const currentValue = activeInput.value?.value.replace(/\\/g, '/') ?? stringValue.value
  const replaceStart = item.replaceStart ?? result.replaceStart
  const replaceEnd = item.replaceEnd ?? result.replaceEnd
  const nextValue = `${currentValue.slice(0, replaceStart)}${item.insertText}${currentValue.slice(replaceEnd)}`
  const nextCursor = replaceStart + item.insertText.length
  emit('update:value', nextValue)
  if (activeInput.value) {
    activeInput.value.value = nextValue
    activeInput.value.setSelectionRange(nextCursor, nextCursor)
  }

  if (item.keepOpen) {
    isMenuOpen.value = true
    void nextTick(() => {
      const control = activeInput.value
      if (!control || document.activeElement !== control) return
      control.setSelectionRange(nextCursor, nextCursor)
      void refreshCompletion(nextValue, nextCursor)
    })
  } else {
    clearCompletion()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  completion.handleKeydown(event, item => applySuggestionByKey(item.key))
}

function resolveBrowseContext(
  value: string,
): PathBrowseContext | null {
  const normalizedValue = value.replace(/\\/g, '/')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedValue) || normalizedValue.includes('{{')) return null

  const withoutTrailingSlash = normalizedValue.replace(/\/+$/, '')
  if (!withoutTrailingSlash) return { directory: '', fragment: '' }
  if (normalizedValue.endsWith('#')) {
    return { directory: normalizedValue, fragment: '' }
  }
  if (normalizedValue.endsWith('/')) {
    return { directory: withoutTrailingSlash, fragment: '' }
  }

  return {
    directory: getPathDirectory(withoutTrailingSlash),
    fragment: getPathBasename(withoutTrailingSlash).toLocaleLowerCase(),
  }
}

function createPathCompletionResult(
  value: string,
  context: PathBrowseContext,
  entries: readonly FilePathDirectoryEntry[],
  filter: FilePathFilter | undefined,
): PropertyCompletionResult | null {
  const normalizedExtensions = (filter?.extensions ?? []).map(extension => (
    extension.startsWith('.') ? extension.toLocaleLowerCase() : `.${extension.toLocaleLowerCase()}`
  ))
  const target = filter?.target ?? 'both'
  const preparedCandidates = entries
    .map(entry => toPathCompletionItem(entry, context.directory))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter(candidate => candidate.isDirectory || target !== 'directory')
    .filter(candidate => candidate.isDirectory
      || normalizedExtensions.length === 0
      || normalizedExtensions.some(extension => candidate.label.toLocaleLowerCase().endsWith(extension)))
  const normalizedValue = value.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
  if (preparedCandidates.some(candidate => (
    !candidate.isDirectory
    && candidate.insertText.replace(/\/+$/, '').toLocaleLowerCase() === normalizedValue
  ))) {
    const directory = getPathDirectory(value.replace(/\\/g, '/').replace(/\/+$/, ''))
    return {
      replaceStart: 0,
      replaceEnd: value.length,
      items: [{
        key: `clear-file:${normalizedValue}`,
        label: t('propertyEditor.filePath.clearSelection'),
        icon: 'mdiClose',
        insertText: directory ? `${directory.replace(/\/+$/, '')}/` : '',
        keepOpen: true,
      }],
    }
  }

  const candidates = preparedCandidates
    .filter(candidate => !context.fragment || candidate.label.toLocaleLowerCase().startsWith(context.fragment)
      || candidate.insertText.toLocaleLowerCase().startsWith(context.fragment))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
      const leftStarts = left.label.toLocaleLowerCase().startsWith(context.fragment)
      const rightStarts = right.label.toLocaleLowerCase().startsWith(context.fragment)
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    })
    .map(({ isDirectory: _isDirectory, ...item }) => item)

  const parent = createParentCompletionItem(context.directory)
  return candidates.length > 0 || parent
    ? { replaceStart: 0, replaceEnd: value.length, items: candidates, ...(parent ? { parent } : {}) }
    : null
}

function toPathCompletionItem(entry: FilePathDirectoryEntry, directory: string) {
  const normalizedEntry = entry.name.replace(/\\/g, '/').replace(/\/+$/, '')
  const directoryPrefix = directory.endsWith('#') ? directory : `${directory}/`
  const path = directory
    && normalizedEntry !== directory
    && !normalizedEntry.startsWith(directoryPrefix)
    ? `${directory}${directory.endsWith('#') ? '' : '/'}${normalizedEntry}`
    : normalizedEntry
  const label = entry.label ?? (path.endsWith('#') ? path.slice(0, -1) : getPathBasename(path))
  if (!label) return null
  const isDirectory = Boolean(entry.isDirectory)
  return {
    key: `path:${path}`,
    label,
    icon: entry.icon ?? (isDirectory ? 'mdiFolder' as const : 'mdiFileOutline' as const),
    insertText: isDirectory && !path.endsWith('#') && !path.endsWith(':') ? `${path}/` : path,
    keepOpen: true,
    isDirectory,
  }
}

function createParentCompletionItem(directory: string): PropertyCompletionItem | null {
  if (!directory || /^[a-z]:\/?$/i.test(directory)) return null
  const parent = directory.endsWith('#') ? '' : getPathDirectory(directory)
  return {
    key: `parent:${directory}`,
    label: '..',
    icon: 'mdiArrowUp',
    insertText: parent ? `${parent}/` : '',
    keepOpen: true,
  }
}

function getPathDirectory(path: string): string {
  const slashIndex = path.lastIndexOf('/')
  if (slashIndex < 0) {
    const packageSeparator = path.indexOf('#')
    return packageSeparator >= 0 ? path.slice(0, packageSeparator + 1) : ''
  }
  if (slashIndex === 2 && /^[a-z]:\//i.test(path)) return path.slice(0, 3)
  return path.slice(0, slashIndex)
}

function getPathBasename(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('#'))
  return path.slice(separatorIndex + 1)
}

</script>

<style scoped>
.file-path-field {
  position: relative;
  flex: 1;
  min-width: 0;
}

</style>
