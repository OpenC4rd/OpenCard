<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, type ComponentPublicInstance } from 'vue';
import OcIcon from '../../../components/base/OcIcon.vue';
import OcButton from '../../../components/base/OcButton.vue';
import OcActionMenu, { isActionMenuBranchEvent } from '../../../components/standard/OcActionMenu.vue';
import { actionAccessibleLabel, formatActionBadge, hasActionBadge } from '../../../components/standard/actionBadge';
import OcFloatingLayer from '../../../components/standard/OcFloatingLayer.vue';
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue';
import wordmarkBrightness from '../../../assets/opencard-wordmark-brightness-map.png';
import wordmarkPhase from '../../../assets/opencard-wordmark-phase-map.png';
import AppearanceShaderPreview from '../../settings/components/AppearanceShaderPreview.vue';
import ShellTitleBarNotice from './ShellTitleBarNotice.vue';
import { titleBarNotices } from '../../notifications/titlebarNotices';
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
  'menu-action': [menuKey: string, actionKey: string];
  'app-action': [actionKey: string];
  'window-control': [actionKey: string];
  'cancel-task': [taskKey: string];
}>();

const openMenu = ref<string | null>(null);
const menuBranchId = useId();
const titlebarRef = ref<HTMLElement | null>(null);
const taskPanelAnchor = ref<HTMLElement | null>(null);
const taskPanelOpen = ref(false);
const noticeAnchor = ref<HTMLElement | null>(null);
const noticePanelAnchor = ref<DOMRect | null>(null);
const noticePanelOpen = ref(false);
let noticePanelCloseTimer: number | null = null;
const menuAnchors = new Map<string, HTMLElement>();
let taskPanelCloseTimer: number | null = null;
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

function cancelNoticePanelClose(): void {
  if (noticePanelCloseTimer == null) return;
  window.clearTimeout(noticePanelCloseTimer);
  noticePanelCloseTimer = null;
}

function openNoticePanel(): void {
  cancelNoticePanelClose();
  if (titleBarNotices.value.length) {
    const anchor = noticeAnchor.value;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const topSpace = Number.parseFloat(getComputedStyle(anchor).getPropertyValue('--oc-space-2')) || 0;
      noticePanelAnchor.value = new DOMRect(rect.left, rect.top - topSpace, rect.width, rect.height);
    }
    noticePanelOpen.value = true;
  }
}

function scheduleNoticePanelClose(): void {
  cancelNoticePanelClose();
  noticePanelCloseTimer = window.setTimeout(() => {
    noticePanelCloseTimer = null;
    noticePanelOpen.value = false;
  }, 120);
}

function taskProgressPercent(task: ShellProgressTask): number {
  return Math.round(Math.min(1, Math.max(0, task.progress)) * 100);
}

function cancelTaskPanelClose(): void {
  if (taskPanelCloseTimer == null) return;
  window.clearTimeout(taskPanelCloseTimer);
  taskPanelCloseTimer = null;
}

function openTaskPanel(): void {
  cancelTaskPanelClose();
  if (props.tasks?.length) taskPanelOpen.value = true;
}

function scheduleTaskPanelClose(): void {
  cancelTaskPanelClose();
  taskPanelCloseTimer = window.setTimeout(() => {
    taskPanelCloseTimer = null;
    taskPanelOpen.value = false;
  }, 120);
}

function closeTaskPanel(): void {
  cancelTaskPanelClose();
  taskPanelOpen.value = false;
}

function setMenuAnchor(menuKey: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) menuAnchors.set(menuKey, element);
  else menuAnchors.delete(menuKey);
}

function toggleMenu(menuKey: string): void {
  openMenu.value = openMenu.value === menuKey ? null : menuKey;
}

function switchOpenMenu(menuKey: string): void {
  if (openMenu.value) openMenu.value = menuKey;
}

function runMenuCommand(menuKey: string, actionKey: string): void {
  openMenu.value = null;
  emit('menu-action', menuKey, actionKey);
}

