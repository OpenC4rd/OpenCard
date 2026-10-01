<template>
  <section class="workspace-bottom-panel" :class="{ 'is-expanded': expanded }"
    @mouseleave="scheduleCollapse"
    @focusin="requestExpansion" @focusout="handlePanelFocusOut">
    <button
      ref="toggleRef"
      class="workspace-bottom-panel__toggle"
      type="button"
      :aria-expanded="expanded"
      :aria-label="pinned ? unpinLabel : pinLabel"
      :data-tooltip="pinned ? unpinLabel : pinLabel"
      :aria-pressed="pinned"
      :data-issue-severity="issueCount > 0 ? issueSeverity : null"
      @mouseenter="handleToggleMouseEnter"
      @mouseleave="isToggleHovered = false"
      @click="togglePinned"
    >
      <OcIcon :name="isToggleHovered ? (pinned ? 'tool.pin-off' : 'tool.pin') : (expanded ? 'nav.chevron-down' : 'nav.chevron-up')" size="sm" />
    </button>

    <div
      ref="contentRef"
      class="workspace-bottom-panel__content"
      :inert="!expanded || undefined"
    >
      <div class="workspace-bottom-panel__tabs">
        <div class="workspace-bottom-panel__tab-list" role="tablist">
          <button
            v-for="tab in tabs"
            :id="`workspace-bottom-tab-${tab.key}`"
            :key="tab.key"
            class="workspace-bottom-panel__tab"
            :class="{ 'is-active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-controls="`workspace-bottom-tabpanel-${tab.key}`"
            :aria-selected="activeTab === tab.key"
            :tabindex="activeTab === tab.key ? 0 : -1"
            @click="emit('tab-change', tab.key)"
            @keydown="handleTabKeydown($event, tab.key)"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.key === 'issues' && issueCount > 0" class="workspace-bottom-panel__count">
              {{ issueCount }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-show="activeTab === 'issues'"
        id="workspace-bottom-tabpanel-issues"
        class="workspace-bottom-panel__tabpanel workspace-bottom-panel__issues"
        role="tabpanel"
        aria-labelledby="workspace-bottom-tab-issues"
      >
        <OcFieldInput :value="issueFilter" class="workspace-bottom-panel__issue-filter"
          type="search" :placeholder="issueFilterLabel" :aria-label="issueFilterLabel" full-width
          @input="issueFilter = ($event.target as HTMLInputElement).value" />
        <div class="workspace-bottom-panel__issues-scroll">
          <OcTree
            v-if="filteredIssueTreeData.rootKeys.length > 0"
            :data="filteredIssueTreeData"
            :expanded-keys="expandedIssueKeys"
            activation-mode="double-click"
            selection-mode="none"
            fill
            @expansion-change="handleIssueExpansionChange"
            @action="handleIssueAction"
            @node-activate="handleIssueActivate"
          />
          <div v-else class="workspace-bottom-panel__empty">{{ issueEmptyLabel }}</div>
        </div>
      </div>

      <div
        v-show="activeTab === 'output'"
        id="workspace-bottom-tabpanel-output"
        class="workspace-bottom-panel__tabpanel workspace-bottom-panel__output"
        role="tabpanel"
        aria-labelledby="workspace-bottom-tab-output"
      >
        <div ref="outputScrollRef" class="workspace-bottom-panel__output-scroll" role="log"
          aria-live="polite" @scroll="handleOutputScroll">
          <div v-if="visibleOutputEntries.length === 0" class="workspace-bottom-panel__empty">
            {{ outputEntries.length === 0 ? outputEmptyLabel : outputFilterEmptyLabel }}
          </div>
          <div v-else class="workspace-bottom-panel__output-lines">
            <button v-for="entry in visibleOutputEntries" :key="entry.id"
              class="workspace-bottom-panel__output-line" :data-severity="entry.severity"
              type="button" :data-tooltip="outputCopyLabel" @click="copyOutputEntry(entry)">
              <time :datetime="new Date(entry.timestamp).toISOString()">{{ formatOutputTime(entry.timestamp) }}</time>
              <span class="workspace-bottom-panel__output-severity">
                {{ outputSeverityLabels[entry.severity] }}
              </span>
              <span class="workspace-bottom-panel__output-message">
                <template v-if="entry.code">
                  <code class="workspace-bottom-panel__output-error-code">{{ entry.code }}</code>
                  {{ getAppErrorMeaning(entry.code, outputLocale) }}
                </template>
                <template v-else>{{ entry.message }}</template>
              </span>
              <span v-if="entry.detail" class="workspace-bottom-panel__output-detail">{{ entry.detail }}</span>
            </button>
          </div>
        </div>
        <div class="workspace-bottom-panel__output-toolbar">
          <div class="workspace-bottom-panel__severity-dock">
            <div class="workspace-bottom-panel__severity-filters" :aria-label="outputSeverityFilterLabel">
              <button
                v-for="severity in APP_OUTPUT_SEVERITIES"
                :key="severity"
                class="workspace-bottom-panel__toolbar-button workspace-bottom-panel__severity-filter"
                :data-severity="severity"
                type="button"
                :aria-pressed="enabledSeverities.has(severity)"
                @click="toggleSeverity(severity)"
              >
                <span class="workspace-bottom-panel__severity-dot" />
                <span>{{ outputSeverityLabels[severity] }}</span>
                <span class="workspace-bottom-panel__severity-count">{{ severityCounts[severity] }}</span>
              </button>
            </div>
            <button
              class="workspace-bottom-panel__toolbar-button workspace-bottom-panel__output-clear"
              type="button"
              :disabled="outputEntries.length === 0"
              @click="emit('output-clear')"
            >
              {{ outputClearLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import OcFieldInput from '../../../components/base/OcFieldInput.vue'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcTree from '../../../components/standard/OcTree.vue'
import type {
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
} from '../../../shared/ui/node/node.types'
import { COPY_ISSUE_ACTION_KEY } from '../composables/useWorkspaceIssues'
import type {
  EditorIssueSeverity,
  SessionIssueNavigationRequest,
} from '../../editor-runtime/model/editorIssue'
import {
  APP_OUTPUT_SEVERITIES,
  type AppOutputEntry,
  type AppOutputSeverity,
} from '../../logging/appOutput'
import { getAppErrorMeaning } from '../../logging/appErrorCatalog'
import { notifyAppError } from '../../notifications/titlebarNotices'

export type WorkspaceBottomTab = 'issues' | 'output'

const props = defineProps<{
  resizing?: boolean
  expanded: boolean
  activeTab: WorkspaceBottomTab
  issueCount: number
  issueSeverity: EditorIssueSeverity | null
  issueTreeData: OcNodeCollection
  issueNavigationTargets: ReadonlyMap<string, SessionIssueNavigationRequest>
  issueDetails?: ReadonlyMap<string, import('../../editor-runtime/model/editorIssue').EditorIssue>
  expandedIssueKeys: readonly string[]
  outputEntries: readonly AppOutputEntry[]
  issuesLabel: string
  outputLabel: string
  issueEmptyLabel: string
  issueFilterLabel: string
  outputEmptyLabel: string
  outputFilterEmptyLabel: string
  outputClearLabel: string
  outputCopyLabel: string
  outputLocale: string
  outputSeverityFilterLabel: string
  outputSeverityLabels: Readonly<Record<AppOutputSeverity, string>>
  expandLabel: string
  collapseLabel: string
  pinLabel: string
  unpinLabel: string
}>()

const emit = defineEmits<{
  'expanded-change': [expanded: boolean]
  'tab-change': [tab: WorkspaceBottomTab]
  'issue-expansion-change': [key: string, expanded: boolean]
  'issue-navigate': [request: SessionIssueNavigationRequest]
  'output-clear': []
}>()

const HOVER_COLLAPSE_DELAY_MS = 180
const pinned = ref(false)
const toggleRef = ref<HTMLButtonElement | null>(null)
const isToggleHovered = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const issueFilter = ref('')
const filteredIssueTreeData = computed<OcNodeCollection>(() => {
  const query = issueFilter.value.trim().toLocaleLowerCase()
  if (!query) return props.issueTreeData
  const items = new Map(props.issueTreeData.items)
  const children = new Map<string, readonly string[]>()
  const matches = (key: string): boolean => {
    const item = items.get(key)
    const matchingChildren = (props.issueTreeData.children.get(key) ?? []).filter(matches)
    if (matchingChildren.length) children.set(key, matchingChildren)
    return Boolean(item?.label.toLocaleLowerCase().includes(query) || matchingChildren.length)
  }
  const rootKeys = props.issueTreeData.rootKeys.filter(matches)
  return { rootKeys, items, children }
})
const outputScrollRef = ref<HTMLElement | null>(null)
const enabledSeverities = ref<ReadonlySet<AppOutputSeverity>>(new Set(APP_OUTPUT_SEVERITIES))
const shouldFollowOutput = ref(true)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

function clearCollapseTimer(): void {
  if (collapseTimer === null) return
  clearTimeout(collapseTimer)
  collapseTimer = null
}

function requestExpansion(): void {
  clearCollapseTimer()
  if (pinned.value || props.expanded) return
  emit('expanded-change', true)
}

function handleToggleMouseEnter(): void {
  isToggleHovered.value = true
  requestExpansion()
}

function togglePinned(): void {
  clearCollapseTimer()
  pinned.value = !pinned.value
  if (pinned.value) emit('expanded-change', true)
}
function scheduleCollapse(): void {
  clearCollapseTimer()
  if (props.resizing || pinned.value || !props.expanded) return
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    if (props.resizing) return
    emit('expanded-change', false)
  }, HOVER_COLLAPSE_DELAY_MS)
}

function handlePanelFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget
  const panel = event.currentTarget
  if (panel instanceof HTMLElement && nextTarget instanceof Node && panel.contains(nextTarget)) return
  clearCollapseTimer()
  if (pinned.value || !props.expanded) return
  emit('expanded-change', false)
}

