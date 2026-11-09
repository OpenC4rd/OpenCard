<template>
  <OcEmpty v-if="!profile" icon="mdiPrinter" tone="muted" fill>
    {{ t('projectExport.noProfiles') }}
  </OcEmpty>
  <ProjectResourceWorkbench v-else :inspector-title="t('projectExport.inspectorTitle')"
    :inspector-actions="inspectorActions" @action="handleInspectorAction">
    <OcEmpty v-if="message" icon="mdiPrinter" tone="muted" fill role="status">{{ message }}</OcEmpty>
    <div v-else class="export-page__stage" :class="{ 'is-loading': preview.loading }" :aria-busy="preview.loading"
      @wheel.prevent="handleWheel">
      <img v-for="url in preview.imageUrls" :key="url" class="export-page__sheet"
        :class="{ 'is-spread': preview.pageStep > 1 }" :src="url" :alt="t('projectExport.preview.alt')">
    </div>

    <template v-if="!message && preview.pageCount > 1" #append>
      <OcOptionGroup v-if="preview.spreadAvailable" :model-value="preview.spread ? 'double' : 'single'"
        :options="viewOptions" appearance="sliding-outline" icon-only :aria-label="t('projectExport.preview.viewMode')"
        @update:model-value="emit('setSpread', $event === 'double')" />
      <OcButton icon-only size="sm" variant="ghost" icon="mdiArrowLeft" :disabled="preview.pageIndex === 0"
        :aria-label="t('projectExport.preview.previous')" :data-tooltip="t('projectExport.preview.previous')"
        @click="emit('selectPage', preview.pageIndex - preview.pageStep)" />
      <OcText as="span" size="sm">
        {{ t('projectExport.preview.page', { current: pageLabel, total: preview.pageCount }) }}
      </OcText>
      <OcButton icon-only size="sm" variant="ghost" icon="mdiArrowRight"
        :disabled="preview.pageIndex + preview.pageStep >= preview.pageCount"
        :aria-label="t('projectExport.preview.next')" :data-tooltip="t('projectExport.preview.next')"
        @click="emit('selectPage', preview.pageIndex + preview.pageStep)" />
    </template>

    <template #inspector>
      <div class="export-page__properties">
        <div class="export-page__fields">
          <PropertyEditor :inputs="inputs" :categories="categories" :capabilities="capabilities" sort-mode="category"
            @update-property="updateProperty" />
        </div>
        <OcButton class="export-page__submit" block size="lg" variant="solid" icon="mdiExport" :disabled="busy || Boolean(issue)" @click="emit('submit')">
          {{ t(busy ? 'projectExport.preparing' : 'projectExport.submit') }}
        </OcButton>
      </div>
    </template>
  </ProjectResourceWorkbench>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcEmpty from '../../../components/base/OcEmpty.vue'
import OcOptionGroup, { type OcOption } from '../../../components/standard/OcOptionGroup.vue'
import OcText from '../../../components/base/OcText.vue'
import ProjectResourceWorkbench from '../../../components/editors/ProjectResourceWorkbench.vue'
import type { OcActionDefinition } from '../../../shared/ui/action/action.types'
import PropertyEditor from '../../../shared/ui/property-editor/PropertyEditor.vue'
import type { PropertyEditorInput, PropertyEditorMutation, PropertyFieldCapabilities } from '../../../shared/ui/property-editor/propertyEditor.types'
import type { ExportPageRegion, ExportProfile } from '../../workspace/model/projectExportProfile'
import {
  applyExportProfileField,
  countHiddenExportChanges,
  createExportDocumentProvider,
  createExportProfileCategories,
  createExportProfileInput,
  createExportVariableProviders,
} from '../exportProfileProperties'
import type { ExportTaskValidationIssue } from '../exportTask'

defineOptions({ name: 'ExportPageContent' })

const EDIT_ACTION_KEY = 'edit'
const SAVE_ACTION_KEY = 'save'
const CANCEL_ACTION_KEY = 'cancel'
const ADVANCED_ACTION_KEY = 'toggle-advanced'
/** 这些错误要改的字段在高级配置里，藏着就没法照着提示修。 */
const ADVANCED_ISSUE_CODES: ReadonlySet<string> = new Set(['paper-too-small', 'invalid-scale'])

const props = defineProps<{
  profile: ExportProfile | null
  documents: readonly string[]
  busy: boolean
  issue: ExportTaskValidationIssue | null
  editing: boolean
  capabilities?: PropertyFieldCapabilities
  preview: {
    imageUrls: readonly string[]
    pageIndex: number
    pageStep: number
    pageCount: number
    loading: boolean
    spreadAvailable: boolean
    spread: boolean
  }
}>()
const emit = defineEmits<{ update: [profile: ExportProfile]; selectPage: [index: number]; setSpread: [spread: boolean]; edit: []; save: []; cancel: []; submit: [] }>()
const { t } = useI18n()

