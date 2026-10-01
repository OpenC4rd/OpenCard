<template>
  <div class="oc-rich-text-editor">
    <div v-if="editor" class="oc-rich-text-editor__toolbar" role="toolbar" aria-label="Text formatting">
      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupHistory', '历史')">
          <OcButton size="md" icon-only icon="action.undo" :data-tooltip="tr('app.menu.undo', '撤销')" :aria-label="tr('app.menu.undo', '撤销')"
            :disabled="!editor.can().chain().focus().undo().run()" @mousedown.prevent @click="editor.chain().focus().undo().run()" />
          <OcButton size="md" icon-only icon="action.redo" :data-tooltip="tr('app.menu.redo', '重做')" :aria-label="tr('app.menu.redo', '重做')"
            :disabled="!editor.can().chain().focus().redo().run()" @mousedown.prevent @click="editor.chain().focus().redo().run()" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.font', '字体')">
          <OcSelect class="oc-rich-text-editor__font" :data-tooltip="tr('propertyEditor.richText.font', '字体')" :aria-label="tr('propertyEditor.richText.font', '字体')"
            :model-value="activeFontFamily" :options="fontOptions" :z-index="2500" @update:model-value="setFontFamily" />
          <OcSelect class="oc-rich-text-editor__font-size" :data-tooltip="tr('propertyEditor.richText.fontSize', '字号')" :aria-label="tr('propertyEditor.richText.fontSize', '字号')"
            :model-value="activeFontSize" :options="fontSizeOptions" :z-index="2500" @update:model-value="setFontSize" />
          <OcButton size="md" icon-only icon="format.font-size-decrease" :data-tooltip="tr('propertyEditor.richText.decreaseFontSize', '减小字号')" :aria-label="tr('propertyEditor.richText.decreaseFontSize', '减小字号')"
            @mousedown.prevent @click="adjustFontSize(-1)" />
          <OcButton size="md" icon-only icon="format.font-size-increase" :data-tooltip="tr('propertyEditor.richText.increaseFontSize', '增大字号')" :aria-label="tr('propertyEditor.richText.increaseFontSize', '增大字号')"
            @mousedown.prevent @click="adjustFontSize(1)" />
          <OcButton size="md" icon-only icon="format.bold" :active="editor.isActive('bold')"
            :data-tooltip="tr('propertyEditor.richText.bold', '粗体')" :aria-label="tr('propertyEditor.richText.bold', '粗体')" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()" />
          <OcButton size="md" icon-only icon="format.italic" :active="editor.isActive('italic')"
            :data-tooltip="tr('propertyEditor.richText.italic', '斜体')" :aria-label="tr('propertyEditor.richText.italic', '斜体')" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()" />
          <OcButton size="md" icon-only icon="format.underline" :active="editor.isActive('underline')"
            :data-tooltip="tr('propertyEditor.richText.underline', '下划线')" :aria-label="tr('propertyEditor.richText.underline', '下划线')" @mousedown.prevent @click="editor.chain().focus().toggleUnderline().run()" />
          <OcButton size="md" icon-only icon="format.strikethrough" :active="editor.isActive('strike')"
            :data-tooltip="tr('propertyEditor.richText.strikethrough', '删除线')" :aria-label="tr('propertyEditor.richText.strikethrough', '删除线')" @mousedown.prevent @click="editor.chain().focus().toggleStrike().run()" />
        </div>
      </div>

      <div class="oc-rich-text-editor__toolbar-row">
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDocumentStructure', '文档结构')">
          <OcButton size="md" icon-only icon="data.list-bulleted" :data-tooltip="tr('propertyEditor.richText.bulletList', '无序列表')" :aria-label="tr('propertyEditor.richText.bulletList', '无序列表')"
            :active="editor.isActive('bulletList')" @mousedown.prevent @click="editor.chain().focus().toggleBulletList().run()" />
          <OcButton size="md" icon-only icon="data.list-numbered" :data-tooltip="tr('propertyEditor.richText.orderedList', '有序列表')" :aria-label="tr('propertyEditor.richText.orderedList', '有序列表')"
            :active="editor.isActive('orderedList')" @mousedown.prevent @click="editor.chain().focus().toggleOrderedList().run()" />
          <OcButton v-if="!editor.isActive('table')" size="md" icon-only icon="data.table" :data-tooltip="tr('propertyEditor.richText.insertTable', '插入表格')" :aria-label="tr('propertyEditor.richText.insertTable', '插入表格')"
            @mousedown.prevent @click="insertTable" />
          <OcActionButton v-if="editor.isActive('table')" :action="tableAction" size="md" variant="ghost"
            @select="handleTableAction" />
        </div>
        <div v-if="bindingCompletion" class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupDataReference', '数据引用')">
          <OcButton size="md" icon-only icon="format.code-braces" :data-tooltip="tr('propertyEditor.richText.insertBinding', '插入 binding')"
            :aria-label="tr('propertyEditor.richText.insertBinding', '插入 binding')" @mousedown.prevent @click="insertBinding" />
        </div>
        <div v-if="hasProjectIconSources" class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupProjectIcon', '项目图标')">
          <OcActionButton :action="projectIconAction" size="md" variant="ghost"
            @mousedown.prevent @select="handleProjectIconAction" />
          <OcButton v-for="entry in recentProjectIconEntries" :key="projectIconSelectionKey(null, entry)" size="md" icon-only
            class="oc-rich-text-editor__recent-icon" :data-tooltip="`${entry.name} ${entry.seriesKey}`"
            :aria-label="tr('propertyEditor.richText.insertRecentIcon', `插入最近图标：${entry.name}`, { name: entry.name })" @mousedown.prevent @click="insertRecentProjectIcon(entry)">
            <template #icon>
              <span class="oc-rich-text-editor__recent-icon-image oc-project-icon"
                :style="createProjectIconPreviewStyle(entry, readProjectIconSize)" aria-hidden="true" />
            </template>
          </OcButton>
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupColorAndStroke', '颜色与描边')">
          <OcColorPicker :label="tr('propertyEditor.richText.foregroundColor', '前景色')" :model-value="foregroundColor" :z-index="2500"
            @open-change="captureColorSnapshot('foreground', $event)"
            @preview="setForegroundColor" @cancel="restoreColorSnapshot('foreground')">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="format.color-fill" size="md" /><span :style="{ backgroundColor: color }" />
            </span></template>
          </OcColorPicker>
          <OcColorPicker :label="tr('propertyEditor.richText.textBackgroundColor', '文字背景色')" :model-value="backgroundColor" :z-index="2500"
            @open-change="captureColorSnapshot('background', $event)"
            @preview="setBackgroundColor" @cancel="restoreColorSnapshot('background')">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command">
              <OcIcon name="format.color-highlight" size="md" /><span :style="{ backgroundColor: color }" />
            </span></template>
          </OcColorPicker>
          <OcColorPicker :label="tr('propertyEditor.richText.strokeColor', '描边颜色')" :model-value="strokeColor" :z-index="2500"
            @open-change="captureColorSnapshot('stroke', $event)"
            @preview="setStrokeColor" @cancel="restoreColorSnapshot('stroke')">
            <template #trigger="{ color }"><span class="oc-rich-text-editor__color-command oc-rich-text-editor__color-command--stroke"
              :style="{ WebkitTextStrokeColor: color }">A</span></template>
          </OcColorPicker>
          <OcSelect class="oc-rich-text-editor__stroke-width" :data-tooltip="tr('propertyEditor.richText.strokeWidth', '描边宽度')" :aria-label="tr('propertyEditor.richText.strokeWidth', '描边宽度')"
            :model-value="strokeWidth" :options="strokeWidthOptions" :z-index="2500" @update:model-value="setStrokeWidth" />
        </div>
        <div class="oc-rich-text-editor__tool-group" role="group" :aria-label="tr('propertyEditor.richText.groupAlignment', '段落对齐')">
          <OcButton v-for="alignment in alignments" :key="alignment.value" size="md" icon-only
            :icon="alignment.icon" :data-tooltip="alignment.title" :aria-label="alignment.title"
            :active="editor.isActive({ textAlign: alignment.value })"
            @mousedown.prevent @click="editor.chain().focus().setTextAlign(alignment.value).run()" />
        </div>
        <div class="oc-rich-text-editor__tool-group oc-rich-text-editor__tool-group--tail" role="group" :aria-label="tr('propertyEditor.richText.groupClearFormatting', '清除格式')">
          <OcButton size="md" icon-only icon="format.clear" :data-tooltip="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')" :aria-label="tr('propertyEditor.richText.clearCharacterFormatting', '清除字符格式')"
            @mousedown.prevent @click="editor.chain().focus().unsetAllMarks().run()" />
        </div>
      </div>
    </div>

    <OcFloatingLayer v-if="selectedNodeAnchor && selectedNodeKind" :open="nodeEditOpen"
      :anchor="selectedNodeAnchor" placement="top-start" :z-index="2500">
      <div class="oc-rich-text-editor__node-edit-layer">
        <OcActionButton v-if="selectedNodeKind === 'projectIcon'" :action="projectIconAction"
          size="sm" variant="ghost" @mousedown.prevent @select="handleProjectIconAction" />
        <OcButton v-else size="sm" icon-only icon="action.edit" :data-tooltip="tr('propertyEditor.richText.editSelected', '编辑选中内容')"
          :aria-label="tr('propertyEditor.richText.editSelected', '编辑选中内容')" data-test="rich-text-node-edit"
          @mousedown.prevent @click="openSelectedNodeEditor" />
      </div>
    </OcFloatingLayer>

    <OcDialog :open="selectedNodeEditorOpen" :title="selectedNodeDialogTitle"
      size="md" close-on-backdrop @request-close="cancelSelectedNodeEditor">
      <div v-if="dialogNodeTarget?.kind === 'binding'" class="oc-rich-text-editor__node-dialog-content">
        <label class="oc-rich-text-editor__dialog-field oc-rich-text-editor__dialog-binding-field">
          <span>{{ tr('propertyEditor.richText.bindingExpression', 'Binding 表达式') }}</span>
          <OcFieldInput :value="dialogBindingExpression" variant="plain" full-width
            aria-label="Binding expression"
            @input="updateDialogBindingExpression" />
        </label>
      </div>
      <div v-else-if="dialogNodeTarget?.kind === 'projectIcon'" class="oc-rich-text-editor__node-dialog-content">
        <OcActionButton :action="dialogProjectIconAction" size="md" variant="ghost"
          @select="selectDialogProjectIcon" />
      </div>
      <template #footer>
        <OcButton type="button" @click="cancelSelectedNodeEditor">{{ tr('propertyEditor.richText.cancel', '取消') }}</OcButton>
        <OcButton type="button" variant="solid" @click="confirmSelectedNodeEditor">{{ tr('propertyEditor.richText.confirm', '确定') }}</OcButton>
      </template>
    </OcDialog>

    <EditorContent :editor="editor" class="oc-rich-text-editor__surface" :style="baseStyle" />
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue'
import { Extension, Mark, type Editor, type JSONContent } from '@tiptap/core'
import type { ParseRule } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import OcButton from '../../../components/base/OcButton.vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import OcColorPicker from '../../../components/standard/OcColorPicker.vue'
import OcSelect from '../../../components/standard/OcSelect.vue'
import OcActionButton from '../../../components/standard/OcActionButton.vue'
import type { OcActionDefinition, OcActionSelectPayload } from '../action/action.types'
import OcFloatingLayer from '../../../components/standard/OcFloatingLayer.vue'
import { normalizeRichTextHtml, parseRichTextHtml } from '../../rich-text/richTextHtml'
import type { IconToken } from '../icon/iconRegistry'
import { BindingNode } from './bindingNode'
import type { RichTextBindingCompletionProvider } from './bindingNode.types'
import { ProjectIconNode } from './projectIconNode'
import {
  createProjectIconStyle,
  createProjectIconPreviewStyle,
  findProjectIcon,
  type ProjectIconCatalog,
  type ProjectIconCatalogEntry,
} from '../../../features/workspace/services/projectIconCatalog'
import type { ProjectIconSource } from '../../../features/workspace/services/projectIconCompletion'
import { formatProjectIconPath, parseProjectIconPath } from '../../rich-text/projectIconReference'
import { readProjectIconSize } from '../../../features/workspace/services/projectIconDimensionResolver'
import {
  projectIconRecentIdentity,
  recentProjectIconIdentities,
  rememberRecentProjectIcon,
} from './recentProjectIcons'

