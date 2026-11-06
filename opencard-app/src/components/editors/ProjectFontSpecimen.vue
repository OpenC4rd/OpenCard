<!-- 业务 字样展示：同一段文字按三档字号和字体实际存在的字面展开，每一段都按真实覆盖分配字体。 -->
<template>
  <div class="project-font-specimen">
    <div v-if="diagnostics.length" class="project-font-specimen__diagnostics" role="status">
      <OcText v-for="diagnostic in diagnostics" :key="diagnostic" tone="danger" size="xs">{{ diagnostic }}</OcText>
    </div>
    <div class="project-font-specimen__sheet" :style="sheetStyle">
      <section v-for="group in rowGroups" :key="group.key" class="project-font-specimen__group">
        <div v-for="row in group.rows" :key="row.key" class="project-font-specimen__row">
          <OcText class="project-font-specimen__caption" tone="muted" size="xs">{{ row.caption }}</OcText>
          <p class="project-font-specimen__text" :class="{ 'is-single-line': group.singleLine }"
            :style="{ fontSize: `${row.fontSize}px` }">
            <span v-for="(run, index) in row.runs"
              :key="`${index}:${run.faceKey ?? run.familyKey ?? 'fallback'}`"
              class="project-font-specimen__run"
              :data-font-key="run.familyKey ?? 'fallback'"
              :data-face-key="run.faceKey ?? 'fallback'"
              :style="runStyle(run.familyKey, run.faceKey)"
              @pointerenter="showFontInfo(run.familyKey, run.faceKey, $event)"
              @pointerleave="fontInfoOpen = false">{{ run.text }}</span>
          </p>
        </div>
      </section>
    </div>

    <OcOverlayMarker group="font-info" :anchor="fontInfoLayerAnchor" :owner="fontInfoAnchor" placement="top"
      :open="fontInfoOpen" @update:open="fontInfoOpen = $event">
      <FontInfoLayer v-if="fontInfo" :font="fontInfo.font" :face="fontInfo.face"
        :coverage-failed="fontInfo.coverageFailed" />
    </OcOverlayMarker>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OverlayAnchor } from '../../composables/overlayGroups'
import { createProjectFontCssFamily } from '../../features/workspace/model/projectFonts'
import {
  projectFontFileEntries,
  projectFontStyles,
  projectFontWeights,
  projectFontWeightValues,
  type ProjectFont,
  type ProjectFontComposition,
} from '../../features/workspace/model/projectFontRegistry'
import type { ProjectFontLoadError } from '../../features/workspace/services/projectFontLoader'
import {
  characterSetToUnicodeRanges,
  createProjectFontPreviewRuns,
  mergeUnicodeRanges,
  readProjectFontCharacterSet,
  subtractUnicodeRanges,
  type ProjectFontPreviewCandidate,
} from '../../features/workspace/services/projectFontCoverage'
import OcText from '../base/OcText.vue'
import OcOverlayMarker from '../standard/OcOverlayMarker.vue'
import FontInfoLayer from './FontInfoLayer.vue'

type FontSlot = ReturnType<typeof projectFontFileEntries>[number]
type SpecimenSlot = FontSlot & { candidate: ProjectFontPreviewCandidate }
type FontInfoContent = { font: ProjectFont | null; face: FontSlot | null; coverageFailed: boolean }

/** 三档字号相对控件字号的比例；字面行用中间档，够看清字形又能一行放下。 */
const SIZE_TIERS = [1, 0.5, 0.25] as const
const FACE_ROW_TIER = SIZE_TIERS[1]

const props = defineProps<{
  families: readonly ProjectFont[]
  /** 被展示的单个字体；与 `composition` 互斥。 */
  family?: ProjectFont | null
  /** 被展示的字体组合；与 `family` 互斥。 */
  composition?: ProjectFontComposition | null
  text: string
  /** 最大一档的字号，单位 px。 */
  size: number
  readFontBytes: (source: string) => Promise<Uint8Array>
  loadErrors?: readonly ProjectFontLoadError[]
}>()
const { t } = useI18n()

