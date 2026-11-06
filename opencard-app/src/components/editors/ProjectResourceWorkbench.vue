<!-- 业务 项目资源工作台骨架：图标、字体、自定义块、包四页共用的「舞台 + 悬浮面板」布局，几何与 CDE 同一套。 -->
<template>
  <div class="project-resource-workbench" :class="{ 'is-full-bleed': fullBleed, 'is-resizing': isResizing }">
    <div class="project-resource-workbench__stage" :style="fullBleed ? undefined : stageInsets()">
      <slot :insets="dockInsets()" />
    </div>
    <div v-if="$slots.append" class="project-resource-workbench__controls" :style="stageInsets()">
      <OcCard variant="glass" :padding="false">
        <div class="project-resource-workbench__controls-row"><slot name="append" /></div>
      </OcCard>
    </div>

    <OcDock v-if="$slots.leading" side="left" v-bind="dockProps" :extent="dock.leftDockExtent.value"
      :top-size="dock.leftSidebarTopHeight.value" :width-label="t('cardDesigner.layout.resizeLeftSidebar')"
      :width-tooltip="t('cardDesigner.layout.resizeSidebarTooltip', { label: t('cardDesigner.layout.resizeLeftSidebar') })"
      :split-label="t('cardDesigner.layout.resizeLeftSplit')"
      @update:extent="dock.updateDockExtent('left', $event)" @toggle-collapse="dock.toggleDockCollapsed('left')"
      @resize-start="isResizing = true" @resize-end="finishResize('left', $event)">
      <template #top>
        <OcCard fill variant="glass" :padding="false" :title="leadingTitle" :actions="leadingActions" @action="emit('action', $event)">
          <OcPanel fill tone="transparent" border="none" padding="none" overflow="hidden" align="stretch">
            <slot name="leading" />
          </OcPanel>
        </OcCard>
      </template>
    </OcDock>

    <OcDock v-if="$slots.inspector" side="right" v-bind="dockProps" :extent="dock.rightDockExtent.value"
      :top-size="dock.rightSidebarTopHeight.value" :width-label="t('cardDesigner.layout.resizeRightSidebar')"
      :width-tooltip="t('cardDesigner.layout.resizeSidebarTooltip', { label: t('cardDesigner.layout.resizeRightSidebar') })"
      :split-label="t('projectConfig.resizeSplit')"
      @update:extent="dock.updateDockExtent('right', $event)" @update:top-size="dock.updateDockTopSize('right', $event)"
      @toggle-collapse="dock.toggleDockCollapsed('right')" @resize-start="isResizing = true"
      @resize-end="finishResize('right', $event)">
      <template #top>
        <OcCard fill variant="glass" :padding="false" :title="inspectorTitle" :actions="inspectorActions" @action="emit('action', $event)">
          <OcPanel fill tone="transparent" border="none" padding="none" overflow="auto" align="stretch">
            <slot name="inspector" />
          </OcPanel>
        </OcCard>
      </template>
      <template v-if="$slots.footer" #bottom>
        <OcCard fill variant="glass" :padding="false" :title="footerTitle">
          <OcPanel fill tone="transparent" border="none" padding="none" overflow="auto" align="stretch">
            <slot name="footer" />
          </OcPanel>
        </OcCard>
      </template>
    </OcDock>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStateStore } from '../../features/app-state/store/appStateStore'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import {
  DOCK_BOTTOM_MIN_HEIGHT,
  DOCK_GEOMETRY_CONFIG,
  DOCK_RESPONSIVE_WIDTH,
  DOCK_SPLIT_GAP,
  DOCK_TOP_MIN_HEIGHT,
} from '../../shared/ui/dock/dockConfig'
import type { DockSide } from '../../shared/ui/dock/dockGeometry'
import { useDockLayout } from '../../shared/ui/dock/useDockLayout'
import OcPanel from '../base/OcPanel.vue'
import OcCard from '../standard/OcCard.vue'
import OcDock from '../standard/OcDock.vue'

defineProps<{
  /** 左卡标题。 */
  leadingTitle?: string
  /** 左卡头部的增删命令。 */
  leadingActions?: OcActionDefinition[]
  /** 右卡标题；给 `footer` 插槽时是右上卡的标题。 */
  inspectorTitle?: string
  /** 右卡头部的命令。 */
  inspectorActions?: OcActionDefinition[]
  /** 右下卡标题，只在 `footer` 插槽存在时使用。 */
  footerTitle?: string
  /** 内容铺到面板底下，由内容自己按插槽给的 `insets` 避让；只用于可平移缩放的画布。 */
  fullBleed?: boolean
}>()
const emit = defineEmits<{ action: [payload: { key: string }] }>()
const { t } = useI18n()
const slots = useSlots()
const appState = useAppStateStore()
const isResizing = ref(false)
/** 四页共用一份面板宽度：切页面时面板不跳。 */
const dock = useDockLayout({
  layout: computed(() => appState.state.value.layout.resourceDock),
  geometryConfig: DOCK_GEOMETRY_CONFIG,
  topMinHeight: DOCK_TOP_MIN_HEIGHT,
  commitLayout: resourceDock => appState.updateLayout({ resourceDock }),
})
const dockProps = {
  ...DOCK_GEOMETRY_CONFIG,
  topMinHeight: DOCK_TOP_MIN_HEIGHT,
  bottomMinHeight: DOCK_BOTTOM_MIN_HEIGHT,
  responsiveMinStageWidth: DOCK_RESPONSIVE_WIDTH,
  splitGap: DOCK_SPLIT_GAP,
}

/** 只算当前真的存在的面板：包页没有左卡，共用布局里的左宽不算数。在渲染时调用，插槽才是最新的。 */
function dockInsets(): { left: number; right: number } {
  const { left = 0, right = 0 } = dock.viewportInsets.value
  return { left: slots.leading ? left : 0, right: slots.inspector ? right : 0 }
}
function stageInsets(): CSSProperties {
  const { left, right } = dockInsets()
  const gap = DOCK_GEOMETRY_CONFIG.floatingGap
  return { paddingLeft: `${left + gap}px`, paddingRight: `${right + gap}px` }
}
function finishResize(side: DockSide, axis: 'width' | 'split'): void {
  isResizing.value = false
  if (axis === 'width') dock.commitDockExtent(side)
  else dock.commitLayout()
}
</script>

<style scoped>
.project-resource-workbench {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: var(--oc-bg-raised);
  background-image: var(--oc-viewport-dot-pattern);
  background-size: var(--oc-viewport-dot-size);
  background-position: var(--oc-viewport-dot-position);
}
.project-resource-workbench__stage {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  transition: padding var(--oc-duration) var(--oc-ease);
}
.project-resource-workbench.is-full-bleed .project-resource-workbench__stage { grid-row: 1 / -1; grid-column: 1; }
.project-resource-workbench__controls {
  z-index: var(--oc-z-overlay-toolbar);
  grid-row: 2;
  grid-column: 1;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-width: 0;
  padding-block: var(--oc-space-xs);
  pointer-events: none;
  transition: padding var(--oc-duration) var(--oc-ease);
}
.project-resource-workbench__controls > * { min-width: 0; pointer-events: auto; }
.project-resource-workbench__controls-row {
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
  min-width: 0;
  padding: var(--oc-space-2xs) var(--oc-space-xs);
}
.project-resource-workbench.is-resizing .project-resource-workbench__stage,
.project-resource-workbench.is-resizing .project-resource-workbench__controls { transition: none; }
</style>
