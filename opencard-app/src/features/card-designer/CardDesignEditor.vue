<!--
  使用说明：
  - 输入 `filePath` 与 `modelValue` 作为卡牌编辑源
  - 通过 `save/modified/update:modelValue` 与外层会话同步

  职责边界：
  - 负责卡牌编辑器编排 实例树 结构树 画布与属性面板协同
  - 只上抛编辑意图与内容变更 不负责文件系统持久化规则

  主要输出事件：
  - `update:modelValue`（同步文档文本）
  - `modified`（同步脏状态）
  - `save`（请求外层执行保存）
-->
<template>
  <div ref="editorRootRef" class="card-design-editor" :class="{ 'is-content-pending': editorContentPending }"
    :style="editorShellStyle" tabindex="-1" @keydown="handleRootKeydown">
    <div class="card-design-editor__stage"
      :class="{ 'is-layer-view-active': layerViewActive, 'is-debug-overlays-hidden': props.debugHideCdeOverlays }">
      <div class="card-design-editor__mode-view">
          <div class="card-design-editor__stage-base" :class="{ 'is-data-table-mode': workspaceMode === 'data-table' }">
            <OcPanel fill tone="transparent" border="none" padding="none" overflow="hidden">
              <div v-if="props.mode === 'diff'" class="card-design-editor__diff-mode-stage">
                <OcEmpty v-if="!props.comparison" tone="muted">{{ t('sidebar.diffViewer.loading') }}</OcEmpty>
                <OcEmpty v-else-if="!diffBeforeRender || !diffAfterRender">{{ t('sidebar.diffViewer.parseFailedGeneric')
                }}</OcEmpty>
                <CardViewport v-else ref="cardViewportRef" class="card-design-editor__viewport" :class="{ 'is-data-table-mode': workspaceMode === 'data-table' }"
                  :face="diffAfterRender.document.faces[activeFaceKey]" :resource-context="diffAfterRender.resources"
                  readonly :transform="viewportTransform" :viewport-insets="diffViewportInsets"
                  :comparison="diffViewportComparison" :comparison-divider-label="t('sidebar.diffViewer.divider')"
                  @diff-divider-change="handleDiffDividerChange" @blank-click="clearEffectiveBlockSelection"
                  @block-click="handleEffectiveViewportBlockClick"
                  @viewport-transform-change="handleViewportTransformChange"
                  @render-readiness-change="handleRenderReadinessChange" />
              </div>
              <template v-else>
                <CardViewport ref="cardViewportRef" v-if="viewFace && renderResources"
                  class="card-design-editor__viewport" :class="{ 'is-debug-transparent': props.debugTransparentCdeViewport, 'is-debug-passive': props.debugPassiveCdeViewport, 'is-data-table-mode': workspaceMode === 'data-table' }"
                  :face="viewFace" :clip-to-face="clipToFace" :resource-context="renderResources" :readonly="workspaceMode !== 'design'"
                  :restore-key="props.filePath" :transform="viewportTransform"
                  :selected-block-id="props.debugPassiveCdeViewport || workspaceMode !== 'design' ? null : selectedBlock?.id ?? null"
                  :selected-location-type="props.debugPassiveCdeViewport || workspaceMode !== 'design' ? null : selectedLocationType"
                  :selected-anchor="selectedAnchor" :selected-parent-block-id="selectedParentBlockId"
                  :selected-parent-flow-direction="selectedParentFlowDirection" :selected-flow-align="selectedFlowAlign"
                  :viewport-insets="viewportInsets"
                  :selection-info="props.debugPassiveCdeViewport || workspaceMode !== 'design' ? null : selectionInfo"
                  :selection-action-labels="selectionActionLabels" :selection-command-actions="selectionCommandActions"
                  :layer-view-active="layerViewActive"
                  :layer-view-base-plane-label="t('cardDesigner.layerView.basePlane')"
                  :space-modifier-active="spaceHeld"
                  :layer-view-shortcut-legend-label="t('cardDesigner.layerView.shortcutLegend')"
                  :layer-view-shortcut-hints="layerViewShortcutHints"
                  :layer-view-atomic-block-ids="layerViewAtomicBlockIds"
                  :show-info="workspaceMode === 'design' && !selectedBlock && !props.debugPassiveCdeViewport"
                  :show-position-on-move="workspaceMode === 'design' && !props.debugPassiveCdeViewport && (props.showSelectionPositionOnMove ?? true)"
                  :show-size-on-resize="workspaceMode === 'design' && !props.debugPassiveCdeViewport && (props.showSelectionSizeOnResize ?? true)"
                  :alignment-snapping-enabled="workspaceMode === 'design' && !props.debugPassiveCdeViewport && alignmentSnappingEnabled"
                  :transform-disabled-block-ids="transformDisabledBlockIds"
                  @pointerdown.capture="handleCanvasPointerDown" @block-click="handleEffectiveViewportBlockClick"
                  @blank-click="clearEffectiveBlockSelection" @resize-selection="handleSelectionResize"
                  @move-selection="handleSelectionMove" @selection-action="handleSelectionAction"
                  @selection-command="handleSelectionCommand" @z-index-step="handleLayerZIndexStep"
                  @face-dimension-change="handleFaceDimensionChange"
                  @viewport-transform-change="handleViewportTransformChange"
                  @viewport-size-change="handleViewportSizeChange"
                  @render-readiness-change="handleRenderReadinessChange">
                  <template #info>
                    <section class="card-design-editor__card-info" :aria-label="t('cardDesigner.info.title')">
                      <span v-for="item in viewportCardInfo" :key="item.key" :class="{
                        'is-highlighted': highlightedInfoKeys.has(item.key),
                        'is-group-separated': item.separated,
                        'is-multiline': item.multiline,
                      }">
                        {{ item.value }}
                      </span>
                    </section>
                  </template>
                  <template #left-info>
                    <span class="card-design-editor__dimension-info"
                      :class="{ 'is-highlighted': highlightedInfoKeys.has('height') }">
                      {{ viewportCardDimensions.height }}
                    </span>
                  </template>
                  <template #bottom-info>
                    <span class="card-design-editor__dimension-info"
                      :class="{ 'is-highlighted': highlightedInfoKeys.has('width') }">
                      {{ viewportCardDimensions.width }}
                    </span>
                  </template>
                </CardViewport>
                <OcEmpty v-else>{{ t('cardDesigner.document.parseFailed') }}</OcEmpty>
              </template>
            </OcPanel>
          </div>

          <div class="card-design-editor__data-table-view" :class="{ 'is-active': workspaceMode === 'data-table' }">
            <CardDataTable ref="cardDataTableRef" :readonly="props.mode === 'diff'" :columns="dataTableColumns"
              :catalog-face-groups="dataTableCatalogFaceGroups" :face-groups="dataTableFaceGroups"
              :binding-interpreter="propertyBindingInterpreter" :get-cell-definition="getDataTableCellDefinition"
              @add-instance="createInstance" @rename-instance="renameInstance" @duplicate-card="duplicateDataTableCard"
              @delete-instance="deleteInstance" @set-instance-exported="setDataTableInstanceExported"
              @add-block="includeDataTableBlock" @remove-block="removeDataTableBlock"
              @include-field="includeDataTableField" @exclude-field="excludeDataTableField"
              @create-field="openDataTableFieldDialog" @delete-field="deleteDataTableField"
              @update-cell="updateDataTableCell" @reset-cell="resetDataTableCell"
              @cell-select="handleDataTableCellSelect" />
          </div>
      </div>

      <div class="card-design-editor__stage-layer" :class="{ 'is-data-table-mode': workspaceMode === 'data-table' }">
        <CdeOverlayDock side="left" :extent="leftDockExtent" :collapsed-extent="overlayGeometryConfig.collapsedExtent"
          :min-extent="overlayGeometryConfig.minExtent" :max-extent="overlayGeometryConfig.maxExtent"
          :expand-drag-threshold="overlayGeometryConfig.expandDragThreshold"
          :collapse-drag-threshold="overlayGeometryConfig.collapseDragThreshold"
          :floating-gap="overlayGeometryConfig.floatingGap" :top-expanded="isInstancePanelExpanded"
          :bottom-expanded="isPreviewPanelExpanded" :top-size="leftSidebarTopHeight"
          :top-min-height="overlayTopMinHeight" :bottom-min-height="overlayBottomMinHeight"
          :responsive-min-stage-width="overlayResponsiveWidth" :split-gap="overlaySplitGap"
          :width-label="t('cardDesigner.layout.resizeLeftSidebar')" :width-tooltip="t('cardDesigner.layout.resizeSidebarTooltip', {
            label: t('cardDesigner.layout.resizeLeftSidebar'),
          })" :split-label="t('cardDesigner.layout.resizeLeftSplit')" @update:extent="updateDockExtent('left', $event)"
          @update:top-size="updateDockTopSize('left', $event)" @toggle-collapse="toggleDockCollapsed('left')"
          @resize-start="handleDockResizeStart" @resize-end="handleDockResizeEnd('left', $event)">
          <template #top>
            <OcCard fill variant="glass" :title="t('cardDesigner.panels.cardTree')" :actions="props.mode === 'diff' ? [] : instanceCardActions"
              :collapsed="!isInstancePanelExpanded" @action="handleInstanceCardAction">
              <OcPanel fill tone="transparent" border="none" padding="none" overflow="auto" align="stretch">
                <OcTree v-if="isInstancePanelExpanded" ref="instanceTreeRef" fill role="listbox"
                  data-cde-shortcut-scope="instance-tree" tab-navigation="none"
                  :data="props.mode === 'diff' ? diffInstanceTreeData : instanceTreeData"
                  :selected-keys="props.mode === 'diff' ? diffSelectedInstanceKeys : selectedCardKeys" selection-mode="multiple"
                  @selection-change="handleInstanceTreeSelection" @action="handleInstanceTreeAction"
                  @rename-commit="handleInstanceRenameCommit" @move="handleInstanceMove" />
              </OcPanel>
            </OcCard>
          </template>
          <template #bottom>
            <OcCard fill variant="glass" :title="t('cardDesigner.panels.preview')" :actions="previewCardActions" :collapsed="!isPreviewPanelExpanded"
              @action="handlePreviewCardAction">
              <OcPanel align="stretch" fill radius="none" tone="transparent" border="none" shadow="lg" padding="none">
                <div ref="transformPreviewHostRef" class="card-design-editor__transform-preview-host"
                  @wheel.prevent.stop="handlePreviewViewportWheel">
                  <div ref="transformPreviewViewportRef" class="card-design-editor__transform-preview-viewport"
                    :style="transformPreviewViewportStyle">
                    <CardFaceRenderer v-if="viewFace && renderResources" :face="viewFace" :clip-to-face="true"
                      :resource-context="renderResources" :style="transformPreviewRendererStyle" />
                    <button v-if="transformPreviewFrameStyle" type="button"
                      class="card-design-editor__transform-preview-frame"
                      :class="{ 'is-visible': isTransformPreviewFrameVisible, 'is-dragging': isPreviewViewportDragging }"
                      :style="transformPreviewFrameStyle" :aria-label="t('cardDesigner.canvas.moveViewport')"
                      :aria-hidden="!isTransformPreviewFrameVisible || undefined"
                      :tabindex="isTransformPreviewFrameVisible ? 0 : -1" @keydown="handlePreviewViewportKeydown"
                      @pointerdown="startPreviewViewportDrag" @pointermove="handlePreviewViewportDrag"
                      @pointerup="stopPreviewViewportDrag" @pointercancel="stopPreviewViewportDrag" />
                  </div>
                </div>
              </OcPanel>
            </OcCard>
          </template>
        </CdeOverlayDock>

        <CdeOverlayDock side="right" :extent="rightDockExtent" :collapsed-extent="overlayGeometryConfig.collapsedExtent"
          :min-extent="overlayGeometryConfig.minExtent" :max-extent="overlayGeometryConfig.maxExtent"
          :expand-drag-threshold="overlayGeometryConfig.expandDragThreshold"
          :collapse-drag-threshold="overlayGeometryConfig.collapseDragThreshold"
          :floating-gap="overlayGeometryConfig.floatingGap" :top-expanded="isStructureTreePanelExpanded"
          :bottom-expanded="isPropertyPanelExpanded" :top-size="rightSidebarTopHeight"
          :top-min-height="overlayTopMinHeight" :bottom-min-height="overlayBottomMinHeight"
          :responsive-min-stage-width="overlayResponsiveWidth" :split-gap="overlaySplitGap"
          :width-label="t('cardDesigner.layout.resizeRightSidebar')" :width-tooltip="t('cardDesigner.layout.resizeSidebarTooltip', {
            label: t('cardDesigner.layout.resizeRightSidebar'),
          })" :split-label="t('cardDesigner.layout.resizeRightSplit')" @update:extent="updateDockExtent('right', $event)"
          @update:top-size="updateDockTopSize('right', $event)" @toggle-collapse="toggleDockCollapsed('right')"
          @resize-start="handleDockResizeStart" @resize-end="handleDockResizeEnd('right', $event)">
          <template #top>
            <OcCard fill variant="glass" :title="t('cardDesigner.panels.structureTree')" :actions="props.mode === 'diff' ? [] : structureTreeCardActions"
              :collapsed="!isStructureTreePanelExpanded" @action="handleStructureTreeCardAction">
              <OcPanel align="stretch" fill tone="transparent" border="none" padding="none" overflow="auto">
                <OcTree ref="structureTreeRef" fill data-cde-shortcut-scope="structure-tree" tab-navigation="none"
                  :data="props.mode === 'diff' ? diffBlockTreeData : blockTreeData"
                  :selected-keys="props.mode === 'diff' ? diffSelectedBlockKeys : selectedBlockKeys"
                  :expanded-keys="expandedBlockKeys"
                  :selection-expansion-mode="forceStructureTreeReveal ? 'expand' : props.structureTreeSelectionBehavior ?? 'expand-exclusive'"
                  :scroll-to-selection="forceStructureTreeReveal || (props.structureTreeScrollToSelection ?? true)"
                  selection-mode="multiple" activation-mode="double-click"
                  @selection-change="handleStructureTreeSelection" @expansion-change="handleStructureTreeExpansion"
                  @expansion-sync="handleStructureTreeExpansionSync" @node-activate="handleStructureTreeNodeActivate"
                  @action="handleStructureTreeAction" @rename-commit="handleBlockRenameCommit"
                  @move="handleBlockMove" />
              </OcPanel>
            </OcCard>
          </template>
          <template #bottom>
            <OcCard fill variant="glass" :title="t('cardDesigner.panels.properties')" :actions="props.mode === 'diff' ? [] : propertyCardActions"
              :collapsed="!isPropertyPanelExpanded" @action="handlePropertyCardAction">
              <OcPanel fill tone="transparent" border="none" padding="none" overflow="auto">
                <OcEmpty v-if="isMultiBlockSelection" class="card-design-editor__multi-selection-summary">
                  {{ t('cardDesigner.selectionSummary.multipleBlocks', { count: effectiveSelectedBlockKeys.length }) }}
                </OcEmpty>
                <PropertyEditor v-else ref="propertyEditorRef"
                  :inputs="props.mode === 'diff' ? diffPropertyInputs : propertyEditorInputs"
                  :categories="propertyCategories" :sort-mode="propertySortMode"
                  :binding-interpreter="propertyBindingInterpreter" :delete-mode="propertyDeleteMode"
                  :field-warnings="propertyFieldWarnings" @update-property="updateBlockProp"
                  @add-property="addBlockProp" @reset-property="resetBlockProp" @delete-property="deleteProperty" />
              </OcPanel>
            </OcCard>
          </template>
        </CdeOverlayDock>

        <OcOverlayToolbar v-if="viewFace" class="card-design-editor__face-tools"
          :class="{ 'is-resizing': isDockResizing }" orientation="vertical" :style="faceToolsStyle" :label="t('cardDesigner.canvas.controls')"
          :items="props.mode === 'diff' ? diffFaceToolbarItems : faceToolbarItems" @select="handleFaceToolbarSelect" />
      </div>
    </div>

    <AdditionalFieldCreateDialog :open="additionalFieldCreateDialogOpen" :field-types="additionalFieldTypeOptions"
      :field-type="additionalFieldCreateDraft.fieldType" :field-key="additionalFieldCreateDraft.fieldKey"
      :title="additionalFieldCreateDraft.title" :error-text="additionalFieldCreateErrorText"
      :invalid="Boolean(additionalFieldCreateError)" @update-field-type="updateAdditionalFieldType"
      @update-field-key="updateAdditionalFieldKey" @update-title="updateAdditionalFieldTitle"
      @close="closeAdditionalFieldDialog" @submit="submitAdditionalFieldDialog" />
    <DataTableWorkbookImportDialog :result="pendingDataTableWorkbookImport" @cancel="cancelDataTableWorkbookImport"
      @confirm="confirmDataTableWorkbookImport" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { SessionNavigationToken } from '../editor-runtime/model/editorIssue'
