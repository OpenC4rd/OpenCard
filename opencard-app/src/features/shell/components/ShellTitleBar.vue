<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OcIcon from '../../../components/base/OcIcon.vue';
import OcActionBar from '../../../components/standard/OcActionBar.vue';
import OcOverlayMarker from '../../../components/standard/OcOverlayMarker.vue';
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue';
import wordmarkBrightness from '../../../assets/opencard-wordmark-brightness-map.png';
import wordmarkPhase from '../../../assets/opencard-wordmark-phase-map.png';
import AppearanceShaderPreview from '../../settings/components/AppearanceShaderPreview.vue';
import ShellTitleBarNotice from './ShellTitleBarNotice.vue';
import ShellNoticePanel from './ShellNoticePanel.vue';
import ShellTaskPanel from './ShellTaskPanel.vue';
import { titleBarNotices } from '../../notifications/titlebarNotices';
import { useOverlayDismiss } from '../../../shared/ui/useOverlayDismiss';
import type { OcActionBarItem, OcActionSelectPayload } from '../../../shared/ui/action/action.types';
import type {
  ShellProgressTask,
  ShellTitleBarAppAction,
  ShellTitleBarMenuGroup,
  ShellTitleBarWindowControl,
} from '../shell.types';

const props = defineProps<{
  collapsed: boolean;
  brandLabel: string;
  menuGroups: ShellTitleBarMenuGroup[];
  appActions?: ShellTitleBarAppAction[];
  tasks?: readonly ShellProgressTask[];
  windowControls?: ShellTitleBarWindowControl[];
  collapseTooltip?: string;
  expandTooltip?: string;
  dragRegion?: boolean;
  nativeMacosControls?: boolean;
  cancelTaskLabel?: string;
}>();

const emit = defineEmits<{
  'toggle-sidebar': [];
  'app-action': [actionKey: string];
  'window-control': [actionKey: string];
  'cancel-task': [taskKey: string];
}>();

const PANEL_CLOSE_DELAY = 120;

/** 任务面板、通知面板各一个 marker：宿主与互斥归组，这里只持自己的开关。 */
const taskPanelAnchor = ref<HTMLElement | null>(null);
const noticeAnchor = ref<HTMLElement | null>(null);
const taskPanelOpen = ref(false);
const noticePanelOpen = ref(false);
let taskPanelCloseTimer: number | null = null;
let noticePanelCloseTimer: number | null = null;

/** 菜单内容随 props.menuGroups 实时渲染：切页后条目归新的 owner 处理。 */
const menuItems = computed<OcActionBarItem[]>(() => props.menuGroups.map(menu => ({
  key: menu.key,
  title: menu.label,
  badge: menu.badge,
  badgeLabel: menu.badgeLabel,
  children: menu.actions,
})));
const activeProgressTasks = computed(() => (props.tasks ?? []).filter(task => task.active !== false));
const titlebarProgress = computed(() => {
  if (activeProgressTasks.value.length === 0) return null;
  const totals = activeProgressTasks.value.reduce((result, task) => {
    const weight = Number.isFinite(task.weight) && (task.weight ?? 0) > 0 ? task.weight! : 1;
    result.progress += Math.min(1, Math.max(0, task.progress)) * weight;
    result.weight += weight;
    return result;
  }, { progress: 0, weight: 0 });
  return totals.progress / totals.weight;
});
const latestTitleBarNotice = computed(() => titleBarNotices.value[titleBarNotices.value.length - 1] ?? null);

function readTaskPanelRect(): DOMRect | null {
  return taskPanelAnchor.value?.getBoundingClientRect() ?? null;
}

/** 通知面板锚在通知宿主上方一条间距处；宿主高度随通知长度变，每次求值重算。 */
function noticePanelRect(anchor: HTMLElement): DOMRect {
  const rect = anchor.getBoundingClientRect();
  const topSpace = Number.parseFloat(getComputedStyle(anchor).getPropertyValue('--oc-space-xs')) || 0;
  return new DOMRect(rect.left, rect.top - topSpace, rect.width, rect.height);
}

function readNoticePanelRect(): DOMRect | null {
  const owner = noticeAnchor.value;
  return owner ? noticePanelRect(owner) : null;
}

function cancelTaskPanelClose(): void {
  if (taskPanelCloseTimer === null) return;
  window.clearTimeout(taskPanelCloseTimer);
  taskPanelCloseTimer = null;
}

function openTaskPanel(): void {
  cancelTaskPanelClose();
  taskPanelOpen.value = Boolean(props.tasks?.length && taskPanelAnchor.value);
}

function scheduleTaskPanelClose(): void {
  cancelTaskPanelClose();
  taskPanelCloseTimer = window.setTimeout(() => {
    taskPanelCloseTimer = null;
    taskPanelOpen.value = false;
  }, PANEL_CLOSE_DELAY);
}

function cancelNoticePanelClose(): void {
  if (noticePanelCloseTimer === null) return;
  window.clearTimeout(noticePanelCloseTimer);
  noticePanelCloseTimer = null;
}

function openNoticePanel(): void {
  cancelNoticePanelClose();
  noticePanelOpen.value = Boolean(titleBarNotices.value.length && noticeAnchor.value);
}

function scheduleNoticePanelClose(): void {
  cancelNoticePanelClose();
  noticePanelCloseTimer = window.setTimeout(() => {
    noticePanelCloseTimer = null;
    noticePanelOpen.value = false;
  }, PANEL_CLOSE_DELAY);
}

// 任务清空后这一层没有内容可留；面板内容是 slot，任务一变它自己就更新。
watch(
  () => props.tasks?.length ?? 0,
  length => {
    if (length === 0) taskPanelOpen.value = false;
  },
  { flush: 'sync' },
);

