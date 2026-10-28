import { computed, getCurrentInstance, ref, watch, watchEffect } from 'vue'
import { createRichTextInteraction } from './richTextInteraction'
import { useRichTextFormatting } from './useRichTextFormatting'
import { resolveRichTextStyle } from '../../rich-text/richTextResourceStyle'
import { Extension, type ChainedCommands, type Editor, type JSONContent } from '@tiptap/core'
import { richTextStyleExtensions, fontVariable } from './richTextStyleExtensions'
import { richTextParseOptions, canonicalEditorHtml, visualEditorHtml, equivalentRichTextHtml } from './richTextEditorHtml'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { DOMParser as ProseMirrorParser, DOMSerializer, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { useEditor } from '@tiptap/vue-3'
import type { OcActionDefinition, OcActionSelectPayload } from '../action/action.types'
import type {
  PropertyCompletionItem,
  PropertyCompletionProvider,
  PropertyEditorFieldDefinition,
  PropertyFieldCapabilities,
  PropertyIconEntry,
  PropertyIconScope,
} from '../property-editor/propertyEditor.types'
import type { IconToken } from '../icon/iconRegistry'
import { BindingNode } from './bindingNode'
import { ProjectIconNode } from './projectIconNode'
import { parseProjectIconPath } from '../../rich-text/projectIconReference'
import {
  projectIconRecentIdentity,
  recentProjectIconIdentities,
  rememberRecentProjectIcon,
} from './recentProjectIcons'
import {
  createRichTextFormatInput,
  richTextFormatCategories,
} from './richTextFormat'

export type RichTextEditorProps = {
  /** 本次会话的初始 HTML。挂载后内容由编辑器文档持有。 */
  initialHtml: string
  /** 行内表达式补全服务。 */
  bindingCompletion?: PropertyCompletionProvider
  /** 编辑区继承的基础字体与字号。 */
  baseStyle?: {
    fontFamily?: string
    fontSize?: string
  }
  /** 环境资源能力（项目与资源包字体、图标、图片文件与预览解析器）。 */
  capabilities?: PropertyFieldCapabilities
}

export function useRichTextEditor(props: RichTextEditorProps, onChange: () => void) {
  const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
    | ((key: string, parameters?: Record<string, unknown>) => string)
    | undefined
  const tr = (key: string, fallback: string, parameters?: Record<string, unknown>): string =>
    translate?.(key, parameters) ?? fallback

  let originalDocument: ProseMirrorNode | null = null
  let appliedSource: { document: ProseMirrorNode; html: string } | null = null
  const toolbarRevision = ref(0)
  const interaction = createRichTextInteraction(() => editor.value, (node, previewStyle) => {
    const attributes = node.marks.find(mark => mark.type.name === 'textStyle')?.attrs ?? {}
    const highlight = node.marks.find(mark => mark.type.name === 'highlight')
    return resolveRichTextStyle(
      {
        style: `${highlight ? `background-color: ${highlight.attrs.color || '#ffff00'};` : ''}${previewStyle}`,
        'data-oc-fill-type': String(attributes.textFillType ?? ''),
        'data-oc-fill-source': String(attributes.textFillSource ?? ''),
      },
      () => null,
      reference => props.capabilities?.resolveImagePreview?.(reference) ?? null,
    )
  })
  const formatting = useRichTextFormatting(() => editor.value, toolbarRevision, interaction, () => props.baseStyle?.fontSize)
  function captureInteraction(event: Event) {
    if (!(event.target instanceof Element) || event.target.closest('.oc-rich-text-editor__surface')) return
    interaction.capture()
  }
  function colorOpen(open: boolean) { if (open) interaction.capture(); else interaction.clearPreview() }

  const strokeWidthCompletionProvider = createToolbarCompletion(
    [0, 0.5, 1, 1.5, 2, 3].map(size => ({ key: `${size}px`, label: `${size}px` })),
  )
  const fontVariables = computed(() => {
    const vars: Record<string, string> = {}
    for (const scope of props.capabilities?.fonts ?? []) {
      for (const option of scope.entries) {
        if (option.value) vars[fontVariable(option.value)] = option.cssFamily ?? option.value
      }
    }
    return vars
  })
  const alignments = computed<ReadonlyArray<{
    value: 'left' | 'center' | 'right' | 'justify'
    icon: IconToken
    title: string
  }>>(() => [
    { value: 'left', icon: 'mdiFormatAlignLeft', title: tr('propertyEditor.richText.alignLeft', '左对齐') },
    { value: 'center', icon: 'mdiFormatAlignCenter', title: tr('propertyEditor.richText.alignCenter', '居中') },
    { value: 'right', icon: 'mdiFormatAlignRight', title: tr('propertyEditor.richText.alignRight', '右对齐') },
    { value: 'justify', icon: 'mdiFormatAlignJustify', title: tr('propertyEditor.richText.alignJustify', '两端对齐') },
  ])

  const foregroundColor = computed(() => formatting.value('foregroundColor'))
  const backgroundColor = computed(() => formatting.value('backgroundColor'))
  const activeFontFamily = computed(() => formatting.value('fontFamily'))
  const activeFontSize = computed(() => formatting.value('fontSize'))
  const fontSizeOptions = computed(() => {
    const current = activeFontSize.value
    const sizes = [...new Set([...formatting.sizeSteps, ...(current.endsWith('px') ? [Number.parseFloat(current)] : [])])].sort((a, b) => a - b)
    const options = sizes.map(size => ({ key: `${size}px`, label: `${size}px` }))
    return current && !current.endsWith('px') ? [{ key: current, label: current }, ...options] : options
  })
  function createToolbarCompletion(items: readonly { key: string; label: string; labelStyle?: Readonly<Record<string, string>> }[]): PropertyCompletionProvider {
    return ({ value }) => {
      const raw = value.trim().toLocaleLowerCase()
      const query = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) ? `${raw}px` : raw
      const filterQuery = items.some(item => item.key.toLocaleLowerCase() === query) ? '' : query
      const suggestions: PropertyCompletionItem[] = items
        .filter(item => !filterQuery || `${item.label} ${item.key}`.toLocaleLowerCase().includes(filterQuery))
        .sort((left, right) => Number(right.key.toLocaleLowerCase() === query) - Number(left.key.toLocaleLowerCase() === query))
        .map(item => ({ ...item, insertText: item.key }))
      return { replaceStart: 0, replaceEnd: value.length, items: suggestions }
    }
  }
  type StringFieldDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'string' }>
  type FontFamilyFieldDefinition = Extract<PropertyEditorFieldDefinition, { fieldType: 'fontFamily' }>
  const fontFieldDefinition = computed<FontFamilyFieldDefinition>(() => ({
    title: tr('propertyEditor.richText.font', '字体'),
    fieldType: 'fontFamily',
    placeholder: formatting.state.value.fontFamily.kind === 'mixed'
      ? tr('propertyEditor.richText.mixed', '混合')
      : tr('propertyEditor.richText.defaultFont', '默认字体'),
  }))
  const fontSizeFieldDefinition = computed<StringFieldDefinition>(() => ({
    title: tr('propertyEditor.richText.fontSize', '字号'), fieldType: 'string',
    commitMode: 'blur',
    placeholder: formatting.state.value.fontSize.kind === 'mixed' ? tr('propertyEditor.richText.mixed', '混合') : undefined,
    completion: { provider: createToolbarCompletion(fontSizeOptions.value) },
  }))
  const strokeWidthFieldDefinition = computed<StringFieldDefinition>(() => ({
    title: tr('propertyEditor.richText.strokeWidth', '描边宽度'), fieldType: 'string',
    commitMode: 'blur',
    completion: { provider: strokeWidthCompletionProvider },
  }))
  const lengthCompletionProvider = createToolbarCompletion(
    [0, 1, 2, 4, 8, 12].map(size => ({ key: `${size}px`, label: `${size}px` })),
  )
  const propertyCategories = computed(() => richTextFormatCategories(tr))
  const propertyInputs = computed(() => {
    toolbarRevision.value
    const selection = editor.value?.state.selection
    return [createRichTextFormatInput({
      labels: tr,
      title: selection instanceof CellSelection ? tr('propertyEditor.richText.selectedCells', '选中单元格')
        : selection instanceof NodeSelection ? tr('propertyEditor.richText.selectedNode', '选中节点')
        : selection && !selection.empty ? tr('propertyEditor.richText.selectionProperties', '选中文本')
        : tr('propertyEditor.richText.inputProperties', '输入文字'),
      state: formatting.state.value,
      fields: {
        fontField: fontFieldDefinition.value,
        fontSizeField: fontSizeFieldDefinition.value,
        strokeWidthField: strokeWidthFieldDefinition.value,
        lengthCompletionProvider,
      },
    })]
  })

  const iconScopes = computed<readonly PropertyIconScope[]>(() => props.capabilities?.icons ?? [])
  const hasProjectIconSources = computed(() =>
    iconScopes.value.some(scope => scope.series.some(series => series.entries.length > 0)),
  )

  function projectIconSelectionKey(packageKey: string | null, entry: PropertyIconEntry): string {
    return `project-icon:${packageKey ?? ''}:${entry.seriesKey}/${entry.iconKey}`
  }

  function projectIconSeriesGroups(scope: PropertyIconScope) {
    return scope.series
      .map(series => ({
        key: `project-icon-series:${scope.packageKey ?? ''}:${series.key}`,
        title: series.name,
        icon: 'mdiStickerEmoji' as const,
        children: series.entries.map(entry => ({
          key: projectIconSelectionKey(scope.packageKey, entry),
          title: entry.name,
          thumbnailStyle: entry.inlineStyle,
          thumbnailLabel: entry.name,
        })),
      }))
      .filter(series => series.children.length > 0)
  }

  const projectIconEntriesByActionKey = computed(() => new Map(
    iconScopes.value.flatMap(scope =>
      scope.series.flatMap(series =>
        series.entries.map(entry => [
          projectIconSelectionKey(scope.packageKey, entry),
          { packageKey: scope.packageKey, entry },
        ] as const),
      ),
    ),
  ))

  const recentProjectIconEntries = computed(() => {
    const hostScope = iconScopes.value.find(scope => scope.packageKey === null)
    const hostEntries = hostScope?.series.flatMap(series => series.entries) ?? []
    return recentProjectIconIdentities.value.flatMap(identity => {
      const entry = hostEntries.find(
        candidate => projectIconRecentIdentity(null, candidate.seriesKey, candidate.iconKey) === identity,
      )
      return entry ? [entry] : []
    })
  })

  const projectIconActionChildren = computed(() => {
    const host = iconScopes.value
      .filter(scope => scope.packageKey === null)
      .flatMap(scope => projectIconSeriesGroups(scope))
    const packages = iconScopes.value
      .filter(scope => scope.packageKey !== null)
      .map(scope => ({
        key: `project-icon-package:${scope.packageKey}`,
        title: scope.label,
        icon: 'mdiPackageVariantClosed' as const,
        children: projectIconSeriesGroups(scope),
      }))
      .filter(group => group.children.length > 0)
    return [...host, ...packages]
  })

  const projectIconAction = computed<OcActionDefinition>(() => {
    toolbarRevision.value
    return {
      key: 'project-icon',
      icon: 'mdiStickerEmoji',
      title: hasSelectedProjectIcon()
        ? tr('propertyEditor.richText.replaceProjectIcon', '替换项目图标')
        : tr('propertyEditor.richText.insertProjectIcon', '插入项目图标'),
      disabled: !hasProjectIconSources.value,
      children: projectIconActionChildren.value,
    }
  })

  const tableAction = computed<OcActionDefinition>(() => {
    toolbarRevision.value
    return {
      key: 'table-actions',
      icon: 'mdiTableLarge',
      title: tr('propertyEditor.richText.tableActions', '表格操作'),
      children: [
        { key: 'table.add-row-before', icon: 'mdiArrowUp', title: tr('propertyEditor.richText.addRowBefore', '在上方插入行') },
        { key: 'table.add-row-after', icon: 'mdiArrowDown', title: tr('propertyEditor.richText.addRowAfter', '在下方插入行') },
        { key: 'table.add-column-before', icon: 'mdiArrowLeft', title: tr('propertyEditor.richText.addColumnBefore', '在左侧插入列') },
        { key: 'table.add-column-after', icon: 'mdiArrowRight', title: tr('propertyEditor.richText.addColumnAfter', '在右侧插入列') },
        { key: 'table.toggle-header', icon: 'mdiLandRowsHorizontal', title: tr('propertyEditor.richText.toggleHeader', '切换表头行') },
        { key: 'table.toggle-header-column', icon: 'mdiTableLarge', title: tr('propertyEditor.richText.toggleHeaderColumn', '切换表头列') },
        { key: 'table.toggle-header-cell', icon: 'mdiTableLarge', title: tr('propertyEditor.richText.toggleHeaderCell', '切换表头单元格') },
        { key: 'table.merge-cells', icon: 'mdiTableLarge', title: tr('propertyEditor.richText.mergeCells', '合并单元格'), disabled: !editor.value?.can().mergeCells() },
        { key: 'table.split-cell', icon: 'mdiTableLarge', title: tr('propertyEditor.richText.splitCell', '拆分单元格'), disabled: !editor.value?.can().splitCell() },
        { key: 'table.delete-row', icon: 'mdiTrashCanOutline', iconTone: 'danger', title: tr('propertyEditor.richText.deleteRow', '删除当前行') },
        { key: 'table.delete-column', icon: 'mdiTrashCanOutline', iconTone: 'danger', title: tr('propertyEditor.richText.deleteColumn', '删除当前列') },
        { key: 'table.delete', icon: 'mdiUndoVariant', iconTone: 'danger', title: tr('propertyEditor.richText.deleteTable', '删除整个表格') },
      ],
    }
  })

  const selectedNodeKind = computed<'binding' | 'projectIcon' | null>(() => {
    toolbarRevision.value
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
  const editor = useEditor({
    content: visualEditorHtml(props.initialHtml),
    parseOptions: richTextParseOptions,
    extensions: [
      Extension.create({ name: 'formatInteraction', addProseMirrorPlugins: () => [interaction.plugin] }),
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
      Underline,
      Color,
      ...richTextStyleExtensions,
      TextAlign.configure({ types: ['paragraph'] }),
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
    },
    onUpdate: onChange,
    onTransaction: ({ transaction }) => {
      interaction.update(transaction)
      toolbarRevision.value += 1
    },
  })
  watch(editor, current => { if (current) originalDocument = current.state.doc }, { flush: 'sync' })
  watchEffect(() => {
    const current = editor.value
    if (current && !current.isDestroyed) current.view.updateState(current.state)
  })

  function getHtml(): string {
    const current = editor.value
    if (!current) return props.initialHtml
    if (appliedSource?.document.eq(current.state.doc)) return appliedSource.html
    if (originalDocument?.eq(current.state.doc)) return props.initialHtml
    return canonicalEditorHtml(current.getHTML())
  }
  function applyHtml(html: string): boolean {
    const current = editor.value
    if (!current) return false
    const dom = new DOMParser().parseFromString(visualEditorHtml(html), 'text/html').body
    const next = ProseMirrorParser.fromSchema(current.schema).parse(dom, richTextParseOptions)
    const output = document.createElement('div')
    output.append(DOMSerializer.fromSchema(current.schema).serializeFragment(next.content))
    if (!equivalentRichTextHtml(html, canonicalEditorHtml(output.innerHTML))) return false
    interaction.release()
    if (!next.eq(current.state.doc)) {
      const transaction = closeHistory(current.state.tr).replaceWith(0, current.state.doc.content.size, next.content)
      transaction.setSelection(Selection.atStart(transaction.doc))
      current.view.dispatch(transaction)
      current.view.dispatch(closeHistory(current.state.tr))
    }
    appliedSource = { document: current.state.doc, html }
    return true
  }
  function flushPendingInput(): boolean {
    if (editor.value?.view.composing) return false
    const detail = { ready: true }
    editor.value?.view.dom.querySelectorAll('.binding-node.is-editing').forEach(node => {
      node.dispatchEvent(new CustomEvent('oc-flush-binding', { detail }))
    })
    return detail.ready
  }

  function runCommand(command: string) {
    interaction.run(current => {
      const chain = current.chain().focus()
      const commands: Record<string, (chain: ChainedCommands) => ChainedCommands> = {
        undo: chain => chain.undo(), redo: chain => chain.redo(),
        bold: chain => chain.toggleBold(), italic: chain => chain.toggleItalic(),
        underline: chain => chain.toggleUnderline(), strike: chain => chain.toggleStrike(),
        bulletList: chain => chain.toggleBulletList(), orderedList: chain => chain.toggleOrderedList(),
        clear: chain => chain.unsetAllMarks(),
      }
      if (commands[command]) commands[command](chain).run()
      else chain.setTextAlign(command).run()
    }, command !== 'undo' && command !== 'redo')
  }

  function insertTable(): void {
    interaction.run(current => current.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), true)
  }

  function handleTableAction(payload: OcActionSelectPayload): void {
    interaction.run(current => {
      const chain = current.chain().focus()
      if (payload.key === 'table.add-row-before') chain.addRowBefore().run()
      else if (payload.key === 'table.add-row-after') chain.addRowAfter().run()
      else if (payload.key === 'table.add-column-before') chain.addColumnBefore().run()
      else if (payload.key === 'table.add-column-after') chain.addColumnAfter().run()
      else if (payload.key === 'table.toggle-header') chain.toggleHeaderRow().run()
      else if (payload.key === 'table.toggle-header-column') chain.toggleHeaderColumn().run()
      else if (payload.key === 'table.toggle-header-cell') chain.toggleHeaderCell().run()
      else if (payload.key === 'table.merge-cells') chain.mergeCells().run()
      else if (payload.key === 'table.split-cell') chain.splitCell().run()
      else if (payload.key === 'table.delete-row') chain.deleteRow().run()
      else if (payload.key === 'table.delete-column') chain.deleteColumn().run()
      else if (payload.key === 'table.delete') chain.deleteTable().run()
    }, true)
  }

  function insertBinding(): void {
    interaction.run(current => current.chain().focus().insertContent({
      type: 'binding',
      attrs: { expression: '' },
    }).run(), true)
  }

  type ProjectIconSelection = {
    packageKey: string | null
    entry: PropertyIconEntry
  }

  function resolveProjectIconReference(reference: string): PropertyIconEntry | null {
    const parsed = parseProjectIconPath(reference)
    if (!parsed) return null
    const scope = iconScopes.value.find(candidate => (candidate.packageKey ?? null) === (parsed.packageKey ?? null))
    const series = scope?.series.find(candidate => candidate.key.toLocaleLowerCase() === parsed.seriesKey.toLocaleLowerCase())
    return series?.entries.find(candidate => candidate.iconKey.toLocaleLowerCase() === parsed.iconKey.toLocaleLowerCase()) ?? null
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

  function insertRecentProjectIcon(entry: PropertyIconEntry): void {
    insertProjectIconEntry({ packageKey: null, entry })
  }

  function insertProjectIconEntry(selection: ProjectIconSelection): void {
    interaction.run(currentEditor => {
      const attrs = { iconPath: selection.entry.iconPath }
      if (hasSelectedProjectIcon()) {
        const position = currentEditor.state.selection.from
        currentEditor.chain().focus().updateAttributes('projectIcon', attrs).setNodeSelection(position).run()
      } else currentEditor.chain().focus().insertContent(createProjectIconContent(currentEditor, attrs)).run()
      rememberRecentProjectIcon(selection.packageKey, selection.entry.seriesKey, selection.entry.iconKey)
    }, true)
  }

  function createProjectIconContent(
    currentEditor: Editor,
    attrs: { iconPath: string },
  ): JSONContent {
    const marks = currentEditor.state.storedMarks ?? currentEditor.state.selection.$from.marks()
    return {
      type: 'projectIcon',
      attrs,
      ...(marks.length > 0 ? { marks: marks.map(mark => mark.toJSON()) } : {}),
    }
  }

  function focus(): void {
    editor.value?.commands.focus('end', { scrollIntoView: false })
  }

  return {
    editor, focus, getHtml, applyHtml, flushPendingInput, endInteraction: interaction.release,
    fontVariables, captureInteraction, colorOpen, formatting, interaction,
    fontFieldDefinition, fontSizeFieldDefinition, activeFontFamily, activeFontSize,
    runCommand, insertTable, tableAction, handleTableAction, insertBinding,
    hasProjectIconSources, projectIconAction, handleProjectIconAction,
    recentProjectIconEntries, projectIconSelectionKey, insertRecentProjectIcon,
    foregroundColor, backgroundColor, alignments, tr,
    selectedNodeAnchor, selectedNodeKind, nodeEditOpen, propertyInputs, propertyCategories,
  }
}