import {
  getCardFieldDefinition,
  getBlockProperty,
  type AdditionalFieldDefinition,
  type CardBlock,
  type CardFaceKey,
  type FlowDirection,
} from '../../entities/card/model'
import { getBlockPresentation } from './blockPresentation'
import OcPanel from '../../components/base/OcPanel.vue'
import CardFaceRenderer from '../card-rendering/components/CardFaceRenderer.vue'
import CardViewport, {
  type CardViewportSelectionActionLabels,
  type CardViewportSelectionCommand,
  type CardViewportSelectionInfo,
  type CardViewportStatusFlash,
} from '../card-rendering/components/CardViewport.vue'
import { buildCardLayerGroups } from '../card-rendering/components/cardLayerModel'
import PropertyEditor from '../../shared/ui/property-editor/PropertyEditor.vue'
import AdditionalFieldCreateDialog from '../../shared/ui/property-editor/AdditionalFieldCreateDialog.vue'
import OcEmpty from '../../components/base/OcEmpty.vue'
import OcTree from '../../components/standard/OcTree.vue'
import type { OcActionButtonAction } from '../../components/standard/OcActionButton.vue'
import OcOverlayToolbar, {
  createViewportToolbarItems,
  type OcOverlayToolbarItem,
} from '../../components/standard/OcOverlayToolbar.vue'
import CdeOverlayDock from './CdeOverlayDock.vue'
import {
  CDE_OVERLAY_BOTTOM_MIN_HEIGHT,
  CDE_OVERLAY_GEOMETRY_CONFIG,
  CDE_OVERLAY_RESPONSIVE_WIDTH,
  CDE_OVERLAY_SPLIT_GAP,
  CDE_OVERLAY_TOP_MIN_HEIGHT,
} from './cdeOverlayConfig'
import { useCdeDocumentState } from './useCdeDocumentState'
import { useCdeInstanceOps } from './useCdeInstanceOps'
import { useCdeOverlayLayout } from './useCdeOverlayLayout'
import { useCdeDiffView } from './useCdeDiffView'
import { useCdePropertyEditorProjection } from './useCdePropertyEditorProjection'
import { useCdeDataTableCellProjection } from './useCdeDataTableCellProjection'
import {
  useCdePropertyPanelState,
  type CdeAdditionalFieldType,
  type CdePropertySortMode,
} from './useCdePropertyPanelState'
import { createBlockAddActions, useCdeTreeOps } from './useCdeTreeOps'
import CardDataTable from './CardDataTable.vue'
import DataTableWorkbookImportDialog from './DataTableWorkbookImportDialog.vue'
import { useCdeDataTableModel } from './useCdeDataTableModel'
import { useCdeDataTableCommands } from './useCdeDataTableCommands'
import { useCdeDataTableWorkbook } from './useCdeDataTableWorkbook'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import { useCdeRenderProjection } from './useCdeRenderProjection'
import { useCdeViewportCardInfo } from './useCdeViewportCardInfo'
import type { PreparedCardRender } from '../card-rendering/renderPipeline'
import {
  useCdeViewportController,
  type CdeViewportPort,
} from './useCdeViewportController'
import { useCdeSelectionCommands } from './useCdeSelectionCommands'
import {
  useCdeLayerViewInteraction,
  type CdeLayerViewPort,
} from './useCdeLayerViewInteraction'
import {
  formatCdeShortcutMarkup,
  getCdeShortcutParts,
  useCdeShortcuts,
  type CdeShortcutCommand,
} from './useCdeShortcuts'
import {
  useCdeBlockFieldCommands,
} from './useCdeBlockFieldCommands'
import type {
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeExpansionEvent,
  OcNodeExpansionSyncEvent,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import { isBlockContainer, isBlockPackaged, visitCardBlockTree } from '../../entities/card/tree'
import OcCard, { type OcCardAction } from '../../components/standard/OcCard.vue'
import type { CardDesignerViewState } from '../editor-runtime/model/editorUiState'
import { createCardDesignerIssueSnapshot } from './cardDesignerIssues'
import { isBindingExpression } from '../editor-runtime/model/binding'
import type { FilePathDirectoryProvider } from '../../shared/model/filePath'
import { useProjectStore } from '../workspace/store/projectStore'
import {
  cloneClipboardBlocksWithNewIds,
  createCardBlocksClipboard,
  getClipboardBlockPayloads,
} from '../../shared/model/clipboard/cardBlockClipboard'
import { readOcClipboard, writeOcClipboard } from '../../shared/model/clipboard/ocClipboardService'
import { fileSystemService } from '../workspace/services/fileSystemService'
import { createResourceDirectoryProvider } from '../workspace/services/resourceDirectoryProvider'
import {
  isCardDesignerNavigationToken,
  type CardDesignerNavigationResult,
  type CardDesignerNavigationToken,
} from './cardDesignerNavigation'

// 蓝图实例固定 ID
const BLUEPRINT_CARD_ID = '__blueprint__'
const EDIT_RICH_TEXT_ACTION_KEY = 'content.edit-rich-text'
const FLOW_DIRECTION_ACTIONS = [
  { key: 'flow.direction.left', direction: 'rl', icon: 'nav.arrow-left', titleKey: 'flowLeft' },
  { key: 'flow.direction.up', direction: 'bt', icon: 'nav.arrow-up', titleKey: 'flowUp' },
  { key: 'flow.direction.down', direction: 'tb', icon: 'nav.arrow-down', titleKey: 'flowDown' },
  { key: 'flow.direction.right', direction: 'lr', icon: 'nav.arrow-right', titleKey: 'flowRight' },
] as const satisfies readonly {
  key: string
  direction: FlowDirection
  icon: OcActionButtonAction['icon']
  titleKey: string
}[]

// 组件输入输出
const props = defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t, te, locale } = useI18n()
const projectStore = useProjectStore()
const settingsStore = useAppSettingsStore()
const propertyBindingInterpreter = { isExpression: isBindingExpression }

