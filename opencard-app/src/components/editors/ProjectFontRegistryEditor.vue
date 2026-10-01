<template>
  <div class="project-font-registry-workbench">
    <component :is="'style'" v-if="previewFontCss" v-text="previewFontCss" />

    <section class="project-font-registry-workbench__left">
      <OcText v-if="error" class="project-font-registry-workbench__error" tone="danger" size="sm" role="alert">
        {{ error }}
      </OcText>

      <div class="project-font-registry-workbench__list">
        <OcTree fill role="listbox" selection-mode="single"
          activation-mode="double-click" scroll-to-selection :data="treeData"
          :expanded-keys="['families', 'compositions']"
          :selected-keys="selectedTreeKeys" :action-overflow-title="t('projectConfig.fonts.entryActions')"
          @selection-change="handleSelectionChange" @node-activate="handleNodeActivate" @action="handleNodeAction" />
      </div>
    </section>

    <section class="project-font-registry-workbench__right">
      <template v-if="selectedEntry">
        <header class="project-font-registry-workbench__preview-toolbar">
          <OcFieldInput full-width :value="previewText" :aria-label="t('projectConfig.fonts.previewText')"
            @input="updatePreviewText" />
          <div v-if="previewDiagnostics.length" class="project-font-registry-workbench__preview-diagnostics" role="status">
            <OcText v-for="diagnostic in previewDiagnostics" :key="diagnostic" tone="danger" size="xs">
              {{ diagnostic }}
            </OcText>
          </div>
        </header>
        <div class="project-font-registry-workbench__preview" :style="previewStyle">
          <span class="project-font-registry-workbench__preview-content">
            <span
              v-for="(run, index) in previewRuns"
              :key="`${index}:${run.faceKey ?? run.familyKey ?? 'fallback'}`"
              class="project-font-registry-workbench__preview-run"
              :data-font-key="run.familyKey ?? 'fallback'"
              :data-face-key="run.faceKey ?? 'fallback'"
              :style="runStyle(run.familyKey, run.faceKey)"
              @pointerenter="showFontInfo(run.familyKey, run.faceKey, $event)"
              @pointerleave="hideFontInfo"
            >{{ run.text }}</span>
          </span>
        </div>
        <OcFloatingLayer
          :open="Boolean(hoveredFontAnchor)"
          :anchor="hoveredFontAnchor"
          placement="top"
          class="project-font-registry-workbench__font-info-layer"
          role="tooltip"
        >
          <section v-if="hoveredFont" class="project-font-registry-workbench__font-info">
            <strong>{{ hoveredFont.name }}</strong>
            <dl>
              <div>
                <dt>{{ t('projectConfig.fonts.previewFontKey') }}</dt>
                <dd>{{ hoveredFont.key }}</dd>
              </div>
              <div>
                <dt>{{ t('projectConfig.fonts.previewFontSource') }}</dt>
                <dd>{{ hoveredFace?.source ?? projectFontFileEntries(hoveredFont ?? { files: {} }).map(slot => slot.source).join('; ') }}</dd>
              </div>
            </dl>
          </section>
          <section v-else class="project-font-registry-workbench__font-info">
            <strong>{{ coverageFailed ? t('projectConfig.fonts.previewCoverageUnavailable')
              : t('projectConfig.fonts.previewSystemFallback') }}</strong>
            <OcText tone="muted" size="sm">{{ coverageFailed
              ? t('projectConfig.fonts.previewCoverageUnavailableDescription')
              : t('projectConfig.fonts.previewSystemFallbackDescription') }}</OcText>
          </section>
        </OcFloatingLayer>
      </template>
      <div v-else class="project-font-registry-workbench__placeholder">
        <OcIcon :name="activePage === 'families' ? 'file.font' : 'data.layers'" size="lg" tone="muted" />
        <OcEmpty tone="muted" inset="none">
          {{ activePage === 'families' ? t('projectConfig.fonts.noFontSelected') : t('projectConfig.fonts.noSetSelected') }}
        </OcEmpty>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectFont, ProjectFontComposition } from '../../features/workspace/model/projectFontRegistry'
