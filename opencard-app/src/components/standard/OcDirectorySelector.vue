<!-- Standard 目录选取器：限定在一个根目录内，逐层浏览并选取文件或文件夹，可从磁盘导入。 -->
<template>
  <div class="oc-directory-selector" :class="{ 'is-disabled': disabled }">
    <div class="oc-directory-selector__toolbar">
      <nav class="oc-directory-selector__crumbs" :aria-label="rootLabel">
        <template v-for="(crumb, index) in crumbs" :key="crumb.path">
          <OcIcon v-if="index > 0" name="mdiChevronRight" size="sm" tone="muted" />
          <OcButton
            size="sm"
            variant="ghost"
            :disabled="disabled || crumb.path === currentDirectory"
            @click="navigate(crumb.path)"
          >
            {{ crumb.label }}
          </OcButton>
        </template>
      </nav>
      <OcFieldFrame class="oc-directory-selector__search" :disabled="disabled">
        <OcFieldInput
          variant="plain"
          full-width
          :value="query"
          :disabled="disabled"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
          autocomplete="off"
          spellcheck="false"
          @input="query = ($event.target as HTMLInputElement).value"
        />
      </OcFieldFrame>
      <slot name="toolbar-end" />
      <OcButton
        v-if="importable"
        size="sm"
        variant="soft"
        icon="mdiImport"
        :disabled="disabled"
        @click="emit('import-request', currentDirectory)"
      >
        {{ importLabel }}
      </OcButton>
    </div>

    <div class="oc-directory-selector__body">
      <OcAlbum
        v-if="view === 'grid'"
        fill
        layout="tile"
        activation-mode="double-click"
        :data="collection"
        :selected-keys="modelValue"
        :selection-mode="multiple ? 'multiple' : 'single'"
        :placeholder="emptyText"
        @selection-change="handleSelectionChange"
        @node-activate="handleActivate($event.key)"
      />
      <OcTree
        v-else
        fill
        role="listbox"
        activation-mode="double-click"
        :data="collection"
        :selected-keys="modelValue"
        :selection-mode="multiple ? 'multiple' : 'single'"
        :placeholder="emptyText"
        @selection-change="handleSelectionChange"
        @node-activate="handleActivate($event.key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  getPathBasename,
  matchesFilePathFilter,
  normalizePath,
  type FilePathDirectoryEntry,
  type FilePathFilter,
  type FilePathScope,
} from '../../shared/model/filePath'
import type { OcNode, OcNodeCollection, OcNodeSelectionEvent } from '../../shared/ui/node/node.types'
import type { OcVisual } from '../../shared/ui/visual/visual.types'
import OcButton from '../base/OcButton.vue'
import OcFieldFrame from '../base/OcFieldFrame.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcAlbum from './OcAlbum.vue'
import OcTree from './OcTree.vue'

interface OcDirectorySelectorProps {
  /** 可浏览的作用域。目录读取与越界防护都由它负责。 */
  scope: FilePathScope
  /** 起始并限定的相对目录；用户不能浏览到它的上层。缺省为作用域根。 */
  root?: string
  /** 已选中的相对路径。多选时可含多项。 */
  modelValue?: readonly string[]
  /** 目标类型与通配过滤。目录始终可进入，过滤只决定哪些条目可被选中并显示。 */
  filter?: FilePathFilter
  /** 是否允许多选。 */
  multiple?: boolean
  /** 网格显示缩略图，列表更紧凑。 */
  view?: 'grid' | 'list'
  /** 文件相对路径到缩略图地址的解析；缺省时文件只显示图标。 */
  resolveThumbnailSrc?: (relativePath: string) => string | null
  /** 是否显示"从磁盘导入"按钮。点击只发出 import-request，复制由宿主完成。 */
  importable?: boolean
  /** 递增它会重新读取当前目录，用于导入之后刷新。 */
  refreshKey?: number
  /** 搜索框占位与无障碍文案。 */
  searchPlaceholder?: string
  /** 无条目时的空状态文案。 */
  emptyText?: string
  /** 导入按钮文案。 */
  importLabel?: string
  /** 根目录面包屑文案，同时作为面包屑导航的无障碍名称。 */
  rootLabel?: string
  /** 是否禁用交互。 */
  disabled?: boolean
}

interface OcDirectorySelectorEmits {
  /** 选中集合变化。只包含满足 filter 的条目。 */
  'update:modelValue': [value: string[]]
  /** 进入某个目录后触发，参数是它的相对路径。 */
  navigate: [directory: string]
  /** 双击文件（满足 filter）时触发，用于直接确认。 */
  activate: [path: string]
  /** 点击导入按钮，参数是当前目录的相对路径。 */
  'import-request': [directory: string]
}

