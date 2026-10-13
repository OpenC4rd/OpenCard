<template>
  <OcDialog class="release-notes-dialog" :open="open && Boolean(release)"
    :title="t('app.updater.releaseNotesTitle', { version: release?.version ?? '' })"
    size="lg" height-mode="fixed" height="lg"
    :dismissible="!busy" @request-close="handleClose">
    <template v-if="release">
        <div
          v-if="release.body"
          class="release-notes-dialog__body oc-release-notes"
          v-html="renderedBody"
        />
        <p v-else class="release-notes-dialog__empty oc-release-notes">{{ t('app.updater.releaseNotesEmpty') }}</p>

    </template>
    <template v-if="release" #footer>
      <OcButton :disabled="busy" @click="handleClose">
        {{ t('app.updater.releaseNotesClose') }}
      </OcButton>
      <OcButton v-if="available" variant="solid" :icon="downloaded ? 'action.restart' : 'action.download'"
        :disabled="busy" @click="emit('action')">
        {{ busy
          ? t('app.updater.downloading')
          : downloaded
            ? t('app.updater.installVersion', { version: release.version })
            : t('app.updater.downloadVersion', { version: release.version }) }}
      </OcButton>
    </template>
  </OcDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import OcButton from '../../../components/base/OcButton.vue'
import OcDialog from '../../../components/standard/OcDialog.vue'
import { renderMarkdown } from '../../card-rendering/markdown/renderMarkdown'
import type { ReleaseNotesSnapshot } from '../composables/updateStatePersistence'

const props = defineProps<{
  open: boolean
  release: ReleaseNotesSnapshot | null
  available: boolean
  busy: boolean
  downloaded: boolean
}>()

const emit = defineEmits<{
  close: []
  action: []
}>()

const { t } = useI18n()
const renderedBody = computed(() => renderMarkdown(props.release?.body ?? ''))

function handleClose(): void {
  if (!props.busy) emit('close')
}
</script>

<style scoped>
.release-notes-dialog__empty {
  margin: 0;
}

.release-notes-dialog__body,
.release-notes-dialog__empty {
  overflow: auto;
}

</style>
