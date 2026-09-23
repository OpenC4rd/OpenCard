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

    <OcAutocompletePopover
      :id="autocompleteId"
      :open="isMenuOpen"
      :anchor="activeInput"
      :items="items"
      :active-key="activeKey"
      @select="applySuggestionByKey"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
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
import OcAutocompletePopover from '../../../../components/standard/OcAutocompletePopover.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'

type FilePathDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'filePath' }>
type FilePathSessionState = 'idle' | 'filtering' | 'browsing-directory' | 'committed'
type PathBrowseContext = {
  directory: string
  fragment: string
}
type PathCompletionResolution = {
  result: PropertyCompletionResult | null
  state: FilePathSessionState
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
const completionResult = ref<PropertyCompletionResult | null>(null)
const items = ref<readonly PropertyCompletionItem[]>([])
const isFocused = ref(false)
const isMenuOpen = ref(false)
const activeKey = ref<string | null>(null)
const sessionState = ref<FilePathSessionState>('idle')
const autocompleteId = useId()
let requestId = 0
let suppressDefinitionInvalidation = false

const stringValue = computed(() => (props.value == null ? '' : String(props.value)).replace(/\\/g, '/'))
const activeDescendantId = computed(() => activeKey.value
  ? `${autocompleteId}-option-${activeKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  : undefined)

watch(items, (nextItems) => {
  if (!nextItems.some((item) => item.key === activeKey.value)) {
    activeKey.value = nextItems[0]?.key ?? null
  }
})

watch(
  () => [
    props.definition.completion?.provider,
    props.definition.directoryProvider,
    props.definition.filter,
  ] as const,
  () => {
    if (sessionState.value === 'committed') return
    if (suppressDefinitionInvalidation) return
    requestId += 1
    clearCompletion()
  },
  { deep: true },
)

async function refreshCompletion(
  value: string,
  cursor: number,
): Promise<void> {
  if (props.definition.isReadonly) return clearCompletion()
  const currentRequest = ++requestId
  const completionProvider = props.definition.completion?.provider

  try {
    const genericResult = completionProvider
      ? await completionProvider({ value, cursor })
      : null
    if (currentRequest !== requestId) return
    if (genericResult) return applyCompletionResult(genericResult, 'filtering')

    const directoryProvider = props.definition.directoryProvider
    const browseContext = resolveBrowseContext(value)
    if (!directoryProvider || !browseContext) return clearCompletion()

    const entries = await directoryProvider(browseContext.directory)
    if (currentRequest !== requestId) return
    const resolution = createPathCompletionResult(
      value,
      browseContext,
      entries,
      props.definition.filter,
    )
    applyCompletionResult(resolution.result, resolution.state)
  } catch (error) {
    if (currentRequest !== requestId) return
    reportAppError('OC-E4005', error)
    clearCompletion()
  }
}

function applyCompletionResult(
  result: PropertyCompletionResult | null,
  state: FilePathSessionState,
): void {
  sessionState.value = state
  completionResult.value = result
  items.value = result
    ? [...result.items, ...(result.parent ? [result.parent] : [])]
    : []
  isMenuOpen.value = isFocused.value && items.value.length > 0
}

function clearCompletion(state: FilePathSessionState = 'idle'): void {
  sessionState.value = state
  completionResult.value = null
  items.value = []
  activeKey.value = null
  isMenuOpen.value = false
}

function handleInput(event: Event): void {
  const control = event.target as HTMLInputElement
  activeInput.value = control
  const value = control.value.replace(/\\/g, '/')
  sessionState.value = 'filtering'
  suppressDefinitionInvalidation = true
  emit('update:value', value)
  void nextTick(() => {
    suppressDefinitionInvalidation = false
  })
  void refreshCompletion(value, control.selectionStart ?? value.length)
}

function handleFocus(event: FocusEvent): void {
  const control = event.target as HTMLInputElement
  activeInput.value = control
  isFocused.value = true
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
  isFocused.value = false
  requestId += 1
  window.setTimeout(() => {
    if (!isFocused.value) isMenuOpen.value = false
  }, 0)
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
  if (item.key.startsWith('clear-file:')
    || item.insertText.endsWith('/')
    || item.insertText.endsWith('#')
    || item.insertText.endsWith(':')) {
    sessionState.value = 'browsing-directory'
  } else if (item.key.startsWith('path:')) {
    sessionState.value = 'committed'
  }
  if (item.keepOpen) suppressDefinitionInvalidation = true
  emit('update:value', nextValue)
  if (activeInput.value) {
    activeInput.value.value = nextValue
    activeInput.value.setSelectionRange(nextCursor, nextCursor)
  }

  if (item.keepOpen) {
    isMenuOpen.value = true
    void nextTick(() => {
      suppressDefinitionInvalidation = false
      const control = activeInput.value
      if (!control) return
      control.focus()
      control.setSelectionRange(nextCursor, nextCursor)
      void refreshCompletion(nextValue, nextCursor)
    })
  } else {
    requestId += 1
    clearCompletion('committed')
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    requestId += 1
    clearCompletion()
    return
  }
  if (items.value.length === 0) return

  if (event.key === 'Tab' && event.shiftKey) {
    const parent = completionResult.value?.parent
    if (!parent) return
    event.preventDefault()
    applySuggestionByKey(parent.key)
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const currentIndex = Math.max(0, items.value.findIndex((item) => item.key === activeKey.value))
    const delta = event.key === 'ArrowDown' ? 1 : -1
    activeKey.value = items.value[(currentIndex + delta + items.value.length) % items.value.length]?.key ?? null
    isMenuOpen.value = true
    return
  }

  if (event.key === 'Tab' || event.key === 'Enter') {
    if (!activeKey.value) return
    event.preventDefault()
    applySuggestionByKey(activeKey.value)
  }
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
): PathCompletionResolution {
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
      result: {
        replaceStart: 0,
        replaceEnd: value.length,
        items: [{
          key: `clear-file:${normalizedValue}`,
          label: t('propertyEditor.filePath.clearSelection'),
          icon: 'action.close',
          insertText: directory ? `${directory.replace(/\/+$/, '')}/` : '',
          keepOpen: true,
        }],
      },
      state: 'committed',
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
  return {
    result: candidates.length > 0 || parent
      ? { replaceStart: 0, replaceEnd: value.length, items: candidates, ...(parent ? { parent } : {}) }
      : null,
    state: context.fragment ? 'filtering' : 'browsing-directory',
  }
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
    icon: entry.icon ?? (isDirectory ? 'folder.generic' as const : 'file.generic' as const),
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
    icon: 'nav.arrow-up',
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

onBeforeUnmount(() => {
  requestId += 1
})
</script>

<style scoped>
.file-path-field {
  position: relative;
  flex: 1;
  min-width: 0;
}

</style>
