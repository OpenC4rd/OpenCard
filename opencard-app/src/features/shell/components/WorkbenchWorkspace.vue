<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OcIcon from '../../../components/base/OcIcon.vue'
import OcButton from '../../../components/base/OcButton.vue'

defineOptions({ name: 'WorkbenchWorkspace' })

const props = withDefaults(defineProps<{
  hasActiveEditor: boolean
  hasProject?: boolean
}>(), { hasProject: true })

const emit = defineEmits<{ 'open-project': [] }>()

const { t } = useI18n()
</script>

<template>
  <div v-if="props.hasActiveEditor" class="workbench-workspace__editor-stage">
    <slot />
  </div>
  <section v-else-if="props.hasProject" class="workspace-empty-state" :aria-label="t('app.editorEmpty.title')">
    <OcIcon class="workspace-empty-state__icon" name="file.generic" size="lg" />
    <h1>{{ t('app.editorEmpty.title') }}</h1>
    <p>{{ t('app.editorEmpty.subtitle') }}</p>
  </section>
  <section v-else class="workspace-empty-state" :aria-label="t('app.workbenchEmpty.title')">
    <OcIcon class="workspace-empty-state__icon" name="status.folder-open" size="lg" />
    <h1>{{ t('app.workbenchEmpty.title') }}</h1>
    <p>{{ t('app.workbenchEmpty.subtitle') }}</p>
    <OcButton icon="status.folder-open" variant="outline" size="lg" @click="emit('open-project')">
      {{ t('sidebar.openProject') }}
    </OcButton>
  </section>
</template>

<style scoped>
.workbench-workspace__editor-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* 编辑器舞台自己收圆角：调用方要的那圈角曾经挂在一层多余的 OcPanel 上，现在归这个盒子所有。 */
  border-radius: var(--oc-radius-lg);
  overflow: hidden;
}

.workspace-empty-state {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--oc-space-2);
  padding: var(--oc-space-5);
  color: var(--oc-fg-default);
  text-align: center;
}

.workspace-empty-state__icon {
  margin-bottom: var(--oc-space-2);
  color: var(--oc-fg-subtle);
}

.workspace-empty-state h1,
.workspace-empty-state p {
  margin: 0;
}

.workspace-empty-state h1 {
  font-size: var(--oc-text-lg);
  font-weight: var(--font-weight-ui-title);
}

.workspace-empty-state p {
  max-width: 360px;
  color: var(--oc-fg-subtle);
  font-size: var(--oc-text-base);
  line-height: 1.5;
}
</style>
