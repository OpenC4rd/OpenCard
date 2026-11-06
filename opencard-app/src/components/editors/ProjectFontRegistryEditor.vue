<template>
  <ProjectResourceWorkbench :leading-title="t('projectConfig.fonts.panelTitle')" :leading-actions="leadingCardActions"
    :inspector-title="t('projectConfig.fonts.details')" @action="handleCardAction">
    <template #leading>
      <div class="project-font-registry-workbench__left">
        <component :is="'style'" v-if="previewFontCss" v-text="previewFontCss" />
        <OcText v-if="error" tone="danger" size="sm" role="alert">{{ error }}</OcText>
        <div class="project-font-registry-workbench__list">
          <OcTree fill role="listbox" selection-mode="single"
            activation-mode="double-click" scroll-to-selection :data="treeData"
            :expanded-keys="['families', 'compositions']"
            :selected-keys="selectedTreeKeys" :action-overflow-title="t('projectConfig.fonts.entryActions')"
            @selection-change="handleSelectionChange" @node-activate="handleNodeActivate" @action="handleNodeAction" />
        </div>
      </div>
    </template>

    <template v-if="selectedEntry" #append>
      <OcFieldInput class="project-font-registry-workbench__text" full-width :value="previewText"
        :aria-label="t('projectConfig.fonts.previewText')" @input="updatePreviewText" />
      <OcSlider class="project-font-registry-workbench__size" v-model="previewSize"
        :min="PREVIEW_SIZE_MIN" :max="PREVIEW_SIZE_MAX" :step="PREVIEW_SIZE_STEP"
        :value-text="`${previewSize} px`" :aria-label="t('projectConfig.fonts.previewSize')" />
    </template>

    <ProjectFontSpecimen v-if="selectedEntry" :families="families" :family="shownFamily" :composition="shownComposition"
      :text="previewText" :size="previewSize" :read-font-bytes="readFontBytes"
      :load-errors="loadErrors" />
    <OcEmpty v-else tone="muted" inset="none" fill :icon="activePage === 'families' ? 'mdiFormatFont' : 'mdiLayersOutline'">
      {{ activePage === 'families' ? t('projectConfig.fonts.noFontSelected') : t('projectConfig.fonts.noSetSelected') }}
    </OcEmpty>

    <template v-if="selectedEntry" #inspector>
      <ProjectFontInspector :families="families" :family="shownFamily" :composition="shownComposition"
        @configure="configureEntry(activePage, selectedEntry!.key)" />
    </template>
  </ProjectResourceWorkbench>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectFont, ProjectFontComposition } from '../../features/workspace/model/projectFontRegistry'
