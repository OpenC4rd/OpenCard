<!-- 项目字体系统字系选择器：以树列出系统已安装的字系与字面，标签用该字系自己的字体绘制。 -->
<template>
  <div class="project-font-system-picker">
    <component :is="'style'" v-if="previewFontCss" v-text="previewFontCss" />

    <OcFieldInput full-width :value="query" :disabled="loading" autocomplete="off"
      spellcheck="false" :placeholder="t('projectConfig.fonts.searchSystemFonts')"
      :aria-label="t('projectConfig.fonts.searchSystemFonts')" @input="updateQuery" />
    <OcSwitch v-model:checked="onlySelected" :label="t('projectConfig.fonts.systemFontOnlySelected')" />

    <OcText v-if="loading" tone="muted" size="sm">{{ t('projectConfig.fonts.systemFontsLoading') }}</OcText>
    <OcText v-else-if="error" tone="danger" size="sm" role="alert">
      {{ t('projectConfig.fonts.systemFontsFailed', { message: error }) }}
    </OcText>
    <template v-else>
      <div class="project-font-system-picker__tree">
        <OcTree fill virtualized :data="treeData" selection-mode="none"
          action-visibility="always" :expanded-keys="expandedKeys"
          @action="handleAction" @expansion-change="handleExpansionChange" />
      </div>
      <OcText v-if="!matchedFamilies.length" tone="muted" size="sm">
        {{ onlySelected && !selectedNameSet.size
          ? t('projectConfig.fonts.systemFontsNoneSelected')
          : t('projectConfig.fonts.systemFontsEmpty') }}
      </OcText>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  assignSystemFontSlots,
  resolveSystemFontAssetSrc,
  type SystemFontFace,
  type SystemFontFamily,
} from '../../features/workspace/services/systemFontCatalog'
import { createAvailableKey } from '../../shared/model/keySlug'
import type {
  OcNode,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeExpansionEvent,
  OcNodeKey,
} from '../../shared/ui/node/node.types'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcSwitch from '../base/OcSwitch.vue'
import OcText from '../base/OcText.vue'
import OcTree from '../standard/OcTree.vue'

/** 勾选字系的节点尾部 action key。 */
const TOGGLE_FAMILY_ACTION_KEY = 'toggle-system-family'