type RichTextFontOption = {
  label: string
  value: string
  cssFamily?: string
}

type RichTextFontSelectOption = RichTextFontOption & {
  labelStyle?: Readonly<Record<string, string>>
}

const props = defineProps<{
  modelValue: string
  bindingCompletion?: RichTextBindingCompletionProvider
  projectIconCatalog?: ProjectIconCatalog
  /** Icon sources the toolbar offers: the current project first, then packages that ship icons. */
  packageIconSources?: readonly ProjectIconSource[]
  /**
   * Resolves an icon reference that may name an icon owned by a package. Falls back to the offered
   * sources, then to the host project catalog, which only knows current-project icons.
   */
  resolveProjectIcon?: (reference: string) => ProjectIconCatalogEntry | null
  fontOptions?: readonly RichTextFontOption[]
  baseStyle?: {
    fontFamily?: string
    fontSize?: string
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
  | ((key: string, parameters?: Record<string, unknown>) => string)
  | undefined
const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
  translate?.(key, parameters) ?? fallback

const lastEmittedValue = ref<string | null>(null)
const toolbarRevision = ref(0)
const selectedNodeEditorOpen = ref(false)
const dialogBindingExpression = ref('')
const dialogIconPath = ref<string | null>(null)
const dialogNodeTarget = ref<{ position: number, nodeType: string, kind: 'binding' | 'projectIcon' } | null>(null)
type ColorCommand = 'foreground' | 'background' | 'stroke'
type ColorSnapshot = {
  content: JSONContent
  selection: { from: number, to: number }
}
const colorSnapshots = new Map<ColorCommand, ColorSnapshot>()

const TextStyleAttributes = Extension.create({
  name: 'textStyleAttributes',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize || null,
          renderHTML: attributes => attributes.fontSize
            ? { style: `font-size: ${attributes.fontSize}` }
            : {},
        },
        textStrokeColor: {
          default: null,
          parseHTML: element => element.style.webkitTextStrokeColor || null,
          renderHTML: attributes => attributes.textStrokeColor
            ? { style: `-webkit-text-stroke-color: ${attributes.textStrokeColor}` }
            : {},
        },
        textStrokeWidth: {
          default: null,
          parseHTML: element => element.style.webkitTextStrokeWidth || null,
          renderHTML: attributes => attributes.textStrokeWidth && attributes.textStrokeWidth !== '0px'
            ? { style: `-webkit-text-stroke-width: ${attributes.textStrokeWidth}` }
            : {},
        },
      },
    }]
  },
})