onBeforeUnmount(clearCollapseTimer)

const tabs = computed<readonly { key: WorkspaceBottomTab; label: string }[]>(() => [
  { key: 'issues', label: props.issuesLabel },
  { key: 'output', label: props.outputLabel },
])

const severityCounts = computed<Record<AppOutputSeverity, number>>(() => {
  const counts = Object.fromEntries(
    APP_OUTPUT_SEVERITIES.map(severity => [severity, 0]),
  ) as Record<AppOutputSeverity, number>
  for (const entry of props.outputEntries) counts[entry.severity] += 1
  return counts
})

const visibleOutputEntries = computed(() =>
  props.outputEntries.filter(entry => enabledSeverities.value.has(entry.severity))
)

function toggleSeverity(severity: AppOutputSeverity): void {
  const next = new Set(enabledSeverities.value)
  if (next.has(severity)) next.delete(severity)
  else next.add(severity)
  enabledSeverities.value = next
}

function formatOutputTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

async function copyOutputEntry(entry: AppOutputEntry): Promise<void> {
  try {
    const content = entry.code
      ? `${entry.code} ${getAppErrorMeaning(entry.code, props.outputLocale)}\n${entry.message}`
      : entry.message
    await navigator.clipboard.writeText(content)
  } catch (error) {
    notifyAppError('OC-E1002', { source: 'output-entry', entryId: entry.id, error }, props.outputLocale)
  }
}

