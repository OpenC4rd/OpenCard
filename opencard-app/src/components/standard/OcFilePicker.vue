<!-- Standard 文件选取器：在单个或多个作用域目录树中按通配符/正则筛选并选取文件或文件夹。 -->
<template>
  <div class="oc-file-picker" :class="{ 'is-disabled': disabled }">
    <OcFieldFrame class="oc-file-picker__search" full-width :disabled="disabled">
      <OcFieldInput
        variant="plain"
        full-width
        :value="query"
        :disabled="disabled"
        :placeholder="searchPlaceholder"
        :aria-label="searchPlaceholder"
        autocomplete="off"
        spellcheck="false"
        @input="handleSearchInput"
      />
      <template v-if="query" #suffix>
        <OcButton
          icon-only
          size="sm"
          variant="ghost"
          icon="mdiClose"
          :disabled="disabled"
          :aria-label="clearSearchLabel"
          @click="clearQuery"
        />
      </template>
    </OcFieldFrame>

    <div class="oc-file-picker__body">
      <OcTree
        v-if="treeData.rootKeys.length > 0"
        class="oc-file-picker__tree"
        fill
        role="tree"
        selection-mode="single"
        activation-mode="single-click"
        :data="treeData"
        :selected-keys="selectedNodeKeys"
        :expanded-keys="effectiveExpandedKeys"
        :placeholder="emptyText"
        @node-activate="handleNodeActivate"
        @expansion-change="handleExpansionChange"
      />
      <OcEmpty v-else tone="muted" inset="none">{{ emptyText }}</OcEmpty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import {
  getPathBasename,
  matchesFilePathFilter,
  normalizePath,
  type FilePathDirectoryEntry,
  type FilePathFilter,
  type FilePathScope,
} from '../../shared/model/filePath'
import type {
  OcNode,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeKey,
} from '../../shared/ui/node/node.types'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { OcVisual } from '../../shared/ui/visual/visual.types'
import OcButton from '../base/OcButton.vue'
import OcEmpty from '../base/OcEmpty.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcTree from './OcTree.vue'

interface OcFilePickerProps {
  /** 当前选中的路径值（含可选包前缀）。决定树中哪一项处于选中高亮态。 */
  modelValue?: string
  /** 可浏览的文件作用域列表（如当前项目与各资源包）。决定顶层作用域节点及目录读取来源。 */
  scopes: readonly FilePathScope[]
  /** 限定起始相对子目录；缺省从作用域根目录开始。影响初始读取的相对路径前缀。 */
  root?: string
  /** 目标类型与通配符/正则过滤条件。决定哪些条目被展示并允许选中。 */
  filter?: FilePathFilter
  /** 将文件完整引用解析为缩略图地址的可选回调。提供时文件节点显示图片缩略图。 */
  resolveThumbnailSrc?: (reference: string) => string | null
  /** 搜索框占位文案。显示在顶部过滤输入框内。 */
  searchPlaceholder?: string
  /** 清空搜索按钮的无障碍标签。用于屏幕阅读器朗读。 */
  clearSearchLabel?: string
  /** 无匹配文件时的空状态文案。在没有任何可展示条目时显示。 */
  emptyText?: string
  /** 是否禁用交互。为 true 时阻止搜索输入、展开与文件选取。 */
  disabled?: boolean
}

interface OcFilePickerEmits {
  /** 选中文件或目录时触发，输出完整引用路径。 */
  'update:modelValue': [value: string]
}

defineOptions({ name: 'OcFilePicker' })

const props = withDefaults(defineProps<OcFilePickerProps>(), {
  modelValue: '',
  root: '',
  filter: undefined,
  resolveThumbnailSrc: undefined,
  searchPlaceholder: 'Search files...',
  clearSearchLabel: 'Clear search',
  emptyText: 'No matching files',
  disabled: false,
})

const emit = defineEmits<OcFilePickerEmits>()