const DynamicStyle = Mark.create({
  name: 'dynamicStyle',
  priority: 1000,
  excludes: 'highlight textStyle',
  addAttributes() {
    return {
      tag: { default: 'span' },
      rawStyle: { default: '' },
    }
  },
  parseHTML() {
    const rule = (tag: 'mark' | 'span') => ({
      tag: `${tag}[data-oc-dynamic-style]`,
      getAttrs: (element: HTMLElement) => {
        const rawStyle = element.getAttribute('data-oc-dynamic-style') ?? ''
        return rawStyle ? { tag, rawStyle } : false
      },
    })
    return [rule('mark'), rule('span')]
  },
  renderHTML({ HTMLAttributes }) {
    return [HTMLAttributes.tag === 'mark' ? 'mark' : 'span', {
      'data-oc-dynamic-style': HTMLAttributes.rawStyle,
    }, 0]
  },
})

const StaticHighlight = Highlight.extend({
  parseHTML() {
    return (this.parent?.() ?? []).map((rule): ParseRule => ({
      ...rule,
      getAttrs: (element: HTMLElement | string) => {
        if (typeof element === 'string') return null
        return element.hasAttribute('data-oc-dynamic-style')
          ? false
          : typeof rule.getAttrs === 'function'
            ? ((rule.getAttrs as (element: HTMLElement) => ParseRule['attrs'])(element) ?? null)
            : rule.getAttrs ?? null
      },
    }))
  },
})

