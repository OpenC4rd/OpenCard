<!-- Settings rows consume prepared UI data and return semantic user intent. -->
<template>
  <section ref="workspaceRef" class="settings-content" :aria-label="viewModel.title"
    @scroll.passive="schedulePreviewPresentation">
  <div class="settings-content__content" :class="{ 'has-preview': previewContent }">
      <template v-if="previewContent">
        <div ref="previewStageRef" class="settings-content__preview-stage" aria-hidden="true">
          <div ref="previewGlassRef" class="settings-content__preview-glass" />
          <div ref="previewSurfaceRef" class="settings-content__preview-surface">
            <div ref="previewRef" class="settings-content__preview">
          <div class="settings-content__preview-titlebar">
            <AppearanceShaderPreview :progress="0.64" />
            <span class="settings-content__preview-brand" />
            <div class="settings-content__preview-window-dots">
              <i /><i /><i />
            </div>
          </div>
          <div class="settings-content__preview-body">
            <aside class="settings-content__preview-sidebar">
              <span class="settings-content__preview-section-line" />
              <span v-for="index in 5" :key="index" class="settings-content__preview-row"
                :class="{ 'is-selected': index === 2, 'is-short': index === 4 }">
                <i /><b />
              </span>
              <OcPhaseImage
                class="settings-content__preview-sidebar-logo"
                :src="previewLogoPhase"
                fit="contain"
                :duration-ms="12_000"
                direction="reverse"
              />
            </aside>
            <main class="settings-content__preview-workspace">
              <header class="settings-content__preview-page-header">
                <span />
                <i /><i />
              </header>
              <div class="settings-content__preview-editor">
                <AppearanceShaderPreview variant="dot-noise" />
                <section class="settings-content__preview-panel">
                  <span class="settings-content__preview-section-line" />
                  <span class="settings-content__preview-row is-selected"><i /><b /></span>
                  <span class="settings-content__preview-row is-indented"><i /><b /></span>
                </section>
                <div class="settings-content__preview-canvas">
                  <div class="settings-content__preview-document">
                    <div class="settings-content__preview-card-corner">
                      <b>7</b><span>♣</span>
                    </div>
                    <div class="settings-content__preview-card-pips">
                      <i v-for="index in 7" :key="index">♣</i>
                    </div>
                    <div class="settings-content__preview-card-corner is-bottom">
                      <b>7</b><span>♣</span>
                    </div>
                  </div>
                </div>
                <section class="settings-content__preview-panel settings-content__preview-properties">
                  <span class="settings-content__preview-section-line" />
                  <span v-for="index in 3" :key="index" class="settings-content__preview-property"
                    :class="{ 'is-accented': index === 2 }">
                    <i /><b />
                  </span>
                </section>
              </div>
            </main>
          </div>
            </div>
          </div>
        </div>
        <div ref="previewSpacerRef" class="settings-content__preview-spacer" aria-hidden="true" />
    </template>

    <div class="settings-content__cards">
      <OcCard
        v-for="card in viewModel.cards"
        :key="card.key"
        class="settings-content__card"
        variant="plain"
        :title="card.title"
        :icon="card.icon"
        :actions="card.actions"
        @action="handleCardAction(card, $event.key)"
      >
        <PagePropertyEditor
          :items="card.items"
          @editor-preview="intent => handleEditorPreview(card, intent)"
          @editor-commit="intent => handleEditorCommit(card, intent)"
          @editor-cancel="intent => handleEditorCancel(card, intent)"
        />
      </OcCard>
    </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import previewLogoPhase from '../../../assets/opencard-logo-phase-map.png'
import OcCard from '../../../components/standard/OcCard.vue'
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue'
import { reducedMotionQuery } from '../../../shared/ui/foundation'
import PagePropertyEditor from '../../../shared/ui/property-editor/PagePropertyEditor.vue'
import type {
  EditorItem,
  EditorItemCancelIntent,
  EditorItemEditorPart,
  EditorItemValueIntent,
} from '../../../shared/ui/property-editor/propertyEditor.types'
import type { OcEditableThemeColorKey, OcThemeId } from '../../../shared/ui/foundation'
import AppearanceShaderPreview from './AppearanceShaderPreview.vue'
import type { AppSettingKey, SettingsIntent } from '../model/appSettings'
import type {
  SettingsCardViewModel,
  SettingsCategoryViewModel,
} from '../composables/useSettingsViewModel'