import { createProjectFontCssFamily } from '../../features/workspace/model/projectFonts'
import { projectFontFileEntries, projectFontWeightValues } from '../../features/workspace/model/projectFontRegistry'
import type { ProjectFontLoadError } from '../../features/workspace/services/projectFontLoader'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
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
import OcText from '../base/OcText.vue'
import OcSlider from '../standard/OcSlider.vue'
import OcTree from '../standard/OcTree.vue'
import ProjectFontInspector from './ProjectFontInspector.vue'
import ProjectFontSpecimen from './ProjectFontSpecimen.vue'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'

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
const PREVIEW_SIZE_MIN = 24
const PREVIEW_SIZE_MAX = 120
const PREVIEW_SIZE_STEP = 4
const PREVIEW_SIZE_DEFAULT = 48
const activePage = ref<'families' | 'compositions'>('families')
const selectedFamilyKey = ref<string | null>(null)
const selectedCompositionKey = ref<string | null>(null)
const previewText = ref(t('projectConfig.fonts.previewSample'))
const previewSize = ref(PREVIEW_SIZE_DEFAULT)
const selectedFamily = computed(() => props.families.find(family => family.key === selectedFamilyKey.value) ?? null)
const selectedComposition = computed(() => props.compositions.find(entry => entry.key === selectedCompositionKey.value) ?? null)
const shownFamily = computed(() => activePage.value === 'families' ? selectedFamily.value : null)
const shownComposition = computed(() => activePage.value === 'compositions' ? selectedComposition.value : null)
const selectedEntry = computed(() => shownFamily.value ?? shownComposition.value)
const selectedTreeKeys = computed(() => {
  const key = activePage.value === 'families' ? selectedFamilyKey.value : selectedCompositionKey.value
  return key ? [treeKey(activePage.value, key)] : []
})
const referencedFamilyKeys = computed(() => new Set(
  props.compositions.flatMap(composition => composition.members.map(member => member.fontKey.toLocaleLowerCase())),
))
const leadingCardActions = computed<OcActionDefinition[]>(() => [
  { key: 'add-family', icon: 'mdiPlus', title: t('projectConfig.fonts.addFont') },
  { key: 'add-composition', icon: 'mdiFolderPlusOutline', title: t('projectConfig.fonts.addSet') },
])
const treeData = computed<OcNodeCollection>(() => {
  const addFamilyAction: OcNodeAction = {
    key: 'add-family', title: t('projectConfig.fonts.addFont'), icon: 'mdiPlus',
  }
  const addCompositionAction: OcNodeAction = {
    key: 'add-composition', title: t('projectConfig.fonts.addSet'), icon: 'mdiPlus',
  }
  const configureFamilyAction: OcNodeAction = {
    key: 'configure-family', title: t('projectConfig.fonts.configure'), icon: 'mdiCogOutline',
  }
  const removeFamilyAction: OcNodeAction = {
    key: 'delete-family', title: t('projectConfig.fonts.remove'), icon: 'mdiTrashCanOutline', iconTone: 'danger',
  }
  const configureCompositionAction: OcNodeAction = {
    key: 'configure-composition', title: t('projectConfig.fonts.configureSet'), icon: 'mdiCogOutline',
  }
  const removeCompositionAction: OcNodeAction = {
    key: 'delete-composition', title: t('projectConfig.fonts.removeSet'), icon: 'mdiTrashCanOutline', iconTone: 'danger',
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
      visual: { type: 'icon', icon: 'mdiFormatFont' },
      contextActions: [addFamilyAction],
    }],
    ['compositions', {
      label: t('projectConfig.fonts.compositions'),
      visual: { type: 'icon', icon: 'mdiLayersOutline' },
      contextActions: [addCompositionAction],
    }],
    ...props.families.map((entry): [string, OcNode] => {
      const referenced = referencedFamilyKeys.value.has(entry.key.toLocaleLowerCase())
      return [treeKey('families', entry.key), {
        label: entry.name,
        labelFont: JSON.stringify(createProjectFontCssFamily(entry.key)),
        visual: { type: 'icon', icon: 'mdiFormatFont' },
        tail: [
          t('projectConfig.fonts.faceCount', { count: projectFontFileEntries(entry).length }),
          ...(referenced ? [configureFamilyAction] : [configureFamilyAction, removeFamilyAction]),
        ],
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
      visual: { type: 'icon', icon: 'mdiLayersOutline' },
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
const previewFontCss = computed(() => props.families.flatMap(font => projectFontFileEntries(font).map(slot => (
  `@font-face { font-family: ${JSON.stringify(createProjectFontCssFamily(font.key))}; src: url(${JSON.stringify(props.resolveAssetSrc(slot.source))}); font-weight: ${projectFontWeightValues[slot.weight]}; font-style: ${slot.style === 'upright' ? 'normal' : 'italic'}; }`
))).join('\n'))

watch(() => props.families, families => {
  if (!families.some(family => family.key === selectedFamilyKey.value)) selectedFamilyKey.value = families[0]?.key ?? null
}, { immediate: true })
watch(() => props.compositions, compositions => {
  if (!compositions.some(entry => entry.key === selectedCompositionKey.value)) selectedCompositionKey.value = compositions[0]?.key ?? null
}, { immediate: true })

function treeKey(page: 'families' | 'compositions', key: string): string { return `${page}:${key}` }
/** 空分组的占位子项键：不参与选中与动作，只说明这一组现在是空的。 */
const GROUP_EMPTY_KEY = { families: 'families:empty', compositions: 'compositions:empty' } as const
/** 占位子项禁用它自己：它不是一个能点开的字体条目，只是这一组的空状态（与「预装的包」树同一种做法）。 */
function emptyPlaceholder(label: string): OcNode {
  return { label, visual: { type: 'icon', icon: 'mdiFileOutline' }, disabled: true }
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
function handleCardAction({ key }: { key: string }): void {
  if (key === 'add-family') emit('register-family')
  else if (key === 'add-composition') emit('add-composition')
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
.project-font-registry-workbench__left { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.project-font-registry-workbench__list { position: relative; grid-row: 2; min-height: 0; overflow: hidden; }
.project-font-registry-workbench__list > .oc-tree { position: absolute; inset: 0; }
.project-font-registry-workbench__text, .project-font-registry-workbench__size { flex: 0 1 var(--oc-resource-control-width); width: var(--oc-resource-control-width); min-width: 0; }
</style>