import { createProjectFontCssFamily } from '../../features/workspace/model/projectFonts'
import { projectFontFileEntries, projectFontWeightValues } from '../../features/workspace/model/projectFontRegistry'
import type { ProjectFontLoadError } from '../../features/workspace/services/projectFontLoader'
import {
  characterSetToUnicodeRanges,
  createProjectFontPreviewRuns,
  mergeUnicodeRanges,
  readProjectFontCharacterSet,
  subtractUnicodeRanges,
  type ProjectFontPreviewCandidate,
} from '../../features/workspace/services/projectFontCoverage'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeActivateEvent,
  OcNodeCollection,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import OcEmpty from '../base/OcEmpty.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcFloatingLayer from '../standard/OcFloatingLayer.vue'
import OcTree from '../standard/OcTree.vue'

const props = withDefaults(defineProps<{
  families: readonly ProjectFont[]
  compositions?: readonly ProjectFontComposition[]
  resolveAssetSrc: (source: string) => string
  readFontBytes: (source: string) => Promise<Uint8Array>
  error?: string
  loadErrors?: readonly ProjectFontLoadError[]
}>(), { compositions: () => [], error: '', loadErrors: () => [] })
const emit = defineEmits<{
  'update:families': [families: ProjectFont[]]
  'update:compositions': [compositions: ProjectFontComposition[]]
  'register-family': []
  'configure-family': [familyKey: string]
  'remove-family': [familyKey: string]
  'add-composition': []
  'configure-composition': [compositionKey: string]
}>()
const { t } = useI18n()
const activePage = ref<'families' | 'compositions'>('families')
const selectedFamilyKey = ref<string | null>(null)
const selectedCompositionKey = ref<string | null>(null)
const previewText = ref(t('projectConfig.fonts.previewSample'))
const characterSets = ref<ReadonlyMap<string, ReadonlySet<number>>>(new Map())
const failedCoverageKeys = ref<ReadonlySet<string>>(new Set())
const hoveredFontKey = ref<string | null>(null)
const hoveredFaceKey = ref<string | null>(null)
const hoveredFontAnchor = ref<HTMLElement | null>(null)
let coverageGeneration = 0
const selectedFamily = computed(() => props.families.find(family => family.key === selectedFamilyKey.value) ?? null)
const selectedComposition = computed(() => props.compositions.find(entry => entry.key === selectedCompositionKey.value) ?? null)
const selectedEntry = computed(() => activePage.value === 'families' ? selectedFamily.value : selectedComposition.value)
const selectedTreeKeys = computed(() => {
  const key = activePage.value === 'families' ? selectedFamilyKey.value : selectedCompositionKey.value
  return key ? [treeKey(activePage.value, key)] : []
})
const referencedFamilyKeys = computed(() => new Set(
  props.compositions.flatMap(composition => composition.members.map(member => member.fontKey.toLocaleLowerCase())),
))
const treeData = computed<OcNodeCollection>(() => {
  const addFamilyAction: OcNodeAction = {
    key: 'add-family', title: t('projectConfig.fonts.addFont'), icon: 'action.add',
  }
  const addCompositionAction: OcNodeAction = {
    key: 'add-composition', title: t('projectConfig.fonts.addSet'), icon: 'action.add',
  }
  const configureFamilyAction: OcNodeAction = {
    key: 'configure-family', title: t('projectConfig.fonts.configure'), icon: 'tool.settings',
  }
  const removeFamilyAction: OcNodeAction = {
    key: 'delete-family', title: t('projectConfig.fonts.remove'), icon: 'action.delete', iconTone: 'danger',
  }
  const configureCompositionAction: OcNodeAction = {
    key: 'configure-composition', title: t('projectConfig.fonts.configureSet'), icon: 'tool.settings',
  }
  const removeCompositionAction: OcNodeAction = {
    key: 'delete-composition', title: t('projectConfig.fonts.removeSet'), icon: 'action.delete', iconTone: 'danger',
  }
  const familyKeys = props.families.length
    ? props.families.map(entry => treeKey('families', entry.key))
    : [GROUP_EMPTY_KEY.families]
  const compositionKeys = props.compositions.length
    ? props.compositions.map(entry => treeKey('compositions', entry.key))
    : [GROUP_EMPTY_KEY.compositions]
  const items = new Map<string, OcNode>([
    ['families', {
      label: t('projectConfig.fonts.projectFonts'),
      visual: { type: 'icon', icon: 'file.font' },
      tail: [addFamilyAction],
      contextActions: [addFamilyAction],
    }],
    ['compositions', {
      label: t('projectConfig.fonts.compositions'),
      visual: { type: 'icon', icon: 'data.layers' },
      tail: [addCompositionAction],
      contextActions: [addCompositionAction],
    }],
    ...props.families.map((entry): [string, OcNode] => {
      const referenced = referencedFamilyKeys.value.has(entry.key.toLocaleLowerCase())
      return [treeKey('families', entry.key), {
        label: entry.name,
        labelFont: JSON.stringify(createProjectFontCssFamily(entry.key)),
        visual: { type: 'icon', icon: 'file.font' },
        tail: referenced ? [configureFamilyAction] : [configureFamilyAction, removeFamilyAction],
        contextActions: referenced ? [configureFamilyAction] : [
          configureFamilyAction,
          { type: 'divider', key: 'font-delete-divider' },
          removeFamilyAction,
        ],
      }]
    }),
    ...props.compositions.map((entry): [string, OcNode] => [treeKey('compositions', entry.key), {
      label: entry.name,
      labelFont: compositionLabelFont(entry),
      visual: { type: 'icon', icon: 'data.layers' },
      tail: [configureCompositionAction, removeCompositionAction],
      contextActions: [
        configureCompositionAction,
        { type: 'divider', key: 'composition-delete-divider' },
        removeCompositionAction,
      ],
    }]),
  ])
  // 空分组也要有子项：分组标题看着能展开，点开却什么都没有，比一句话更让人以为界面坏了。
  if (props.families.length === 0) {
    items.set(GROUP_EMPTY_KEY.families, emptyPlaceholder(t('projectConfig.fonts.noProjectFonts')))
  }
  if (props.compositions.length === 0) {
    items.set(GROUP_EMPTY_KEY.compositions, emptyPlaceholder(t('projectConfig.fonts.noCompositions')))
  }
  return {
    rootKeys: ['families', 'compositions'],
    items,
    children: new Map([['families', familyKeys], ['compositions', compositionKeys]]),
  }
})
const previewStyle = computed<CSSProperties>(() => ({
  fontFamily: activePage.value === 'families' && selectedFamily.value
    ? JSON.stringify(createProjectFontCssFamily(selectedFamily.value.key))
    : '',
}))
const previewFontCss = computed(() => props.families.flatMap(font => projectFontFileEntries(font).map(slot => (
  `@font-face { font-family: ${JSON.stringify(createProjectFontCssFamily(font.key))}; src: url(${JSON.stringify(props.resolveAssetSrc(slot.source))}); font-weight: ${projectFontWeightValues[slot.weight]}; font-style: ${slot.style === 'upright' ? 'normal' : 'italic'}; }`
))).join('\n'))
const previewFamilies = computed(() => activePage.value === 'families'
  ? selectedFamily.value ? [selectedFamily.value] : []
  : (selectedComposition.value?.members ?? [])
      .map(member => props.families.find(font => font.key.toLocaleLowerCase() === member.fontKey.toLocaleLowerCase()))
      .filter((font): font is ProjectFont => Boolean(font)))