const props = defineProps<{
  viewModel: SettingsCategoryViewModel
  /** 要带到前台的设置项 key：进入/切换分类后把它滚入视野并高亮一次。 */
  focusKey?: string
}>()

const emit = defineEmits<{
  intent: [intent: SettingsIntent]
}>()

const previewContent = computed(() => props.viewModel.preview)

const workspaceRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const previewStageRef = ref<HTMLElement | null>(null)
const previewGlassRef = ref<HTMLElement | null>(null)
const previewSurfaceRef = ref<HTMLElement | null>(null)
const previewSpacerRef = ref<HTMLElement | null>(null)

type PreviewMetrics = {
  baseHeight: number
  mediumHeight: number
  shrinkDistance: number
  minimumOpacity: number
  maximumOpacity: number
}

let previewMetrics: PreviewMetrics | null = null
let previewPresentationFrame: number | null = null
let previewMeasureFrame: number | null = null

function readNumericToken(element: HTMLElement, styles: CSSStyleDeclaration, token: string): number {
  const source = element.style.getPropertyValue(token) || styles.getPropertyValue(token)
  const value = Number.parseFloat(source)
  return Number.isFinite(value) ? value : 0
}

function updatePreviewPresentation(): void {
  previewPresentationFrame = null
  const workspace = workspaceRef.value
  const stage = previewStageRef.value
  const metrics = previewMetrics
  if (!workspace || !stage || !metrics) return
  const progress = Math.min(1, Math.max(0, workspace.scrollTop / metrics.shrinkDistance))
  const minimumScale = Math.min(1, metrics.mediumHeight / metrics.baseHeight)
  const scale = 1 + ((minimumScale - 1) * progress)
  const opacity = metrics.minimumOpacity
    + ((metrics.maximumOpacity - metrics.minimumOpacity) * progress)
  stage.style.setProperty('--settings-preview-scale', String(scale))
  stage.style.setProperty('--settings-preview-glass-opacity', String(opacity))
}

function schedulePreviewPresentation(): void {
  if (previewPresentationFrame !== null) return
  previewPresentationFrame = requestAnimationFrame(updatePreviewPresentation)
}

function measurePreviewGeometry(): void {
  previewMeasureFrame = null
  const workspace = workspaceRef.value
  const preview = previewRef.value
  const glass = previewGlassRef.value
  const surface = previewSurfaceRef.value
  const spacer = previewSpacerRef.value
  if (!workspace || !preview || !glass || !surface || !spacer) return
  const styles = getComputedStyle(workspace)
  const largeHeight = readNumericToken(workspace, styles, '--oc-settings-preview-height-lg')
  const mediumHeight = readNumericToken(workspace, styles, '--oc-settings-preview-height-md')
  const shrinkDistance = readNumericToken(workspace, styles, '--oc-settings-preview-shrink-distance')
  if (!largeHeight || !mediumHeight || !shrinkDistance) return
  preview.style.maxWidth = `${largeHeight * (16 / 9)}px`
  const baseHeight = preview.offsetHeight
  if (!baseHeight) return
  glass.style.height = `${baseHeight}px`
  surface.style.height = `${baseHeight}px`
  spacer.style.height = `${baseHeight}px`
  previewMetrics = {
    baseHeight,
    mediumHeight,
    shrinkDistance,
    minimumOpacity: readNumericToken(workspace, styles, '--oc-settings-preview-glass-opacity-min'),
    maximumOpacity: readNumericToken(workspace, styles, '--oc-settings-preview-glass-opacity-max'),
  }
  updatePreviewPresentation()
}

