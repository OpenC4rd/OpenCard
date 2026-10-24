<template>
  <OcDialog :open="open" :title="dialogTitle" as="form" size="md" min-height="md"
    close-on-backdrop @request-close="emit('close')" @submit="submit">
    <label class="project-font-set-dialog__field">
      <span>{{ t('projectConfig.fonts.name') }}</span>
      <OcFieldInput full-width autofocus :value="name" :aria-invalid="!name.trim()"
        @input="updateText('name', $event)" />
    </label>
    <label class="project-font-set-dialog__field">
      <span>{{ t('projectConfig.fonts.key') }}</span>
      <OcFieldInput full-width mono :value="key" :placeholder="generatedKey"
        :aria-invalid="Boolean(key) && (!validKey || !uniqueKey)" @input="updateText('key', $event)" />
    </label>

    <div class="project-font-set-dialog__members">
      <OcText as="strong" size="sm">{{ t('projectConfig.fonts.members') }}</OcText>
      <div ref="memberPickerRef" class="project-font-set-dialog__member-add">
        <OcFieldInput full-width :value="memberQuery" :placeholder="t('projectConfig.fonts.searchMembers')"
          autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"
          :aria-label="t('projectConfig.fonts.searchMembers')" :aria-expanded="memberMenuOpen"
          :aria-controls="memberAutocompleteId" :aria-activedescendant="activeMemberOptionId"
          @focus="openMemberMenu" @input="updateMemberQuery" @blur="closeMemberMenu"
          @keydown="handleMemberKeydown" />
        <OcButton type="button" icon-only variant="soft" icon="mdiPlus" :disabled="!candidateMemberKey"
          :aria-label="t('projectConfig.fonts.addMember')" :data-tooltip="t('projectConfig.fonts.addMember')"
          @click="addCandidateMember" />

        <OcOverlayMarker
          ref="layer"
          :group="`completion:${memberAutocompleteId}`"
          :anchor="memberPickerRef"
          :owner="activeMemberInput"
          placement="bottom-start"
          :max-height="220"
          :open="memberMenuOpen"
          @update:open="memberMenuOpen = $event"
          @close="memberMenuOpen = false"
        >
          <OcAutocompleteList :id="memberAutocompleteId" :items="memberSuggestions"
            :active-key="activeMemberKey" @select="selectMemberSuggestion" />
        </OcOverlayMarker>
      </div>
      <OcButton type="button" variant="ghost" icon="mdiCogOutline" @click="advancedOpen = !advancedOpen">
        {{ t('projectConfig.fonts.advancedRanges') }}
      </OcButton>
      <div v-if="selectedMembers.length" class="project-font-set-dialog__selected">
        <div v-for="(member, index) in selectedMembers" :key="`${member.fontKey}:${index}`"
          class="project-font-set-dialog__member-row">
          <span><OcIcon name="mdiFormatFont" size="sm" />{{ entryLabel(member.fontKey) }}</span>
          <span>
            <OcButton type="button" icon-only size="sm" variant="ghost" icon="mdiFormatVerticalAlignTop"
              :disabled="index === 0" :aria-label="t('projectConfig.fonts.moveMemberToTop')"
              :data-tooltip="t('projectConfig.fonts.moveMemberToTop')"
              @click="moveMember(index, 0)" />
            <OcButton type="button" icon-only size="sm" variant="ghost" icon="mdiArrowUp" :disabled="index === 0"
              :aria-label="t('propertyEditor.arrays.moveUp')" :data-tooltip="t('propertyEditor.arrays.moveUp')"
              @click="moveMember(index, index - 1)" />
            <OcButton type="button" icon-only size="sm" variant="ghost" icon="mdiArrowDown"
              :disabled="index === selectedMembers.length - 1" :aria-label="t('propertyEditor.arrays.moveDown')"
              :data-tooltip="t('propertyEditor.arrays.moveDown')"
              @click="moveMember(index, index + 1)" />
            <OcButton type="button" icon-only size="sm" variant="ghost" icon="mdiFormatVerticalAlignBottom"
              :disabled="index === selectedMembers.length - 1"
              :aria-label="t('projectConfig.fonts.moveMemberToBottom')"
              :data-tooltip="t('projectConfig.fonts.moveMemberToBottom')"
              @click="moveMember(index, selectedMembers.length - 1)" />
            <OcButton type="button" icon-only size="sm" variant="ghost" icon="mdiTrashCanOutline" icon-tone="danger"
              :aria-label="t('projectConfig.fonts.removeMember')"
              :data-tooltip="t('projectConfig.fonts.removeMember')" @click="removeMember(index)" />
          </span>
          <div v-if="advancedOpen" class="project-font-set-dialog__range-editor">
            <div class="project-font-set-dialog__range-presets">
              <OcButton v-for="preset in rangePresets" :key="preset.key" type="button" size="sm" variant="soft"
                @click="applyRangePreset(index, preset.ranges)">
                {{ t(preset.labelKey) }}
              </OcButton>
            </div>
            <OcFieldInput full-width :value="characterInputs[index] ?? ''"
              :placeholder="t('projectConfig.fonts.characterInputPlaceholder')"
              @input="updateMemberCharacters(index, $event)" />
            <OcFieldInput full-width mono
              :value="formatRanges(member.ranges)"
              :placeholder="t('projectConfig.fonts.rangePlaceholder')"
              :aria-invalid="invalidRangeIndexes.has(index)"
              @input="updateMemberRanges(index, $event)" />
          </div>
        </div>
      </div>
      <OcText v-else tone="muted" size="sm">{{ t('projectConfig.fonts.noMembers') }}</OcText>
    </div>

    <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">{{ validationMessage }}</OcText>
    <template #footer>
      <OcButton type="button" @click="emit('close')">{{ t('projectConfig.fonts.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!canSubmit">{{ t('projectConfig.fonts.save') }}</OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ProjectFontComposition,
  ProjectFontCompositionMember,
  ProjectFont,
  UnicodeRange,
} from '../../features/workspace/model/projectFontRegistry'
import { normalizeUnicodeRanges } from '../../features/workspace/model/projectFontRegistry'
import { projectFontIdPattern } from '../../features/workspace/model/projectFonts'
import { createAvailableKey } from '../../shared/model/keySlug'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcText from '../base/OcText.vue'
import OcAutocompleteList from '../standard/OcAutocompleteList.vue'
import OcDialog from '../standard/OcDialog.vue'
import OcOverlayMarker from '../standard/OcOverlayMarker.vue'

export type ProjectFontCompositionRequest = {
  originalKey?: string
  key: string
  name: string
  members: ProjectFontCompositionMember[]
}

const props = defineProps<{
  open: boolean
  families: readonly ProjectFont[]
  compositions: readonly ProjectFontComposition[]
  originalKey?: string
}>()
const emit = defineEmits<{ close: []; submit: [request: ProjectFontCompositionRequest] }>()
const { t } = useI18n()
const name = ref('')
const key = ref('')
const selectedMembers = ref<ProjectFontCompositionMember[]>([])
const advancedOpen = ref(false)
const invalidRangeIndexes = ref<ReadonlySet<number>>(new Set())
const characterInputs = ref<string[]>([])
const memberQuery = ref('')
const selectedCandidateKey = ref<string | null>(null)
const memberPickerRef = ref<HTMLElement | null>(null)
const layer = ref<InstanceType<typeof OcOverlayMarker> | null>(null)
const activeMemberInput = ref<HTMLInputElement | null>(null)
const memberMenuOpen = ref(false)
const activeMemberKey = ref<string | null>(null)
const memberAutocompleteId = useId()
const rangePresets = [
  { key: 'latin', labelKey: 'projectConfig.fonts.rangePresetLatin', ranges: [{ start: 0x0000, end: 0x024f }] },
  { key: 'cjk', labelKey: 'projectConfig.fonts.rangePresetCjk', ranges: [
    { start: 0x3400, end: 0x4dbf }, { start: 0x4e00, end: 0x9fff }, { start: 0xf900, end: 0xfaff },
  ] },
  { key: 'kana', labelKey: 'projectConfig.fonts.rangePresetKana', ranges: [
    { start: 0x3040, end: 0x30ff }, { start: 0x31f0, end: 0x31ff },
  ] },
  { key: 'hangul', labelKey: 'projectConfig.fonts.rangePresetHangul', ranges: [
    { start: 0x1100, end: 0x11ff }, { start: 0x3130, end: 0x318f }, { start: 0xac00, end: 0xd7af },
  ] },
] as const
const editing = computed(() => Boolean(props.originalKey))
const usedKeys = computed(() => [...props.families, ...props.compositions]
  .map(entry => entry.key)
  .filter(candidate => candidate.toLocaleLowerCase() !== props.originalKey?.toLocaleLowerCase()))
const generatedKey = computed(() => createAvailableKey(name.value, usedKeys.value, 'font-set'))
const effectiveKey = computed(() => key.value || generatedKey.value)
const validKey = computed(() => projectFontIdPattern.test(effectiveKey.value))
const uniqueKey = computed(() => !usedKeys.value.some(candidate => (
  candidate.toLocaleLowerCase() === effectiveKey.value.toLocaleLowerCase()
)))
const availableEntries = computed(() => props.families)
const selectableEntries = computed(() => availableEntries.value.filter(entry => (
  !selectedMembers.value.some(member => member.fontKey.toLocaleLowerCase() === entry.key.toLocaleLowerCase())
)))
const memberSuggestions = computed(() => {
  const query = memberQuery.value.trim().toLocaleLowerCase()
  return selectableEntries.value
    .filter(entry => !query || entry.name.toLocaleLowerCase().includes(query)
      || entry.key.toLocaleLowerCase().includes(query))
    .map(entry => ({
      key: entry.key,
      label: entry.name,
      detail: `font:${entry.key}`,
      icon: 'mdiFormatFont' as const,
    }))
})
const candidateMemberKey = computed(() => {
  if (selectedCandidateKey.value
    && selectableEntries.value.some(entry => entry.key === selectedCandidateKey.value)) {
    return selectedCandidateKey.value
  }
  return memberQuery.value.trim() ? activeMemberKey.value : null
})
const activeMemberOptionId = computed(() => activeMemberKey.value
  ? `${memberAutocompleteId}-option-${activeMemberKey.value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  : undefined)
const canSubmit = computed(() => Boolean(
  name.value.trim() && validKey.value && uniqueKey.value
    && selectedMembers.value.length > 0 && invalidRangeIndexes.value.size === 0,
))
const dialogTitle = computed(() => editing.value
  ? t('projectConfig.fonts.configureSet') : t('projectConfig.fonts.addSet'))
const validationMessage = computed(() => {
  if (!uniqueKey.value) return t('projectConfig.fonts.keyExists')
  if (key.value && !validKey.value) return t('projectConfig.fonts.invalidKey')
  if (!name.value.trim()) return t('projectConfig.fonts.nameRequired')
  if (selectedMembers.value.length === 0) return t('projectConfig.fonts.memberRequired')
  if (invalidRangeIndexes.value.size) return t('projectConfig.fonts.invalidRange')
  return ''
})

watch([() => props.open, () => props.originalKey], ([open]) => {
  if (!open) {
    resetMemberPicker()
    return
  }
  const composition = props.compositions.find(candidate => candidate.key === props.originalKey)
  name.value = composition?.name ?? createDefaultSetName()
  key.value = composition?.key ?? ''
  selectedMembers.value = (composition?.members ?? []).map(member => ({
    fontKey: member.fontKey,
    ...(member.ranges ? { ranges: member.ranges.map(range => ({ ...range })) } : {}),
  }))
  advancedOpen.value = selectedMembers.value.some(member => member.ranges)
  invalidRangeIndexes.value = new Set()
  characterInputs.value = selectedMembers.value.map(() => '')
  resetMemberPicker()
}, { immediate: true })

watch(memberSuggestions, suggestions => {
  activeMemberKey.value = suggestions.some(entry => entry.key === activeMemberKey.value)
    ? activeMemberKey.value
    : (suggestions[0]?.key ?? null)
})

// 卸载时关掉自己那一层：组宿主活在别处，不留空面板。
onBeforeUnmount(() => { layer.value?.close() })

function createDefaultSetName(): string {
  const existingNames = new Set(props.compositions.map(composition => composition.name.toLocaleLowerCase()))
  let index = 1
  while (existingNames.has(t('projectConfig.fonts.defaultSetName', { index }).toLocaleLowerCase())) index += 1
  return t('projectConfig.fonts.defaultSetName', { index })
}

function updateText(field: 'name' | 'key', event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  if (field === 'name') name.value = event.target.value
  else key.value = event.target.value
}
function openMemberMenu(event: FocusEvent): void {
  activeMemberInput.value = event.target as HTMLInputElement
  memberMenuOpen.value = memberSuggestions.value.length > 0
}
function updateMemberQuery(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  activeMemberInput.value = event.target
  memberQuery.value = event.target.value
  selectedCandidateKey.value = null
  memberMenuOpen.value = memberSuggestions.value.length > 0
}
function closeMemberMenu(): void {
  window.setTimeout(() => { memberMenuOpen.value = false }, 0)
}
function selectMemberSuggestion(memberKey: string): void {
  const entry = selectableEntries.value.find(candidate => candidate.key === memberKey)
  if (!entry) return
  memberQuery.value = entry.name
  selectedCandidateKey.value = entry.key
  activeMemberKey.value = entry.key
  memberMenuOpen.value = false
  void nextTick(() => activeMemberInput.value?.focus())
}
function addCandidateMember(): void {
  const memberKey = candidateMemberKey.value
  if (!memberKey || selectedMembers.value.some(member => member.fontKey === memberKey)) return
  selectedMembers.value.push({ fontKey: memberKey })
  characterInputs.value.push('')
  resetMemberPicker()
  void nextTick(() => activeMemberInput.value?.focus())
}
function moveActiveMember(offset: 1 | -1): void {
  if (!memberSuggestions.value.length) return
  const current = Math.max(0, memberSuggestions.value.findIndex(entry => entry.key === activeMemberKey.value))
  activeMemberKey.value = memberSuggestions.value[
    (current + offset + memberSuggestions.value.length) % memberSuggestions.value.length
  ]?.key ?? null
}
function handleMemberKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    memberMenuOpen.value = memberSuggestions.value.length > 0
    moveActiveMember(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter' && candidateMemberKey.value) {
    event.preventDefault()
    addCandidateMember()
  } else if (event.key === 'Escape') {
    memberMenuOpen.value = false
  }
}
function resetMemberPicker(): void {
  memberQuery.value = ''
  selectedCandidateKey.value = null
  memberMenuOpen.value = false
  activeMemberKey.value = memberSuggestions.value[0]?.key ?? null
}
function moveMember(from: number, to: number): void {
  if (to < 0 || to >= selectedMembers.value.length) return
  const members = [...selectedMembers.value]
  const [member] = members.splice(from, 1)
  if (!member) return
  members.splice(to, 0, member)
  selectedMembers.value = members
  const characters = [...characterInputs.value]
  const [characterInput] = characters.splice(from, 1)
  characters.splice(to, 0, characterInput ?? '')
  characterInputs.value = characters
  invalidRangeIndexes.value = new Set()
}
function removeMember(index: number): void {
  selectedMembers.value = selectedMembers.value.filter((_, candidate) => candidate !== index)
  characterInputs.value = characterInputs.value.filter((_, candidate) => candidate !== index)
  invalidRangeIndexes.value = new Set()
}
function entryLabel(memberKey: string): string {
  return props.families.find(entry => entry.key === memberKey)?.name ?? memberKey
}
function submit(): void {
  if (!canSubmit.value) return
  emit('submit', {
    ...(props.originalKey ? { originalKey: props.originalKey } : {}),
    key: effectiveKey.value,
    name: name.value.trim(),
    members: selectedMembers.value.map(member => ({
      fontKey: member.fontKey,
      ...(member.ranges ? { ranges: member.ranges.map(range => ({ ...range })) } : {}),
    })),
  })
}

function formatRanges(ranges: readonly UnicodeRange[] | undefined): string {
  return ranges?.map(range => range.start === range.end
    ? `U+${range.start.toString(16).toUpperCase()}`
    : `U+${range.start.toString(16).toUpperCase()}-${range.end.toString(16).toUpperCase()}`).join(', ') ?? ''
}

function parseRanges(value: string): UnicodeRange[] | null | undefined {
  if (!value.trim()) return undefined
  const ranges: UnicodeRange[] = []
  for (const part of value.split(',')) {
    const match = /^\s*U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(part)
    if (!match) return null
    const start = Number.parseInt(match[1] ?? '', 16)
    const end = Number.parseInt(match[2] ?? match[1] ?? '', 16)
    if (start > end || end > 0x10ffff || (start <= 0xdfff && end >= 0xd800)) return null
    ranges.push({ start, end })
  }
  return ranges
}

function updateMemberRanges(index: number, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  const parsed = parseRanges(event.target.value)
  const invalid = new Set(invalidRangeIndexes.value)
  if (parsed === null) invalid.add(index)
  else {
    invalid.delete(index)
    const member = selectedMembers.value[index]
    if (member) selectedMembers.value[index] = {
      fontKey: member.fontKey,
      ...(parsed ? { ranges: parsed } : {}),
    }
  }
  invalidRangeIndexes.value = invalid
}

function applyRangePreset(index: number, ranges: readonly UnicodeRange[]): void {
  const member = selectedMembers.value[index]
  if (!member) return
  selectedMembers.value[index] = { fontKey: member.fontKey, ranges: ranges.map(range => ({ ...range })) }
  characterInputs.value[index] = ''
  const invalid = new Set(invalidRangeIndexes.value)
  invalid.delete(index)
  invalidRangeIndexes.value = invalid
}

function updateMemberCharacters(index: number, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  characterInputs.value[index] = event.target.value
  const member = selectedMembers.value[index]
  if (!member) return
  const codePoints = [...new Set([...event.target.value].flatMap(character => {
    const codePoint = character.codePointAt(0)
    return codePoint === undefined ? [] : [codePoint]
  }))]
  const ranges = normalizeUnicodeRanges(codePoints.map(codePoint => ({ start: codePoint, end: codePoint })))
  selectedMembers.value[index] = {
    fontKey: member.fontKey,
    ...(ranges ? { ranges } : {}),
  }
  const invalid = new Set(invalidRangeIndexes.value)
  invalid.delete(index)
  invalidRangeIndexes.value = invalid
}
</script>

<style scoped>
.project-font-set-dialog__field,
.project-font-set-dialog__members,
.project-font-set-dialog__selected { display: grid; min-width: 0; gap: var(--oc-space-xs); }
.project-font-set-dialog__field { color: var(--oc-fg-muted); font-size: var(--oc-text-sm); }
.project-font-set-dialog__member-add,
.project-font-set-dialog__member-row,
.project-font-set-dialog__member-row > span { display: flex; align-items: center; min-width: 0; gap: var(--oc-space-xs); }
.project-font-set-dialog__member-row { flex-wrap: wrap; justify-content: space-between; padding: var(--oc-space-xs); border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }
.project-font-set-dialog__member-row > :first-child { flex: 1; }
.project-font-set-dialog__member-add > :first-child { flex: 1; }
.project-font-set-dialog__selected { max-height: var(--oc-list-max-height-sm); overflow-y: auto; }
.project-font-set-dialog__range-editor { display: grid; flex: 0 0 100%; gap: var(--oc-space-xs); }
.project-font-set-dialog__range-presets { display: flex; flex-wrap: wrap; gap: var(--oc-space-2xs); }
</style>
