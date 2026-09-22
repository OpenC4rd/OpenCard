<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import OcIcon from '../../../components/base/OcIcon.vue';
import OcText from '../../../components/base/OcText.vue';
import OcActionRail from '../../../components/standard/OcActionRail.vue';
import OcOptionGroup, { type OcOption } from '../../../components/standard/OcOptionGroup.vue';
import type { OcActionButtonAction } from '../../../components/standard/OcActionButton.vue';
import type { ShellButton, ShellList, ShellListGroup } from '../shell.types';
import type { ProjectWorkspaceSidebarState } from '../../settings/model/appSettings';
import ShellSidebarContent from './ShellSidebarContent.vue';

const props = defineProps<{
  collapsed: boolean;
  width: number;
  bodyGroups: ShellListGroup[];
  tailButtons: ShellButton[];
  collapseListTooltip?: string;
  expandListTooltip?: string;
  minResizeWidth?: number;
  maxResizeWidth?: number;
  compactGroupWidth?: number;
  persistedLayout?: ProjectWorkspaceSidebarState;
  resizeToggleAnimating?: boolean;
}>();

const emit = defineEmits<{
  'head-button-clicked': [buttonKey: string];
  'list-button-clicked': [listKey: string, actionKey: string];
  'body-group-changed': [groupKey: string];
  'tail-button-clicked': [buttonKey: string];
  resize: [width: number];
  'resize-start': [];
  'resize-end': [];
  'layout-change': [layout: ProjectWorkspaceSidebarState];
}>();

defineSlots<{ 'list-content': (props: { list: ShellList }) => unknown }>();

const sidebarElement = ref<HTMLElement | null>(null);
const resizing = ref(false);
const activeGroupKey = ref<string | null>(null);
const transitionDirection = ref<'forward' | 'backward'>('forward');
const collapsedLists = ref<Record<string, boolean>>({});
const listWeights = ref<Record<string, number>>({});
const resizingListPair = ref(false);

const listGroups = computed<ShellListGroup[]>(() => props.bodyGroups);
const activeGroup = computed(() => listGroups.value.find(group => group.key === activeGroupKey.value) ?? listGroups.value[0]);
const activeTransitionKey = computed(() => activeGroup.value?.transitionKey ?? activeGroup.value?.key ?? 'empty');
const activeHeadButtons = computed(() => activeGroup.value?.headButtons ?? []);
const activeLists = computed(() => activeGroup.value?.lists ?? []);
const groupOptions = computed<readonly OcOption[]>(() => listGroups.value.map(group => ({
  value: group.key,
  label: group.title,
  icon: group.icon,
})));
const groupTitlesHidden = computed(() => props.collapsed || props.width < (props.compactGroupWidth ?? 0));
const actionDefinitionsByList = computed(() => new Map(activeLists.value.map(list => [
  list.key,
  list.actions.map<OcActionButtonAction>(action => ({
    key: action.key ?? action.icon,
    title: action.hoverTip,
    icon: action.icon,
    disabled: action.disabled,
    badge: action.badge,
    badgeLabel: action.badgeLabel,
    children: action.children,
  })),
])));

function ensureListState(lists: ShellList[]): void {
  const persisted = props.persistedLayout;
  const next = { ...collapsedLists.value };
  const weights = { ...listWeights.value };
  for (const list of lists) {
    next[list.key] = persisted ? persisted.collapsedLists.includes(list.key) : (next[list.key] ?? false);
    weights[list.key] = persisted?.listWeights[list.key] ?? weights[list.key] ?? 1;
  }
  collapsedLists.value = next;
  listWeights.value = weights;
}

watch([listGroups, () => props.persistedLayout], ([groups]) => {
  if (!activeGroupKey.value || !groups.some(group => group.key === activeGroupKey.value)) activeGroupKey.value = groups[0]?.key ?? null;
  groups.forEach(group => ensureListState(group.lists));
}, { immediate: true });

function selectGroup(key: string): void {
  if (key === activeGroupKey.value) return;
  const current = listGroups.value.findIndex(group => group.key === activeGroupKey.value);
  const next = listGroups.value.findIndex(group => group.key === key);
  transitionDirection.value = next >= current ? 'forward' : 'backward';
  activeGroupKey.value = key;
  emit('body-group-changed', key);
}

function emitLayoutChange(): void {
  emit('layout-change', {
    collapsedLists: Object.entries(collapsedLists.value).filter(([, collapsed]) => collapsed).map(([key]) => key),
    listWeights: { ...listWeights.value },
  });
}

function toggleListCollapsed(key: string): void {
  collapsedLists.value[key] = !collapsedLists.value[key];
  emitLayoutChange();
}
function isListCollapsed(key: string): boolean { return collapsedLists.value[key] === true; }

function listSectionStyle(list: ShellList): { flexGrow: string; flexShrink: string; flexBasis: string } {
  return isListCollapsed(list.key)
    ? { flexGrow: '0', flexShrink: '0', flexBasis: 'var(--oc-size-md)' }
    : { flexGrow: String(listWeights.value[list.key] ?? 1), flexShrink: '1', flexBasis: 'var(--oc-sidebar-tree-min-height)' };
}
function findNextExpandedList(index: number): ShellList | null { return activeLists.value.slice(index + 1).find(list => !isListCollapsed(list.key)) ?? null; }
function canResizeAfter(index: number): boolean { return !isListCollapsed(activeLists.value[index]?.key ?? '') && findNextExpandedList(index) !== null; }

