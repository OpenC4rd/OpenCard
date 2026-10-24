<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue';
import OcIcon from '../../../components/base/OcIcon.vue';
import OcActionMenu from '../../../components/standard/OcActionMenu.vue';
import OcOverlayMarker from '../../../components/standard/OcOverlayMarker.vue';
import { actionAccessibleLabel, formatActionBadge, hasActionBadge } from '../../../components/standard/actionBadge';
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue';
import wordmarkBrightness from '../../../assets/opencard-wordmark-brightness-map.png';
import wordmarkPhase from '../../../assets/opencard-wordmark-phase-map.png';
import AppearanceShaderPreview from '../../settings/components/AppearanceShaderPreview.vue';
import ShellTitleBarNotice from './ShellTitleBarNotice.vue';
import ShellNoticePanel from './ShellNoticePanel.vue';
import ShellTaskPanel from './ShellTaskPanel.vue';
import { titleBarNotices } from '../../notifications/titlebarNotices';
import { useOverlayDismiss } from '../../../shared/ui/useOverlayDismiss';
import type { OverlayAnchor } from '../../../composables/overlayGroups';
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

/** 菜单、任务面板、通知面板各一个 marker：宿主与互斥归组，这里只持自己的开关。 */
const menuLayer = ref<InstanceType<typeof OcOverlayMarker> | null>(null);
// 响应式 Map：模板 ref 回填必须触发重渲染，锚点函数才读得到当前按钮。
const menuAnchors = reactive(new Map<string, HTMLElement>());
const openMenuKey = ref<string | null>(null);
const taskPanelAnchor = ref<HTMLElement | null>(null);
const noticeAnchor = ref<HTMLElement | null>(null);
const taskPanelOpen = ref(false);
const noticePanelOpen = ref(false);
let taskPanelCloseTimer: number | null = null;
let noticePanelCloseTimer: number | null = null;

const activeMenu = computed(() => props.menuGroups.find(menu => menu.key === openMenuKey.value) ?? null);
/** 当前激活的那个菜单按钮：锚点、归属、键盘关闭后的焦点去处都是它。 */
const activeMenuButton = computed(() => (openMenuKey.value ? menuAnchors.get(openMenuKey.value) ?? null : null));
/**
 * 锚点是「当前激活的那个菜单按钮」。每次换菜单都返回一个新函数，marker 才会把新锚点
 * 推进组里让宿主滑过去；函数锚点让 autoUpdate 每次重算都拿到按钮的当前矩形。
 */
const activeMenuAnchor = computed<OverlayAnchor>(() => {
  const button = activeMenuButton.value;
  return () => button?.getBoundingClientRect() ?? null;
});
const menuOpen = computed(() => openMenuKey.value !== null);
/** 「已打开」就是当前锚点等于这个按钮：被抢占时 marker 会把它清成 null。 */
const isMenuOpen = (key: string) => openMenuKey.value === key;
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

function setMenuAnchor(menuKey: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) menuAnchors.set(menuKey, element);
  else menuAnchors.delete(menuKey);
}

function openTitleMenu(key: string): void {
  if (!menuAnchors.has(key)) return;
  openMenuKey.value = key;
}

/** 菜单已经打开时划到另一个按钮：宿主不变，只换锚点与条目。 */
function switchOpenMenu(key: string): void {
  if (menuOpen.value) openTitleMenu(key);
}

// 换菜单时 open 一直是 true，marker 不会重新激活；post-flush 时新锚点已经交给 marker，
// 这时再重开一次，同一个宿主节点才会滑到新按钮下面。
watch(openMenuKey, () => {
  if (menuOpen.value) menuLayer.value?.open();
}, { flush: 'post' });

function toggleMenu(key: string): void {
  if (isMenuOpen(key)) {
    openMenuKey.value = null;
    return;
  }
  openTitleMenu(key);
}

/** 菜单请求收掉自己所在的那一层：键盘关闭时焦点还给打开它的那个按钮。 */
function handleMenuCloseRequest(restoreFocus: boolean): void {
  const button = activeMenuButton.value;
  openMenuKey.value = null;
  if (restoreFocus) button?.focus();
}

/** 被抢占或主动关闭都从 marker 回来：菜单状态必须跟着退出。 */
function handleMenuOpenChange(open: boolean): void {
  if (!open) openMenuKey.value = null;
}

function runMenuCommand(actionKey: string): void {
  const menu = activeMenu.value;
  openMenuKey.value = null;
  void menu?.onAction?.(actionKey);
}

useOverlayDismiss(() => menuOpen.value, () => activeMenuButton.value, () => { openMenuKey.value = null; });
useOverlayDismiss(() => taskPanelOpen.value, () => taskPanelAnchor.value, () => { taskPanelOpen.value = false; });
useOverlayDismiss(() => noticePanelOpen.value, () => noticeAnchor.value, () => { noticePanelOpen.value = false; });

// marker 只负责显示，Esc 归调用点。焦点在菜单里时先让菜单自己收（它会把焦点还给触发按钮），
// 这里只兜住焦点不在菜单里的情况；两个悬停面板没有别的关闭来源，一并收掉。
function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  taskPanelOpen.value = false;
  noticePanelOpen.value = false;
  if (event.target instanceof Element && event.target.closest('.oc-action-menu')) return;
  openMenuKey.value = null;
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

      <div
        v-for="menu in props.menuGroups"
        :key="menu.key"
        class="titlebar-menu"
        @pointerenter="switchOpenMenu(menu.key)"
      >
        <button
          :ref="(element) => setMenuAnchor(menu.key, element)"
          class="titlebar-menu-button"
          type="button"
          :aria-label="actionAccessibleLabel(menu.label, menu.badgeLabel)"
          :aria-haspopup="'menu'"
          :aria-expanded="isMenuOpen(menu.key)"
          @click="toggleMenu(menu.key)"
        >
          <span>{{ menu.label }}</span>
          <span v-if="hasActionBadge(menu.badge)" class="oc-number-badge" aria-hidden="true">
            {{ formatActionBadge(menu.badge) }}
          </span>
        </button>
      </div>

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
      ref="menuLayer"
      group="menu"
      :anchor="activeMenuAnchor"
      :owner="activeMenuButton"
      placement="bottom-start"
      :open="menuOpen"
      @update:open="handleMenuOpenChange"
    >
      <OcActionMenu v-if="activeMenu" :actions="activeMenu.actions" overlay-key="menu"
        :on-select="runMenuCommand" @close="handleMenuCloseRequest" />
    </OcOverlayMarker>

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