const fontOptions = computed<readonly RichTextFontSelectOption[]>(() => [
  { label: tr('propertyEditor.richText.defaultFont', '默认字体'), value: '' },
  ...(props.fontOptions ?? []).map(option => ({
    ...option,
    labelStyle: { fontFamily: option.cssFamily ?? option.value },
  })),
])
const strokeWidthOptions = computed(() => [
  { label: tr('propertyEditor.richText.noStroke', '无描边'), value: '0px' },
  { label: '0.5 px', value: '0.5px' },
  { label: '1 px', value: '1px' },
  { label: '1.5 px', value: '1.5px' },
  { label: '2 px', value: '2px' },
  { label: '3 px', value: '3px' },
] as const)
const fontSizeSteps = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96] as const
const defaultFontSize = 16
const richTextParseOptions = { preserveWhitespace: 'full' as const }
function canonicalEditorHtml(value: string): string {
  return value.replace(/\bdata-oc-dynamic-style=("[^"]*"|'[^']*')/g, 'style=$1')
}
function visualEditorHtml(value: string): string {
  const parsed = parseRichTextHtml(value)
  if (!parsed.canEnterVisualMode || !/<[^>]+>/.test(value)) return normalizeRichTextHtml(value)
  const documentNode = new DOMParser().parseFromString(value, 'text/html')
  for (const element of Array.from(documentNode.body.querySelectorAll<HTMLElement>('[style]'))) {
    const rawStyle = element.getAttribute('style') ?? ''
    if (!rawStyle.includes('{{') && !rawStyle.includes('}}')) continue
    element.setAttribute('data-oc-dynamic-style', rawStyle)
    element.removeAttribute('style')
  }
  return documentNode.body.innerHTML
}

const alignments = computed<ReadonlyArray<{
  value: 'left' | 'center' | 'right' | 'justify'
  icon: IconToken
  title: string
}>>(() => [
  { value: 'left', icon: 'format.align-start', title: tr('propertyEditor.richText.alignLeft', '左对齐') },
  { value: 'center', icon: 'format.align-center', title: tr('propertyEditor.richText.alignCenter', '居中') },
  { value: 'right', icon: 'format.align-end', title: tr('propertyEditor.richText.alignRight', '右对齐') },
  { value: 'justify', icon: 'format.align-justify', title: tr('propertyEditor.richText.alignJustify', '两端对齐') },
])

const foregroundColor = computed(() => editor.value?.getAttributes('textStyle').color || '#24292f')
const backgroundColor = computed(() => editor.value?.getAttributes('highlight').color || '#fff59d')
const strokeColor = computed(() => editor.value?.getAttributes('textStyle').textStrokeColor || '#000000')
const strokeWidth = computed(() => editor.value?.getAttributes('textStyle').textStrokeWidth || '0px')
const activeFontFamily = computed(() => {
  toolbarRevision.value
  const activeValue = editor.value?.getAttributes('textStyle').fontFamily || ''
  return fontOptions.value.find(option => (option.cssFamily ?? option.value) === activeValue)?.value
    ?? activeValue
})
const activeFontSize = computed(() => {
  toolbarRevision.value
  return String(resolveActiveFontSize())
})
const fontSizeOptions = computed(() => {
  toolbarRevision.value
  const activeSize = resolveActiveFontSize()
  const sizes = [...new Set<number>([...fontSizeSteps, activeSize])].sort((left, right) => left - right)
  return sizes.map(size => ({ label: `${size} px`, value: String(size) }))
})
const iconCatalogs = computed(() => {
  const catalogs = new Map<string, ProjectIconCatalog>()
  for (const source of props.packageIconSources ?? []) catalogs.set(source.packageKey ?? '', source.catalog)
  if (!catalogs.has('') && props.projectIconCatalog) catalogs.set('', props.projectIconCatalog)
  return catalogs
})
const hasProjectIconSources = computed(() => [...iconCatalogs.value.values()]
  .some(catalog => catalog.entries.length > 0))

function projectIconSelectionKey(packageKey: string | null, entry: ProjectIconCatalogEntry): string {
  return `project-icon:${packageKey ?? ''}:${entry.seriesKey}/${entry.iconKey}`
}

function projectIconSeriesGroups(packageKey: string | null, catalog: ProjectIconCatalog) {
  return catalog.series.map(series => ({
    key: `project-icon-series:${packageKey ?? ''}:${series.key}`,
    title: series.name,
    icon: 'file.project-icon' as const,
    children: catalog.entries
      .filter(entry => entry.seriesKey.toLocaleLowerCase() === series.key.toLocaleLowerCase())
      .map(entry => ({
        key: projectIconSelectionKey(packageKey, entry),
        title: entry.name,
        thumbnailStyle: createProjectIconStyle(entry, readProjectIconSize),
        thumbnailLabel: entry.name,
      })),
  })).filter(series => series.children.length > 0)
}

const projectIconEntriesByActionKey = computed(() => new Map(
  [...iconCatalogs.value].flatMap(([packageKey, catalog]) => catalog.entries.map(entry => [
    projectIconSelectionKey(packageKey || null, entry),
    { packageKey: packageKey || null, entry },
  ] as const)),
))
const recentProjectIconEntries = computed(() => recentProjectIconIdentities.value.flatMap(identity => {
  // The recent row lists current-project icons; the identity still carries the package so a
  // package icon and a project icon sharing collection and icon keys cannot collide.
  const entry = iconCatalogs.value.get('')?.entries.find(candidate => (
    projectIconRecentIdentity(null, candidate.seriesKey, candidate.iconKey) === identity
  ))
  return entry ? [entry] : []
}))
const projectIconActionChildren = computed(() => {
  const host = [...iconCatalogs.value]
    .filter(([packageKey]) => packageKey === '')
    .flatMap(([, catalog]) => projectIconSeriesGroups(null, catalog))
  const packages = (props.packageIconSources ?? [])
    .filter(source => source.packageKey !== null)
    .map(source => ({
      key: `project-icon-package:${source.packageKey}`,
      title: source.label,
      icon: 'file.package' as const,
      children: projectIconSeriesGroups(source.packageKey, source.catalog),
    }))
    .filter(group => group.children.length > 0)
  return [...host, ...packages]
})
const projectIconAction = computed<OcActionDefinition>(() => {
  toolbarRevision.value
  return {
    key: 'project-icon',
    icon: 'action.project-icon-plus',
    title: hasSelectedProjectIcon()
      ? tr('propertyEditor.richText.replaceProjectIcon', '替换项目图标')
      : tr('propertyEditor.richText.insertProjectIcon', '插入项目图标'),
    disabled: !hasProjectIconSources.value,
    children: projectIconActionChildren.value,
  }
})
const tableAction = computed<OcActionDefinition>(() => ({
  key: 'table-actions',
  icon: 'data.table',
  title: tr('propertyEditor.richText.tableActions', '表格操作'),
  children: [
    { key: 'table.add-row-before', icon: 'nav.arrow-up', title: tr('propertyEditor.richText.addRowBefore', '在上方插入行') },
    { key: 'table.add-row-after', icon: 'nav.arrow-down', title: tr('propertyEditor.richText.addRowAfter', '在下方插入行') },
    { key: 'table.add-column-before', icon: 'nav.arrow-left', title: tr('propertyEditor.richText.addColumnBefore', '在左侧插入列') },
    { key: 'table.add-column-after', icon: 'nav.arrow-right', title: tr('propertyEditor.richText.addColumnAfter', '在右侧插入列') },
    { key: 'table.toggle-header', icon: 'layout.rows', title: tr('propertyEditor.richText.toggleHeader', '切换表头行') },
    { key: 'table.delete-row', icon: 'action.delete', iconTone: 'danger', title: tr('propertyEditor.richText.deleteRow', '删除当前行') },
    { key: 'table.delete-column', icon: 'action.delete', iconTone: 'danger', title: tr('propertyEditor.richText.deleteColumn', '删除当前列') },
    { key: 'table.delete', icon: 'action.discard', iconTone: 'danger', title: tr('propertyEditor.richText.deleteTable', '删除整个表格') },
  ],
}))
const selectedNodeKind = computed<'binding' | 'projectIcon' | null>(() => {
  const node = editor.value?.state.selection instanceof NodeSelection
    ? editor.value.state.selection.node
    : null
  if (!node) return null
  if (node.type.name === 'binding') return 'binding'
  if (node.type.name === 'projectIcon') return 'projectIcon'
  return null
})
const selectedNodeAnchor = computed<DOMRect | null>(() => {
  toolbarRevision.value
  const currentEditor = editor.value
  const selection = currentEditor?.state.selection
  if (!currentEditor || !(selection instanceof NodeSelection) || !selectedNodeKind.value) return null
  try {
    const nodeDom = currentEditor.view.nodeDOM(selection.from)
    if (nodeDom instanceof HTMLElement) return nodeDom.getBoundingClientRect()
    const coordinates = currentEditor.view.coordsAtPos(selection.from)
    return new DOMRect(coordinates.left, coordinates.top, Math.max(1, coordinates.right - coordinates.left), Math.max(1, coordinates.bottom - coordinates.top))
  } catch {
    return currentEditor.view.dom.getBoundingClientRect()
  }
})
const nodeEditOpen = computed(() => Boolean(selectedNodeAnchor.value))
const selectedNodeDialogTitle = computed(() => dialogNodeTarget.value?.kind === 'binding'
  ? tr('propertyEditor.richText.editBinding', '编辑 Binding')
  : dialogNodeTarget.value?.kind === 'projectIcon'
    ? tr('propertyEditor.richText.editProjectIcon', '编辑项目图标')
    : '')
const dialogProjectIconAction = computed<OcActionDefinition>(() => ({
  ...projectIconAction.value,
  title: tr('propertyEditor.richText.chooseProjectIcon', '选择项目图标'),
}))

function openSelectedNodeEditor(): void {
  const currentEditor = editor.value
  const selection = currentEditor?.state.selection
  if (!currentEditor || !(selection instanceof NodeSelection)) return
  const kind = selectedNodeKind.value
  if (!kind) return
  dialogNodeTarget.value = { position: selection.from, nodeType: selection.node.type.name, kind }
  if (selectedNodeKind.value === 'binding') {
    dialogBindingExpression.value = String(selection.node.attrs.expression ?? '')
  } else if (selectedNodeKind.value === 'projectIcon') {
    dialogIconPath.value = String(selection.node.attrs.iconPath ?? '')
  }
  selectedNodeEditorOpen.value = true
}

function updateDialogBindingExpression(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) dialogBindingExpression.value = target.value
}

