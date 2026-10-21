<template>
  <section ref="panelElement" class="shell-bottom-panel" :class="{ 'is-expanded': expanded }"
    @mouseleave="scheduleCollapse"
    @focusin="requestExpansion" @focusout="handlePanelFocusOut">
    <slot name="leading" />
    <button
      ref="toggleRef"
      class="shell-bottom-panel__toggle"
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
      <OcIcon :name="isToggleHovered ? (pinned ? 'mdiPinOffOutline' : 'mdiPinOutline') : (expanded ? 'mdiChevronDown' : 'mdiChevronUp')" size="sm" />
    </button>

    <div
      ref="contentRef"
      class="shell-bottom-panel__content"
      :inert="!expanded || undefined"
    >
      <div class="shell-bottom-panel__tabs">
        <div class="shell-bottom-panel__tab-list" role="tablist">
          <button
            v-for="tab in tabs"
            :id="`shell-bottom-tab-${tab.key}`"
            :key="tab.key"
            class="shell-bottom-panel__tab"
            :class="{ 'is-active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-controls="`shell-bottom-tabpanel-${tab.key}`"
            :aria-selected="activeTab === tab.key"
            :tabindex="activeTab === tab.key ? 0 : -1"
            @click="emit('tab-change', tab.key)"
            @keydown="handleTabKeydown($event, tab.key)"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.key === 'issues' && issueCount > 0" class="shell-bottom-panel__count">
              {{ issueCount }}
            </span>
          </button>
        </div>
      </div>

      <div
        v-show="activeTab === 'issues'"
        id="shell-bottom-tabpanel-issues"
        class="shell-bottom-panel__tabpanel shell-bottom-panel__issues"
        role="tabpanel"
        aria-labelledby="shell-bottom-tab-issues"
      >
        <OcFieldInput :value="issueFilter" class="shell-bottom-panel__issue-filter"
          type="search" :placeholder="issueFilterLabel" :aria-label="issueFilterLabel" full-width
          @input="issueFilter = ($event.target as HTMLInputElement).value" />
        <div class="shell-bottom-panel__issues-scroll">
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
          <div v-else class="shell-bottom-panel__empty">{{ issueEmptyLabel }}</div>
        </div>
      </div>

      <div
        v-show="activeTab === 'output'"
        id="shell-bottom-tabpanel-output"
        class="shell-bottom-panel__tabpanel shell-bottom-panel__output"
        role="tabpanel"
        aria-labelledby="shell-bottom-tab-output"
      >
        <div ref="outputScrollRef" class="shell-bottom-panel__output-scroll" role="log"
          aria-live="polite" @scroll="handleOutputScroll">
          <div v-if="visibleOutputEntries.length === 0" class="shell-bottom-panel__empty">
            {{ outputEntries.length === 0 ? outputEmptyLabel : outputFilterEmptyLabel }}
          </div>
          <div v-else class="shell-bottom-panel__output-lines">
            <button v-for="entry in visibleOutputEntries" :key="entry.id"
              class="shell-bottom-panel__output-line" :data-severity="entry.severity"
              type="button" :data-tooltip="outputCopyLabel" @click="copyOutputEntry(entry)">
              <time :datetime="new Date(entry.timestamp).toISOString()">{{ formatOutputTime(entry.timestamp) }}</time>
              <span class="shell-bottom-panel__output-severity">
                {{ outputSeverityLabels[entry.severity] }}
              </span>
              <span class="shell-bottom-panel__output-message">
                <template v-if="entry.code">
                  <code class="shell-bottom-panel__output-error-code">{{ entry.code }}</code>
                  {{ getAppErrorMeaning(entry.code, outputLocale) }}
                </template>
                <template v-else>{{ entry.message }}</template>
              </span>
              <span v-if="entry.detail" class="shell-bottom-panel__output-detail">{{ entry.detail }}</span>
            </button>
          </div>
        </div>
        <div class="shell-bottom-panel__output-toolbar">
          <div class="shell-bottom-panel__severity-dock">
            <div class="shell-bottom-panel__severity-filters" :aria-label="outputSeverityFilterLabel">
              <button
                v-for="severity in APP_OUTPUT_SEVERITIES"
                :key="severity"
                class="shell-bottom-panel__toolbar-button shell-bottom-panel__severity-filter"
                :data-severity="severity"
                type="button"
                :aria-pressed="enabledSeverities.has(severity)"
                @click="toggleSeverity(severity)"
              >
                <span class="shell-bottom-panel__severity-dot" />
                <span>{{ outputSeverityLabels[severity] }}</span>
                <span class="shell-bottom-panel__severity-count">{{ severityCounts[severity] }}</span>
              </button>
            </div>
            <button
              class="shell-bottom-panel__toolbar-button shell-bottom-panel__output-clear"
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
import { COPY_ISSUE_ACTION_KEY } from '../spacePage'
import type { SpacePageProblems } from '../spacePage'
import {
  APP_OUTPUT_SEVERITIES,
  type AppOutputEntry,
  type AppOutputSeverity,
} from '../../logging/appOutput'
import { getAppErrorMeaning } from '../../logging/appErrorCatalog'
import { notifyAppError } from '../../notifications/titlebarNotices'