const SEP = '::'
const query = ref('')
const expandedKeys = ref<string[]>([])
const directoryEntriesByKey = shallowRef<ReadonlyMap<string, readonly FilePathDirectoryEntry[]>>(new Map())
const loadingKeys = new Set<string>()
let loadGeneration = 0

const baseRoot = computed(() => normalizePath(props.root ?? ''))
const targetMode = computed(() => props.filter?.target ?? 'both')

const scopeNodeKey = (scopeKey: string) => `scope${SEP}${scopeKey}`
const entryNodeKey = (scopeKey: string, relativePath: string, isDirectory: boolean) =>
  `${isDirectory ? 'dir' : 'file'}${SEP}${scopeKey}${SEP}${relativePath}`
const cacheKey = (scopeKey: string, directory: string) => `${scopeKey}${SEP}${directory}`

function joinRelativePath(parent: string, childName: string): string {
  const normalizedChild = normalizePath(childName)
  if (!parent || normalizedChild === parent || normalizedChild.startsWith(`${parent}/`)) return normalizedChild
  return `${parent}/${normalizedChild}`
}

async function ensureDirectoryLoaded(scope: FilePathScope, directory: string, generation = loadGeneration): Promise<readonly FilePathDirectoryEntry[]> {
  const key = cacheKey(scope.key, directory)
  const existing = directoryEntriesByKey.value.get(key)
  if (existing) return existing
  if (loadingKeys.has(key)) return []
  loadingKeys.add(key)
  try {
    const entries = await scope.readDirectory(directory)
    if (generation !== loadGeneration) return []
    const next = new Map(directoryEntriesByKey.value)
    next.set(key, entries)
    directoryEntriesByKey.value = next
    return entries
  } catch {
    return []
  } finally {
    loadingKeys.delete(key)
  }
}

async function crawlScopeForSearch(scope: FilePathScope, startDirectory: string, generation: number): Promise<void> {
  const queue: string[] = [startDirectory]
  for (let visited = 0; queue.length > 0 && visited < 64; visited += 1) {
    if (generation !== loadGeneration) return
    const current = queue.shift()!
    const entries = await ensureDirectoryLoaded(scope, current, generation)
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const childPath = joinRelativePath(current, entry.name)
      if (childPath && childPath !== current) queue.push(childPath)
    }
  }
}

async function expandSelectedAncestors(generation: number): Promise<void> {
  const rawValue = (props.modelValue ?? '').trim()
  if (!rawValue) return
  const matchedScope = [...props.scopes]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(scope => (scope.prefix ? rawValue.startsWith(scope.prefix) : !rawValue.includes('#')))
  if (!matchedScope) return
  const relative = normalizePath(rawValue.slice(matchedScope.prefix.length))
  if (!relative) return
  const segments = relative.split('/')
  const nextExpanded = new Set(expandedKeys.value)
  nextExpanded.add(scopeNodeKey(matchedScope.key))
  let current = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = current ? `${current}/${segments[index]!}` : segments[index]!
    nextExpanded.add(entryNodeKey(matchedScope.key, current, true))
    await ensureDirectoryLoaded(matchedScope, current, generation)
  }
  expandedKeys.value = [...nextExpanded]
}

watch(
  [() => props.scopes, baseRoot],
  async ([scopes, rootDir]) => {
    const generation = ++loadGeneration
    directoryEntriesByKey.value = new Map()
    loadingKeys.clear()
    expandedKeys.value = scopes.map(scope => scopeNodeKey(scope.key))
    await Promise.all(scopes.map(scope => ensureDirectoryLoaded(scope, rootDir, generation)))
    await expandSelectedAncestors(generation)
  },
  { immediate: true },
)

watch(() => props.modelValue, () => void expandSelectedAncestors(loadGeneration))

watch(query, async (nextQuery) => {
  if (!nextQuery.trim()) return
  const generation = loadGeneration
  await Promise.all(props.scopes.map(scope => crawlScopeForSearch(scope, baseRoot.value, generation)))
})