const editorRootRef = ref<HTMLElement | null>(null)
const overlayGeometryConfig = CDE_OVERLAY_GEOMETRY_CONFIG
const overlayTopMinHeight = CDE_OVERLAY_TOP_MIN_HEIGHT
const overlayBottomMinHeight = CDE_OVERLAY_BOTTOM_MIN_HEIGHT
const overlayResponsiveWidth = CDE_OVERLAY_RESPONSIVE_WIDTH
const overlaySplitGap = CDE_OVERLAY_SPLIT_GAP
const {
  editorShellStyle,
  ensurePanelsExpanded,
  commitDockExtent,
  commitLayout: commitOverlayLayout,
  isInstancePanelExpanded,
  isPreviewPanelExpanded,
  isPropertyPanelExpanded,
  isStructureTreePanelExpanded,
  leftDockExtent,
  leftSidebarTopHeight,
  rightDockExtent,
  rightSidebarTopHeight,
  toggleDockCollapsed,
  togglePanel,
  updateDockExtent,
  updateDockTopSize,
  viewportInsets,
} = useCdeOverlayLayout({
  layout: toRef(props, 'cardDesignerLayout'),
  geometryConfig: overlayGeometryConfig,
  topMinHeight: overlayTopMinHeight,
  commitLayout: layout => emit('update-card-designer-layout', layout),
})
const faceToolsStyle = computed(() => ({
  right: `${(viewportInsets.value.right ?? 0) + overlayGeometryConfig.floatingGap}px`,
  bottom: `${overlayGeometryConfig.floatingGap}px`,
}))
const isDockResizing = ref(false)

function handleDockResizeStart(): void {
  isDockResizing.value = true
}

function handleDockResizeEnd(side: 'left' | 'right', axis: 'width' | 'split'): void {
  isDockResizing.value = false
  if (axis === 'width') commitDockExtent(side)
  else commitOverlayLayout()
}

function handleDataTableCellSelect(payload: {
  faceKey: CardFaceKey
  cardId: string
  blockId: string
  fieldKey: string
}): void {
  activeFaceKey.value = payload.faceKey
  selectedCardId.value = payload.cardId
  selectedCardKeys.value = [payload.cardId]
}


// 文档与编辑器状态
const propertySortMode = ref<CdePropertySortMode>('category')
const propertyDeleteMode = ref(false)
const workspaceMode = computed(() => props.cardDesignerMode ?? 'design')
const renderContentReady = ref(false)
const hasRenderableViewport = computed(() => props.mode === 'diff'
  ? Boolean(props.comparison && diffBeforeRender.value && diffAfterRender.value)
  : Boolean(viewFace.value && renderResources.value))
const editorContentPending = computed(() => (
  workspaceMode.value === 'design' && hasRenderableViewport.value && !renderContentReady.value
))

function handleRenderReadinessChange(state: { revision: number; status: 'pending' | 'ready' }): void {
  if (state.status === 'ready') renderContentReady.value = true
}

const dataTableCustomFieldTargetBlockId = ref<string | null>(null)
const activeFaceKey = ref<CardFaceKey>(props.cardDesignerView?.activeFace ?? 'front')
const clipToFace = ref(props.cardDesignerView?.clipToFace ?? false)
const alignmentSnappingEnabled = ref(
  props.cardDesignerView?.alignmentSnappingEnabled
  ?? props.alignmentSnappingEnabledByDefault
  ?? true,
)

// 对比视图投影与对比选择：组件只留下「定位后如何揭示字段」的导航入口。
const {
  diffBeforeRender,
  diffAfterRender,
  diffViewportComparison,
  diffViewportInsets,
  diffBlockTreeData,
  diffInstanceTreeData,
  diffPropertyInputs,
  diffSelectedBlockKeys,
  diffSelectedInstanceKeys,
  diffInstanceIds,
  diffViewMode,
  hasDiffModel,
  resolveDiffBlock,
  handleDiffDividerChange,
  setDiffDividerPreset,
  toggleDiffViewMode,
} = useCdeDiffView({
  mode: toRef(props, 'mode'),
  comparison: toRef(props, 'comparison'),
  diffUiState: toRef(props, 'diffUiState'),
  renderEnvironment: projectStore.renderEnvironment,
  activeFaceKey,
  viewportInsets,
  blueprintCardId: BLUEPRINT_CARD_ID,
  translate: messageKey => t(messageKey),
  hasMessage: messageKey => te(messageKey),
  flashStatus: status => cardViewportRef.value?.flashStatus?.(status),
  emitDiffUiState: state => emit('update-diff-ui-state', state),
})

function createViewState(): CardDesignerViewState {
  return {
    activeFace: activeFaceKey.value,
    clipToFace: clipToFace.value,
    alignmentSnappingEnabled: alignmentSnappingEnabled.value,
    selectedInstanceId: selectedCardId.value === BLUEPRINT_CARD_ID
      ? null
      : selectedCardId.value,
    selectedBlockIdsByFace: selectedBlockIdsByFace.value,
  }
}

function commitViewState(): void {
  emit('update-card-designer-view', createViewState())
}

const clipAction = computed<OcActionButtonAction>(() => ({
  key: 'toggle-face-clip',
  icon: clipToFace.value ? 'tool.box-cutter' : 'tool.box-cutter-off',
  title: `${clipToFace.value
    ? t('cardDesigner.view.disableClip')
    : t('cardDesigner.view.enableClip')} ${formatCdeShortcutMarkup('view.toggle-clip')}`,
}))

const alignmentSnappingAction = computed<OcActionButtonAction>(() => ({
  key: 'toggle-alignment-snapping',
  icon: alignmentSnappingEnabled.value ? 'tool.snap-grid-on' : 'tool.snap-grid',
  title: `${alignmentSnappingEnabled.value
    ? t('cardDesigner.view.disableAlignmentSnapping')
    : t('cardDesigner.view.enableAlignmentSnapping')} ${formatCdeShortcutMarkup('view.toggle-snapping')}`,
}))

const faceSwitchAction = computed<OcActionButtonAction>(() => ({
  key: 'switch-face',
  icon: activeFaceKey.value === 'front'
    ? 'tool.flip-to-front'
    : 'tool.flip-to-back',
  title: `${activeFaceKey.value === 'front'
    ? t('cardDesigner.view.switchToBack')
    : t('cardDesigner.view.switchToFront')} ${formatCdeShortcutMarkup('view.switch-face')}`,
}))

const faceToolbarItems = computed<readonly OcOverlayToolbarItem[]>(() => [
  ...createViewportToolbarItems(viewportScaleLabel.value, {
    zoomOut: `${t('cardDesigner.shortcuts.zoomOut')} ${formatCdeShortcutMarkup('viewport.zoom-out')}`,
    fit: `${t('cardDesigner.shortcuts.fitViewport')} ${formatCdeShortcutMarkup('viewport.fit')}`,
    zoomIn: `${t('cardDesigner.shortcuts.zoomIn')} ${formatCdeShortcutMarkup('viewport.zoom-in')}`,
  }),
  { type: 'divider', key: 'viewport-actions' },
  {
    ...alignmentSnappingAction.value,
    active: alignmentSnappingEnabled.value,
    variant: alignmentSnappingEnabled.value ? 'soft' : 'ghost',
  },
  {
    ...clipAction.value,
    active: clipToFace.value,
    variant: clipToFace.value ? 'soft' : 'ghost',
  },
  faceSwitchAction.value,
])
const diffViewModeAction = computed<OcOverlayToolbarItem>(() => ({
  key: 'toggle-diff-view-mode',
  icon: 'layout.columns',
  title: diffViewMode.value === 'split'
    ? `${t('sidebar.diffViewer.switchToSideBySide')} ${formatCdeShortcutMarkup('view.toggle-diff-mode')}`
    : `${t('sidebar.diffViewer.switchToSplit')} ${formatCdeShortcutMarkup('view.toggle-diff-mode')}`,
  active: diffViewMode.value === 'side-by-side',
  variant: diffViewMode.value === 'side-by-side' ? 'soft' : 'ghost',
}))
const diffFaceToolbarItems = computed<readonly OcOverlayToolbarItem[]>(() => [
  diffViewModeAction.value,
  faceSwitchAction.value,
])

function handleFaceToolbarSelect({ key }: { key: string }): void {
  if (key === 'viewport.zoom-out') zoomViewportOut()
  else if (key === 'viewport.fit') fitViewport()
  else if (key === 'viewport.zoom-in') zoomViewportIn()
  else if (key === 'toggle-alignment-snapping') toggleAlignmentSnapping()
  else if (key === 'toggle-face-clip') toggleFaceClip()
  else if (key === 'toggle-diff-view-mode') toggleDiffViewMode()
  else if (key === 'switch-face') toggleActiveFace()
}

function toggleFaceClip(): void {
  clipToFace.value = !clipToFace.value
  commitViewState()
  cardViewportRef.value?.flashStatus?.({
    icon: clipToFace.value ? 'tool.box-cutter' : 'tool.box-cutter-off',
    message: clipToFace.value
      ? t('cardDesigner.viewportStatus.clipEnabled')
      : t('cardDesigner.viewportStatus.clipDisabled'),
  })
}