export type ShellBottomPanelTab = 'issues' | 'output'

const props = defineProps<{
  resizing?: boolean
  expanded: boolean
  activeTab: ShellBottomPanelTab
  issueCount: number
  issueSeverity: SpacePageProblems['severity']
  issueTreeData: OcNodeCollection
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
  'tab-change': [tab: ShellBottomPanelTab]
  'issue-expansion-change': [key: string, expanded: boolean]
  'issue-navigate': [key: string]
  'issue-copy': [key: string]
  'output-clear': []
}>()

const HOVER_COLLAPSE_DELAY_MS = 180
const panelElement = ref<HTMLElement | null>(null)
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
  if (props.resizing || pinned.value || !props.expanded || panelElement.value?.contains(document.activeElement)) return
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    if (props.resizing || panelElement.value?.contains(document.activeElement)) return
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

const tabs = computed<readonly { key: ShellBottomPanelTab; label: string }[]>(() => [
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
  if (!expanded && panelElement.value?.contains(document.activeElement)) toggleRef.value?.focus()
}, { flush: 'sync' })
watch(() => props.resizing, (resizing) => {
  if (!resizing && props.expanded) scheduleCollapse()
})
watch(() => [props.expanded, props.activeTab] as const, scrollOutputToEnd)
watch(visibleOutputEntries, scrollOutputToEnd)

function handleTabKeydown(event: KeyboardEvent, currentTab: ShellBottomPanelTab): void {
  let nextTab: ShellBottomPanelTab | null = null
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
  if (event.actionKey === COPY_ISSUE_ACTION_KEY) emit('issue-copy', event.key)
}

function handleIssueActivate(event: OcNodeActivateEvent): void {
  emit('issue-navigate', event.key)
}
</script>

<style scoped>
.shell-bottom-panel {
  position: relative;
  min-width: 0;
  height: 0;
  overflow: visible;
  border-radius: var(--oc-radius-surface);
  background: var(--oc-bg-surface);
}

.shell-bottom-panel__toggle {
  position: fixed;
  right: var(--oc-space-sm);
  bottom: var(--oc-space-sm);
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
  border-bottom-right-radius: var(--oc-radius-control);
  background: var(--oc-bg-surface);
  color: var(--oc-fg-muted);
  box-shadow: var(--oc-shadow-sm);
  transform: none;
  transition:
    border-color var(--oc-duration-quick) var(--oc-ease),
    background-color var(--oc-duration-quick) var(--oc-ease),
    color var(--oc-duration-quick) var(--oc-ease);
}

.shell-bottom-panel__toggle:hover,
.shell-bottom-panel__toggle:focus-visible {
  border-color: var(--oc-border-accent);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-accent);
  outline: none;
}

.shell-bottom-panel__toggle[data-issue-severity] {
  border-color: currentColor;
  background: var(--oc-bg-surface);
}

.shell-bottom-panel__toggle[data-issue-severity='error'] {
  color: var(--oc-fg-danger);
}

.shell-bottom-panel__toggle[data-issue-severity='warning'] {
  color: var(--oc-fg-warning);
}