function sortEntries(entries: readonly FilePathDirectoryEntry[], parentDirectory: string) {
  return [...entries]
    .map(entry => {
      const relativePath = joinRelativePath(parentDirectory, entry.name)
      const label = entry.label ?? (getPathBasename(relativePath) || relativePath)
      return { entry, relativePath, label, isDirectory: Boolean(entry.isDirectory) }
    })
    .filter(item => Boolean(item.relativePath && item.label))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    })
}

function createEntryVisual(reference: string, isDirectory: boolean, icon?: IconToken): OcVisual {
  if (!isDirectory && props.resolveThumbnailSrc) {
    const src = props.resolveThumbnailSrc(reference)
    if (src) return { type: 'image', src, label: reference }
  }
  if (icon) return { type: 'icon', icon }
  return { type: 'icon', icon: isDirectory ? 'mdiFolder' : 'mdiFileOutline' }
}

const treeData = computed<OcNodeCollection>(() => {
  const items = new Map<OcNodeKey, OcNode>()
  const children = new Map<OcNodeKey, readonly OcNodeKey[]>()
  const rootKeys: OcNodeKey[] = []
  const normalizedQuery = query.value.trim().toLocaleLowerCase()

  for (const scope of props.scopes) {
    const sKey = scopeNodeKey(scope.key)
    const scopeVisual: OcVisual = {
      type: 'icon',
      icon: scope.prefix ? 'mdiPackageVariantClosed' : 'mdiFolder',
    }

    if (normalizedQuery) {
      const matchedKeys: OcNodeKey[] = []
      const seenPaths = new Set<string>()
      for (const [key, dirEntries] of directoryEntriesByKey.value.entries()) {
        if (!key.startsWith(`${scope.key}${SEP}`)) continue
        const directory = key.slice(scope.key.length + SEP.length)
        for (const candidate of sortEntries(dirEntries, directory)) {
          if (seenPaths.has(candidate.relativePath)) continue
          seenPaths.add(candidate.relativePath)
          if (!matchesFilePathFilter({ name: candidate.relativePath, isDirectory: candidate.isDirectory }, props.filter)) continue
          if (!`${candidate.label} ${candidate.relativePath}`.toLocaleLowerCase().includes(normalizedQuery)) continue
          const nodeKey = entryNodeKey(scope.key, candidate.relativePath, candidate.isDirectory)
          items.set(nodeKey, {
            label: candidate.label,
            visual: createEntryVisual(`${scope.prefix}${candidate.relativePath}`, candidate.isDirectory, candidate.entry.icon),
            ...(candidate.relativePath !== candidate.label ? { tail: candidate.relativePath } : {}),
          })
          matchedKeys.push(nodeKey)
        }
      }
      if (matchedKeys.length > 0) {
        rootKeys.push(sKey)
        items.set(sKey, { label: scope.label, visual: scopeVisual })
        children.set(sKey, matchedKeys)
      }
      continue
    }
    rootKeys.push(sKey)
    items.set(sKey, { label: scope.label, visual: scopeVisual })
    children.set(sKey, buildDirectoryChildren(scope, baseRoot.value, items, children))
  }
  return { rootKeys, items, children }
})

function buildDirectoryChildren(
  scope: FilePathScope,
  directory: string,
  items: Map<OcNodeKey, OcNode>,
  children: Map<OcNodeKey, readonly OcNodeKey[]>,
): readonly OcNodeKey[] {
  const rawEntries = directoryEntriesByKey.value.get(cacheKey(scope.key, directory)) ?? []
  const nodeKeys: OcNodeKey[] = []
  for (const candidate of sortEntries(rawEntries, directory)) {
    if (!candidate.isDirectory && !matchesFilePathFilter({ name: candidate.relativePath, isDirectory: false }, props.filter)) continue
    const nodeKey = entryNodeKey(scope.key, candidate.relativePath, candidate.isDirectory)
    items.set(nodeKey, {
      label: candidate.label,
      visual: createEntryVisual(`${scope.prefix}${candidate.relativePath}`, candidate.isDirectory, candidate.entry.icon),
    })
    nodeKeys.push(nodeKey)
    if (candidate.isDirectory) {
      children.set(
        nodeKey,
        expandedKeys.value.includes(nodeKey)
          ? buildDirectoryChildren(scope, candidate.relativePath, items, children)
          : [`placeholder${SEP}${nodeKey}`],
      )
    }
  }
  return nodeKeys
}