function schedulePreviewMeasurement(): void {
  if (previewMeasureFrame !== null) return
  previewMeasureFrame = requestAnimationFrame(measurePreviewGeometry)
}

let previewResizeObserver: ResizeObserver | null = null
onMounted(() => {
  measurePreviewGeometry()
  if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
    previewResizeObserver = new ResizeObserver(schedulePreviewMeasurement)
    previewResizeObserver.observe(workspaceRef.value)
  }
})
watch(previewContent, async preview => {
  previewMetrics = null
  if (!preview) return
  await nextTick()
  measurePreviewGeometry()
})
onBeforeUnmount(() => {
  previewResizeObserver?.disconnect()
  if (previewPresentationFrame !== null) cancelAnimationFrame(previewPresentationFrame)
  if (previewMeasureFrame !== null) cancelAnimationFrame(previewMeasureFrame)
  if (focusHighlightTimer !== null) window.clearTimeout(focusHighlightTimer)
  focusHighlightedRow?.classList.remove('is-settings-focus')
  focusHighlightedRow = null
})

const FOCUS_HIGHLIGHT_MS = 1600
let focusHighlightTimer: number | null = null
let focusHighlightedRow: HTMLElement | null = null

/** 把带 focusKey 的那一行滚进视野并高亮一会儿；只对当前分类里存在的行生效。 */
function revealFocusedRow(key: string): void {
  const root = workspaceRef.value
  if (!root) return
  const row = root.querySelector<HTMLElement>(`[data-item-key="${key}"]`)
  if (!row) return
  const reducedMotion = reducedMotionQuery()?.matches ?? false
  row.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
  focusHighlightedRow?.classList.remove('is-settings-focus')
  focusHighlightedRow = row
  row.classList.add('is-settings-focus')
  if (focusHighlightTimer !== null) window.clearTimeout(focusHighlightTimer)
  focusHighlightTimer = window.setTimeout(() => {
    focusHighlightTimer = null
    focusHighlightedRow?.classList.remove('is-settings-focus')
    focusHighlightedRow = null
  }, FOCUS_HIGHLIGHT_MS)
}

watch(() => [props.focusKey, props.viewModel.key] as const, async ([key]) => {
  if (!key) return
  await nextTick()
  revealFocusedRow(key)
}, { immediate: true })

function emitSettingChange(key: Extract<SettingsIntent, { type: 'setting.change' }>['key'], value: unknown): void {
  emit('intent', { type: 'setting.change', key, value })
}
function emitSettingPreview(key: Extract<SettingsIntent, { type: 'setting.preview' }>['key'], value: unknown): void {
  emit('intent', { type: 'setting.preview', key, value })
}

const themeColorSnapshots = new Map<string, string | null>()

function findItem(items: readonly EditorItem[], path: readonly string[]): EditorItem | undefined {
  const [key, ...remaining] = path
  const item = items.find(candidate => candidate.key === key)
  if (!item || remaining.length === 0) return item
  return findItem(item.children ?? [], remaining)
}

function findEditor(
  items: readonly EditorItem[],
  path: readonly string[],
  editorKey: string,
): EditorItemEditorPart | undefined {
  return findItem(items, path)?.content?.find((part): part is EditorItemEditorPart => (
    typeof part !== 'string' && part.type === 'editor' && part.key === editorKey
  ))
}

/** 主题 card 的行直接就是主题的子项，所以 card key 决定这套改动落到哪套主题。 */
function themeIdOfCard(card: SettingsCardViewModel): OcThemeId | null {
  const match = card.key.match(/^theme:(dark|light)$/)
  return match ? match[1] as OcThemeId : null
}

function colorToken(childKey: string): OcEditableThemeColorKey | null {
  return childKey.startsWith('color:') ? childKey.slice('color:'.length) as OcEditableThemeColorKey : null
}

function snapshotKey(themeId: OcThemeId, token: OcEditableThemeColorKey): string {
  return `${themeId}:${token}`
}