function selectDialogProjectIcon(payload: OcActionSelectPayload): void {
  const selection = projectIconEntriesByActionKey.value.get(payload.key)
  if (selection) dialogIconPath.value = projectIconPath(selection)
}

function confirmSelectedNodeEditor(): void {
  const currentEditor = editor.value
  const target = dialogNodeTarget.value
  if (!currentEditor || !target) return
  const node = currentEditor.state.doc.nodeAt(target.position)
  if (!node || node.type.name !== target.nodeType) return cancelSelectedNodeEditor()
  if (target.kind === 'binding') {
    const expression = dialogBindingExpression.value.trim()
    if (!expression) currentEditor.chain().focus().setNodeSelection(target.position).deleteSelection().run()
    else currentEditor.chain().focus().setNodeSelection(target.position)
      .updateAttributes(target.nodeType, { expression }).run()
  } else if (target.kind === 'projectIcon' && dialogIconPath.value) {
    currentEditor.chain().focus().setNodeSelection(target.position)
      .updateAttributes(target.nodeType, { iconPath: dialogIconPath.value }).run()
  }
  selectedNodeEditorOpen.value = false
}

function cancelSelectedNodeEditor(): void {
  selectedNodeEditorOpen.value = false
  dialogIconPath.value = null
  dialogNodeTarget.value = null
}