const previewCandidates = computed<ProjectFontPreviewCandidate[]>(() => activePage.value === 'families'
  ? selectedFamily.value ? projectFontFileEntries(selectedFamily.value).map(slot => ({
      familyKey: selectedFamily.value!.key,
      faceKey: previewFaceKey(selectedFamily.value!.key, slot.source),
    })) : []
  : (selectedComposition.value?.members ?? []).flatMap(member => {
      const family = props.families.find(candidate => (
        candidate.key.toLocaleLowerCase() === member.fontKey.toLocaleLowerCase()
      ))
      return projectFontFileEntries(family ?? { files: {} }).map(slot => ({
        familyKey: member.fontKey,
        faceKey: previewFaceKey(member.fontKey, slot.source),
        ...(member.ranges ? { ranges: member.ranges } : {}),
      }))
    }))
const previewRuns = computed(() => createProjectFontPreviewRuns(
  previewText.value,
  previewCandidates.value,
  characterSets.value,
))
const hoveredFont = computed(() => hoveredFontKey.value
  ? props.families.find(family => family.key.toLocaleLowerCase() === hoveredFontKey.value?.toLocaleLowerCase()) ?? null
  : null)
const hoveredFace = computed(() => projectFontFileEntries(hoveredFont.value ?? { files: {} }).find(slot => (
  previewFaceKey(hoveredFont.value!.key, slot.source) === hoveredFaceKey.value
)) ?? null)
const coverageFailed = computed(() => previewFamilies.value.some(family => failedCoverageKeys.value.has(family.key)))
const shadowedMemberKeys = computed(() => {
  if (activePage.value !== 'compositions' || !selectedComposition.value) return []
  const claimedByDescriptor = new Map<string, { start: number; end: number }[]>()
  const shadowed: string[] = []
  for (const member of selectedComposition.value.members) {
    const family = props.families.find(candidate => candidate.key.toLocaleLowerCase() === member.fontKey.toLocaleLowerCase())
    let readable = false
    let contributes = false
    for (const slot of projectFontFileEntries(family ?? { files: {} })) {
      const coverage = characterSets.value.get(previewFaceKey(member.fontKey, slot.source))
      if (!coverage) continue
      readable = true
      const descriptorKey = `${slot.weight}:${slot.style}`
      const claimed = claimedByDescriptor.get(descriptorKey) ?? []
      const effective = subtractUnicodeRanges(characterSetToUnicodeRanges(coverage, member.ranges), claimed)
      if (effective.length) contributes = true
      claimedByDescriptor.set(descriptorKey, mergeUnicodeRanges([
        ...claimed,
        ...effective,
      ]))
    }
    if (readable && !contributes) shadowed.push(member.fontKey)
  }
  return shadowed
})
const previewDiagnostics = computed(() => {
  const selectedKeys = new Set(previewFamilies.value.map(family => family.key.toLocaleLowerCase()))
  return [
    ...props.loadErrors
      .filter(error => selectedKeys.has(error.fontKey.toLocaleLowerCase()))
      .map(error => t('projectConfig.fonts.previewLoadFailed', { key: error.fontKey, source: error.source })),
    ...[...failedCoverageKeys.value]
      .filter(key => selectedKeys.has(key.toLocaleLowerCase()))
      .map(key => t('projectConfig.fonts.previewCoverageFailed', { key })),
    ...shadowedMemberKeys.value.map(key => t('projectConfig.fonts.previewMemberShadowed', { key })),
  ]
})