const categories = computed(() => createExportProfileCategories(t))
const documentProvider = createExportDocumentProvider(() => props, t)
const variableProviders = createExportVariableProviders(t)
const region = ref<ExportPageRegion>('cb')
const advanced = computed(() => Boolean(props.profile?.advanced) || ADVANCED_ISSUE_CODES.has(props.issue?.code ?? ''))
const inputs = computed<PropertyEditorInput[]>(() => props.profile
  ? [createExportProfileInput(props.profile, props.documents, props.busy || !props.editing, documentProvider, variableProviders, { advanced: advanced.value, region: region.value }, t)]
  : [])
const inspectorActions = computed<OcActionDefinition[]>(() => props.editing ? [{
  key: ADVANCED_ACTION_KEY,
  icon: 'mdiCogOutline',
  title: t('projectExport.advanced'),
  active: advanced.value,
  badge: !advanced.value && props.profile ? countHiddenExportChanges(props.profile) || undefined : undefined,
}, {
  key: CANCEL_ACTION_KEY, icon: 'mdiClose', title: t('projectExport.cancelEdit'), disabled: props.busy,
}, {
  key: SAVE_ACTION_KEY, icon: 'mdiContentSaveOutline', title: t('projectExport.saveProfile'), disabled: props.busy,
}] : [{
  key: EDIT_ACTION_KEY, icon: 'mdiPencilOutline', title: t('projectExport.editProfile'), disabled: props.busy,
}])
const viewOptions = computed<OcOption[]>(() => [
  { value: 'single', label: t('projectExport.preview.single'), icon: 'mdiFileOutline' },
  { value: 'double', label: t('projectExport.preview.double'), icon: 'mdiFileMultipleOutline' },
])
const pageLabel = computed(() => {
  const first = props.preview.pageIndex + 1
  const last = Math.min(first + props.preview.pageStep - 1, props.preview.pageCount)
  return first === last ? String(first) : `${first}–${last}`
})
const message = computed(() => props.issue
  ? t(`projectExport.validation.${props.issue.code}`, { path: props.issue.path ?? '' })
  : '')

const WHEEL_PAGE_THRESHOLD = 40
const WHEEL_PAGE_COOLDOWN_MS = 180
let wheelDelta = 0
let wheelLockedUntil = 0

/** 滚轮翻页：触控板的连续惯性滚动先累计到阈值，翻一页后冷却一小会儿，避免一划翻很多页。 */
function handleWheel(event: WheelEvent): void {
  const now = performance.now()
  if (now < wheelLockedUntil) return
  wheelDelta += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (Math.abs(wheelDelta) < WHEEL_PAGE_THRESHOLD) return
  const { pageIndex, pageStep, pageCount } = props.preview
  const next = pageIndex + (wheelDelta > 0 ? pageStep : -pageStep)
  wheelDelta = 0
  wheelLockedUntil = now + WHEEL_PAGE_COOLDOWN_MS
  if (next >= 0 && next < pageCount) emit('selectPage', next)
}

function handleInspectorAction({ key }: { key: string }): void {
  if (key === EDIT_ACTION_KEY) emit('edit')
  else if (key === SAVE_ACTION_KEY) emit('save')
  else if (key === CANCEL_ACTION_KEY) emit('cancel')
  else if (props.profile) emit('update', { ...props.profile, advanced: !advanced.value })
}

function updateProperty(mutation: PropertyEditorMutation): void {
  if (mutation.fieldKey === 'pageRegion') region.value = mutation.value as ExportPageRegion
  else if (props.profile) emit('update', applyExportProfileField(props.profile, mutation.fieldKey, mutation.value))
}
</script>

<style scoped>
.export-page__stage {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-lg);
  width: 100%;
  height: 100%;
  min-height: 0;
  padding-block: var(--oc-space-lg);
  transition: opacity var(--oc-duration) var(--oc-ease);
}
.export-page__stage.is-loading { opacity: 0.6; }
.export-page__sheet {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: var(--oc-shadow-md);
}
/* 列表自己滚动，导出按钮固定在面板底部。 */
.export-page__sheet.is-spread { max-width: calc(50% - var(--oc-space-lg) / 2); }
.export-page__properties {
  display: flex;
  flex-direction: column;
  gap: var(--oc-space-md);
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.export-page__fields {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.export-page__submit { flex: none; }
</style>