function toggleAlignmentSnapping(): void {
  alignmentSnappingEnabled.value = !alignmentSnappingEnabled.value
  commitViewState()
  cardViewportRef.value?.flashStatus?.({
    icon: alignmentSnappingEnabled.value ? 'tool.snap-grid-on' : 'tool.snap-grid',
    message: alignmentSnappingEnabled.value
      ? t('cardDesigner.viewportStatus.snappingEnabled')
      : t('cardDesigner.viewportStatus.snappingDisabled'),
  })
}

function toggleActiveFace(): void {
  activeFaceKey.value = activeFaceKey.value === 'front' ? 'back' : 'front'
  forceStructureTreeReveal.value = false
  commitViewState()
  cardViewportRef.value?.flashStatus?.({
    icon: activeFaceKey.value === 'front' ? 'tool.flip-to-front' : 'tool.flip-to-back',
    message: activeFaceKey.value === 'front'
      ? t('cardDesigner.viewportStatus.switchedToFront')
      : t('cardDesigner.viewportStatus.switchedToBack'),
  })
}

type CardViewportHandle = CdeViewportPort & CdeLayerViewPort & {
  flashStatus?: (status: CardViewportStatusFlash) => void
}

type PropertyEditorHandle = {
  revealField: (inputKey: string, fieldKey: string, characterOffset?: number) => Promise<boolean>
  activateField: (inputKey: string, fieldKey: string) => Promise<boolean>
}

type CardDataTableHandle = {
  revealCell: (
    cardId: string,
    blockId: string,
    fieldKey: string,
    characterOffset?: number,
  ) => Promise<boolean>
}

const cardViewportRef = ref<CardViewportHandle | null>(null)
const propertyEditorRef = ref<PropertyEditorHandle | null>(null)
const cardDataTableRef = ref<CardDataTableHandle | null>(null)
const instanceTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
const structureTreeRef = ref<{ beginRename: (key: string) => Promise<void> } | null>(null)
const loadedFilePath = ref<string | null>(null)

function createPanelToggleAction(key: string, expanded: boolean): OcCardAction {
  return {
    key,
    icon: expanded ? 'nav.chevron-down' : 'nav.chevron-up',
    title: expanded ? t('cardDesigner.panelActions.collapse') : t('cardDesigner.panelActions.expand'),
  }
}

// 当前选择状态
const selectedBlockIdsByFace = ref<Record<CardFaceKey, string[]>>({
  front: [...(props.cardDesignerView?.selectedBlockIdsByFace?.front ?? [])],
  back: [...(props.cardDesignerView?.selectedBlockIdsByFace?.back ?? [])],
})
function sameBlockSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}
const selectedBlockKeys = computed<string[]>({
  get: () => selectedBlockIdsByFace.value[activeFaceKey.value],
  set: keys => {
    if (sameBlockSelection(selectedBlockIdsByFace.value[activeFaceKey.value], keys)) return
    selectedBlockIdsByFace.value = {
      ...selectedBlockIdsByFace.value,
      [activeFaceKey.value]: [...keys],
    }
    commitViewState()
  },
})
const effectiveSelectedBlockKeys = computed(() => props.mode === 'diff' ? diffSelectedBlockKeys.value : selectedBlockKeys.value)
const isMultiBlockSelection = computed(() => effectiveSelectedBlockKeys.value.length > 1)
const selectedCardKeys = ref<string[]>([])
const selectedCardId = ref<string | null>(
  props.cardDesignerView?.selectedInstanceId ?? BLUEPRINT_CARD_ID,
)
const forceStructureTreeReveal = ref(false)

// 文档状态与读写协议。
const {
  rawContent,
  cardDoc,
  documentRevision,
  parentLookup,
  markDocumentChanged,
  refreshDocumentState,
  flushPendingChanges,
  loadRawDoc,
  saveFile: saveDocumentFile,
} = useCdeDocumentState({
  emitModelValueUpdate: (content, history) => {
    if (props.mode !== 'diff') emit('update:modelValue', content, history)
  },
  emitModified: (modified) => {
    if (props.mode !== 'diff') emit('modified', modified)
  },
  emitSave: () => {
    if (props.mode !== 'diff') emit('save')
  },
  resetSelection: () => {
    selectedBlockIdsByFace.value = { front: [], back: [] }
    selectedCardKeys.value = []
    selectedCardId.value = props.cardDesignerView?.selectedInstanceId ?? BLUEPRINT_CARD_ID
  },
})

const activeFace = computed(() => cardDoc.value?.faces[activeFaceKey.value] ?? null)

const blockFieldCommands = useCdeBlockFieldCommands({
  cardDoc,
  blueprintCardId: BLUEPRINT_CARD_ID,
  refreshDocumentState,
  markDocumentChanged,
})

const {
  createField: createDataTableField,
  applyWorkbookImport: applyDataTableWorkbookImport,
  deleteField: deleteDataTableField,
  excludeField: excludeDataTableField,
  fieldSelection: dataTableFields,
  exportInstanceIds: dataTableExportInstanceIds,
  includeBlock: includeDataTableBlock,
  includeField: includeDataTableField,
  removeBlock: removeDataTableBlock,
  resetCell: resetDataTableCell,
  setInstanceExported: setDataTableInstanceExported,
  updateCell: updateDataTableCell,
} = useCdeDataTableCommands({
  cardDoc,
  documentRevision,
  blueprintCardId: BLUEPRINT_CARD_ID,
  refreshDocumentState,
  markDocumentChanged,
  updateBlockField: blockFieldCommands.updateField,
  resetBlockField: blockFieldCommands.resetField,
  createBlockField: blockFieldCommands.createField,
  deleteBlockField: blockFieldCommands.deleteField,
})

const {
  columns: dataTableColumns,
  catalogFaceGroups: dataTableCatalogFaceGroups,
  faceGroups: dataTableFaceGroups,
} = useCdeDataTableModel({
  cardDoc,
  documentRevision,
  fieldSelection: dataTableFields,
  exportInstanceIds: dataTableExportInstanceIds,
  blueprintCardId: BLUEPRINT_CARD_ID,
  blueprintTitle: () => t('cardDesigner.dataTable.blueprint'),
  faceTitle: faceKey => t(`cardDesigner.info.${faceKey}`),
  translate: messageKey => t(messageKey),
  hasMessage: messageKey => te(messageKey),
})

const appSettingsStore = useAppSettingsStore()

const {
  busy: dataTableWorkbookBusy,
  canExport: canExportDataTableWorkbook,
  pendingImport: pendingDataTableWorkbookImport,
  exportWorkbook: exportDataTableWorkbook,
  importWorkbook: importDataTableWorkbook,
  confirmImport: confirmDataTableWorkbookImport,
  cancelImport: cancelDataTableWorkbookImport,
} = useCdeDataTableWorkbook({
  cardDoc,
  columns: dataTableColumns,
  faceGroups: dataTableFaceGroups,
  exportInstanceIds: dataTableExportInstanceIds,
  flushPendingChanges,
  applyImport: applyDataTableWorkbookImport,
  openAfterExport: computed(() => appSettingsStore.settings.value.exporting.openCdeWorkbookAfterExport),
  translate: (key, parameters) => t(key, parameters ?? {}),
})

// 实例树与实例编辑协议。
const {
  selectedCard,
  instanceTreeData,
  handleInstanceSelection,
  handleInstanceAction,
  handleInstanceRenameCommit,
  handleInstanceMove,
  createInstance,
  renameInstance,
  duplicateInstance,
  deleteInstance,
} = useCdeInstanceOps({
  cardDoc,
  blueprintCardId: BLUEPRINT_CARD_ID,
  selectedCardId,
  selectedCardKeys,
  documentRevision,
  translate: messageKey => t(messageKey),
  refreshDocumentState,
  markDocumentChanged,
})

function duplicateDataTableCard(cardId: string): void {
  if (cardId === BLUEPRINT_CARD_ID) createInstance()
  else duplicateInstance(cardId)
}

function openDataTableFieldDialog(blockId: string): void {
  dataTableCustomFieldTargetBlockId.value = openAdditionalFieldCreateDialog(blockId, BLUEPRINT_CARD_ID)
    ? blockId
    : null
}

function closeAdditionalFieldDialog(): void {
  dataTableCustomFieldTargetBlockId.value = null
  closeAdditionalFieldCreateDialog()
}

function submitAdditionalFieldDialog(definition: AdditionalFieldDefinition): void {
  const blockId = dataTableCustomFieldTargetBlockId.value
  if (!blockId) {
    submitAdditionalFieldCreate(definition)
    return
  }
  const result = createDataTableField({
    blockId,
    fieldKey: additionalFieldCreateDraft.value.fieldKey,
    definition,
  })
  if (result) return
  dataTableCustomFieldTargetBlockId.value = null
  closeAdditionalFieldCreateDialog()
}

const canMutateSelectedInstance = computed(() => selectedCardKeys.value.some(
  key => key !== BLUEPRINT_CARD_ID && instanceTreeData.value.items.has(key),
))

function handleInstanceTreeSelection(event: OcNodeSelectionEvent): void {
  if (props.mode === 'diff') {
    diffSelectedInstanceKeys.value = event.selectedKeys.length > 0
      ? [...event.selectedKeys]
      : [BLUEPRINT_CARD_ID]
    return
  }
  handleInstanceSelection(event)
}

function handleInstanceTreeAction(event: OcNodeActionEvent): void {
  handleInstanceAction(event)
  if (event.actionKey === 'rename') void instanceTreeRef.value?.beginRename(event.key)
}

const instanceCardActions = computed<OcCardAction[]>(() => [
  {
    key: 'add-instance',
    icon: 'action.add',
    title: t('cardDesigner.dataTable.addInstance'),
  },
  {
    key: 'duplicate-instance',
    icon: 'action.copy',
    title: t('cardDesigner.dataTable.duplicateInstance'),
    disabled: !canMutateSelectedInstance.value,
  },
  {
    key: 'delete-instance',
    icon: 'action.delete',
    title: t('cardDesigner.dataTable.deleteInstance'),
    disabled: !canMutateSelectedInstance.value,
  },
  createPanelToggleAction('toggle-instance-panel', isInstancePanelExpanded.value),
])

const previewCardActions = computed<OcCardAction[]>(() => [
  createPanelToggleAction('toggle-preview-panel', isPreviewPanelExpanded.value),
])