function handleEditorPreview(card: SettingsCardViewModel, intent: EditorItemValueIntent): void {
  const themeId = themeIdOfCard(card)
  if (!themeId) {
    emitSettingPreview(intent.itemPath[0] as AppSettingKey, intent.value)
    return
  }
  const childKey = intent.itemPath[0]
  if (childKey === 'angle') {
    emit('intent', { type: 'theme-angle.preview', themeId, value: intent.value as number })
    return
  }
  const token = colorToken(childKey)
  if (!token) return
  const key = snapshotKey(themeId, token)
  if (!themeColorSnapshots.has(key)) {
    const editor = findEditor(card.items, intent.itemPath, intent.editorKey)
    themeColorSnapshots.set(key, typeof editor?.definition.defaultValue === 'string'
      ? editor.definition.defaultValue
      : null)
  }
  emit('intent', { type: 'theme-color.preview', themeId, token, value: intent.value as string })
}

function handleEditorCommit(card: SettingsCardViewModel, intent: EditorItemValueIntent): void {
  const themeId = themeIdOfCard(card)
  if (!themeId) {
    emitSettingChange(intent.itemPath[0] as AppSettingKey, intent.value)
    return
  }
  const childKey = intent.itemPath[0]
  if (childKey === 'name') {
    const name = String(intent.value).trim()
    if (name) emit('intent', { type: 'theme-name.change', themeId, name })
    return
  }
  if (childKey === 'preset') {
    if (intent.value) emit('intent', { type: 'theme-preset.change', themeId, presetId: String(intent.value) })
    return
  }
  if (childKey === 'font') {
    emit('intent', { type: 'theme-font.change', themeId, value: String(intent.value).trim() || 'system' })
    return
  }
  if (childKey === 'angle') {
    emit('intent', { type: 'theme-angle.change', themeId, value: intent.value as number })
    return
  }
  const token = colorToken(childKey)
  if (!token) return
  themeColorSnapshots.delete(snapshotKey(themeId, token))
  emit('intent', { type: 'theme-color.change', themeId, token, value: intent.value as string })
}

function handleEditorCancel(card: SettingsCardViewModel, intent: EditorItemCancelIntent): void {
  const themeId = themeIdOfCard(card)
  if (!themeId) return
  const token = colorToken(intent.itemPath[0])
  if (!token) return
  const key = snapshotKey(themeId, token)
  const snapshot = themeColorSnapshots.get(key)
  themeColorSnapshots.delete(key)
  emit('intent', { type: 'theme-color.cancel', themeId, token, value: snapshot ?? null })
}

function handleCardAction(card: SettingsCardViewModel, actionKey: string): void {
  const themeId = themeIdOfCard(card)
  if (themeId && (actionKey === 'theme.copy' || actionKey === 'theme.read')) {
    emit('intent', { type: actionKey, themeId })
    return
  }
  if (themeId && actionKey === 'theme-preset.delete') {
    const presetId = String(findEditor(card.items, ['preset'], 'value')?.value ?? '')
    if (presetId.startsWith('user:')) emit('intent', { type: 'theme-preset.delete', themeId, presetId })
    return
  }
  if (actionKey === 'identity.regenerate') {
    emit('intent', { type: 'identity.regenerate' })
    return
  }
  if (actionKey === 'locale.refresh') emit('intent', { type: 'locale.refresh' })
  if (actionKey === 'locale-folder.open') emit('intent', { type: 'locale-folder.open' })
  if (actionKey === 'project-workspace.reset') emit('intent', { type: 'project-workspace.reset' })
  if (actionKey === 'cache.clear') emit('intent', { type: 'cache.clear' })
}
</script>

<style scoped>
.settings-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.settings-content__content {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--oc-content-width-md);
  margin-inline: auto;
  padding: var(--oc-space-lg) var(--oc-space-lg);
}

.settings-content__content.has-preview { padding-top: 0; }

.settings-content__cards {
  display: grid;
  gap: var(--oc-space-lg);
}

/* 跳转落点：短暂勾一圈主题色，提示"就是这一行"。 */
.settings-content :deep(.is-settings-focus) {
  border-radius: var(--oc-radius-control);
  outline: 2px solid var(--oc-accent);
  outline-offset: 2px;
  animation: settings-focus-pulse var(--oc-duration) var(--oc-ease) 1;
}