function handleOutputScroll(): void {
  const element = outputScrollRef.value
  if (!element) return
  shouldFollowOutput.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 1
}

async function scrollOutputToEnd(): Promise<void> {
  if (!props.expanded || props.activeTab !== 'output' || !shouldFollowOutput.value) return
  await nextTick()
  const element = outputScrollRef.value
  if (element) element.scrollTop = element.scrollHeight
}

watch(() => props.expanded, (expanded) => {
  if (!expanded && contentRef.value?.contains(document.activeElement)) toggleRef.value?.focus()
}, { flush: 'sync' })
watch(() => props.resizing, (resizing) => {
  if (!resizing && props.expanded) scheduleCollapse()
})
watch(() => [props.expanded, props.activeTab] as const, scrollOutputToEnd)
watch(visibleOutputEntries, scrollOutputToEnd)

function handleTabKeydown(event: KeyboardEvent, currentTab: WorkspaceBottomTab): void {
  let nextTab: WorkspaceBottomTab | null = null
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    nextTab = currentTab === 'issues' ? 'output' : 'issues'
  } else if (event.key === 'Home') {
    nextTab = 'issues'
  } else if (event.key === 'End') {
    nextTab = 'output'
  }

  if (!nextTab) return
  event.preventDefault()
  emit('tab-change', nextTab)
}

