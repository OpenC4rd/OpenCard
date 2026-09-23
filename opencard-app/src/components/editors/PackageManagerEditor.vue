<template>
  <ProjectRegistryEditorShell content-mode="workspace">
    <OcEmpty v-if="treeData.rootKeys.length === 0" tone="muted" inset="comfortable">
      {{ t('packageManager.empty') }}
    </OcEmpty>
    <div v-else class="package-manager-editor__view">
      <!-- 相册卡片：封面由 OcAlbum 用 OcCover 画出来，动作就是节点尾部那两条命令。 -->
      <OcAlbum
        fill
        :data="treeData"
        :aria-label="t('packageManager.title')"
        selection-mode="none"
        activation-mode="none"
        @action="handleNodeAction"
      />
    </div>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/registry/editorRegistry'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { OcNode, OcNodeActionEvent, OcNodeCollection } from '../../shared/ui/node/node.types'
import { formatPackageCoordinate } from '../../features/workspace/model/packageCoordinate'
import { getPathBasename } from '../../shared/model/filePath'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import OcAlbum from '../standard/OcAlbum.vue'
import OcEmpty from '../base/OcEmpty.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'

defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()

const REVEAL_ACTION_KEY = 'package-manager.reveal'
const COPY_ACTION_KEY = 'package-manager.copy-coordinate'

/**
 * 这一页只说两件事："项目里有哪些包"，以及"它们各自现在是什么状态"。
 *
 * 状态不是另做一次校验得出的：发现阶段读每个归档本来就是为了知道它是谁，所以
 * "解开了没有"就是缓存里有没有那个指纹目录，"读不出来"就是那一次读取的结果。页面只负责显示。
 */
const treeData = computed<OcNodeCollection>(() => {
  const items = new Map<string, OcNode>()
  for (const pkg of [...projectStore.projectResourcePackages.value.values()]
    .sort((left, right) => left.manifest.title.localeCompare(right.manifest.title))) {
    const coordinate = formatPackageCoordinate(pkg.coordinate)
    items.set(pkg.archivePath, {
      label: pkg.manifest.title,
      visual: { type: 'icon', icon: 'file.package', iconTone: pkg.rootPath ? 'success' : 'warning' },
      // 封面是包解开之后的资源：没解开的包没有封面，媒体区留空 —— 这本身就是状态。
      ...(pkg.cover ? { cover: { type: 'image' as const, src: pkg.cover.src, label: `${coordinate} ${t('packageManifest.coverAlt')}` } } : {}),
      tail: [
        coordinate,
        // 状态是文字而不是只靠配色：一眼就能扫出哪些解开了、哪些还没有。
        pkg.rootPath ? t('packageManager.unpacked') : t('packageManager.unpacking'),
        ROW_ACTIONS.copy,
        ROW_ACTIONS.reveal,
      ],
    })
  }
  for (const broken of projectStore.unreadableProjectResourcePackages.value) {
    items.set(broken.archivePath, {
      label: getPathBasename(broken.archivePath),
      visual: { type: 'icon', icon: 'file.package', iconTone: 'danger' },
      tail: [t('packageManager.unreadable'), broken.reason, ROW_ACTIONS.reveal],
    })
  }
  return { rootKeys: [...items.keys()], items, children: new Map() }
})

const ROW_ACTIONS = {
  reveal: {
    key: REVEAL_ACTION_KEY,
    title: t('packageManager.reveal'),
    icon: 'status.folder-open' as const,
  },
  copy: {
    key: COPY_ACTION_KEY,
    title: t('packageManager.copyCoordinate'),
    icon: 'action.copy' as const,
  },
}

function handleNodeAction(event: OcNodeActionEvent): void {
  if (event.actionKey === REVEAL_ACTION_KEY) {
    void projectStore.revealEntryInFileManager(event.key)
    return
  }
  if (event.actionKey === COPY_ACTION_KEY) {
    const coordinate = treeData.value.items.get(event.key)?.tail
    const text = Array.isArray(coordinate) ? coordinate.find(part => typeof part === 'string') : coordinate
    if (typeof text === 'string') void navigator.clipboard.writeText(text)
  }
}

const presentation = computed<EditorPresentation>(() => ({
  title: t('packageManager.title'),
  description: t('packageManager.description'),
  icon: 'file.package',
}))

defineExpose({ presentation })

emit('modified', false)
</script>

<style scoped>
.package-manager-editor__view {
  height: 100%;
  min-height: 0;
}
</style>