@keyframes settings-focus-pulse {
  from { outline-color: transparent; }
  to { outline-color: var(--oc-accent); }
}

@media (prefers-reduced-motion: reduce) {
  .settings-content :deep(.is-settings-focus) { animation: none; }
}

.settings-content__preview-stage {
  --settings-preview-scale: 1;
  --settings-preview-glass-opacity: 0;

  position: sticky;
  top: var(--oc-settings-preview-sticky-offset);
  z-index: var(--oc-z-settings-preview);
  isolation: isolate;
  width: 100%;
  height: 0;
  pointer-events: none;
}

.settings-content__preview-surface {
  position: absolute;
  z-index: 1;
  inset-block-start: 0;
  inset-inline-start: 0;
  display: grid;
  align-items: start;
  justify-items: center;
  width: 100%;
  border-radius: 0 0 var(--oc-radius-surface) var(--oc-radius-surface);
  transform: scale(var(--settings-preview-scale));
  transform-origin: top center;
  will-change: transform;
}

.settings-content__preview-glass {
  position: absolute;
  z-index: 0;
  inset-block-start: 0;
  inset-inline-start: 0;
  width: 100%;
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: 0 0 var(--oc-radius-surface) var(--oc-radius-surface);
  background: var(--oc-bg-glass);
  box-shadow: var(--oc-shadow-md);
  opacity: var(--settings-preview-glass-opacity);
  backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
  transform: scaleY(var(--settings-preview-scale));
  transform-origin: top center;
  will-change: transform, opacity;
}

/*
 * 这一层不是"项与项之间的间距"，而是 sticky 预览的**占位块**：预览舞台自身 height: 0，
 * 由它在正常流里撑出预览的高度（脚本按预览高度写 height），margin-bottom 就是它与下方卡片的间距。
 * 舞台必须留在流外的 0 高度，所以这段间距没法交给上级容器的 gap。
 */
.settings-content__preview-spacer {
  margin-bottom: var(--oc-space-lg);
}

.settings-content__preview {
  position: relative;
  z-index: 1;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--oc-border-muted);
  border-radius: 0 0 var(--oc-radius-surface) var(--oc-radius-surface);
  background: var(--oc-bg-base);
  box-shadow: var(--oc-shadow-md);
}

.settings-content__preview-titlebar {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 var(--oc-space-sm);
  background: var(--oc-bg-base);
}

.settings-content__preview-brand {
  position: relative;
  z-index: 1;
  width: 54px;
  height: 5px;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-subtle);
  opacity: 0.7;
}

.settings-content__preview-window-dots {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 6px;
}

.settings-content__preview-window-dots i {
  width: 7px;
  height: 7px;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-default);
  opacity: 0.82;
}

.settings-content__preview-body {
  display: grid;
  grid-template-columns: 24% 1fr;
  height: calc(100% - 34px);
}

.settings-content__preview-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-xs);
  padding: var(--oc-space-md) var(--oc-space-sm);
  border-right: 1px solid var(--oc-border-muted);
  background: var(--oc-bg-base);
}

.settings-content__preview-sidebar-logo {
  width: var(--oc-size-lg);
  height: var(--oc-size-lg);
  margin-top: auto;
  align-self: center;
  object-fit: contain;
}

.settings-content__preview-section-line {
  display: block;
  width: 42%;
  height: 4px;
  margin: var(--oc-space-2xs) var(--oc-space-xs) var(--oc-space-xs);
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-subtle);
  opacity: 0.65;
}

.settings-content__preview-row {
  display: flex;
  align-items: center;
  gap: var(--oc-space-xs);
  height: var(--oc-size-sm);
  padding: 0 var(--oc-space-xs);
  border-radius: var(--oc-radius-control);
}

.settings-content__preview-row i,
.settings-content__preview-page-header i {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-muted);
}

.settings-content__preview-row b {
  width: 62%;
  height: 4px;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-muted);
  opacity: 0.72;
}