.shell-bottom-panel__toggle[data-issue-severity='info'] {
  color: var(--oc-fg-accent);
}

.shell-bottom-panel__content {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: var(--shell-bottom-panel-height, var(--oc-list-max-height-md));
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--oc-bg-base);
  border-radius: inherit;
  transform: translateY(100%);
  pointer-events: none;
  transition: transform var(--oc-duration) var(--oc-ease);
}

.shell-bottom-panel.is-expanded {
  height: var(--shell-bottom-panel-height, var(--oc-list-max-height-md));
}

.shell-bottom-panel.is-expanded .shell-bottom-panel__content {
  transform: translateY(0);
  pointer-events: auto;
}

.shell-bottom-panel__tabs {
  min-height: 30px;
  display: flex;
  align-items: stretch;
  gap: var(--oc-space-2xs);
  padding: 0 var(--oc-space-sm);
  border-bottom: 1px solid var(--oc-border-muted);
}

.shell-bottom-panel__tab-list {
  display: flex;
  align-items: stretch;
  gap: var(--oc-space-2xs);
}

.shell-bottom-panel__tab {
  position: relative;
  min-width: 72px;
  padding: 0 var(--oc-space-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2xs);
  border: 0;
  background: transparent;
  color: var(--oc-fg-muted);
  font: inherit;
  font-size: var(--oc-text-sm);
}

.shell-bottom-panel__tab::after {
  content: '';
  position: absolute;
  right: var(--oc-space-xs);
  bottom: 0;
  left: var(--oc-space-xs);
  height: 2px;
  background: transparent;
}

.shell-bottom-panel__tab:hover,
.shell-bottom-panel__tab:focus-visible,
.shell-bottom-panel__tab.is-active {
  color: var(--oc-fg-default);
  outline: none;
}

.shell-bottom-panel__tab.is-active::after {
  background: var(--oc-border-accent);
}

.shell-bottom-panel__count {
  min-width: 16px;
  height: 16px;
  padding: 0 var(--oc-space-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-raised);
  color: var(--oc-icon-warning);
  font-size: var(--oc-text-xs);
  line-height: 1;
}

.shell-bottom-panel__tabpanel {
  min-height: 0;
  padding: var(--oc-space-xs) var(--oc-space-sm);
  overflow: auto;
}

.shell-bottom-panel__issues {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.shell-bottom-panel__issues-scroll {
  min-height: 0;
  overflow: auto;
}

.shell-bottom-panel__empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-sm);
}

.shell-bottom-panel__output-lines {
  display: grid;
  gap: var(--oc-space-2xs);
  font-family: var(--oc-font-mono);
  font-size: var(--oc-text-sm);
  color: var(--oc-fg-muted);
}

.shell-bottom-panel__output {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 0;
  overflow: hidden;
}

.shell-bottom-panel__output-toolbar {
  display: flex;
  align-items: end;
  min-width: 0;
}

.shell-bottom-panel__severity-dock {
  position: relative;
  min-width: 0;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  border-top-right-radius: var(--oc-radius-control);
  background: var(--oc-bg-surface);
}

.shell-bottom-panel__severity-filters {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--oc-space-2xs);
  padding: 0 var(--oc-space-xs);
  overflow-x: auto;
}

.shell-bottom-panel__severity-dock::before,
.shell-bottom-panel__severity-dock::after {
  content: '';
  position: absolute;
  width: var(--oc-radius-control);
  height: var(--oc-radius-control);
  pointer-events: none;
}

.shell-bottom-panel__severity-dock::before {
  top: calc(var(--oc-radius-control) * -1);
  left: 0;
  background: radial-gradient(
    circle at top right,
    transparent var(--oc-radius-control),
    var(--oc-bg-surface) var(--oc-radius-control)
  );
}

.shell-bottom-panel__severity-dock::after {
  right: calc(var(--oc-radius-control) * -1);
  bottom: 0;
  background: radial-gradient(
    circle at top right,
    transparent var(--oc-radius-control),
    var(--oc-bg-surface) var(--oc-radius-control)
  );
}

.shell-bottom-panel__toolbar-button {
  height: var(--oc-size-sm);
  padding: 0 var(--oc-space-xs);
  display: inline-flex;
  align-items: center;
  gap: var(--oc-space-2xs);
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--oc-fg-subtle);
  font: inherit;
  font-size: var(--oc-text-xs);
}