const propertyCardActions = computed<OcCardAction[]>(() => {
  const panelToggle = createPanelToggleAction('toggle-property-panel', isPropertyPanelExpanded.value)
  if (isMultiBlockSelection.value) return [panelToggle]
  return [
    ...(canCreateAdditionalField.value
      ? [{
        key: 'additional-field.create',
        icon: 'action.add' as const,
        title: t('propertyEditor.customFields.create'),
      }]
      : []),
    {
      key: 'toggle-property-delete-mode',
      icon: 'action.delete',
      iconTone: propertyDeleteMode.value ? 'danger' : 'default',
      title: t('propertyEditor.actions.delete'),
    },
    {
      key: 'toggle-property-sort',
      icon: propertySortMode.value === 'category'
        ? 'action.sort-alphabetical-ascending'
        : 'action.sort-category',
      title: propertySortMode.value === 'category'
        ? t('propertyEditor.actions.switchToAlphabetical')
        : t('propertyEditor.actions.switchToCategory'),
    },
    panelToggle,
  ]
})

function triggerInstanceAction(actionKey: 'add-instance' | 'duplicate-instance' | 'delete-instance') {
  const selectedKey = selectedCardKeys.value[0]
  if (actionKey === 'add-instance') createInstance()
  else if (actionKey === 'duplicate-instance' && selectedKey) duplicateInstance(selectedKey)
  else if (actionKey === 'delete-instance' && selectedKey) deleteInstance(selectedKey)
}

function handleInstanceCardAction(payload: { key: string }) {
  if (payload.key === 'toggle-instance-panel') {
    togglePanel('instance')
    return
  }

  if (
    payload.key !== 'add-instance' &&
    payload.key !== 'duplicate-instance' &&
    payload.key !== 'delete-instance'
  ) {
    return
  }

  triggerInstanceAction(payload.key)
}

function handlePreviewCardAction(payload: { key: string }) {
  if (payload.key === 'toggle-preview-panel') {
    togglePanel('preview')
  }
}

function handlePropertyCardAction(payload: { key: string }) {
  if (payload.key === 'additional-field.create') {
    openAdditionalFieldCreateDialog()
    return
  }

  if (payload.key === 'toggle-property-panel') {
    togglePanel('property')
    return
  }

  if (payload.key === 'toggle-property-delete-mode') {
    propertyDeleteMode.value = !propertyDeleteMode.value
    return
  }

  if (payload.key === 'toggle-property-sort') {
    propertySortMode.value = propertySortMode.value === 'category' ? 'alphabetical' : 'category'
  }
}

// 结构树与块编辑协议。
const {
  blockTreeData,
  selectedBlock,
  selectedLocation,
  handleBlockSelection,
  handleBlockAction,
  handleBlockRenameCommit,
  handleBlockMove,
  selectBlockKeys,
  handleRootAction,
  handleViewportBlockClick: selectViewportBlock,
  resolveVisibleBlockKey,
  clearSelection,
  getBlockById,
  exportSelectedBlockPayloads,
  pasteBlockPayloads,
} = useCdeTreeOps({
  activeFace,
  cardDoc,
  documentRevision,
  parentLookup,
  selectedBlockKeys,
  getDefaultBlockName: type => t(`cardDesigner.blockNames.${type}`),
  translate: messageKey => t(messageKey),
  refreshDocumentState,
  markDocumentChanged,
})

async function copySelectedBlocks(): Promise<void> {
  const payloads = exportSelectedBlockPayloads()
  if (payloads.length === 0) return
  await writeOcClipboard(createCardBlocksClipboard(payloads, {
    documentId: cardDoc.value?.id,
    sessionId: props.sessionId,
    faceKey: activeFaceKey.value,
  }))
}

async function pasteClipboardBlocks(): Promise<void> {
  const envelope = await readOcClipboard()
  if (!envelope) return
  const cloned = cloneClipboardBlocksWithNewIds(getClipboardBlockPayloads(envelope))
  const pastedIds = pasteBlockPayloads(cloned)
  if (pastedIds.length === 0) return
  commitViewState()
}
function clearEffectiveBlockSelection(): void {
  if (props.mode === 'diff') diffSelectedBlockKeys.value = []
  else clearSelection()
}

/** 画布选中块：对比模式只写对比选择 编辑模式照旧写文档选择。 */
function handleEffectiveViewportBlockClick(blockId: string): void {
  if (props.mode === 'diff') {
    diffSelectedBlockKeys.value = [blockId]
    void nextTick(() => editorRootRef.value?.focus({ preventScroll: true }))
    return
  }
  handleViewportBlockClick(blockId)
}

const expandedBlockKeys = ref<string[]>([])

async function handleStructureTreeAction(event: OcNodeActionEvent): Promise<void> {
  if (event.actionKey === 'copy-block' || event.actionKey === 'paste-block') {
    if (!selectedBlockKeys.value.includes(event.key)) selectBlockKeys([event.key])
    if (event.actionKey === 'copy-block') await copySelectedBlocks()
    else await pasteClipboardBlocks()
    return
  }
  handleBlockAction(event)
  if (event.actionKey === 'rename') {
    void structureTreeRef.value?.beginRename(event.key)
    return
  }
  if (event.actionKey.startsWith('add-')) toggleBlockExpansion(event.key, true)
}

function handleStructureTreeSelection(event: OcNodeSelectionEvent): void {
  if (props.mode === 'diff') diffSelectedBlockKeys.value = event.selectedKeys
  else handleBlockSelection(event)
}

function handleStructureTreeExpansion(event: OcNodeExpansionEvent): void {
  toggleBlockExpansion(event.key, event.expanded)
}

function handleStructureTreeExpansionSync(event: OcNodeExpansionSyncEvent): void {
  expandedBlockKeys.value = event.expandedKeys
}

function handleStructureTreeNodeActivate(event: OcNodeActivateEvent): void {
  if (props.mode === 'diff') return
  if ((blockTreeData.value.children.get(event.key)?.length ?? 0) === 0) return
  toggleBlockExpansion(event.key, !expandedBlockKeys.value.includes(event.key))
}

function toggleBlockExpansion(key: string, expanded: boolean): void {
  const nextKeys = new Set(expandedBlockKeys.value)
  if (expanded) nextKeys.add(key)
  else nextKeys.delete(key)
  expandedBlockKeys.value = [...nextKeys]
}

const structureTreeCardActions = computed<OcCardAction[]>(() => [
  {
    key: 'add-root',
    icon: 'action.add',
    title: t('cardDesigner.blockActions.addRoot'),
    children: createBlockAddActions(messageKey => t(messageKey)),
  },
  {
    key: 'duplicate-selected',
    icon: 'action.copy',
    title: t('cardDesigner.blockActions.duplicateSelected'),
    shortcut: getCdeShortcutParts('block.duplicate'),
    disabled: !selectedBlock.value,
  },
  {
    key: 'delete-selected',
    icon: 'action.delete',
    title: t('cardDesigner.blockActions.deleteSelected'),
    shortcut: getCdeShortcutParts('block.delete'),
    disabled: selectedBlockKeys.value.length === 0,
  },
  createPanelToggleAction('toggle-structure-tree-panel', isStructureTreePanelExpanded.value),
])

async function handleStructureTreeCardAction(payload: { key: string }): Promise<void> {
  if (payload.key === 'toggle-structure-tree-panel') {
    togglePanel('structure')
    return
  }

  handleRootAction(payload.key)
}

// 当前选择派生信息
const {
  propertyInputs: rawPropertyInputs,
  propertyCategories,
  canCreateAdditionalField,
  additionalFieldCreateDialogOpen,
  additionalFieldCreateDraft,
  additionalFieldCreateError,
  additionalFieldTypeOptions,
  updateProperty: updateBlockProp,
  addProperty: addBlockProp,
  resetProperty: resetBlockProp,
  openAdditionalFieldCreateDialog,
  closeAdditionalFieldCreateDialog,
  submitAdditionalFieldCreate,
  deleteProperty,
} = useCdePropertyPanelState({
  cardDoc,
  activeFace,
  selectedLocation,
  selectedBlock,
  selectedCard,
  selectedCardId,
  documentRevision,
  blueprintCardId: BLUEPRINT_CARD_ID,
  refreshDocumentState,
  markDocumentChanged,
  translate: (messageKey) => t(messageKey),
  hasMessage: (messageKey) => te(messageKey),
})

const propertyProjectContext = computed(() => ({
  fonts: projectStore.projectFonts.value,
  information: projectStore.resolvedProject.value,
  dictionary: projectStore.resolvedDictionary.value,
  iconSeries: projectStore.projectIconSeries.value,
  projectIconCatalog: projectStore.projectIconCatalog.value,
  resourceEnvironment: projectStore.projectResourceEnvironment.value,
}))
const propertyDirectoryProvider = computed<FilePathDirectoryProvider | undefined>(() => {
  const rootPath = props.resourceRootPath
  return rootPath
    ? createResourceDirectoryProvider(
        rootPath,
        projectStore.projectResourceEnvironment.value,
        fileSystemService,
        {
          hideDotFiles: settingsStore.settings.value.workspace.hideDotFiles,
          iconEntryLabel: t('projectConfig.icons.title'),
        },
      )
    : undefined
})
const { propertyEditorInputs } = useCdePropertyEditorProjection({
  cardDoc,
  documentRevision,
  activeFaceKey,
  selectedCardId,
  selectedBlock,
  parentLookup,
  rawPropertyInputs,
  projectContext: propertyProjectContext,
  directoryProvider: propertyDirectoryProvider,
  blueprintCardId: BLUEPRINT_CARD_ID,
  translate: (messageKey, parameters) => parameters ? t(messageKey, parameters) : t(messageKey),
  hasMessage: messageKey => te(messageKey),
})
const { getDataTableCellDefinition } = useCdeDataTableCellProjection({
  cardDoc,
  documentRevision,
  parentLookup,
  projectContext: propertyProjectContext,
  directoryProvider: propertyDirectoryProvider,
  locale,
  blueprintCardId: BLUEPRINT_CARD_ID,
  translate: (messageKey, parameters) => parameters ? t(messageKey, parameters) : t(messageKey),
  hasMessage: messageKey => te(messageKey),
})

const additionalFieldCreateErrorText = computed(() => {
  const error = additionalFieldCreateError.value
  if (!error || error === 'invalid-target') return ''
  const messageKey = `propertyEditor.customFields.errors.${error}`
  return te(messageKey) ? t(messageKey) : error
})

function updateAdditionalFieldType(value: string): void {
  additionalFieldCreateDraft.value.fieldType = value as CdeAdditionalFieldType
}

function updateAdditionalFieldKey(value: string): void {
  additionalFieldCreateDraft.value.fieldKey = value
}