.settings-content__preview-row.is-short b { width: 38%; }
.settings-content__preview-row.is-indented { margin-left: var(--oc-space-sm); }

.settings-content__preview-row.is-selected {
  background-color: var(--oc-bg-selected);
}

.settings-content__preview-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 28px minmax(0, 1fr);
  background: var(--oc-bg-surface);
}

.settings-content__preview-page-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-xs);
  padding: 0 var(--oc-space-sm);
  border-bottom: 1px solid var(--oc-border-muted);
  background: color-mix(in srgb, var(--oc-bg-surface) 94%, var(--oc-bg-raised));
}

.settings-content__preview-page-header > span {
  width: 48px;
  height: 4px;
  margin-right: auto;
  border-radius: var(--oc-radius-pill);
  background: var(--oc-fg-muted);
}

.settings-content__preview-editor {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-columns: 22% minmax(0, 1fr) 28%;
  gap: var(--oc-space-2xs);
  background: var(--oc-bg-base);
}

.settings-content__preview-panel {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--oc-space-xs);
  padding: var(--oc-space-sm) var(--oc-space-xs);
  background: var(--oc-bg-glass);
  backdrop-filter: blur(var(--oc-bg-glass-blur)) saturate(var(--oc-bg-glass-saturate));
}

.settings-content__preview-canvas {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: transparent;
}

.settings-content__preview-document {
  position: relative;
  z-index: 1;
  width: 44%;
  aspect-ratio: 5 / 7;
  overflow: hidden;
  border: 1px solid var(--oc-border-strong);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-raised);
  box-shadow: var(--oc-shadow-md);
}

.settings-content__preview-card-corner {
  position: absolute;
  top: 7%;
  left: 9%;
  display: grid;
  justify-items: center;
  color: var(--oc-accent);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 0.8;
}

.settings-content__preview-card-corner b {
  font-size: var(--oc-text-base);
  font-weight: 600;
}

.settings-content__preview-card-corner span {
  font-size: var(--oc-text-base);
}

.settings-content__preview-card-corner.is-bottom {
  inset: auto 9% 7% auto;
  transform: rotate(180deg);
}

.settings-content__preview-card-pips {
  position: absolute;
  display: grid;
  grid-template: repeat(5, 1fr) / repeat(3, 1fr);
  inset: 16% 22%;
  color: var(--oc-accent);
}

.settings-content__preview-card-pips i {
  align-self: center;
  justify-self: center;
  font: 19px/1 Georgia, 'Times New Roman', serif;
  font-style: normal;
}

.settings-content__preview-card-pips i:nth-child(1) { grid-area: 1 / 1; }
.settings-content__preview-card-pips i:nth-child(2) { grid-area: 1 / 3; }
.settings-content__preview-card-pips i:nth-child(3) { grid-area: 3 / 1; }
.settings-content__preview-card-pips i:nth-child(4) { grid-area: 3 / 3; }
.settings-content__preview-card-pips i:nth-child(5) { grid-area: 2 / 2; }
.settings-content__preview-card-pips i:nth-child(6) { grid-area: 5 / 1; transform: rotate(180deg); }
.settings-content__preview-card-pips i:nth-child(7) { grid-area: 5 / 3; transform: rotate(180deg); }

.settings-content__preview-property {
  display: grid;
  gap: var(--oc-space-2xs);
}

.settings-content__preview-property i,
.settings-content__preview-property b {
  display: block;
  border-radius: var(--oc-radius-control);
  background: var(--oc-fg-muted);
  opacity: 0.55;
}

.settings-content__preview-property i { width: 38%; height: 4px; }
.settings-content__preview-property b {
  width: 100%;
  height: var(--oc-size-sm);
  border: 1px solid var(--oc-border-default);
  background: var(--oc-bg-input);
}
.settings-content__preview-property.is-accented b { border-color: var(--oc-border-accent); }

@media (max-width: 680px) {
  .settings-content__content {
    padding: var(--oc-space-md);
  }
}
</style>