const characterSets = ref<ReadonlyMap<string, ReadonlySet<number>>>(new Map())
const failedCoverageKeys = ref<ReadonlySet<string>>(new Set())
const fontInfoAnchor = ref<HTMLElement | null>(null)
const fontInfo = ref<FontInfoContent | null>(null)
const fontInfoOpen = ref(false)
/** 锚点是「被悬停的那一段预览」；每次换片段都返回一个新函数，marker 才会把新锚点推进组里。 */
const fontInfoLayerAnchor = computed<OverlayAnchor>(() => {
  const anchor = fontInfoAnchor.value
  return () => anchor?.getBoundingClientRect() ?? null
})
let coverageGeneration = 0

function findFamily(key: string): ProjectFont | undefined {
  const lookup = key.toLocaleLowerCase()
  return props.families.find(candidate => candidate.key.toLocaleLowerCase() === lookup)
}
function faceKey(familyKey: string, source: string): string {
  return `${familyKey.toLocaleLowerCase()}\0${source}`
}

const shownFamilies = computed(() => props.family
  ? [props.family]
  : (props.composition?.members ?? []).flatMap(member => findFamily(member.fontKey) ?? []))
/** 成员顺序就是回退顺序，字面按成员依次排开；单个字体就是只有一个成员的情形。 */
const slots = computed<SpecimenSlot[]>(() => {
  const members = props.family ? [{ fontKey: props.family.key }] : props.composition?.members ?? []
  return members.flatMap(member => projectFontFileEntries(findFamily(member.fontKey) ?? { files: {} }).map(slot => ({
    ...slot,
    candidate: {
      familyKey: member.fontKey,
      faceKey: faceKey(member.fontKey, slot.source),
      ...('ranges' in member && member.ranges ? { ranges: member.ranges } : {}),
    },
  })))
})
/** 三档字号展示的是日常文字，所以每个成员都先用常规正体，而不是恰好排在最前面的细体。 */
const regularFirstCandidates = computed(() => [...slots.value]
  .sort((left, right) => left.candidate.familyKey === right.candidate.familyKey
    ? Number(right.weight === 'normal' && right.style === 'upright') - Number(left.weight === 'normal' && left.style === 'upright')
    : 0)
  .map(slot => slot.candidate))
const sheetStyle = computed<CSSProperties>(() => ({
  fontFamily: props.family ? JSON.stringify(createProjectFontCssFamily(props.family.key)) : '',
}))
const rowGroups = computed(() => {
  const sizeRuns = createProjectFontPreviewRuns(props.text, regularFirstCandidates.value, characterSets.value)
  const faceRows = projectFontWeights.flatMap(weight => projectFontStyles.flatMap(style => {
    const candidates = slots.value.filter(slot => slot.weight === weight && slot.style === style)
    return candidates.length ? [{
      key: `${weight}:${style}`,
      caption: faceLabel(weight, style),
      fontSize: Math.round(props.size * FACE_ROW_TIER),
      runs: createProjectFontPreviewRuns(props.text, candidates.map(slot => slot.candidate), characterSets.value),
    }] : []
  }))
  return [
    {
      key: 'sizes',
      singleLine: false,
      rows: SIZE_TIERS.map(tier => {
        const fontSize = Math.round(props.size * tier)
        return { key: `size:${tier}`, caption: `${fontSize} px`, fontSize, runs: sizeRuns }
      }),
    },
    { key: 'faces', singleLine: true, rows: faceRows },
  ].filter(group => group.rows.length)
})
const coverageFailed = computed(() => shownFamilies.value.some(family => failedCoverageKeys.value.has(family.key)))
const shadowedMemberKeys = computed(() => {
  if (!props.composition) return []
  const claimedByDescriptor = new Map<string, { start: number; end: number }[]>()
  const shadowed: string[] = []
  for (const member of props.composition.members) {
    let readable = false
    let contributes = false
    for (const slot of projectFontFileEntries(findFamily(member.fontKey) ?? { files: {} })) {
      const coverage = characterSets.value.get(faceKey(member.fontKey, slot.source))
      if (!coverage) continue
      readable = true
      const descriptorKey = `${slot.weight}:${slot.style}`
      const claimed = claimedByDescriptor.get(descriptorKey) ?? []
      const effective = subtractUnicodeRanges(characterSetToUnicodeRanges(coverage, member.ranges), claimed)
      if (effective.length) contributes = true
      claimedByDescriptor.set(descriptorKey, mergeUnicodeRanges([...claimed, ...effective]))
    }
    if (readable && !contributes) shadowed.push(member.fontKey)
  }
  return shadowed
})
const diagnostics = computed(() => {
  const shownKeys = new Set(shownFamilies.value.map(family => family.key.toLocaleLowerCase()))
  return [
    ...(props.loadErrors ?? [])
      .filter(error => shownKeys.has(error.fontKey.toLocaleLowerCase()))
      .map(error => t('projectConfig.fonts.previewLoadFailed', { key: error.fontKey, source: error.source })),
    ...[...failedCoverageKeys.value]
      .filter(key => shownKeys.has(key.toLocaleLowerCase()))
      .map(key => t('projectConfig.fonts.previewCoverageFailed', { key })),
    ...shadowedMemberKeys.value.map(key => t('projectConfig.fonts.previewMemberShadowed', { key })),
  ]
})