const editor = useEditor({
  content: visualEditorHtml(props.modelValue),
  parseOptions: richTextParseOptions,
  extensions: [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
    }),
    Table.configure({ resizable: true, allowTableNodeSelection: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Underline,
    Color,
    FontFamily,
    StaticHighlight.configure({ multicolor: true }),
    DynamicStyle,
    TextAlign.configure({ types: ['paragraph'] }),
    TextStyleAttributes,
    BindingNode.configure({
      completion: request => props.bindingCompletion?.(request) ?? null,
    }),
    ProjectIconNode.configure({
      resolve: reference => resolveProjectIconReference(reference),
    }),
  ],
  editorProps: {
    attributes: {
      class: 'oc-rich-text-editor__content',
      spellcheck: 'true',
    },
    handleDOMEvents: {
      blur: () => {
        return false
      },
    },
  },
  onUpdate: ({ editor: currentEditor }) => {
    const value = canonicalEditorHtml(currentEditor.getHTML())
    lastEmittedValue.value = value
    emit('update:modelValue', value)
  },
  onTransaction: () => {
    toolbarRevision.value += 1
  },
})

watch(() => {
  toolbarRevision.value
  const selection = editor.value?.state.selection
  return selection instanceof NodeSelection
    ? `${selection.from}:${selection.node.type.name}`
    : ''
}, () => {
  if (!selectedNodeEditorOpen.value) dialogNodeTarget.value = null
})

watch(() => props.modelValue, (value) => {
  if (value === lastEmittedValue.value) {
    lastEmittedValue.value = null
    return
  }
  lastEmittedValue.value = null
  const currentEditor = editor.value
  if (!currentEditor) return
  const normalizedValue = visualEditorHtml(value)
  if (canonicalEditorHtml(currentEditor.getHTML()) === value) return
  currentEditor.commands.setContent(normalizedValue, false, richTextParseOptions)
})