const effectiveExpandedKeys = computed<readonly string[]>(() =>
  query.value.trim() ? props.scopes.map(scope => scopeNodeKey(scope.key)) : expandedKeys.value,
)

const selectedNodeKeys = computed<readonly string[]>(() => {
  const current = (props.modelValue ?? '').trim()
  if (!current) return []
  for (const scope of props.scopes) {
    if (scope.prefix ? !current.startsWith(scope.prefix) : current.includes('#')) continue
    const rel = normalizePath(current.slice(scope.prefix.length))
    return [entryNodeKey(scope.key, rel, false), entryNodeKey(scope.key, rel, true)]
  }
  return []
})

function parseEntryNodeKey(key: string): { kind: 'dir' | 'file'; scope: FilePathScope; relativePath: string } | null {
  const parts = key.split(SEP)
  if (parts.length < 3 || (parts[0] !== 'dir' && parts[0] !== 'file')) return null
  const scope = props.scopes.find(candidate => candidate.key === parts[1])
  return scope ? { kind: parts[0], scope, relativePath: parts.slice(2).join(SEP) } : null
}

async function toggleNodeExpansion(key: string, expanded?: boolean): Promise<void> {
  if (props.disabled) return
  const next = new Set(expandedKeys.value)
  const shouldExpand = expanded ?? !next.has(key)
  if (shouldExpand) next.add(key)
  else next.delete(key)
  expandedKeys.value = [...next]
  if (shouldExpand) {
    const parsed = parseEntryNodeKey(key)
    if (parsed?.kind === 'dir') await ensureDirectoryLoaded(parsed.scope, parsed.relativePath)
  }
}

const handleExpansionChange = (event: OcNodeExpansionEvent) => void toggleNodeExpansion(event.key, event.expanded)
const handleNodeActivate = (event: OcNodeActivateEvent) => selectOrToggleNode(event.key)
const handleSearchInput = (event: Event) => {
  if (!props.disabled) query.value = (event.target as HTMLInputElement).value
}
const clearQuery = () => {
  if (!props.disabled) query.value = ''
}

function selectOrToggleNode(key: string): void {
  if (props.disabled) return
  if (key.startsWith(`scope${SEP}`)) return void toggleNodeExpansion(key)
  const parsed = parseEntryNodeKey(key)
  if (!parsed) return
  if (parsed.kind === 'dir') {
    if (
      (targetMode.value === 'directory' || targetMode.value === 'both')
      && matchesFilePathFilter({ name: parsed.relativePath, isDirectory: true }, props.filter)
    ) {
      emit('update:modelValue', `${parsed.scope.prefix}${parsed.relativePath}`)
      return
    }
    return void toggleNodeExpansion(key)
  }
  if (matchesFilePathFilter({ name: parsed.relativePath, isDirectory: false }, props.filter)) {
    emit('update:modelValue', `${parsed.scope.prefix}${parsed.relativePath}`)
  }
}
</script>

<style scoped>
.oc-file-picker {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  gap: var(--oc-space-xs);
}
.oc-file-picker.is-disabled {
  opacity: var(--oc-opacity-disabled, 0.5);
  pointer-events: none;
}
.oc-file-picker__search { flex: 0 0 auto; }
.oc-file-picker__body {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.oc-file-picker__tree { width: 100%; }
</style>