watch(() => props.families, families => {
  if (!families.some(family => family.key === selectedFamilyKey.value)) selectedFamilyKey.value = families[0]?.key ?? null
}, { immediate: true })
watch(() => props.compositions, compositions => {
  if (!compositions.some(entry => entry.key === selectedCompositionKey.value)) selectedCompositionKey.value = compositions[0]?.key ?? null
}, { immediate: true })
watch(
  () => previewFamilies.value.map(family => `${family.key}\0${projectFontFileEntries(family).map(slot => slot.source).join('\0')}`),
  async () => {
    const generation = ++coverageGeneration
    const nextCharacterSets = new Map<string, ReadonlySet<number>>()
    const nextFailedKeys = new Set<string>()
    await Promise.all(previewFamilies.value.map(async family => {
      let loaded = false
      for (const slot of projectFontFileEntries(family)) {
        try {
          const characterSet = await readProjectFontCharacterSet(await props.readFontBytes(slot.source))
          nextCharacterSets.set(previewFaceKey(family.key, slot.source), characterSet)
          loaded = true
        } catch {
          // A family remains previewable when at least one of its faces is readable.
        }
      }
      if (!loaded) nextFailedKeys.add(family.key)
    }))
    if (generation !== coverageGeneration) return
    characterSets.value = nextCharacterSets
    failedCoverageKeys.value = nextFailedKeys
  },
  { immediate: true },
)

