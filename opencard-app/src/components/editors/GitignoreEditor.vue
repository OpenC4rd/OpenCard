<!-- 业务 忽略项编辑器：舞台是规则的预览树，右侧是规则列表和当前规则的属性；注释和空行原样留在文件里。 -->
<template>
  <MonacoEditor v-if="editorState.mode === 'diff'" :model-value="editorState.draftContent ?? ''" language="plaintext"
    :mode="editorState.mode" :comparison="props.comparison" :theme-id="themeId" :theme-overrides="themeOverrides" />
  <ProjectRegistryEditorShell v-else content-mode="workspace">
    <ProjectResourceWorkbench :inspector-title="t('gitignoreEditor.rules')" :inspector-actions="ruleActions"
      :footer-title="t('cardDesigner.panels.properties')" @action="handleRuleAction">
      <div class="gitignore-editor__stage">
        <OcCard fill variant="glass" :padding="false" :title="t('gitignoreEditor.source')">
          <MonacoEditor ref="sourceRef" :session="session" language="plaintext" :theme-id="themeId"
            :theme-overrides="themeOverrides" @cursor-line="followCursor" />
        </OcCard>
      </div>

      <template #inspector>
        <OcTree v-if="entries.length" fill role="listbox" :data="ruleList" :selected-keys="selectedRuleKeys"
          selection-mode="single" scroll-to-selection @selection-change="selectRule" @action="handleRowAction" />
        <OcEmpty v-else tone="muted" fill>{{ t('gitignoreEditor.empty') }}</OcEmpty>
      </template>
      <template #footer>
        <div v-if="selected" class="gitignore-editor__form">
          <label>
            <OcText as="span" size="sm" tone="muted">{{ t('gitignoreEditor.action') }}</OcText>
            <OcSelect full-width :model-value="selected.rule.keep ? 'keep' : 'ignore'" :options="actionOptions"
              @update:model-value="setField('action', $event)" />
          </label>
          <label>
            <OcText as="span" size="sm" tone="muted">{{ t('gitignoreEditor.match') }}</OcText>
            <OcSelect full-width :model-value="selected.rule.match" :options="matchOptions"
              @update:model-value="setField('match', $event)" />
          </label>
          <label>
            <OcText as="span" size="sm" tone="muted">{{ t(`gitignoreEditor.value.${selected.rule.match}`) }}</OcText>
            <OcFieldInput full-width mono :value="selected.rule.value" @change="setField('value', fieldText($event))" />
          </label>
          <label v-if="selected.rule.match !== 'custom'">
            <OcText as="span" size="sm" tone="muted">{{ t('gitignoreEditor.scope') }}</OcText>
            <OcFieldInput full-width :value="selected.rule.scope" :placeholder="t('gitignoreEditor.scopeHint')"
              @change="setField('scope', fieldText($event))" />
          </label>
        </div>
        <OcEmpty v-else tone="muted" icon="mdiEyeOffOutline" fill>{{ t('gitignoreEditor.noSelection') }}</OcEmpty>
      </template>
    </ProjectResourceWorkbench>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorProps } from '../../features/editor-runtime/editorProtocol'
