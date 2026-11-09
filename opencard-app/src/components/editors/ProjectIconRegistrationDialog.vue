<template>
  <OcDialog class="project-icon-registration-dialog" :open="open"
    :title="appendMode ? t('projectConfig.icons.addIconsToSet', { name: targetSeries?.name ?? '' })
      : t('projectConfig.icons.createCollection')"
    as="form" size="md" close-on-backdrop @request-close="close" @submit="submit">
    <ProjectImportSourceChoice v-if="!hasSelection" :options="sourceOptions" glyph="★" @select="pickSource" />
    <template v-else>
      <section class="project-icon-registration-dialog__summary">
        <OcText as="strong">{{ t('projectConfig.icons.selectedIconsCount', { count: icons.length }) }}</OcText>
        <OcButton type="button" size="sm" variant="ghost" icon="mdiArrowLeft" @click="chooseAgain">
          {{ t('projectConfig.icons.chooseAgain') }}
        </OcButton>
        <OcButton v-if="!appendMode" type="button" size="sm" variant="ghost" icon="mdiCogOutline"
          @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? t('projectConfig.icons.simpleSettings') : t('projectConfig.icons.advancedSettings') }}
        </OcButton>
      </section>

      <label v-if="!appendMode" class="project-icon-registration-dialog__field">
        <span>{{ t('projectConfig.icons.packName') }}</span>
        <OcFieldInput full-width autofocus :value="iconSetName" :aria-invalid="!validName"
          @input="updateText('name', $event)" />
      </label>
      <label v-if="advancedOpen && !appendMode" class="project-icon-registration-dialog__field">
        <span>{{ t('projectConfig.icons.packKey') }}</span>
        <OcFieldInput full-width mono :value="iconSetKey" :placeholder="generatedKey"
          :aria-invalid="Boolean(iconSetKey) && (!validKey || !uniqueKey)" @input="updateText('key', $event)" />
      </label>

      <section v-if="sprite" class="project-icon-registration-dialog__sprite">
        <OcText tone="muted" size="sm">{{ t('projectConfig.icons.spriteSize', { width: sprite.width, height: sprite.height }) }}</OcText>
        <OcOptionGroup :model-value="cutMode" :options="cutModeOptions" appearance="sliding-outline" fill
          @update:model-value="cutMode = $event === 'grid' ? 'grid' : 'size'" />
        <label v-for="axis in cutAxes" :key="axis.key" class="project-icon-registration-dialog__field">
          <span>{{ axis.label }}</span>
          <OcSelect full-width :model-value="axis.value" :options="axis.options" @update:model-value="axis.set($event)" />
        </label>
        <OcText tone="muted" size="sm">
          {{ t('projectConfig.icons.spriteGrid', { columns: Math.floor(sprite.width / cellSize.width), rows: Math.floor(sprite.height / cellSize.height), count: icons.length }) }}
        </OcText>
      </section>

      <!-- The sheet itself, whole, with the cut drawn over it: what the cell choices produce is visible before importing. -->
      <figure v-if="sprite" class="project-icon-registration-dialog__sheet">
        <span class="project-icon-registration-dialog__sheet-frame">
          <img class="project-icon-registration-dialog__sheet-image" :src="fileSystemService.toAssetSrc(sprite.path)"
            :alt="fileName(sprite.path)" :data-pixelated="Math.min(cellSize.width, cellSize.height) <= PIXEL_ART_SHORT_SIDE || undefined" />
          <svg class="project-icon-registration-dialog__sheet-grid" :viewBox="`0 0 ${sprite.width} ${sprite.height}`"
            preserveAspectRatio="none" aria-hidden="true">
            <path :d="cutLines" />
          </svg>
        </span>
      </figure>
      <OcAlbum v-else class="project-icon-registration-dialog__preview" layout="tile" selection-mode="none"
        activation-mode="none" :data="previewData" />
    </template>

    <OcText v-if="localError" tone="danger" size="sm" role="alert">{{ localError }}</OcText>
    <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">{{ validationMessage }}</OcText>

    <template #footer>
      <OcButton type="button" @click="close">{{ t('projectConfig.icons.cancel') }}</OcButton>
      <OcButton v-if="hasSelection" type="submit" variant="solid" :disabled="!canSubmit">
        {{ appendMode ? t('projectConfig.icons.addIcons') : t('projectConfig.icons.createCollection') }}
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
  /** 给了就是一张图里切出来的一格：同一个 `sourcePath` 被多个图标共用，各自只取其中一块。 */
  crop?: ProjectIconCrop
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
  guessProjectIconGridCell,
  projectIconGridCellSizes,
  projectIconGridCells,
  type ProjectIconCrop,
  type ProjectIconSeries,
} from '../../features/workspace/model/projectIcons'
import { loadRasterDimensions, PIXEL_ART_SHORT_SIDE } from '../../features/workspace/services/projectIconFileFacts'
import { toKeySlug } from '../../shared/model/keySlug'
import { fileSystemService } from '../../features/workspace/services/fileSystemService'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcAlbum from '../standard/OcAlbum.vue'
import OcDialog from '../standard/OcDialog.vue'
import OcOptionGroup, { type OcOption } from '../standard/OcOptionGroup.vue'
import OcSelect from '../standard/OcSelect.vue'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import ProjectImportSourceChoice, { type ProjectImportSourceOption } from './ProjectImportSourceChoice.vue'

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
/** 选了"切分一张图"时的那张图和它的大小；有它，图标就是按格子切出来的，而不是每个文件一个。 */
const sprite = ref<{ path: string, width: number, height: number } | null>(null)
const cellWidth = ref('')
const cellHeight = ref('')
const cellSize = computed(() => ({ width: Number(cellWidth.value), height: Number(cellHeight.value) }))
/** Where the cut falls on the sheet, in sheet pixels: the lines between cells, not the sheet's own edge. */
const cutLines = computed(() => {
  const sheet = sprite.value
  if (!sheet || icons.value.length === 0) return ''
  const { width, height } = cellSize.value
  const columns = Math.floor(sheet.width / width)
  const rows = Math.floor(sheet.height / height)
  const vertical = Array.from({ length: columns + 1 }, (_, index) => `M${index * width} 0V${rows * height}`)
  const horizontal = Array.from({ length: rows + 1 }, (_, index) => `M0 ${index * height}H${columns * width}`)
  return [...vertical, ...horizontal].join('')
})