function updateAdditionalFieldTitle(value: string): void {
  additionalFieldCreateDraft.value.title = value
}

const selectedLocationType = computed<'simple-container-location' | 'flow-container-location' | null>(() => {
  return selectedLocation.value?.type ?? null
})
const selectedAnchor = computed(() => {
  return selectedLocation.value?.type === 'simple-container-location' ? selectedLocation.value.anchor : null
})
const selectedParentBlockId = computed(() => {
  const block = selectedBlock.value
  if (!block) {
    return null
  }

  const parent = parentLookup.value.get(block.id)
  return parent?.type === 'card-face' ? null : parent?.id ?? null
})
const selectedParentFlowDirection = computed(() => {
  const block = selectedBlock.value
  if (!block) return null
  const parent = parentLookup.value.get(block.id)
  return parent?.type === 'flow-container-block' ? parent.direction : null
})
const selectedFlowAlign = computed(() => (
  selectedLocation.value?.type === 'flow-container-location' ? selectedLocation.value.align : null
))
const selectionActionLabels = computed<CardViewportSelectionActionLabels>(() => ({
  label: t('cardDesigner.selectionActions.label'),
  fillParent: t('cardDesigner.selectionActions.fillParent'),
  centerInParent: t('cardDesigner.selectionActions.centerInParent'),
  inset: t('cardDesigner.selectionActions.inset'),
  outset: t('cardDesigner.selectionActions.outset'),
  fillCrossAxis: t('cardDesigner.selectionActions.fillCrossAxis'),
  centerCrossAxis: t('cardDesigner.selectionActions.centerCrossAxis'),
}))
const selectionCommandActions = computed<OcActionButtonAction[]>(() => {
  const block = selectedBlock.value
  if (!block) return []
  const actions: OcActionButtonAction[] = []
  if (block.type === 'flow-container-block') {
    actions.push(...FLOW_DIRECTION_ACTIONS.map(action => ({
      key: action.key,
      icon: action.icon,
      iconTone: block.direction === action.direction ? 'primary' : 'default',
      title: t(`cardDesigner.selectionActions.${action.titleKey}`),
    } satisfies OcActionButtonAction)))
  }

  const input = propertyEditorInputs.value.find(candidate => candidate.key === block.id)
  const definition = input?.fields.content ?? getCardFieldDefinition(block, 'content')
  if (
    definition?.fieldType !== 'string'
    || !definition.richText
    || definition.isReadonly
    || isBindingExpression(input?.record.content)
  ) return actions

  actions.push({
    key: EDIT_RICH_TEXT_ACTION_KEY,
    icon: 'format.text-variant-outline',
    title: t('cardDesigner.selectionActions.editRichText'),
  })
  return actions
})

async function handleSelectionCommand(intent: CardViewportSelectionCommand): Promise<void> {
  const block = selectedBlock.value
  if (!block || block.id !== intent.blockId) return

  const flowDirectionAction = FLOW_DIRECTION_ACTIONS.find(action => action.key === intent.key)
  if (flowDirectionAction) {
    if (block.type !== 'flow-container-block' || block.direction === flowDirectionAction.direction) return
    blockFieldCommands.updateField({
      cardId: selectedCardId.value ?? BLUEPRINT_CARD_ID,
      blockId: block.id,
      fieldKey: 'direction',
    }, flowDirectionAction.direction, 'action')
    return
  }

  if (intent.key !== EDIT_RICH_TEXT_ACTION_KEY) return

  ensurePanelsExpanded(['property'])
  await nextTick()
  await propertyEditorRef.value?.activateField(block.id, 'content')
}
const layerViewShortcutHints = computed(() => [
  {
    keys: [
      { icon: 'input.mouse-scroll-wheel' as const },
      { separator: t('cardDesigner.layerView.shortcutOr') },
      '↑ / ↓',
    ],
    label: t('cardDesigner.layerView.stepPlane'),
  },
  {
    keys: [
      { icon: 'input.keyboard-shift' as const },
      { icon: 'input.mouse-scroll-wheel' as const },
      { separator: t('cardDesigner.layerView.shortcutOr') },
      '↑ / ↓',
    ],
    label: t('cardDesigner.layerView.stepLayer'),
  },
  {
    keys: ['A-Z'],
    label: t('cardDesigner.layerView.cycleByInitial'),
  },
  {
    keys: [{ icon: 'input.keyboard-shift' as const }, 'A-Z'],
    label: t('cardDesigner.layerView.cycleCurrentLayer'),
  },
  {
    keys: [{ icon: 'input.keyboard-space' as const }],
    label: t('cardDesigner.layerView.selectFocused'),
  },
  {
    keys: [
      { icon: 'input.keyboard-space' as const },
      { icon: 'input.mouse-scroll-wheel' as const },
      { separator: t('cardDesigner.layerView.shortcutOr') },
      '↑ / ↓',
    ],
    label: t('cardDesigner.layerView.adjustZIndex'),
  },
  {
    keys: [
      { icon: 'input.keyboard-shift' as const },
      { icon: 'input.keyboard-space' as const },
      { icon: 'input.mouse-scroll-wheel' as const },
      { separator: t('cardDesigner.layerView.shortcutOr') },
      '↑ / ↓',
    ],
    label: t('cardDesigner.layerView.switchExistingLayer'),
  },
])
const transformDisabledBlockIds = computed(() => {
  const block = selectedBlock.value
  if (!block) {
    return []
  }

  const ids: string[] = []
  let current: CardBlock | null = block
  while (current) {
    ids.push(current.id)
    const parent = parentLookup.value.get(current.id)
    if (!parent || parent.type === 'card-face') {
      break
    }
    current = parent
  }
  return ids
})
const renderTargetInstance = computed(() => (
  selectedCardId.value === BLUEPRINT_CARD_ID ? null : selectedCard.value ?? null
))

const renderEnvironment = computed(() => ({
  ...projectStore.renderEnvironment.value,
}))
const renderResourceRootPath = computed(() => props.resourceRootPath ?? null)
const renderSourceFilePath = computed(() => props.filePath?.startsWith('draft://') ? null : props.filePath ?? null)
const {
  findViewBlock,
  renderPipelineResult,
  renderResources,
  viewDocument: viewDoc,
  viewFace,
} = useCdeRenderProjection({
  cardDoc,
  documentRevision,
  instance: renderTargetInstance,
  activeFaceKey,
  resourceRootPath: renderResourceRootPath,
  sourceFilePath: renderSourceFilePath,
  renderEnvironment,
})

const viewportFaceSize = computed(() => {
  const face = viewFace.value
  return face ? { width: face.width, height: face.height } : null
})
const {
  completeFileLoad,
  fitBottomRightHalfViewport,
  fitViewport,
  handlePreviewViewportDrag,
  handlePreviewViewportKeydown,
  handlePreviewViewportWheel,
  handleViewportSizeChange,
  handleViewportTransformChange,
  isPreviewViewportDragging,
  isTransformPreviewFrameVisible,
  prepareForFileChange,
  startPreviewViewportDrag,
  stopPreviewViewportDrag,
  transformPreviewFrameStyle,
  transformPreviewHostRef,
  transformPreviewRendererStyle,
  transformPreviewViewportRef,
  transformPreviewViewportStyle,
  viewportScaleLabel,
  viewportTransform,
  zoomViewportIn,
  zoomViewportOut,
} = useCdeViewportController({
  faceSize: viewportFaceSize,
  viewportPort: cardViewportRef,
  commitTransform: transform => emit('update-viewport-transform', transform),
})

watch(workspaceMode, async mode => {
  await nextTick()
  if (mode === 'data-table') fitBottomRightHalfViewport()
  else if (mode === 'design') fitViewport()
})


const availableLayerZIndices = computed(() => (
  viewFace.value
    ? buildCardLayerGroups(viewFace.value).map(layer => layer.zIndex)
    : []
))
const {
  applySelectionLayout: handleSelectionAction,
  changeFaceDimension: handleFaceDimensionChange,
  changeSelectionZIndex,
  moveSelection: handleSelectionMove,
  resizeSelection: handleSelectionResize,
} = useCdeSelectionCommands({
  cardDoc,
  parentLookup,
  availableLayerZIndices,
  refreshDocumentState,
  markDocumentChanged,
})

const interactionSelectedBlockId = computed(() => selectedBlock.value?.id ?? null)
const hasRenderableFace = computed(() => viewFace.value !== null)
const layerViewAvailable = computed(() => props.mode !== 'diff' && hasRenderableFace.value)
const {
  handleCanvasPointerDown,
  handleLayerZIndexStep,
  handleRootKeydown,
  handleViewportBlockClick,
  layerViewActive,
  spaceHeld,
} = useCdeLayerViewInteraction({
  rootElement: editorRootRef,
  layerViewAvailable,
  selectedBlockId: interactionSelectedBlockId,
  viewportPort: cardViewportRef,
  selectBlock: selectViewportBlock,
  changeZIndex: changeSelectionZIndex,
})

const layerViewAtomicBlockIds = computed(() => {
  const ids: string[] = []
  for (const child of activeFace.value?.children ?? []) {
    visitCardBlockTree(child.block, block => {
      if (isBlockContainer(block) && isBlockPackaged(block)) ids.push(block.id)
    })
  }
  return ids
})