function handleIssueExpansionChange(event: OcNodeExpansionEvent): void {
  emit('issue-expansion-change', event.key, event.expanded)
}

function handleIssueAction(event: OcNodeActionEvent): void {
  if (event.actionKey === COPY_ISSUE_ACTION_KEY) void copyIssue(event.key)
}

function handleIssueActivate(event: OcNodeActivateEvent): void {
  const target = props.issueNavigationTargets.get(event.key)
  if (target) emit('issue-navigate', target)
}

async function copyIssue(key: string): Promise<void> {
  const issue = props.issueDetails?.get(key)
  if (!issue) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(issue, null, 2))
  } catch (error) {
    notifyAppError('OC-E1002', { source: 'issue-entry', issueId: issue.id, error }, props.outputLocale)
  }
}
</script>

<style scoped>
.workspace-bottom-panel {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--oc-radius-lg, 8px);
  background: var(--oc-bg-surface);
}

.workspace-bottom-panel__toggle {
  position: fixed;
  right: var(--oc-space-3, 8px);
  bottom: var(--oc-space-3, 8px);
  left: auto;
  top: auto;
  z-index: var(--oc-z-shell-floating-control);
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--oc-border-default);
  border-radius: 50%;
  border-bottom-right-radius: var(--oc-radius-sm);
  background: var(--oc-bg-surface);
  color: var(--oc-fg-muted);
  box-shadow: var(--oc-shadow-sm);
  transform: none;
  transition:
    border-color var(--oc-duration-fast, 100ms) var(--oc-ease, ease),
    background-color var(--oc-duration-fast, 100ms) var(--oc-ease, ease),
    color var(--oc-duration-fast, 100ms) var(--oc-ease, ease);
}

.workspace-bottom-panel__toggle:hover,
.workspace-bottom-panel__toggle:focus-visible {
  border-color: var(--oc-border-accent);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-accent);
  outline: none;
}

.workspace-bottom-panel__toggle[data-issue-severity] {
  border-color: currentColor;
  background: var(--oc-bg-surface);
}

.workspace-bottom-panel__toggle[data-issue-severity='error'] {
  color: var(--oc-fg-danger);
}

.workspace-bottom-panel__toggle[data-issue-severity='warning'] {
  color: var(--oc-fg-warning);
}

.workspace-bottom-panel__toggle[data-issue-severity='info'] {
  color: var(--oc-fg-accent);
}

.workspace-bottom-panel__content {
  height: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--oc-bg-base);
  transition: height var(--oc-duration-normal, 150ms) var(--oc-ease, ease);
}

.workspace-bottom-panel.is-expanded .workspace-bottom-panel__content {
  height: var(--workspace-bottom-panel-height, var(--oc-list-max-height-md, 180px));
}

.workspace-bottom-panel__tabs {
  min-height: 30px;
  display: flex;
  align-items: stretch;
  gap: var(--oc-space-1, 4px);
  padding: 0 var(--oc-space-3, 8px);
  border-bottom: 1px solid var(--oc-border-muted);
}