function onListResizePointerDown(event: PointerEvent, index: number): void {
  const current = activeLists.value[index];
  const next = findNextExpandedList(index);
  const body = sidebarElement.value?.querySelector<HTMLElement>('.shell-sidebar-body');
  if (!current || !next || !body) return;
  const startY = event.clientY;
  const sections = [...body.querySelectorAll<HTMLElement>('.shell-sidebar-list')];
  const currentElement = sections[index];
  const nextElement = sections[activeLists.value.indexOf(next)];
  if (!currentElement || !nextElement) return;
  resizingListPair.value = true;
  const currentHeight = currentElement.getBoundingClientRect().height;
  const nextHeight = nextElement.getBoundingClientRect().height;
  const minimum = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--oc-sidebar-tree-min-height')) || 0;
  const total = Math.max(0, currentHeight + nextHeight - minimum * 2);
  const pairWeight = (listWeights.value[current.key] ?? 1) + (listWeights.value[next.key] ?? 1);
  const move = (moveEvent: PointerEvent): void => {
    const height = Math.max(minimum, Math.min(currentHeight + moveEvent.clientY - startY, currentHeight + nextHeight - minimum));
    const share = total > 0 ? (height - minimum) / total : 0.5;
    listWeights.value = { ...listWeights.value, [current.key]: pairWeight * share, [next.key]: pairWeight * (1 - share) };
    emitLayoutChange();
  };
  const stop = (): void => { resizingListPair.value = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

function onResizePointerDown(event: PointerEvent): void {
  if (props.collapsed) return;
  resizing.value = true;
  emit('resize-start');
  const pointerId = event.pointerId;
  const startLeft = sidebarElement.value?.getBoundingClientRect().left ?? 0;
  const minWidth = props.minResizeWidth ?? 78;
  const maxWidth = Math.max(minWidth, props.maxResizeWidth ?? Number.POSITIVE_INFINITY);
  const move = (moveEvent: PointerEvent): void => {
    if (!resizing.value) return;
    const width = Math.round(moveEvent.clientX - startLeft);
    emit('resize', Math.min(maxWidth, Math.max(minWidth, width)));
  };
  const stop = (): void => {
    if (!resizing.value) return;
    resizing.value = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    if (sidebarElement.value?.hasPointerCapture(pointerId)) sidebarElement.value.releasePointerCapture(pointerId);
    emit('resize-end');
  };
  sidebarElement.value?.setPointerCapture(pointerId);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}
</script>

<template>
  <aside
    ref="sidebarElement"
    class="shell-sidebar"
    :class="{
      collapsed,
      'is-resizing': resizing && !props.resizeToggleAnimating,
    }"
    :style="{ width: `${width}px` }"
  >
    <OcOptionGroup
      v-if="listGroups.length > 1"
      class="shell-sidebar-group-switcher"
      :model-value="activeGroup?.key"
      :options="groupOptions"
      :icon-only="groupTitlesHidden"
      appearance="sliding-outline"
      semantics="tabs"
      size="md"
      fill
      @update:model-value="selectGroup"
    />
    <Transition :name="`shell-sidebar-group-slide-${transitionDirection}`" mode="out-in">
      <div :key="activeTransitionKey" class="shell-sidebar-active-group" :data-transition-key="activeTransitionKey">
        <div class="shell-sidebar-group shell-sidebar-group-top" data-tooltip-placement="right" data-tooltip-group>
          <button v-for="button in activeHeadButtons" :key="button.key" class="shell-sidebar-button" type="button" :disabled="button.disabled" :data-tooltip="collapsed ? button.hoverTip || button.title : null" @click="emit('head-button-clicked', button.key)">
            <OcIcon v-if="button.icon" :name="button.icon" size="md" /><span v-if="!collapsed">{{ button.title }}</span><span v-if="!collapsed && button.badge" class="oc-number-badge oc-number-badge--neutral">{{ button.badge }}</span>
          </button>
        </div>
        <div class="shell-sidebar-body" :class="{ 'is-resizing-list': resizingListPair }">
          <section v-for="(list, index) in activeLists" :key="list.key" class="shell-sidebar-list" :class="{ collapsed: isListCollapsed(list.key) }" :style="listSectionStyle(list)">
            <div class="shell-sidebar-list-head">
              <button v-if="!collapsed" class="shell-sidebar-list-toggle" type="button" :data-tooltip="isListCollapsed(list.key) ? expandListTooltip || null : collapseListTooltip || null" @click.stop="toggleListCollapsed(list.key)"><OcText class="shell-sidebar-list-title" :truncate="true" :tooltip-on-overflow="list.title">{{ list.title }}</OcText><OcIcon class="shell-sidebar-list-chevron" name="nav.chevron-down" size="sm" :class="{ collapsed: isListCollapsed(list.key) }" /></button>
              <OcActionRail :actions="actionDefinitionsByList.get(list.key) ?? []" @select="emit('list-button-clicked', list.key, $event.key)" />
            </div>
            <div class="shell-sidebar-list-content-wrap" :class="{ collapsed: isListCollapsed(list.key) }"><div class="shell-sidebar-list-content"><slot name="list-content" :list="list"><ShellSidebarContent :list="list" /></slot></div></div>
            <div v-if="canResizeAfter(index)" class="shell-sidebar-list-resizer" @pointerdown.prevent="onListResizePointerDown($event, index)" />
          </section>
        </div>
      </div>
    </Transition>
    <div class="shell-sidebar-group shell-sidebar-group-bottom" data-tooltip-placement="right" data-tooltip-group><button v-for="button in tailButtons" :key="button.key" class="shell-sidebar-button" type="button" :disabled="button.disabled" :data-tooltip="collapsed ? button.hoverTip || button.title : null" @click="emit('tail-button-clicked', button.key)"><OcIcon v-if="button.icon" :name="button.icon" size="md" /><span v-if="!collapsed">{{ button.title }}</span></button></div>
    <div v-if="!collapsed" class="shell-sidebar-resizer" @pointerdown.prevent="onResizePointerDown" />
  </aside>
</template>