const cdeShortcutCommands = [
  ...(['fill-parent', 'center', 'inset', 'outset'] as const).map(actionKey => ({
    key: `selection.${actionKey}` as const,
    scopes: ['canvas', 'structure-tree'] as const,
    canRun: () => workspaceMode.value === 'design' && selectedLocationType.value === 'simple-container-location' && Boolean(selectedBlock.value),
    run: () => { void cardViewportRef.value?.runSelectionQuickAction(actionKey) },
  })),
  ...(['fill-cross-axis', 'center-cross-axis'] as const).map(actionKey => ({
    key: `selection.${actionKey}` as const,
    scopes: ['canvas', 'structure-tree'] as const,
    canRun: () => workspaceMode.value === 'design' && selectedLocationType.value === 'flow-container-location' && Boolean(selectedBlock.value),
    run: () => { void cardViewportRef.value?.runSelectionQuickAction(actionKey) },
  })),
  {
    key: 'instance.rename',
    scopes: ['instance-tree'],
    canRun: () => canMutateSelectedInstance.value,
    run: () => {
      const key = selectedCardKeys.value[0]
      if (key) void instanceTreeRef.value?.beginRename(key)
    },
  },
  {
    key: 'instance.duplicate',
    scopes: ['instance-tree'],
    canRun: () => canMutateSelectedInstance.value,
    run: () => triggerInstanceAction('duplicate-instance'),
  },
  {
    key: 'instance.delete',
    scopes: ['instance-tree'],
    canRun: () => canMutateSelectedInstance.value,
    run: () => triggerInstanceAction('delete-instance'),
  },
  {
    key: 'block.rename',
    scopes: ['canvas', 'structure-tree'],
    canRun: () => workspaceMode.value === 'design' && Boolean(selectedBlock.value),
    run: () => {
      const key = selectedBlockKeys.value[0]
      if (key) void structureTreeRef.value?.beginRename(key)
    },
  },
  {
    key: 'block.copy',
    scopes: ['canvas', 'structure-tree'],
    canRun: () => workspaceMode.value === 'design' && selectedBlockKeys.value.length > 0,
    run: copySelectedBlocks,
  },
  {
    key: 'block.paste',
    scopes: ['canvas', 'structure-tree'],
    canRun: () => workspaceMode.value === 'design' && Boolean(activeFace.value),
    run: pasteClipboardBlocks,
  },
  {
    key: 'block.duplicate',
    scopes: ['canvas', 'structure-tree'],
    canRun: () => workspaceMode.value === 'design' && Boolean(selectedBlock.value),
    run: () => handleRootAction('duplicate-selected'),
  },
  {
    key: 'block.delete',
    scopes: ['canvas', 'structure-tree'],
    canRun: () => workspaceMode.value === 'design' && selectedBlockKeys.value.length > 0,
    run: () => handleRootAction('delete-selected'),
  },
  {
    key: 'viewport.fit',
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: fitViewport,
  },
  {
    key: 'viewport.zoom-in',
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: zoomViewportIn,
  },
  {
    key: 'viewport.zoom-out',
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: zoomViewportOut,
  },
  {
    key: 'view.diff-divider-left',
    scopes: ['canvas'],
    canRun: () => props.mode === 'diff' && hasRenderableFace.value,
    run: () => setDiffDividerPreset(0),
  },
  {
    key: 'view.diff-divider-center',
    scopes: ['canvas'],
    canRun: () => props.mode === 'diff' && hasRenderableFace.value,
    run: () => setDiffDividerPreset(0.5),
  },
  {
    key: 'view.diff-divider-right',
    scopes: ['canvas'],
    canRun: () => props.mode === 'diff' && hasRenderableFace.value,
    run: () => setDiffDividerPreset(1),
  },
  {
    key: 'view.toggle-snapping',
    scopes: ['canvas'],
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: toggleAlignmentSnapping,
  },
  {
    key: 'view.toggle-clip',
    scopes: ['canvas'],
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: toggleFaceClip,
  },
  {
    key: 'view.switch-face',
    scopes: ['canvas'],
    canRun: () => workspaceMode.value === 'design' && hasRenderableFace.value,
    run: toggleActiveFace,
  },
  {
    key: 'view.toggle-diff-mode',
    scopes: ['canvas'],
    canRun: () => props.mode === 'diff' && hasRenderableFace.value,
    run: toggleDiffViewMode,
  },
] as const satisfies readonly CdeShortcutCommand[]

useCdeShortcuts({
  rootElement: editorRootRef,
  commands: cdeShortcutCommands,
  suspendLetterShortcuts: () => layerViewActive.value,
})

const selectionInfo = computed<CardViewportSelectionInfo | null>(() => {
  const block = selectedBlock.value
  const face = viewFace.value
  if (!block || !face) return null

  const renderedBlock = findViewBlock(block.id)
  const presentation = getBlockPresentation(block.type)
  return {
    icon: presentation.icon,
    iconTone: presentation.iconTone,
    name: (typeof renderedBlock?.name === 'string' ? renderedBlock.name.trim() : '') || getBlockProperty<string>(block, 'name')?.trim() || block.id,
    notes: typeof renderedBlock?.notes === 'string' ? renderedBlock.notes.trim() : '',
  }
})

const {
  highlightedInfoKeys,
  viewportCardDimensions,
  viewportCardInfo,
} = useCdeViewportCardInfo({
  cardDoc,
  activeFaceKey,
  selectedCardId,
  selectedCard,
  viewDocument: viewDoc,
  viewFace,
  resourceRootPath: toRef(props, 'resourceRootPath'),
  filePath: toRef(props, 'filePath'),
  fileName: toRef(props, 'fileName'),
  blueprintCardId: BLUEPRINT_CARD_ID,
  translate: (key, parameters) => t(key, parameters ?? {}),
})
const propertyFieldWarnings = computed<ReadonlyMap<string, string>>(() => {
  const warnings = new Map<string, string>()
  const message = t('propertyEditor.currentValueRenderWarning')
  for (const issue of renderPipelineResult.value?.issues ?? []) {
    const inputIds = new Set([issue.location.owner.id, issue.location.blockId].filter((id): id is string => Boolean(id)))
    for (const inputId of inputIds) warnings.set(`${inputId}\u0000${issue.location.fieldKey}`, message)
  }
  return warnings
})
const editorIssueSnapshot = computed(() => createCardDesignerIssueSnapshot({
  document: cardDoc.value,
  instance: renderTargetInstance.value,
  result: renderPipelineResult.value ? {
    ...renderPipelineResult.value,
    issues: renderPipelineResult.value.issues,
  } : null,
  translate: (key, parameters) => t(key, parameters ?? {}),
  resolveFieldLabel: (fieldKey) => {
    const messageKey = `propertyEditor.fields.${fieldKey}`
    return te(messageKey) ? t(messageKey) : fieldKey
  },
}))

let lastEditorIssueSnapshotSignature: string | null = null
watch(editorIssueSnapshot, (snapshot) => {
  const signature = JSON.stringify({
    scopeKey: snapshot.scopeKey,
    scopeOrder: snapshot.scopeOrder,
    issues: snapshot.issues.map(issue => ({
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      locationText: issue.locationText,
      description: issue.description,
      children: issue.children?.map(child => child.id),
    })),
  })
  if (signature === lastEditorIssueSnapshotSignature) return
  lastEditorIssueSnapshotSignature = signature
  emit('issue-snapshot', snapshot)
})
async function saveFile() {
  await flushPendingChanges()
  await saveDocumentFile()
}

function ensureSelectionValidity() {
  const selectedKeys = selectedBlockKeys.value
  if (selectedKeys.length > 0 && !selectedKeys.every(blockId => getBlockById(blockId))) {
    selectedBlockKeys.value = selectedKeys.filter(blockId => getBlockById(blockId))
  }

  if (selectedCardId.value !== BLUEPRINT_CARD_ID && !selectedCard.value) {
    selectedCardId.value = BLUEPRINT_CARD_ID
  }
}

function resolveNavigationInputKey(
  target: CardDesignerNavigationToken['target'],
): string | null {
  if (target.owner === 'document') return cardDoc.value?.id ?? null
  if (target.owner === 'face') return activeFace.value?.id ?? null
  if (target.owner === 'instance') return selectedCard.value?.id ?? null
  if (target.owner === 'block') return selectedBlock.value?.id ?? null
  return selectedLocation.value?.id ?? null
}

function resolveBlockFaceKey(blockId: string): CardFaceKey | null {
  let currentId = blockId
  while (true) {
    const parent = parentLookup.value.get(currentId)
    if (!parent) return null
    if (parent.type === 'card-face') {
      if (parent.id === cardDoc.value?.faces.front.id) return 'front'
      if (parent.id === cardDoc.value?.faces.back.id) return 'back'
      return null
    }
    currentId = parent.id
  }
}

/** 对比模式的问题定位：输入键与字段键都取自对比属性投影 找不到就如实报未找到。 */
function resolveDiffNavigationField(
  target: CardDesignerNavigationToken['target'],
): { inputKey: string; fieldKey: string } | null {
  const blockId = target.blockId
  if (!blockId) return null
  const inputKey = target.owner === 'location' ? `${blockId}:layout` : blockId
  const input = diffPropertyInputs.value.find(candidate => candidate.key === inputKey)
  if (!input) return null
  const fieldKey = input.fields[`${target.fieldKey}@new`]
    ? `${target.fieldKey}@new`
    : input.fields[`${target.fieldKey}@old`]
      ? `${target.fieldKey}@old`
      : null
  return fieldKey ? { inputKey, fieldKey } : null
}

async function navigateDiffTarget(
  token: CardDesignerNavigationToken,
): Promise<CardDesignerNavigationResult> {
  if (!hasDiffModel.value) return 'not-found'
  const target = token.target

  if (target.instanceId !== null && !diffInstanceIds.value.has(target.instanceId)) return 'not-found'
  diffSelectedInstanceKeys.value = [target.instanceId ?? BLUEPRINT_CARD_ID]
  if (target.faceKey) activeFaceKey.value = target.faceKey

  const descriptor = target.blockId ? resolveDiffBlock(target.blockId) : null
  if (!descriptor || (target.faceKey && descriptor.faceKey !== target.faceKey)) {
    diffSelectedBlockKeys.value = []
    return 'not-found'
  }
  diffSelectedBlockKeys.value = [descriptor.blockId]

  const projected = resolveDiffNavigationField(target)
  if (!projected) return 'not-found'

  forceStructureTreeReveal.value = true
  await nextTick()
  await nextTick()
  forceStructureTreeReveal.value = false
  if (!propertyEditorRef.value) return 'not-found'
  return await propertyEditorRef.value.revealField(
    projected.inputKey,
    projected.fieldKey,
    target.characterOffset,
  )
    ? 'success'
    : 'not-found'
}