defineOptions({ name: 'OcDirectorySelector' })

const props = withDefaults(defineProps<OcDirectorySelectorProps>(), {
  root: '',
  modelValue: () => [],
  filter: undefined,
  multiple: false,
  view: 'grid',
  resolveThumbnailSrc: undefined,
  importable: false,
  refreshKey: 0,
  searchPlaceholder: 'Search',
  emptyText: 'Empty folder',
  importLabel: 'Import',
  rootLabel: 'Root',
  disabled: false,
})

const emit = defineEmits<OcDirectorySelectorEmits>()

const baseRoot = computed(() => normalizePath(props.root))
const currentDirectory = ref(baseRoot.value)
const entries = ref<readonly FilePathDirectoryEntry[]>([])
const query = ref('')
let loadGeneration = 0

async function load(): Promise<void> {
  const generation = ++loadGeneration
  const directory = currentDirectory.value
  try {
    const next = await props.scope.readDirectory(directory)
    if (generation === loadGeneration) entries.value = next
  } catch {
    if (generation === loadGeneration) entries.value = []
  }
}

watch(baseRoot, (root) => {
  currentDirectory.value = root
  query.value = ''
})
watch([() => props.scope, currentDirectory, () => props.refreshKey], load, { immediate: true })

function navigate(directory: string): void {
  if (props.disabled || directory === currentDirectory.value) return
  currentDirectory.value = directory
  query.value = ''
  emit('navigate', directory)
}

const crumbs = computed(() => {
  const rest = currentDirectory.value.slice(baseRoot.value.length).replace(/^\//, '')
  const result = [{ label: props.rootLabel, path: baseRoot.value }]
  let path = baseRoot.value
  for (const segment of rest ? rest.split('/') : []) {
    path = path ? `${path}/${segment}` : segment
    result.push({ label: segment, path })
  }
  return result
})

function relativePathOf(entry: FilePathDirectoryEntry): string {
  const name = normalizePath(entry.name)
  const parent = currentDirectory.value
  return !parent || name === parent || name.startsWith(`${parent}/`) ? name : `${parent}/${name}`
}

const visibleEntries = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return entries.value
    .map((entry) => {
      const path = relativePathOf(entry)
      return { entry, path, label: entry.label ?? (getPathBasename(path) || path), isDirectory: Boolean(entry.isDirectory) }
    })
    .filter(item => item.path && item.label
      && (item.isDirectory || matchesFilePathFilter({ name: item.path, isDirectory: false }, props.filter))
      && (!needle || item.label.toLocaleLowerCase().includes(needle)))
    .sort((left, right) => left.isDirectory !== right.isDirectory
      ? (left.isDirectory ? -1 : 1)
      : left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
})

/** 目录是否能被选中取决于 filter.target；文件已在上面按 filter 过滤。 */
function isSelectable(path: string, isDirectory: boolean): boolean {
  return isDirectory
    ? props.filter?.target !== 'file' && matchesFilePathFilter({ name: path, isDirectory: true }, props.filter)
    : props.filter?.target !== 'directory'
}

const collection = computed<OcNodeCollection>(() => {
  const items = new Map<string, OcNode>()
  for (const { entry, path, label, isDirectory } of visibleEntries.value) {
    const icon: OcVisual = { type: 'icon', icon: entry.icon ?? (isDirectory ? 'mdiFolder' : 'mdiFileOutline') }
    const src = isDirectory ? null : props.resolveThumbnailSrc?.(path)
    items.set(path, {
      label,
      visual: icon,
      cover: src ? { type: 'image', src, label: path } : icon,
      tone: isSelectable(path, isDirectory) ? 'default' : 'muted',
    })
  }
  return { rootKeys: [...items.keys()], items, children: new Map() }
})

function isDirectoryPath(path: string): boolean {
  return visibleEntries.value.some(item => item.path === path && item.isDirectory)
}

function handleSelectionChange(event: OcNodeSelectionEvent): void {
  if (props.disabled) return
  emit('update:modelValue', event.selectedKeys.filter(path => isSelectable(path, isDirectoryPath(path))))
}

function handleActivate(path: string): void {
  if (props.disabled) return
  if (isDirectoryPath(path)) navigate(path)
  else if (isSelectable(path, false)) emit('activate', path)
}
</script>

<style scoped>
.oc-directory-selector {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  gap: var(--oc-space-sm);
}
.oc-directory-selector.is-disabled {
  opacity: var(--oc-opacity-disabled);
  pointer-events: none;
}
.oc-directory-selector__toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--oc-space-sm);
  min-width: 0;
}
.oc-directory-selector__crumbs {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.oc-directory-selector__search { flex: 0 1 12rem; }
.oc-directory-selector__body {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
</style>