.workspace-bottom-panel__tab-list {
  display: flex;
  align-items: stretch;
  gap: var(--oc-space-1, 4px);
}

.workspace-bottom-panel__tab {
  position: relative;
  min-width: 72px;
  padding: 0 var(--oc-space-3, 8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-1, 4px);
  border: 0;
  background: transparent;
  color: var(--oc-fg-muted);
  font: inherit;
  font-size: var(--oc-text-sm, 11px);
}

.workspace-bottom-panel__tab::after {
  content: '';
  position: absolute;
  right: var(--oc-space-2, 6px);
  bottom: 0;
  left: var(--oc-space-2, 6px);
  height: 2px;
  background: transparent;
}

.workspace-bottom-panel__tab:hover,
.workspace-bottom-panel__tab:focus-visible,
.workspace-bottom-panel__tab.is-active {
  color: var(--oc-fg-default);
  outline: none;
}

.workspace-bottom-panel__tab.is-active::after {
  background: var(--oc-border-accent);
}

.workspace-bottom-panel__count {
  min-width: 16px;
  height: 16px;
  padding: 0 var(--oc-space-1, 4px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--oc-radius-sm, 3px);
  background: var(--oc-bg-raised);
  color: var(--oc-icon-warning);
  font-size: var(--oc-text-xs, 10px);
  line-height: 1;
}

.workspace-bottom-panel__tabpanel {
  min-height: 0;
  padding: var(--oc-space-2, 6px) var(--oc-space-3, 8px);
  overflow: auto;
}

.workspace-bottom-panel__issues {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.workspace-bottom-panel__issues-scroll {
  min-height: 0;
  overflow: auto;
}

.workspace-bottom-panel__empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm, 11px);
}

.workspace-bottom-panel__output-lines {
  display: grid;
  gap: var(--oc-space-1);
  font-family: var(--oc-font-mono, Consolas, monospace);
  font-size: var(--oc-text-sm, 11px);
  color: var(--oc-fg-muted);
}

.workspace-bottom-panel__output {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 0;
  overflow: hidden;
}

.workspace-bottom-panel__output-toolbar {
  display: flex;
  align-items: end;
  min-width: 0;
}

.workspace-bottom-panel__severity-dock {
  position: relative;
  min-width: 0;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  border-top-right-radius: var(--oc-radius-md);
  background: var(--oc-bg-surface);
}

.workspace-bottom-panel__severity-filters {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--oc-space-1);
  padding: 0 var(--oc-space-2);
  overflow-x: auto;
}

.workspace-bottom-panel__severity-dock::before,
.workspace-bottom-panel__severity-dock::after {
  content: '';
  position: absolute;
  width: var(--oc-radius-md);
  height: var(--oc-radius-md);
  pointer-events: none;
}

.workspace-bottom-panel__severity-dock::before {
  top: calc(var(--oc-radius-md) * -1);
  left: 0;
  background: radial-gradient(
    circle at top right,
    transparent var(--oc-radius-md),
    var(--oc-bg-surface) var(--oc-radius-md)
  );
}

.workspace-bottom-panel__severity-dock::after {
  right: calc(var(--oc-radius-md) * -1);
  bottom: 0;
  background: radial-gradient(
    circle at top right,
    transparent var(--oc-radius-md),
    var(--oc-bg-surface) var(--oc-radius-md)
  );
}

.workspace-bottom-panel__toolbar-button {
  height: var(--oc-size-sm);
  padding: 0 var(--oc-space-2);
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-1);
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--oc-fg-subtle);
  font: inherit;
  font-size: var(--oc-text-xs);
}

.workspace-bottom-panel__toolbar-button:hover:not(:disabled),
.workspace-bottom-panel__toolbar-button:focus-visible {
  color: var(--oc-fg-default);
  outline: none;
}