function closeMenu(): void {
  openMenu.value = null;
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!openMenu.value) {
    return;
  }

  const target = event.target;
  const isInsideTitlebar = target instanceof Node && titlebarRef.value?.contains(target);
  const isInsideActionMenu = isActionMenuBranchEvent(event, menuBranchId);
  if (!isInsideTitlebar && !isInsideActionMenu) {
    closeMenu();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenu.value) {
    event.preventDefault();
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  cancelTaskPanelClose();
  cancelNoticePanelClose();
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <header
    ref="titlebarRef"
    class="titlebar"
    :class="{ 'titlebar-native-macos': props.nativeMacosControls }"
  >
    <Transition name="titlebar-progress-fade">
      <div v-if="titlebarProgress != null" class="titlebar-shader">
        <AppearanceShaderPreview :progress="titlebarProgress" />
      </div>
    </Transition>
    <div class="titlebar-left" data-tooltip-group>
      <button
        class="titlebar-icon"
        type="button"
        :data-tooltip="props.collapsed ? props.expandTooltip || null : props.collapseTooltip || null"
        @click="emit('toggle-sidebar')"
      >
        <OcIcon :name="props.collapsed ? 'nav.sidebar-expand' : 'nav.sidebar-collapse'" size="sm" />
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
          :aria-expanded="openMenu === menu.key"
          @click="toggleMenu(menu.key)"
        >
          <span>{{ menu.label }}</span>
          <span v-if="hasActionBadge(menu.badge)" class="oc-number-badge" aria-hidden="true">
            {{ formatActionBadge(menu.badge) }}
          </span>
        </button>
        <OcFloatingLayer
          :open="openMenu === menu.key"
          :anchor="menuAnchors.get(menu.key) ?? null"
          placement="bottom-start"
          :gap="8"
          :max-height="480"
          class="titlebar-menu-floating oc-floating-layer--surface"
          :data-oc-action-menu-branch="menuBranchId"
        >
          <OcActionMenu
            :actions="menu.actions"
            :branch-id="menuBranchId"
            @select="runMenuCommand(menu.key, $event.key)"
          />
        </OcFloatingLayer>
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
        :class="{ 'titlebar-brand-lockup-interactive': Boolean(props.tasks?.length) }"
        :data-tauri-drag-region="props.dragRegion && !props.tasks?.length ? '' : null"
        :tabindex="props.tasks?.length ? 0 : undefined"
        :aria-expanded="props.tasks?.length ? taskPanelOpen : undefined"
        @pointerenter="openTaskPanel"
        @pointerleave="scheduleTaskPanelClose"
        @focusin="openTaskPanel"
        @focusout="scheduleTaskPanelClose"
        @keydown.esc="closeTaskPanel"
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

    <OcFloatingLayer
      :open="taskPanelOpen && Boolean(props.tasks?.length)"
      :anchor="taskPanelAnchor"
      placement="bottom"
      :gap="6"
      :max-height="360"
      class="titlebar-task-floating"
    >
      <section
        class="titlebar-task-panel"
        aria-live="polite"
        @pointerenter="cancelTaskPanelClose"
        @pointerleave="scheduleTaskPanelClose"
      >
        <div v-for="task in props.tasks ?? []" :key="task.key" class="titlebar-task-row">
          <div class="titlebar-task-row__header">
            <span class="titlebar-task-row__title">{{ task.title }}</span>
            <span class="titlebar-task-row__actions">
              <span class="titlebar-task-row__value">{{ taskProgressPercent(task) }}%</span>
              <OcButton v-if="task.cancellable" icon-only size="sm" variant="ghost" icon="action.close"
                :aria-label="props.cancelTaskLabel || 'Cancel task'"
                :data-tooltip="props.cancelTaskLabel || 'Cancel task'"
                @click="emit('cancel-task', task.key)" />
            </span>
          </div>
          <span v-if="task.detail" class="titlebar-task-row__detail">{{ task.detail }}</span>
          <div
            class="titlebar-task-row__track"
            role="progressbar"
            :aria-label="task.title"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="taskProgressPercent(task)"
          >
            <span
              class="titlebar-task-row__fill"
              :style="{ width: `${taskProgressPercent(task)}%` }"
            />
          </div>
        </div>
      </section>
    </OcFloatingLayer>

    <div class="titlebar-right">
      <div
        v-if="latestTitleBarNotice"
        ref="noticeAnchor"
        class="titlebar-notice-host"
        @pointerenter="openNoticePanel"
        @pointerleave="scheduleNoticePanelClose"
        @focusin="openNoticePanel"
        @focusout="scheduleNoticePanelClose"
      >
        <ShellTitleBarNotice :key="latestTitleBarNotice.id" :notice="latestTitleBarNotice" />
      </div>
      <OcFloatingLayer
        :open="noticePanelOpen"
        :anchor="noticePanelAnchor"
        placement="bottom-end"
        :gap="-(noticeAnchor?.offsetHeight ?? 0)"
        :max-height="360"
        class="titlebar-notice-floating"
        @pointerenter="cancelNoticePanelClose"
        @pointerleave="scheduleNoticePanelClose"
      >
        <section
          class="titlebar-notice-panel"
          aria-label="Title bar messages"
        >
          <div v-for="notice in [...titleBarNotices].reverse()" :key="notice.id" class="titlebar-notice-history-row">
            <OcIcon v-if="notice.icon" :name="notice.icon" size="sm" :tone="notice.tone" />
            <span>{{ notice.message }}</span>
          </div>
        </section>
      </OcFloatingLayer>
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
  </header>
</template>