const props = withDefaults(defineProps<{
  /** 可导入的系统字系，已按名称排序。 */
  families?: readonly SystemFontFamily[]
  /** 已勾选的字系名称。 */
  selectedNames?: readonly string[]
  /** 是否正在读取系统字体清单。 */
  loading?: boolean
  /** 读取系统字体清单失败的原因；为空表示读取正常。 */
  error?: string
}>(), { families: () => [], selectedNames: () => [], loading: false, error: '' })
const emit = defineEmits<{
  /** 用户勾选一个系统字系。 */
  select: [family: SystemFontFamily]
  /** 用户取消一个已勾选的字系。 */
  deselect: [family: SystemFontFamily]
}>()
const { t } = useI18n()
const query = ref('')
const onlySelected = ref(false)
const expandedKeys = ref<readonly OcNodeKey[]>([])
const selectedNameSet = computed(() => new Set(props.selectedNames))
const matchedFamilies = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return props.families
    .filter(family => !onlySelected.value || selectedNameSet.value.has(family.name))
    .filter(family => !keyword || family.name.toLocaleLowerCase().includes(keyword)
      || family.faces.some(face => face.faceName.toLocaleLowerCase().includes(keyword)))
})
/** 预览字体名与系统字体名分开，避免 @font-face 顶掉界面上同名的字体。 */
const previewFamilyNames = computed(() => {
  const usedSlugs: string[] = []
  const names = new Map<string, string>()
  for (const family of props.families) {
    const slug = createAvailableKey(family.name, usedSlugs, 'font')
    usedSlugs.push(slug)
    names.set(family.name, `OpenCardSystemFont-${slug}`)
  }
  return names
})
/** 预览只用会变成“常规正体”的那个字面，一行最多加载一个字体文件。 */
const previewFaces = computed(() => {
  const faces = new Map<string, SystemFontFace>()
  for (const family of props.families) {
    const slots = assignSystemFontSlots(family.faces)
    const face = (slots.find(slot => slot.weight === 'normal' && !slot.italic) ?? slots[0])?.face
    if (face) faces.set(family.name, face)
  }
  return faces
})
/** 预览的 @font-face 按字面真实字重之外统一声明为常规正体，标签本身不做加粗或倾斜。 */
const previewFontCss = computed(() => [...previewFaces.value].flatMap(([familyName, face]) => {
  const cssFamily = previewFamilyNames.value.get(familyName)
  return cssFamily
    ? [`@font-face { font-family: ${JSON.stringify(cssFamily)}; src: url(${JSON.stringify(resolveSystemFontAssetSrc(face.path))}); font-weight: 400; font-style: normal; }`]
    : []
}).join('\n'))
/** 字系是勾选单位，字面只作为它的子节点供核对识别结果。 */
const treeData = computed<OcNodeCollection>(() => {
  const items = new Map<OcNodeKey, OcNode>()
  const children = new Map<OcNodeKey, readonly OcNodeKey[]>()
  const rootKeys: OcNodeKey[] = []
  for (const family of matchedFamilies.value) {
    const selected = selectedNameSet.value.has(family.name)
    rootKeys.push(family.name)
    items.set(family.name, {
      label: family.name,
      labelFont: previewFamilyNames.value.get(family.name),
      visual: { type: 'icon', icon: 'file.font' },
      tail: [{
        key: TOGGLE_FAMILY_ACTION_KEY,
        icon: selected ? 'action.checkbox-marked' : 'action.checkbox-blank',
        iconTone: selected ? 'accent' : 'muted',
        title: selected ? t('projectConfig.fonts.systemFontDeselect') : t('projectConfig.fonts.systemFontSelect'),
      }],
    })
    children.set(family.name, family.faces.map(face => faceKey(face)))
    for (const face of family.faces) {
      items.set(faceKey(face), {
        label: face.faceName || family.name,
        visual: { type: 'icon', icon: 'file.font' },
        tail: [`${face.weight}`, face.italic ? t('projectConfig.fonts.styleItalic') : t('projectConfig.fonts.styleNormal')],
      })
    }
  }
  return { rootKeys, items, children }
})

function faceKey(face: SystemFontFace): OcNodeKey {
  return `${face.path}\u0000${face.index}`
}
function updateQuery(event: Event): void {
  if (event.target instanceof HTMLInputElement) query.value = event.target.value
}
function familyByName(name: OcNodeKey): SystemFontFamily | undefined {
  return props.families.find(family => family.name === name)
}
function handleAction(event: OcNodeActionEvent): void {
  if (event.actionKey !== TOGGLE_FAMILY_ACTION_KEY) return
  const family = familyByName(event.key)
  if (family) toggleFamily(family)
}
function handleExpansionChange(event: OcNodeExpansionEvent): void {
  expandedKeys.value = event.expanded
    ? [...expandedKeys.value, event.key]
    : expandedKeys.value.filter(key => key !== event.key)
}
/** 勾选只由节点尾部的 action 触发：行本身不选中，也不会替用户展开。 */
function toggleFamily(family: SystemFontFamily): void {
  if (selectedNameSet.value.has(family.name)) emit('deselect', family)
  else emit('select', family)
}
</script>

<style scoped>
.project-font-system-picker { display: grid; min-width: 0; gap: var(--oc-space-2); }
/* 虚拟滚动要求树自己滚动，所以这里给的是高度而不是最大高度。 */
.project-font-system-picker__tree { min-width: 0; height: var(--oc-list-height-md); }
</style>