watch(
  () => shownFamilies.value.map(family => `${family.key}\0${projectFontFileEntries(family).map(slot => slot.source).join('\0')}`),
  async () => {
    const generation = ++coverageGeneration
    const nextCharacterSets = new Map<string, ReadonlySet<number>>()
    const nextFailedKeys = new Set<string>()
    await Promise.all(shownFamilies.value.map(async family => {
      let loaded = false
      for (const slot of projectFontFileEntries(family)) {
        try {
          const characterSet = await readProjectFontCharacterSet(await props.readFontBytes(slot.source))
          nextCharacterSets.set(faceKey(family.key, slot.source), characterSet)
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
/** 提示描述的是预览里的片段：预览换条目时不再保留，免得停在一个已经被替换掉的锚点上。 */
watch(() => props.family ?? props.composition, () => { fontInfoOpen.value = false })

function faceLabel(weight: FontSlot['weight'], style: FontSlot['style']): string {
  const weightKey = { light: 'weightLight', normal: 'weightNormal', bold: 'weightBold' }[weight]
  const weightLabel = t(`projectConfig.fonts.${weightKey}`)
  return style === 'italic' ? `${weightLabel} · ${t('projectConfig.fonts.styleItalic')}` : weightLabel
}
function findSlot(familyKey: string | null, key: string | null): FontSlot | null {
  if (!familyKey) return null
  return projectFontFileEntries(findFamily(familyKey) ?? { files: {} })
    .find(slot => faceKey(familyKey, slot.source) === key) ?? null
}
function runStyle(familyKey: string | null, key: string | null): CSSProperties | undefined {
  if (!familyKey) return undefined
  const face = findSlot(familyKey, key)
  return {
    fontFamily: JSON.stringify(createProjectFontCssFamily(familyKey)),
    ...(face ? {
      fontWeight: projectFontWeightValues[face.weight],
      fontStyle: face.style === 'italic' ? 'italic' : 'normal',
    } : {}),
  }
}
function showFontInfo(familyKey: string | null, key: string | null, event: PointerEvent): void {
  if (!(event.currentTarget instanceof HTMLElement)) return
  // 被悬停的那一段文字就是锚点：提示跟着它走，离开即收起。
  fontInfoAnchor.value = event.currentTarget
  fontInfo.value = {
    font: (familyKey ? findFamily(familyKey) : null) ?? null,
    face: findSlot(familyKey, key),
    coverageFailed: coverageFailed.value,
  }
  fontInfoOpen.value = true
}
</script>

<style scoped>
.project-font-specimen {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.project-font-specimen__diagnostics {
  display: grid;
  grid-row: 1;
  gap: var(--oc-space-2xs);
  padding: var(--oc-space-xs) var(--oc-space-sm);
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}
.project-font-specimen__sheet {
  grid-row: 2;
  display: grid;
  align-content: start;
  gap: var(--oc-space-lg);
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--oc-space-lg);
}
.project-font-specimen__group {
  display: grid;
  gap: var(--oc-space-md);
  min-width: 0;
}
.project-font-specimen__group + .project-font-specimen__group {
  padding-top: var(--oc-space-lg);
  border-top: var(--oc-border-width) solid var(--oc-border-muted);
}
.project-font-specimen__row {
  display: grid;
  gap: var(--oc-space-2xs);
  min-width: 0;
}
.project-font-specimen__caption { display: block; }
.project-font-specimen__text {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.project-font-specimen__text.is-single-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}
.project-font-specimen__run {
  border-radius: var(--oc-radius-control);
  transition: background-color var(--oc-duration-quick) var(--oc-ease);
}
.project-font-specimen__run:hover { background-image: var(--oc-overlay-hover); }
</style>
