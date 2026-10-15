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
      <OcFieldInput full-width mono :value="draftKey"
        :aria-invalid="!validKey || !uniqueKey" @input="updateKey" />
    </label>

    <OcText v-if="validationMessage" tone="danger" size="sm" role="alert">
      {{ validationMessage }}
    </OcText>

    <template #footer>
      <OcButton type="button" :disabled="busy" @click="emit('close')">{{ t('projectConfig.icons.cancel') }}</OcButton>
      <OcButton type="submit" variant="solid" :disabled="!validName || !validKey || !uniqueKey || busy">
        {{ t('projectConfig.icons.save') }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script lang="ts">
export type ProjectIconSetSettingsRequest = {
  name: string
  key: string
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { projectIconKeyPattern } from '../../features/workspace/model/projectIcons'
import OcButton from '../base/OcButton.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcText from '../base/OcText.vue'
import OcDialog from '../standard/OcDialog.vue'

const props = withDefaults(defineProps<{
  open: boolean
  name?: string
  seriesKey?: string
  busy?: boolean
  existingKeys?: readonly string[]
}>(), {
  name: '',
  seriesKey: '',
  busy: false,
  existingKeys: () => [],
})
const emit = defineEmits<{
  close: []
  submit: [request: ProjectIconSetSettingsRequest]
}>()
const { t } = useI18n()
const draftName = ref('')
const draftKey = ref('')

const normalizedName = computed(() => draftName.value.trim())
const normalizedKey = computed(() => draftKey.value.trim())
const validName = computed(() => normalizedName.value.length > 0)
const validKey = computed(() => projectIconKeyPattern.test(normalizedKey.value))
const uniqueKey = computed(() => !props.existingKeys.some(key => (
  key.toLocaleLowerCase() === normalizedKey.value.toLocaleLowerCase()
  && key.toLocaleLowerCase() !== props.seriesKey.toLocaleLowerCase()
)))
const validationMessage = computed(() => {
  if (!validName.value) return t('projectConfig.icons.invalidIconSetName')
  if (!validKey.value) return t('projectConfig.icons.invalidIconSetKey')
  if (!uniqueKey.value) return t('projectConfig.icons.iconSetKeyExists')
  return ''
})

watch([() => props.open, () => props.name, () => props.seriesKey], ([open, name, seriesKey]) => {
  if (open) {
    draftName.value = name
    draftKey.value = seriesKey
  }
}, { immediate: true })

function updateName(event: Event): void {
  if (event.target instanceof HTMLInputElement) draftName.value = event.target.value
}
function updateKey(event: Event): void {
  if (event.target instanceof HTMLInputElement) draftKey.value = event.target.value
}

function submit(): void {
  if (!validName.value || !validKey.value || !uniqueKey.value) return
  emit('submit', { name: normalizedName.value, key: normalizedKey.value })
}
</script>

<style scoped>
.project-icon-set-dialog__field {
  display: grid;
  min-width: 0;
  gap: var(--oc-space-xs);
}
</style>