import {
  customGitignoreRule,
  formatGitignoreRule,
  joinGitignoreLines,
  parseGitignoreRule,
  ineffectiveKeepLines,
  readGitignoreRules,
  retargetGitignoreRule,
  splitGitignoreLines,
  type GitignoreMatch,
  type GitignoreRule,
  type GitignoreRuleEntry,
} from '../../features/version-control/gitignoreRules'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type {
  OcNode,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeKey,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcCard from '../standard/OcCard.vue'
import OcSelect, { type OcSelectOption } from '../standard/OcSelect.vue'
import OcTree from '../standard/OcTree.vue'
import MonacoEditor from './MonacoEditor.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'

const ADD_ACTION_KEY = 'add-rule'
const ADD_PATTERN_PREFIX = 'add-pattern:'
const NEW_RULE_PATTERN = '*.tmp'
const COMMON_PATTERNS = ['.DS_Store', 'node_modules/', 'dist/', '*.log', '.env']
const MATCH_ICONS: Record<GitignoreMatch, IconToken> = {
  extension: 'mdiFileMultipleOutline', name: 'mdiFileOutline', folder: 'mdiFolder', custom: 'mdiFileCogOutline',
}

const props = defineProps<EditorProps>()
const editorState = computed(() => props.session.state)
const themeId = computed(() => props.themeId ?? 'dark')
const themeOverrides = computed(() => props.themeOverrides ?? {})
const { t } = useI18n()

const selectedLine = ref<number | null>(null)
const sourceRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
/** 用户手动切成自定义的行：文本能解析也按原文显示，否则切过去会立刻被解析回去。 */
const rawPatterns = ref<ReadonlySet<string>>(new Set())

const lines = computed(() => splitGitignoreLines(editorState.value.draftContent ?? ''))
const entries = computed(() => readGitignoreRules(lines.value).map(entry => {
  const text = lines.value[entry.line]!.trim()
  return rawPatterns.value.has(text) ? { ...entry, rule: customGitignoreRule(text) } : entry
}))
const ineffective = computed(() => ineffectiveKeepLines(entries.value))
/** 选中的行被删掉或撤销掉时落到第一条，右侧属性始终有东西可编辑。 */
const selected = computed(() => entries.value.find(entry => entry.line === selectedLine.value) ?? entries.value[0] ?? null)
const selectedRuleKeys = computed(() => selected.value ? [`rule:${selected.value.line}`] : [])

function describeRule(rule: GitignoreRule): string {
  return t(`gitignoreEditor.describe.${rule.match}`, { name: rule.value })
}
function ruleVisual(rule: GitignoreRule): OcNode['visual'] {
  return { type: 'icon', icon: MATCH_ICONS[rule.match] }
}
function actionLabel(rule: GitignoreRule): string {
  return t(rule.keep ? 'gitignoreEditor.keep' : 'gitignoreEditor.ignore')
}

const ruleList = computed<OcNodeCollection>(() => ({
  rootKeys: entries.value.map(entry => `rule:${entry.line}`),
  items: new Map(entries.value.map(({ line, rule }): [OcNodeKey, OcNode] => [`rule:${line}`, {
    label: describeRule(rule),
    visual: ruleVisual(rule),
    tone: ineffective.value.has(line) ? 'warning' : rule.keep ? 'default' : 'muted',
    tail: [
      ...(ineffective.value.has(line) ? [t('gitignoreEditor.ineffective')] : rule.scope ? [`${rule.scope}/`] : []),
      ...(rule.keep ? [actionLabel(rule)] : []),
      { key: 'remove', title: t('gitignoreEditor.remove'), icon: 'mdiTrashCanOutline', iconTone: 'danger' },
    ],
  }])),
  children: new Map(),
}))

const ruleActions = computed<OcActionDefinition[]>(() => {
  const present = new Set(lines.value.map(line => line.trim()))
  return [{
    key: ADD_ACTION_KEY,
    icon: 'mdiPlus',
    title: t('gitignoreEditor.add'),
    children: [
      { key: `${ADD_PATTERN_PREFIX}${NEW_RULE_PATTERN}`, title: t('gitignoreEditor.newRule') },
      ...COMMON_PATTERNS.filter(pattern => !present.has(pattern)).map(pattern => ({
        key: `${ADD_PATTERN_PREFIX}${pattern}`, title: describeRule(parseGitignoreRule(pattern)),
      })),
    ],
  }]
})

const actionOptions = computed<OcSelectOption[]>(() => [
  { value: 'ignore', label: t('gitignoreEditor.ignore') },
  { value: 'keep', label: t('gitignoreEditor.keep') },
])
const matchOptions = computed<OcSelectOption[]>(() => (['extension', 'name', 'folder', 'custom'] as const)
  .map(value => ({ value, label: t(`gitignoreEditor.matchKind.${value}`) })))

function commit(next: readonly string[]): void {
  props.session.updateContent(joinGitignoreLines(next))
}
function addPattern(pattern: string): void {
  const existing = lines.value.findIndex(line => line.trim() === pattern)
  const line = existing < 0 ? lines.value.length : existing
  selectedLine.value = line
  if (existing < 0) commit([...lines.value, pattern])
  void nextTick(() => sourceRef.value?.revealLine(line + 1))
}
function replaceRule(entry: GitignoreRuleEntry, rule: GitignoreRule): void {
  commit(lines.value.map((line, index) => index === entry.line ? formatGitignoreRule(rule) : line))
}

function lineOf(key: OcNodeKey | undefined): number | null {
  return key?.startsWith('rule:') ? Number(key.slice('rule:'.length)) : null
}
function selectRule(event: OcNodeSelectionEvent): void {
  const line = lineOf(event.selectedKeys[0])
  if (line === null) return
  selectedLine.value = line
  sourceRef.value?.revealLine(line + 1)
}
/** 光标落在规则行上就选中它；落在注释或空行上保持原选择。 */
function followCursor(lineNumber: number): void {
  if (entries.value.some(entry => entry.line === lineNumber - 1)) selectedLine.value = lineNumber - 1
}
function handleRuleAction({ key }: { key: string }): void {
  if (key.startsWith(ADD_PATTERN_PREFIX)) addPattern(key.slice(ADD_PATTERN_PREFIX.length))
}
function handleRowAction(event: OcNodeActionEvent): void {
  const line = lineOf(event.key)
  if (event.actionKey === 'remove' && line !== null) commit(lines.value.filter((_, index) => index !== line))
}

function changeMatch(entry: GitignoreRuleEntry, match: GitignoreMatch): void {
  const text = lines.value[entry.line]!.trim()
  const raw = new Set(rawPatterns.value)
  if (match === 'custom') raw.add(text)
  else raw.delete(text)
  rawPatterns.value = raw
  if (match !== 'custom') replaceRule(entry, retargetGitignoreRule(parseGitignoreRule(text), match))
}

function fieldText(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function setField(field: 'action' | 'match' | 'value' | 'scope', input: string): void {
  const entry = selected.value
  if (!entry) return
  const { rule } = entry
  const value = input.trim()
  if (field === 'action') replaceRule(entry, { ...rule, keep: value === 'keep' })
  else if (field === 'match') changeMatch(entry, value as GitignoreMatch)
  else if (field === 'scope') replaceRule(entry, { ...rule, scope: value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') })
  else if (value) {
    replaceRule(entry, { ...rule, value: rule.match === 'custom' ? value
      : rule.match === 'extension' ? value.replace(/^\*?\./, '') : value.replace(/^\/+|\/+$/g, '') })
  }
}

const presentation = computed<EditorPresentation>(() => ({
  title: t('gitignoreEditor.title'),
  description: t('gitignoreEditor.description'),
  icon: 'mdiEyeOffOutline',
}))
defineExpose({ presentation })
</script>

<style scoped>
.gitignore-editor__stage {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding-block: var(--oc-space-xs);
}
.gitignore-editor__form { font-size: var(--oc-text-base); display: grid; gap: var(--oc-space-xs); min-width: 0; }
.gitignore-editor__form label { display: grid; gap: var(--oc-space-2xs); }
</style>