function runMenuCommand({ key, rootKey }: OcActionSelectPayload): void {
  void props.menuGroups.find(menu => menu.key === rootKey)?.onAction?.(key);
}

useOverlayDismiss(() => taskPanelOpen.value, () => taskPanelAnchor.value, () => { taskPanelOpen.value = false; });
useOverlayDismiss(() => noticePanelOpen.value, () => noticeAnchor.value, () => { noticePanelOpen.value = false; });

// 两个悬停面板没有别的关闭来源，Esc 在这里收掉。
function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  taskPanelOpen.value = false;
  noticePanelOpen.value = false;
}

onMounted(() => window.addEventListener('keydown', handleWindowKeydown, true));
onBeforeUnmount(() => window.removeEventListener('keydown', handleWindowKeydown, true));
</script>

<template>
  <header
    class="titlebar"
    :class="{ 'titlebar-native-macos': props.nativeMacosControls }"
  >
    <Transition name="titlebar-progress-fade">
      <div v-if="titlebarProgress != null" class="titlebar-shader">
        <AppearanceShaderPreview :progress="titlebarProgress" />
      </div>
    </Transition>
    <div class="titlebar-left" data-tooltip-group data-oc-tutorial="shell.titlebar-menus">
      <button
        class="titlebar-icon"
        data-oc-tutorial="shell.sidebar-toggle"
        type="button"
        :data-tooltip="props.collapsed ? props.expandTooltip || null : props.collapseTooltip || null"
        @click="emit('toggle-sidebar')"
      >
        <OcIcon :name="props.collapsed ? 'mdiArrowExpandRight' : 'mdiArrowCollapseLeft'" size="sm" />
      </button>

      <OcActionBar class="titlebar-menus" :items="menuItems" menubar size="md" @select="runMenuCommand" />

      <button
        v-for="action in props.appActions ?? []"
        :key="action.key"
        class="titlebar-icon titlebar-app-action"
        type="button"
        :disabled="action.disabled"
        :data-tooltip="action.hoverTip || null"
        @click="emit('app-action', action.key)"
      >
        <OcIcon :name="action.icon" size="sm" />
      </button>
    </div>

    <div
      class="titlebar-drag"
      :class="{ 'titlebar-drag-enabled': props.dragRegion }"
      :data-tauri-drag-region="props.dragRegion ? '' : null"
    >
      <div
        ref="taskPanelAnchor"
        class="titlebar-brand-lockup"
        data-oc-tutorial="shell.titlebar-tasks"
        :class="{ 'titlebar-brand-lockup-interactive': Boolean(props.tasks?.length) }"
        :data-tauri-drag-region="props.dragRegion && !props.tasks?.length ? '' : null"
        :tabindex="props.tasks?.length ? 0 : undefined"
        :aria-expanded="props.tasks?.length ? taskPanelOpen : undefined"
        @pointerenter="openTaskPanel"
        @pointerleave="scheduleTaskPanelClose"
        @focusin="openTaskPanel"
        @focusout="scheduleTaskPanelClose"
      >
        <OcPhaseImage
          v-if="!props.tasks?.length"
          class="titlebar-brand-wordmark"
          :src="wordmarkPhase"
          :brightness-src="wordmarkBrightness"
          fit="contain"
          alt="OpenCard"
          :duration-ms="12_000"
          direction="reverse"
        />
        <span v-else class="titlebar-brand">{{ props.brandLabel }}</span>
      </div>
    </div>

    <div class="titlebar-right">
      <div
        ref="noticeAnchor"
        class="titlebar-notice-host"
        data-oc-tutorial="shell.titlebar-notices"
        @pointerenter="openNoticePanel"
        @pointerleave="scheduleNoticePanelClose"
        @focusin="openNoticePanel"
        @focusout="scheduleNoticePanelClose"
      >
        <ShellTitleBarNotice v-if="latestTitleBarNotice" :key="latestTitleBarNotice.id" :notice="latestTitleBarNotice" />
      </div>
      <button
        v-for="(control, controlIndex) in props.windowControls ?? []"
        :key="control.key"
        class="titlebar-icon"
        :class="{
          'titlebar-icon-danger': control.danger,
          'titlebar-icon-window': control.group === 'window',
          'titlebar-icon-window-start': control.group === 'window'
            && props.windowControls?.[controlIndex - 1]?.group !== 'window',
        }"
        type="button"
        :data-tooltip="control.hoverTip || null"
        @click="emit('window-control', control.key)"
      >
        <OcIcon :name="control.icon" size="sm" />
      </button>
    </div>

    <OcOverlayMarker
      group="titlebar-tasks"
      :anchor="readTaskPanelRect"
      :owner="taskPanelAnchor"
      placement="bottom"
      :max-height="360"
      :open="taskPanelOpen"
      @update:open="taskPanelOpen = $event"
    >
      <!-- 面板单根且不声明指针事件，这两个监听器落在它自己的根元素上：指针进面板就撤销关闭。 -->
      <ShellTaskPanel
        :tasks="props.tasks ?? []"
        :cancel-task-label="props.cancelTaskLabel"
        @cancel-task="emit('cancel-task', $event)"
        @pointerenter="cancelTaskPanelClose"
        @pointerleave="scheduleTaskPanelClose"
      />
    </OcOverlayMarker>

    <OcOverlayMarker
      group="titlebar-notices"
      :anchor="readNoticePanelRect"
      :owner="noticeAnchor"
      placement="bottom-end"
      :max-height="360"
      :open="noticePanelOpen"
      @update:open="noticePanelOpen = $event"
    >
      <ShellNoticePanel
        :notices="titleBarNotices"
        @pointerenter="cancelNoticePanelClose"
        @pointerleave="scheduleNoticePanelClose"
      />
    </OcOverlayMarker>
  </header>
</template>