function setFontFamily(value: string): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  const cssFamily = fontOptions.value.find(option => option.value === value)?.cssFamily ?? value
  if (cssFamily) chain.setFontFamily(cssFamily).run()
  else chain.unsetFontFamily().run()
}

function insertTable(): void {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

function handleTableAction(payload: OcActionSelectPayload): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (payload.key === 'table.add-row-before') chain.addRowBefore().run()
  else if (payload.key === 'table.add-row-after') chain.addRowAfter().run()
  else if (payload.key === 'table.add-column-before') chain.addColumnBefore().run()
  else if (payload.key === 'table.add-column-after') chain.addColumnAfter().run()
  else if (payload.key === 'table.toggle-header') chain.toggleHeaderRow().run()
  else if (payload.key === 'table.delete-row') chain.deleteRow().run()
  else if (payload.key === 'table.delete-column') chain.deleteColumn().run()
  else if (payload.key === 'table.delete') chain.deleteTable().run()
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function resolveActiveFontSize(): number {
  const currentEditor = editor.value
  const inlineSize = parsePositiveNumber(currentEditor?.getAttributes('textStyle').fontSize)
  if (inlineSize !== null) return inlineSize

  const contentElement = currentEditor?.view.dom
  const computedSize = contentElement ? parsePositiveNumber(getComputedStyle(contentElement).fontSize) : null
  if (computedSize !== null) return computedSize

  return parsePositiveNumber(props.baseStyle?.fontSize) ?? defaultFontSize
}

function setFontSize(value: string): void {
  const size = parsePositiveNumber(value)
  if (size === null) return
  editor.value?.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run()
}

function adjustFontSize(direction: -1 | 1): void {
  const currentEditor = editor.value
  if (!currentEditor) return
  const currentSize = resolveActiveFontSize()
  const nextSize = direction > 0
    ? fontSizeSteps.find(size => size > currentSize) ?? fontSizeSteps[fontSizeSteps.length - 1]
    : [...fontSizeSteps].reverse().find(size => size < currentSize) ?? fontSizeSteps[0]
  currentEditor.chain().focus().setMark('textStyle', { fontSize: `${nextSize}px` }).run()
}

function setForegroundColor(value: string): void {
  editor.value?.chain().focus().setColor(value).run()
}

function setBackgroundColor(value: string): void {
  editor.value?.chain().focus().setHighlight({ color: value }).run()
}

function setStrokeColor(value: string): void {
  editor.value?.chain().focus().setMark('textStyle', {
    textStrokeColor: value,
    textStrokeWidth: strokeWidth.value,
  }).run()
}

function setStrokeWidth(value: string): void {
  editor.value?.chain().focus().setMark('textStyle', {
    textStrokeColor: value === '0px' ? null : strokeColor.value,
    textStrokeWidth: value === '0px' ? null : value,
  }).run()
}

function captureColorSnapshot(command: ColorCommand, open: boolean): void {
  const currentEditor = editor.value
  if (!currentEditor) return
  if (!open) {
    colorSnapshots.delete(command)
    return
  }
  colorSnapshots.set(command, {
    content: currentEditor.getJSON(),
    selection: {
      from: currentEditor.state.selection.from,
      to: currentEditor.state.selection.to,
    },
  })
}

function restoreColorSnapshot(command: ColorCommand): void {
  const currentEditor = editor.value
  const snapshot = colorSnapshots.get(command)
  if (!currentEditor || !snapshot) return
  currentEditor.commands.setContent(snapshot.content)
  currentEditor.commands.setTextSelection(snapshot.selection)
}

function insertBinding(): void {
  editor.value?.chain().focus().insertContent({
    type: 'binding',
    attrs: { expression: '' },
  }).run()
}

/** A chosen icon plus the package it belongs to: the stored reference needs both. */
type ProjectIconSelection = {
  packageKey: string | null
  entry: ProjectIconCatalogEntry
}

function projectIconPath(selection: ProjectIconSelection): string {
  return formatProjectIconPath({
    packageKey: selection.packageKey,
    seriesKey: selection.entry.seriesKey,
    iconKey: selection.entry.iconKey,
  })
}

/** Resolves a stored reference: the caller's resolver first, then any catalog the toolbar offers. */
function resolveProjectIconReference(reference: string): ProjectIconCatalogEntry | null {
  if (props.resolveProjectIcon) return props.resolveProjectIcon(reference)
  const parsed = parseProjectIconPath(reference)
  if (!parsed) return null
  const catalog = iconCatalogs.value.get(parsed.packageKey ?? '')
  return catalog ? findProjectIcon(catalog, parsed.seriesKey, parsed.iconKey) : null
}

function hasSelectedProjectIcon(): boolean {
  const currentEditor = editor.value
  const selection = currentEditor?.state.selection
  return Boolean(currentEditor
    && selection instanceof NodeSelection
    && selection.node.type.name === 'projectIcon')
}

function handleProjectIconAction(payload: OcActionSelectPayload): void {
  const selection = projectIconEntriesByActionKey.value.get(payload.key)
  if (selection) insertProjectIconEntry(selection)
}

function insertRecentProjectIcon(entry: ProjectIconCatalogEntry): void {
  insertProjectIconEntry({ packageKey: null, entry })
}

function insertProjectIconEntry(selection: ProjectIconSelection): void {
  const currentEditor = editor.value
  if (!currentEditor) return
  const attrs = { iconPath: projectIconPath(selection) }
  if (hasSelectedProjectIcon()) {
    const position = currentEditor.state.selection.from
    currentEditor.chain().focus().updateAttributes('projectIcon', attrs).setNodeSelection(position).run()
  } else currentEditor.chain().focus().insertContent(createProjectIconContent(currentEditor, attrs)).run()
  rememberRecentProjectIcon(selection.packageKey, selection.entry.seriesKey, selection.entry.iconKey)
}

function createProjectIconContent(
  currentEditor: Editor,
  attrs: { iconPath: string },
  sourcePosition?: number,
): JSONContent {
  const marks = sourcePosition === undefined
    ? (currentEditor.state.storedMarks ?? currentEditor.state.selection.$from.marks())
    : (currentEditor.state.doc.nodeAt(sourcePosition)?.marks
      ?? currentEditor.state.doc.resolve(sourcePosition).marks())
  return {
    type: 'projectIcon',
    attrs,
    ...(marks.length > 0 ? { marks: marks.map(mark => mark.toJSON()) } : {}),
  }
}

function focus(): void {
  editor.value?.commands.focus('end', { scrollIntoView: false })
}

defineExpose({
  editor,
  focus,
  openSelectedNodeEditor,
  confirmSelectedNodeEditor,
  cancelSelectedNodeEditor,
})
</script>

<style scoped>
.oc-rich-text-editor {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  background: var(--oc-bg-input);
}

.oc-rich-text-editor__toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: var(--oc-space-1);
  padding: var(--oc-space-1);
  overflow: hidden;
  border-bottom: var(--oc-border-width) solid var(--oc-border-default);
  background: var(--oc-bg-raised);
}

