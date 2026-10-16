<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import OcResizeHandle, { type OcResizeHandleChange } from '../../../components/standard/OcResizeHandle.vue';
import OcResizeTrack from '../../../components/standard/OcResizeTrack.vue';
import OcIcon from '../../../components/base/OcIcon.vue';
import OcText from '../../../components/base/OcText.vue';
import OcActionRail from '../../../components/standard/OcActionRail.vue';
import type { OcActionDefinition } from '../../../shared/ui/action/action.types';
import type { ShellList, ShellListGroup } from '../shell.types';
import type { ProjectWorkspaceSidebarState } from '../../app-state/model/appState';
import ShellSidebarContent from './ShellSidebarContent.vue';

const props = defineProps<{
  collapsed: boolean;
  width: number;
  bodyGroup?: ShellListGroup;
  collapseListTooltip?: string;
  expandListTooltip?: string;
  minResizeWidth?: number;
  maxResizeWidth?: number;
  compactGroupWidth?: number;
  persistedLayout?: ProjectWorkspaceSidebarState;
  resizeToggleAnimating?: boolean;
  resizeLabel?: string;
  listResizeLabel?: string;
}>();

const emit = defineEmits<{
  resize: [width: number];
  'resize-start': [];
  'resize-end': [];
  'layout-change': [layout: ProjectWorkspaceSidebarState];
}>();

defineSlots<{ 'list-content': (props: { list: ShellList }) => unknown }>();

const listResizeScale = ref(1);
const sidebarElement = ref<HTMLElement | null>(null);
const resizing = ref(false);
const collapsedLists = ref<Record<string, boolean>>({});
const listWeights = ref<Record<string, number>>({});
const resizingListPair = ref(false);

const activeGroup = computed(() => props.bodyGroup);
const activeHeadButtons = computed(() => activeGroup.value?.headButtons ?? []);
const activeLists = computed(() => activeGroup.value?.lists ?? []);
const actionDefinitionsByList = computed(() => new Map(activeLists.value.map(list => [
  list.key,
  list.actions.map<OcActionDefinition>(action => ({
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

watch([activeLists, () => props.persistedLayout], ([lists]) => {
  ensureListState(lists);
}, { immediate: true });

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

function prepareListResize(index: number): void {
  const current = activeLists.value[index];
  const next = findNextExpandedList(index);
  const sections = sidebarElement.value?.querySelectorAll<HTMLElement>('.shell-sidebar-list');
  if (!current || !next || !sections) return;
  const currentHeight = sections[index]?.getBoundingClientRect().height ?? 0;
  const nextHeight = sections[activeLists.value.indexOf(next)]?.getBoundingClientRect().height ?? 0;
  const minimum = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--oc-sidebar-tree-min-height')) || 0;
  const available = Math.max(0, currentHeight + nextHeight - minimum * 2);
  listResizeScale.value = available > 0 ? listPairWeight(index) / available : 0;
  resizingListPair.value = true;
}

function listPairWeight(index: number): number {
  const current = activeLists.value[index];
  const next = findNextExpandedList(index);
  return (listWeights.value[current?.key ?? ''] ?? 1) + (listWeights.value[next?.key ?? ''] ?? 1);
}

function resizeList(index: number, weight: number): void {
  const current = activeLists.value[index];
  const next = findNextExpandedList(index);
  if (!current || !next) return;
  const pairWeight = listPairWeight(index);
  listWeights.value = { ...listWeights.value, [current.key]: weight, [next.key]: pairWeight - weight };
  emitLayoutChange();
}

function resizeSidebar(change: OcResizeHandleChange): void {
  const keyboard = change.event instanceof KeyboardEvent;
  if (keyboard) emit('resize-start');
  emit('resize', change.value);
  if (keyboard) emit('resize-end');
}

function finishResize(): void {
  resizing.value = false;
  emit('resize-end');
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
      <div class="shell-sidebar-active-group">
        <div class="shell-sidebar-group shell-sidebar-group-top" data-tooltip-placement="right" data-tooltip-group>
          <button v-for="button in activeHeadButtons" :key="button.key" class="shell-sidebar-button" type="button" :disabled="button.disabled" :data-tooltip="collapsed ? button.hoverTip || button.title : null" @click="activeGroup?.onAction?.(button.key)">
            <OcIcon v-if="button.icon" :name="button.icon" size="md" /><span v-if="!collapsed">{{ button.title }}</span><span v-if="!collapsed && button.badge" class="oc-number-badge oc-number-badge--neutral">{{ button.badge }}</span>
          </button>
        </div>
        <div class="shell-sidebar-body" :class="{ 'is-resizing-list': resizingListPair }">
          <section v-for="(list, index) in activeLists" :key="list.key" :data-oc-tutorial="list.tutorialKey" class="shell-sidebar-list" :class="{ collapsed: isListCollapsed(list.key) }" :style="listSectionStyle(list)">
            <div class="shell-sidebar-list-head">
              <button v-if="!collapsed" class="shell-sidebar-list-toggle" type="button" :data-tooltip="isListCollapsed(list.key) ? expandListTooltip || null : collapseListTooltip || null" @click.stop="toggleListCollapsed(list.key)"><OcText class="shell-sidebar-list-title" :truncate="true">{{ list.title }}</OcText><OcIcon class="shell-sidebar-list-chevron" name="nav.chevron-down" size="sm" :class="{ collapsed: isListCollapsed(list.key) }" /></button>
              <OcActionRail :actions="actionDefinitionsByList.get(list.key) ?? []" @select="list.onAction?.($event.key)" />
            </div>
            <div class="shell-sidebar-list-content-wrap" :class="{ collapsed: isListCollapsed(list.key) }"><div class="shell-sidebar-list-content"><slot name="list-content" :list="list"><ShellSidebarContent :list="list" /></slot></div></div>
            <OcResizeHandle v-if="canResizeAfter(index)" class="shell-sidebar-list-resizer" appearance="invisible"
              :value="listWeights[list.key] ?? 1" :minimum="0" :maximum="listPairWeight(index)"
              :units-per-pixel="listResizeScale" :step="listPairWeight(index) / 20"
              :label="listResizeLabel ?? ''"
              @resize-start="prepareListResize(index)" @update:value="resizeList(index, $event)"
              @resize-end="resizingListPair = false" @resize-cancel="resizingListPair = false" />
          </section>
        </div>
      </div>
    <OcResizeTrack v-if="!collapsed || resizing" class="shell-sidebar-resizer" orientation="vertical" edge="right" appearance="gradient"
      :value="width" :minimum="minResizeWidth ?? 78" :maximum="Math.max(minResizeWidth ?? 78, maxResizeWidth ?? Number.POSITIVE_INFINITY)"
      :label="resizeLabel ?? ''"
      @resize-start="resizing = true; emit('resize-start')" @resize="resizeSidebar"
      @resize-end="finishResize" @resize-cancel="finishResize" />
  </aside>
</template>