/** The same cut seen two ways: by the size of one cell, or by how many columns and rows there are. */
const cutMode = ref<'size' | 'grid'>('size')
const cutModeOptions = computed<OcOption[]>(() => [
  { value: 'size', label: t('projectConfig.icons.spriteBySize') },
  { value: 'grid', label: t('projectConfig.icons.spriteByGrid') },
])
/**
 * One choice per side. Only cell sizes that cut the side evenly are offered, so there is nothing to get
 * wrong; the grid view lists the same cuts as counts (a side of `length` cut by `size` has `length / size`).
 */
const cutAxes = computed(() => {
  const sheet = sprite.value
  if (!sheet) return []
  const grid = cutMode.value === 'grid'
  const axis = (key: 'width' | 'height', label: string, cell: typeof cellWidth) => {
    const length = sheet[key]
    const sizes = projectIconGridCellSizes(length)
    const toValue = (size: number) => String(grid ? length / size : size)
    return {
      key,
      label: t(`projectConfig.icons.${label}`),
      value: toValue(Number(cell.value)),
      options: (grid ? [...sizes].reverse() : sizes).map(size => ({ value: toValue(size), label: toValue(size) })),
      set: (value: string) => { cell.value = String(grid ? length / Number(value) : Number(value)) },
    }
  }
  return [
    axis('width', grid ? 'spriteColumns' : 'spriteCellWidth', cellWidth),
    axis('height', grid ? 'spriteRows' : 'spriteCellHeight', cellHeight),
  ]
})