.workspace-bottom-panel__toolbar-button:focus-visible {
  text-decoration: underline;
}

.workspace-bottom-panel__toolbar-button:disabled {
  color: var(--oc-fg-disabled);
}

.workspace-bottom-panel__severity-filter[aria-pressed='true'] {
  color: var(--oc-fg-default);
}

.workspace-bottom-panel__severity-dot {
  width: var(--oc-space-1);
  height: var(--oc-space-1);
  flex: 0 0 auto;
  border-radius: var(--oc-radius-full);
  background: var(--oc-fg-muted);
}

.workspace-bottom-panel__severity-filter[data-severity='info'] .workspace-bottom-panel__severity-dot {
  background: var(--oc-fg-default);
}

.workspace-bottom-panel__severity-filter[data-severity='success'] .workspace-bottom-panel__severity-dot {
  background: var(--oc-fg-success);
}

.workspace-bottom-panel__severity-filter[data-severity='warning'] .workspace-bottom-panel__severity-dot {
  background: var(--oc-fg-warning);
}

.workspace-bottom-panel__severity-filter[data-severity='error'] .workspace-bottom-panel__severity-dot {
  background: var(--oc-fg-danger);
}

.workspace-bottom-panel__severity-count {
  color: var(--oc-fg-muted);
  font-variant-numeric: tabular-nums;
}

.workspace-bottom-panel__output-scroll {
  min-height: 0;
  padding: var(--oc-space-2) var(--oc-space-3);
  overflow: auto;
}

.workspace-bottom-panel__output-line {
  width: 100%;
  min-height: var(--oc-size-sm);
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-2);
  padding: var(--oc-space-1) var(--oc-space-2);
  border: 0;
  border-radius: var(--oc-radius-sm);
  background-color: var(--oc-bg-block);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: copy;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.workspace-bottom-panel__output-line[data-severity='success'] {
  background-color: var(--oc-bg-success-subtle);
}

.workspace-bottom-panel__output-line[data-severity='warning'] {
  background-color: var(--oc-bg-warning-subtle);
}

.workspace-bottom-panel__output-line[data-severity='error'] {
  background-color: var(--oc-bg-danger-subtle);
}

.workspace-bottom-panel__output-line:hover,
.workspace-bottom-panel__output-line:focus-visible {
  background-image: linear-gradient(var(--oc-bg-hover), var(--oc-bg-hover));
  outline: none;
}

.workspace-bottom-panel__output-line:focus-visible {
  box-shadow: var(--oc-focus-ring);
}

.workspace-bottom-panel__output-error-code {
  color: var(--oc-fg-danger);
  font: inherit;
}

.workspace-bottom-panel__output-detail {
  grid-column: 3;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.workspace-bottom-panel__output-line time {
  color: var(--oc-fg-subtle);
  font-variant-numeric: tabular-nums;
}

.workspace-bottom-panel__output-severity {
  color: var(--oc-fg-muted);
  text-transform: uppercase;
}

.workspace-bottom-panel__output-line[data-severity='info'] .workspace-bottom-panel__output-severity,
.workspace-bottom-panel__output-line[data-severity='info'] .workspace-bottom-panel__output-message {
  color: var(--oc-fg-default);
}

.workspace-bottom-panel__output-line[data-severity='success'] .workspace-bottom-panel__output-severity,
.workspace-bottom-panel__output-line[data-severity='success'] .workspace-bottom-panel__output-message {
  color: var(--oc-fg-success);
}

.workspace-bottom-panel__output-line[data-severity='warning'] .workspace-bottom-panel__output-severity,
.workspace-bottom-panel__output-line[data-severity='warning'] .workspace-bottom-panel__output-message {
  color: var(--oc-fg-warning);
}

.workspace-bottom-panel__output-line[data-severity='error'] .workspace-bottom-panel__output-severity,
.workspace-bottom-panel__output-line[data-severity='error'] .workspace-bottom-panel__output-message {
  color: var(--oc-fg-danger);
}
</style>