.oc-rich-text-editor__toolbar-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
}

.oc-rich-text-editor__tool-group {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding-inline: var(--oc-space-2);
  border-inline-start: 1px solid var(--oc-border-muted);
}

.oc-rich-text-editor__tool-group:first-child {
  padding-inline-start: 0;
  border-inline-start: 0;
}

.oc-rich-text-editor__tool-group--tail {
  margin-inline-start: auto;
}

.oc-rich-text-editor__recent-icon {
  width: var(--oc-size-md);
  flex: 0 0 var(--oc-size-md);
}

.oc-rich-text-editor__recent-icon-image {
  display: inline-block;
  flex: none;
  font-size: var(--oc-icon-size-md);
  background-repeat: no-repeat;
  vertical-align: text-bottom;
}

.oc-rich-text-editor__font {
  width: 124px;
}

.oc-rich-text-editor__font-size {
  width: 82px;
}

.oc-rich-text-editor__stroke-width {
  width: 84px;
}

.oc-rich-text-editor__color-command {
  position: relative;
  display: grid;
  width: 16px;
  height: 18px;
  place-items: center;
  font-weight: 700;
  line-height: 1;
}

.oc-rich-text-editor__color-command > span {
  position: absolute;
  right: 1px;
  bottom: 0;
  left: 1px;
  height: 3px;
  border-radius: 1px;
}

.oc-rich-text-editor__color-command--stroke {
  color: var(--oc-bg-input);
  -webkit-text-stroke-width: 1px;
}

.oc-rich-text-editor__surface {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
}

.oc-rich-text-editor__surface :deep(.oc-rich-text-editor__content) {
  min-height: 100%;
  padding: var(--oc-space-4);
  outline: none;
  color: var(--oc-fg-default);
  overflow-wrap: anywhere;
  paint-order: stroke fill;
  white-space: break-spaces;
}

.oc-rich-text-editor__surface :deep(p) {
  margin: 0;
}

.oc-rich-text-editor__surface :deep(p + p) {
  margin-top: 0.35em;
}

.oc-rich-text-editor__surface :deep(ul),
.oc-rich-text-editor__surface :deep(ol) {
  margin-block: var(--oc-space-2);
  padding-inline-start: var(--oc-space-5);
}

.oc-rich-text-editor__surface :deep(table) {
  width: 100%;
  margin-block: var(--oc-space-2);
  border-collapse: collapse;
  table-layout: fixed;
}

.oc-rich-text-editor__surface :deep(th),
.oc-rich-text-editor__surface :deep(td) {
  min-width: var(--oc-size-lg);
  padding: var(--oc-space-1) var(--oc-space-2);
  border: var(--oc-border-width) solid var(--oc-border-default);
  vertical-align: top;
}

.oc-rich-text-editor__surface :deep([class~="selectedCell"]) {
  background: var(--oc-bg-selected);
}

.oc-rich-text-editor__node-edit-layer {
  display: grid;
  max-width: var(--oc-dialog-width-md);
  max-height: inherit;
  gap: var(--oc-space-2);
  padding: var(--oc-floating-surface-padding);
  overflow: auto;
}

.oc-rich-text-editor__node-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