function treeKey(page: 'families' | 'compositions', key: string): string { return `${page}:${key}` }
/** 空分组的占位子项键：不参与选中与动作，只说明这一组现在是空的。 */
const GROUP_EMPTY_KEY = { families: 'families:empty', compositions: 'compositions:empty' } as const
/** 占位子项禁用它自己：它不是一个能点开的字体条目，只是这一组的空状态（与「预装的包」树同一种做法）。 */
function emptyPlaceholder(label: string): OcNode {
  return { label, visual: { type: 'icon', icon: 'file.generic' }, disabled: true }
}
/** 字体组合没有自己的字面，按成员回退顺序拼成一套 font-family，标签就用它自己的组合顺序绘制。 */
function compositionLabelFont(composition: ProjectFontComposition): string | undefined {
  const families = composition.members.map(member => JSON.stringify(createProjectFontCssFamily(member.fontKey)))
  return families.length ? families.join(', ') : undefined
}
function entryKey(key: string): string { return key.slice(key.indexOf(':') + 1) }
function entryPage(key: string): 'families' | 'compositions' | null {
  if (key === 'families' || key.startsWith('families:')) return 'families'
  if (key === 'compositions' || key.startsWith('compositions:')) return 'compositions'
  return null
}
function configureEntry(page: 'families' | 'compositions', key: string): void {
  if (page === 'families') emit('configure-family', key)
  else emit('configure-composition', key)
}
function removeEntry(page: 'families' | 'compositions', key: string): void {
  if (page === 'families') removeFamily(props.families.findIndex(family => family.key === key))
  else removeComposition(props.compositions.findIndex(composition => composition.key === key))
}
function handleSelectionChange(event: OcNodeSelectionEvent): void {
  const selectedKey = event.selectedKeys[0] ?? event.triggerKey
  const page = entryPage(selectedKey)
  if (!page) return
  activePage.value = page
  if (selectedKey === page) return
  const key = entryKey(selectedKey)
  if (page === 'families') selectedFamilyKey.value = key
  else selectedCompositionKey.value = key
}
function handleNodeActivate(event: OcNodeActivateEvent): void {
  if (event.key === 'families' || event.key === 'compositions') {
    activePage.value = event.key
    return
  }
  const page = entryPage(event.key)
  if (page) configureEntry(page, entryKey(event.key))
}
function handleNodeAction(event: OcNodeActionEvent): void {
  const key = entryKey(event.key)
  if (event.actionKey === 'add-family') emit('register-family')
  else if (event.actionKey === 'configure-family') configureEntry('families', key)
  else if (event.actionKey === 'add-composition') emit('add-composition')
  else if (event.actionKey === 'configure-composition') configureEntry('compositions', key)
  else if (event.actionKey === 'delete-family') removeEntry('families', key)
  else if (event.actionKey === 'delete-composition') removeEntry('compositions', key)
}
function removeFamily(index: number): void {
  if (index < 0) return
  const family = props.families[index]
  if (!family || referencedFamilyKeys.value.has(family.key.toLocaleLowerCase())) return
  selectedFamilyKey.value = props.families[
    Math.min(index + 1, props.families.length - 1)
  ]?.key === family.key
    ? props.families[Math.max(0, index - 1)]?.key ?? null
    : props.families[Math.min(index + 1, props.families.length - 1)]?.key ?? null
  emit('remove-family', family.key)
}
function removeComposition(index: number): void {
  if (index < 0) return
  const next = props.compositions.filter((_, candidate) => candidate !== index)
  if (props.compositions[index]?.key === selectedCompositionKey.value) {
    selectedCompositionKey.value = next[Math.min(index, next.length - 1)]?.key ?? null
  }
  emit('update:compositions', next)
}
function updatePreviewText(event: Event): void { if (event.target instanceof HTMLInputElement) previewText.value = event.target.value }
function previewFaceKey(familyKey: string, source: string): string {
  return `${familyKey.toLocaleLowerCase()}\0${source}`
}
function runStyle(familyKey: string | null, faceKey: string | null): CSSProperties | undefined {
  if (!familyKey) return undefined
  const family = props.families.find(candidate => candidate.key.toLocaleLowerCase() === familyKey.toLocaleLowerCase())
  const face = projectFontFileEntries(family ?? { files: {} }).find(candidate => previewFaceKey(familyKey, candidate.source) === faceKey)
  return {
    fontFamily: JSON.stringify(createProjectFontCssFamily(familyKey)),
    ...(face ? {
      fontWeight: projectFontWeightValues[face.weight],
      fontStyle: face.style === 'italic' ? 'italic' : 'normal',
    } : {}),
  }
}
function showFontInfo(familyKey: string | null, faceKey: string | null, event: PointerEvent): void {
  hoveredFontKey.value = familyKey
  hoveredFaceKey.value = faceKey
  hoveredFontAnchor.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}
