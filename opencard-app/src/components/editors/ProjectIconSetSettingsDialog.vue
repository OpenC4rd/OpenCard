<template>
  <OcDialog :open="open" :title="t('projectConfig.icons.configureIconSet')" as="form" size="sm"
    close-on-backdrop @request-close="emit('close')" @submit="submit">
    <label class="project-icon-set-dialog__field">
      <OcText as="span" size="sm">{{ t('projectConfig.icons.iconSetName') }}</OcText>
      <OcFieldInput full-width autofocus :value="draftName"
        :aria-invalid="!validName" @input="updateName" />
    </label>
    <label class="project-icon-set-dialog__field">
      <OcText as="span" size="sm">{{ t('projectConfig.icons.iconSetKey') }}</OcText>
      <OcFieldInput full-width mono disabled :value="seriesKey" />
    </label>

    <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">
      {{ validationMessage }}
    </OcText>

    <template #footer>
      <OcButton type="button" :disabled="busy" @click="emit('close')">{{ t('projectConfig.icons.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!validName || busy">
        {{ t('projectConfig.icons.save') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script lang="ts">
/** 集的 Key 就是它的文件夹名，也是卡片里引用它的方式，所以这里只改显示名。 */
export type ProjectIconSetSettingsRequest = {
  name: string
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  name?: string
  seriesKey?: string
  busy?: boolean
}>(), {
  name: '',
  seriesKey: '',
  busy: false,
})
const emit = defineEmits<{
  close: []
  submit: [request: ProjectIconSetSettingsRequest]
}>()
const { t } = useI18n()
const draftName = ref('')

const normalizedName = computed(() => draftName.value.trim())
const validName = computed(() => normalizedName.value.length > 0)
const validationMessage = computed(() => {
  if (!validName.value) return t('projectConfig.icons.invalidIconSetName')
  return ''
})

watch([() => props.open, () => props.name], ([open, name]) => {
  if (open) draftName.value = name
}, { immediate: true })

function updateName(event: Event): void {
  if (event.target instanceof HTMLInputElement) draftName.value = event.target.value
}

function submit(): void {
  if (!validName.value) return
  emit('submit', { name: normalizedName.value })
}
</script>

<style scoped>
.project-icon-set-dialog__field {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-xs);
}
</style>