const appendMode = computed(() => props.targetSeries !== undefined)
const reservedIconKeys = computed(() => (props.targetSeries?.icons ?? []).map(icon => ({ iconKey: icon.iconKey })))
/** Identity only: the Key is derived from the file name, which needs no read. */
const icons = computed<readonly ProjectIconImport[]>(() => {
  const next: ProjectIconImport[] = []
  if (sprite.value) {
    const stem = fileStem(sprite.value.path) || 'Icon'
    // Up to thousands of cells: keys are claimed through one set instead of rescanning the list per cell.
    const taken = new Set(reservedIconKeys.value.map(icon => icon.iconKey.toLocaleLowerCase()))
    for (const crop of projectIconGridCells(sprite.value, cellSize.value)) {
      const name = `${stem} ${next.length + 1}`
      const base = toKeySlug(name, 'icon')
      let iconKey = base
      for (let suffix = 2; taken.has(iconKey); suffix += 1) iconKey = `${base}-${suffix}`
      taken.add(iconKey)
      next.push({ sourcePath: sprite.value.path, iconKey, name, crop })
    }
    return next
  }
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
const sourceOptions = computed<ProjectImportSourceOption[]>(() => [
  { key: 'files', art: 'files', title: t('projectConfig.icons.chooseFiles'), description: t('projectConfig.icons.chooseFilesHint') },
  { key: 'folder', art: 'folder', title: t('projectConfig.icons.chooseFolder'), description: t('projectConfig.icons.chooseFolderHint') },
  { key: 'sprite', art: 'sheet', title: t('projectConfig.icons.chooseSprite'), description: t('projectConfig.icons.chooseSpriteHint') },
])
/** 缩略图由浏览器按需加载，选文件这一步依然不读文件；图标比例各异，所以完整显示不裁切。 */
const previewData = computed<OcNodeCollection>(() => ({
  rootKeys: icons.value.map(icon => icon.iconKey),
  items: new Map(icons.value.map((icon): [string, OcNode] => [icon.iconKey, {
    label: icon.name,
    cover: { type: 'image', src: fileSystemService.toAssetSrc(icon.sourcePath), fit: 'contain', label: icon.name },
  }])),
  children: new Map(),
}))
const canSubmit = computed(() => hasSelection.value && icons.value.length > 0 && validName.value && validKey.value && uniqueKey.value)
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
  sprite.value = null
  cutMode.value = 'size'
  localError.value = ''
}, { immediate: true })

function pickSource(key: string): void {
  void (key === 'folder' ? pickFolder() : key === 'sprite' ? pickSprite() : pickFiles())
}

/** A sheet is one raster file: its size decides how many cells a cell size cuts it into. */
async function pickSprite(): Promise<void> {
  const path = await fileSystemService.pickFile({
    title: t('projectConfig.icons.pickSpriteTitle'),
    fileTypeName: t('projectConfig.icons.fileType'),
    extensions: PROJECT_ICON_FILE_EXTENSIONS.filter(extension => extension !== 'svg'),
    defaultPath: props.defaultOpenPath,
  })
  if (!path) return
  const size = await loadRasterDimensions(path, await fileSystemService.readBinaryFile(path))
  if (!size) {
    localError.value = t('projectConfig.icons.spriteUnreadable')
    return
  }
  localError.value = ''
  assignDerivedName(fileName(path))
  sprite.value = { path, ...size }
  const guess = guessProjectIconGridCell(size)
  cellWidth.value = String(guess.width)
  cellHeight.value = String(guess.height)
  selectedPaths.value = [path]
}

function chooseAgain(): void {
  sprite.value = null
  selectedPaths.value = []
  localError.value = ''
  advancedOpen.value = false
}

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
.project-icon-registration-dialog__summary { display: flex; align-items: center; gap: var(--oc-space-xs); }
.project-icon-registration-dialog__summary > :first-child { flex: 1 1 auto; min-width: 0; }
.project-icon-registration-dialog__sprite { display: grid; gap: var(--oc-space-xs); }
.project-icon-registration-dialog__sheet {
  display: flex;
  justify-content: center;
  margin: 0;
  padding: var(--oc-space-xs);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
}
.project-icon-registration-dialog__sheet-frame { position: relative; display: inline-block; max-width: 100%; line-height: 0; }
.project-icon-registration-dialog__sheet-image {
  display: block;
  max-width: 100%;
  max-height: var(--oc-settings-preview-height-md);
}
.project-icon-registration-dialog__sheet-image[data-pixelated] { image-rendering: pixelated; }
.project-icon-registration-dialog__sheet-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--oc-border-accent);
  stroke-width: var(--oc-border-width);
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.project-icon-registration-dialog__sheet-grid path { vector-effect: non-scaling-stroke; }
.project-icon-registration-dialog__preview {
  max-height: var(--oc-settings-preview-height-md);
  padding: var(--oc-space-xs);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
}

.project-icon-registration-dialog__field {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-xs);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}
</style>