function hideFontInfo(): void {
  hoveredFontKey.value = null
  hoveredFaceKey.value = null
  hoveredFontAnchor.value = null
}
async function navigateToFont(kind: 'family' | 'composition', key: string): Promise<boolean> {
  if (kind === 'family') {
    if (!props.families.some(family => family.key === key)) return false
    selectedFamilyKey.value = key
    activePage.value = 'families'
    return true
  }
  if (!props.compositions.some(composition => composition.key === key)) return false
  selectedCompositionKey.value = key
  activePage.value = 'compositions'
  return true
}
defineExpose({ navigateToFont })
</script>

<style scoped>
.project-font-registry-workbench {
  display: grid;
  grid-template-columns: minmax(var(--oc-project-font-list-min-width), var(--oc-project-font-list-width)) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--oc-bg-inset);
}
.project-font-registry-workbench__left,
.project-font-registry-workbench__right { min-width: 0; min-height: 0; overflow: hidden; }
.project-font-registry-workbench__left {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: var(--oc-border-width) solid var(--oc-border-muted);
  background: var(--oc-bg-base);
}
.project-font-registry-workbench__error { grid-row: 1; padding: var(--oc-space-2); border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }
.project-font-registry-workbench__list { position: relative; grid-row: 2; min-height: 0; overflow: hidden; }
.project-font-registry-workbench__list > .oc-tree { position: absolute; inset: 0; }
.project-font-registry-workbench__right { display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--oc-bg-base); }
.project-font-registry-workbench__preview-toolbar { display: grid; gap: var(--oc-space-2); padding: var(--oc-space-3); border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }
.project-font-registry-workbench__preview-diagnostics { display: grid; gap: var(--oc-space-1); }
.project-font-registry-workbench__preview { display: grid; place-items: center; min-width: 0; min-height: 0; padding: var(--oc-space-6); overflow: auto; overflow-wrap: anywhere; font-size: var(--oc-font-preview-size); text-align: center; }
.project-font-registry-workbench__preview-content { white-space: pre-wrap; }
.project-font-registry-workbench__preview-run {
  border-radius: var(--oc-radius-sm);
  transition: background-color var(--oc-duration-fast) var(--oc-ease);
}
.project-font-registry-workbench__preview-run:hover { background: var(--oc-bg-hover); }
.project-font-registry-workbench__font-info-layer {
  max-width: var(--oc-content-width-sm);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  box-shadow: var(--oc-shadow-md);
  pointer-events: none;
}
.project-font-registry-workbench__font-info { padding: var(--oc-space-3); }
.project-font-registry-workbench__font-info strong { display: block; margin-bottom: var(--oc-space-2); }
.project-font-registry-workbench__font-info dl { display: grid; gap: var(--oc-space-1); margin: 0; }
.project-font-registry-workbench__font-info dl > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--oc-space-2);
}
.project-font-registry-workbench__font-info dt { color: var(--oc-fg-muted); }
.project-font-registry-workbench__font-info dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.project-font-registry-workbench__placeholder { display: grid; grid-row: 1 / -1; place-content: center; justify-items: center; gap: var(--oc-space-3); min-width: 0; min-height: 0; }
</style>

(Background: j-xagavb exited 1.)