.shell-bottom-panel__toolbar-button:hover:not(:disabled),
.shell-bottom-panel__toolbar-button:focus-visible {
  color: var(--oc-fg-default);
  outline: none;
}

.shell-bottom-panel__toolbar-button:focus-visible {
  text-decoration: underline;
}

.shell-bottom-panel__toolbar-button:disabled {
  color: var(--oc-fg-disabled);
}

.shell-bottom-panel__severity-filter[aria-pressed='true'] {
  color: var(--oc-fg-default);
}

.shell-bottom-panel__severity-dot {
  width: var(--oc-space-2xs);
  height: var(--oc-space-2xs);
  flex: 0 0 auto;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-muted);
}

.shell-bottom-panel__severity-filter[data-severity='info'] .shell-bottom-panel__severity-dot {
  background: var(--oc-fg-default);
}

.shell-bottom-panel__severity-filter[data-severity='success'] .shell-bottom-panel__severity-dot {
  background: var(--oc-fg-success);
}

.shell-bottom-panel__severity-filter[data-severity='warning'] .shell-bottom-panel__severity-dot {
  background: var(--oc-fg-warning);
}

.shell-bottom-panel__severity-filter[data-severity='error'] .shell-bottom-panel__severity-dot {
  background: var(--oc-fg-danger);
}

.shell-bottom-panel__severity-count {
  color: var(--oc-fg-muted);
  font-variant-numeric: tabular-nums;
}

.shell-bottom-panel__output-scroll {
  min-height: 0;
  padding: var(--oc-space-xs) var(--oc-space-sm);
  overflow: auto;
}

.shell-bottom-panel__output-line {
  width: 100%;
  min-height: var(--oc-size-sm);
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: start;
  gap: var(--oc-space-xs);
  padding: var(--oc-space-2xs) var(--oc-space-xs);
  border: 0;
  border-radius: var(--oc-radius-control);
  background-color: var(--oc-bg-block);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: copy;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.shell-bottom-panel__output-line[data-severity='success'] {
  background-color: var(--oc-bg-success-subtle);
}

.shell-bottom-panel__output-line[data-severity='warning'] {
  background-color: var(--oc-bg-warning-subtle);
}

.shell-bottom-panel__output-line[data-severity='error'] {
  background-color: var(--oc-bg-danger-subtle);
}

.shell-bottom-panel__output-line:hover,
.shell-bottom-panel__output-line:focus-visible {
  background-image: var(--oc-overlay-hover);
  outline: none;
}

.shell-bottom-panel__output-line:focus-visible {
  box-shadow: var(--oc-focus-ring);
}

.shell-bottom-panel__output-error-code {
  color: var(--oc-fg-danger);
  font: inherit;
}

.shell-bottom-panel__output-detail {
  grid-column: 3;
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-xs);
}

.shell-bottom-panel__output-line time {
  color: var(--oc-fg-subtle);
  font-variant-numeric: tabular-nums;
}

.shell-bottom-panel__output-severity {
  color: var(--oc-fg-muted);
  text-transform: uppercase;
}

.shell-bottom-panel__output-line[data-severity='info'] .shell-bottom-panel__output-severity,
.shell-bottom-panel__output-line[data-severity='info'] .shell-bottom-panel__output-message {
  color: var(--oc-fg-default);
}

.shell-bottom-panel__output-line[data-severity='success'] .shell-bottom-panel__output-severity,
.shell-bottom-panel__output-line[data-severity='success'] .shell-bottom-panel__output-message {
  color: var(--oc-fg-success);
}

.shell-bottom-panel__output-line[data-severity='warning'] .shell-bottom-panel__output-severity,
.shell-bottom-panel__output-line[data-severity='warning'] .shell-bottom-panel__output-message {
  color: var(--oc-fg-warning);
}

.shell-bottom-panel__output-line[data-severity='error'] .shell-bottom-panel__output-severity,
.shell-bottom-panel__output-line[data-severity='error'] .shell-bottom-panel__output-message {
  color: var(--oc-fg-danger);
}
</style>