async function navigate(token: SessionNavigationToken): Promise<CardDesignerNavigationResult> {
  if (!isCardDesignerNavigationToken(token)) return 'invalid-token'
  // 对比视图是只读视图：定位只作用于对比投影 不触碰文档 也不写会话状态。
  if (props.mode === 'diff') return await navigateDiffTarget(token)

  const document = cardDoc.value
  if (!document) return 'not-found'

  const target = token.target
  const cardKey = target.instanceId ?? BLUEPRINT_CARD_ID
  if (
    target.instanceId !== null
    && !document.instances.some((instance) => instance.id === target.instanceId)
  ) {
    return 'not-found'
  }
  if (target.blockId && resolveBlockFaceKey(target.blockId) !== target.faceKey) return 'not-found'

  selectedCardId.value = cardKey
  selectedCardKeys.value = [cardKey]
  if (target.faceKey) {
    activeFaceKey.value = target.faceKey
  }
  const visibleBlockId = target.blockId ? resolveVisibleBlockKey(target.blockId) : null
  const blockedByPackage = !!target.blockId && visibleBlockId !== target.blockId

  if (workspaceMode.value === 'data-table' && target.owner === 'block' && !blockedByPackage) {
    if (!target.blockId) return 'not-found'
    if (dataTableFields.value[target.blockId]?.includes(target.fieldKey)) {
      await nextTick()
      if (!cardDataTableRef.value) return 'not-found'
      return await cardDataTableRef.value.revealCell(
        cardKey,
        target.blockId,
        target.fieldKey,
        target.characterOffset,
      )
        ? 'success'
        : 'not-found'
    }
  }

  if (workspaceMode.value !== 'design') {
    emit('update:card-designer-mode', 'design')
    await nextTick()
    await nextTick()
  }
  if (target.owner === 'block' || target.owner === 'location') {
    forceStructureTreeReveal.value = true
    selectedBlockKeys.value = visibleBlockId ? [visibleBlockId] : []
  } else {
    clearSelection()
  }
  commitViewState()

  ensurePanelsExpanded(target.blockId ? ['property', 'structure'] : ['property'])

  await nextTick()
  await nextTick()
  if (blockedByPackage) {
    forceStructureTreeReveal.value = false
    return 'not-found'
  }
  const inputKey = resolveNavigationInputKey(target)
  forceStructureTreeReveal.value = false
  if (!inputKey || !propertyEditorRef.value) return 'not-found'

  return await propertyEditorRef.value.revealField(
    inputKey,
    target.fieldKey,
    target.characterOffset,
  )
    ? 'success'
    : 'not-found'
}

watch(
  () => [props.cardDesignerView, props.alignmentSnappingEnabledByDefault] as const,
  ([view, alignmentSnappingEnabledByDefault]) => {
    const nextFace = view?.activeFace ?? 'front'
    if (activeFaceKey.value !== nextFace) {
      activeFaceKey.value = nextFace
      forceStructureTreeReveal.value = false
    }
    const nextFrontSelection = view?.selectedBlockIdsByFace?.front ?? []
    const nextBackSelection = view?.selectedBlockIdsByFace?.back ?? []
    if (
      !sameBlockSelection(selectedBlockIdsByFace.value.front, nextFrontSelection)
      || !sameBlockSelection(selectedBlockIdsByFace.value.back, nextBackSelection)
    ) {
      selectedBlockIdsByFace.value = {
        front: [...nextFrontSelection],
        back: [...nextBackSelection],
      }
    }
    clipToFace.value = view?.clipToFace ?? false
    alignmentSnappingEnabled.value = view?.alignmentSnappingEnabled
      ?? alignmentSnappingEnabledByDefault
      ?? true
    const nextCardId = view?.selectedInstanceId ?? BLUEPRINT_CARD_ID
    selectedCardId.value = nextCardId
  },
  { immediate: true, deep: true },
)

watch(selectedCardId, (cardId) => {
  // 对比视图是只读视图：实例选择不得写入会话视图状态。
  if (props.mode === 'diff') return
  const storedId = props.cardDesignerView?.selectedInstanceId ?? null
  const nextId = cardId === BLUEPRINT_CARD_ID ? null : cardId
  if (storedId !== nextId) commitViewState()
})

watch(
  () => [props.filePath, props.modelValue] as const,
  ([nextFilePath, nextValue]) => {
    const content = nextValue ?? ''
    const hasLoadedDocument = loadedFilePath.value !== null
    if (!content) {
      if (hasLoadedDocument) {
        emit('issue-snapshot', { scopeKey: BLUEPRINT_CARD_ID, scopeOrder: [], issues: [] })
      }
      return
    }

    const fileChanged = nextFilePath !== loadedFilePath.value
    if (!fileChanged && content === rawContent.value) {
      return
    }

    if (hasLoadedDocument) {
      emit('issue-snapshot', { scopeKey: BLUEPRINT_CARD_ID, scopeOrder: [], issues: [] })
    }
    loadedFilePath.value = nextFilePath
    if (fileChanged) {
      prepareForFileChange()
    }
    loadRawDoc(content, fileChanged || !hasLoadedDocument || content === props.savedContent)
    if (!fileChanged) ensureSelectionValidity()
    if (fileChanged) completeFileLoad()
  },
  { immediate: true },
)

function getImageRenderSource(): { render: PreparedCardRender; activeFaceKey: CardFaceKey } | null {
  const render = renderPipelineResult.value
  return render ? { render, activeFaceKey: activeFaceKey.value } : null
}

/** The card document names itself, so the workspace header shows that instead of the file name. */
const presentation = computed<EditorPresentation>(() => ({
  title: viewDoc.value?.name?.trim()
    || props.fileName?.trim()
    || props.filePath.split(/[\\/]/).filter(Boolean).pop()
    || props.filePath,
  description: '',
  icon: 'file.opencard',
}))

defineExpose({
  save: saveFile,
  flush: flushPendingChanges,
  navigate,
  presentation,
  importDataTableWorkbook,
  exportDataTableWorkbook,
  dataTableWorkbookBusy,
  canExportDataTableWorkbook,
  getImageRenderSource,
})

</script>

<style scoped>
.card-design-editor {
  position: relative;
  z-index: var(--oc-z-card-designer);
  opacity: 1;
  transition: opacity var(--oc-duration-normal) var(--oc-ease);
}

.card-design-editor.is-content-pending {
  opacity: 0;
}

.card-design-editor__multi-selection-summary {
  margin: auto;
}

.card-design-editor__viewport.is-debug-passive {
  pointer-events: none;
}

.card-design-editor__viewport {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.card-design-editor__card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-sm);
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
}

.card-design-editor__card-info:hover>span,
.card-design-editor__dimension-info:hover {
  opacity: 1;
}

.card-design-editor__card-info>span {
  overflow: hidden;
  opacity: 0.34;
  text-overflow: ellipsis;
  transition: opacity 140ms ease-out;
  white-space: nowrap;
}

.card-design-editor__card-info>span.is-multiline {
  text-overflow: clip;
  white-space: pre-wrap;
}

.card-design-editor__card-info>span.is-group-separated {
  margin-top: var(--oc-space-4);
}

.card-design-editor__dimension-info {
  display: block;
  color: var(--oc-fg-default);
  font-size: var(--oc-text-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  opacity: 1;
  transition: opacity 140ms ease-out;
  white-space: nowrap;
}

.card-design-editor__card-info>span.is-highlighted,
.card-design-editor__dimension-info.is-highlighted {
  animation: card-info-value-highlight 900ms ease-out;
}

@keyframes card-info-value-highlight {
  0% {
    color: var(--oc-fg-accent);
    opacity: 1;
    text-shadow: 0 0 8px color-mix(in srgb, var(--oc-fg-accent) 70%, transparent);
  }

  100% {
    color: var(--oc-fg-default);
    opacity: 0.34;
    text-shadow: none;
  }
}

.card-design-editor__stage {
  position: relative;
  width: 100%;
  height: 100%;
  container-type: inline-size;
}

.card-design-editor__mode-view {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
}

.card-designer-view-fade-enter-active,
.card-designer-view-fade-leave-active {
  transition: opacity var(--oc-duration-normal) var(--oc-ease);
}

.card-designer-view-fade-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.card-designer-view-fade-enter-from,
.card-designer-view-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {

  .card-designer-view-fade-enter-active,
  .card-designer-view-fade-leave-active {
    transition-duration: 0.01ms;
  }
}

.card-designer-diff-status-enter-active,
.card-designer-diff-status-leave-active {
  transition: opacity var(--oc-duration-normal) var(--oc-ease);
}

.card-designer-diff-status-enter-from,
.card-designer-diff-status-leave-to {
  opacity: 0;
}

.card-designer-diff-status-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {

  .card-designer-diff-status-enter-active,
  .card-designer-diff-status-leave-active {
    transition-duration: 0.01ms;
  }
}

.card-design-editor__stage-base {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 0;
}

.card-design-editor__stage-base.is-data-table-mode {
  z-index: 1;
  pointer-events: none;
}

.card-design-editor__data-table-view {
  position: absolute;
  inset: 0;
  z-index: 0;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.card-design-editor__data-table-view.is-active {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

.card-design-editor__viewport.is-data-table-mode {
  background-color: transparent;
  background-image: none;
  pointer-events: none;
}

.card-design-editor__stage-layer.is-data-table-mode {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.card-design-editor__stage.is-layer-view-active .card-design-editor__stage-base {
  z-index: var(--oc-z-overlay-toolbar);
}

.card-design-editor__stage-layer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: none;
  z-index: var(--oc-z-card-designer);
  opacity: 1;
  transition: opacity var(--oc-duration-normal) var(--oc-ease);
}

.card-design-editor__viewport.is-debug-transparent {
  background-color: transparent;
  background-image: none;
}



.card-design-editor__stage.is-layer-view-active .card-design-editor__stage-layer {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.card-design-editor__stage.is-layer-view-active .card-design-editor__stage-layer,
.card-design-editor__stage.is-layer-view-active .card-design-editor__stage-layer * {
  pointer-events: none !important;
}

.card-design-editor__stage.is-debug-overlays-hidden .card-design-editor__stage-layer {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.card-design-editor__face-tools {
  position: absolute;
  right: var(--oc-floating-surface-gap);
  bottom: var(--oc-floating-surface-gap);
  z-index: 3;
  transition: right var(--oc-duration-normal) var(--oc-ease);
}

.card-design-editor__face-tools.is-resizing {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .card-design-editor__stage-layer {
    transition: none;
  }
}

.card-design-editor__transform-preview-host {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-design-editor__transform-preview-viewport {
  position: relative;
  flex: 0 0 auto;
}

.card-design-editor__transform-preview-frame {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px solid var(--oc-border-accent);
  border-radius: 2px;
  outline: none;
  background: color-mix(in srgb, var(--oc-bg-accent) 10%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--oc-bg-base) 72%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--oc-fg-accent) 22%, transparent);
  cursor: grab;
  touch-action: none;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--oc-duration-fast) var(--oc-ease),
    background-color var(--oc-duration-fast) var(--oc-ease),
    box-shadow var(--oc-duration-fast) var(--oc-ease);
}

.card-design-editor__transform-preview-frame.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.card-design-editor__transform-preview-frame::after {
  content: '';
  position: absolute;
  inset: -5px;
}

.card-design-editor__transform-preview-frame:hover,
.card-design-editor__transform-preview-frame:focus-visible {
  background: color-mix(in srgb, var(--oc-bg-accent) 18%, transparent);
  box-shadow:
    0 0 0 1px var(--oc-bg-base),
    inset 0 0 0 1px color-mix(in srgb, var(--oc-fg-accent) 42%, transparent);
}

.card-design-editor__transform-preview-frame.is-dragging {
  background: color-mix(in srgb, var(--oc-bg-accent) 24%, transparent);
  cursor: grabbing;
}

.card-design-editor__diff-mode-stage {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
