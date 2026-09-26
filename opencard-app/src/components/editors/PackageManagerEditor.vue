<template>
  <ProjectRegistryEditorShell content-mode="workspace">
    <OcEmpty v-if="treeData.rootKeys.length === 0" tone="muted" inset="comfortable">
      {{ t('packageManager.empty') }}
    </OcEmpty>
    <div v-else class="package-manager-editor__view">
      <!-- 相册卡片：封面由 OcAlbum 用 OcCover 画出来，动作都挂在节点尾部。 -->
      <OcAlbum
        fill
        :data="treeData"
        :aria-label="t('packageManager.title')"
        selection-mode="none"
        activation-mode="single-click"
        @node-activate="handleNodeActivate"
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
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection } from '../../shared/ui/node/node.types'
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
const REMOVE_ACTION_KEY = 'package-manager.remove'
const CONFIRM_REMOVE_ACTION_KEY = 'package-manager.confirm-remove'

const REVEAL_ACTION: OcNodeAction = {
  key: REVEAL_ACTION_KEY,
  title: t('packageManager.reveal'),
  icon: 'status.folder-open',
}

/**
 * 移除包 = 把这个归档移到回收站。破坏性动作两步走：先点删除，菜单里再确认一次 ——
 * 和文件树里删一个文件是同一套，确认那一项的标题带上文件名。
 */
function removeAction(name: string): OcNodeAction {
  return {
    key: REMOVE_ACTION_KEY,
    title: t('packageManager.remove'),
    icon: 'action.delete',
    children: [{
      key: CONFIRM_REMOVE_ACTION_KEY,
      title: t('packageManager.confirmRemove', { name }),
      icon: 'action.delete',
      iconTone: 'danger',
    }],
  }
}

/**
 * 这一页就是侧栏那个包文件夹的相册版：标题是文件名，小字是包自述的坐标 —— 和侧栏里那一行字字相同。
 * 相册只多做一件事：把包内的封面画在卡片上。
 *
 * 文件是唯一的事实：有几份归档就有几张卡，内容相同的两份也各占一张，读不出身份的也照样列出来。
 * 至于"解开了没有"，看封面有没有画出来就够了。
 */
const treeData = computed<OcNodeCollection>(() => {
  const catalog = projectStore.projectResourcePackages.value
  const files = [...projectStore.projectResourcePackageFiles.value].sort((left, right) => (
    getPathBasename(left.archivePath).localeCompare(getPathBasename(right.archivePath))
  ))

  const items = new Map<string, OcNode>()
  for (const file of files) {
    const title = getPathBasename(file.archivePath)
    const pkg = catalog.get(file.fingerprint)
    const coordinate = pkg ? formatPackageCoordinate(pkg.coordinate) : ''
    items.set(file.archivePath, {
      label: title,
      visual: { type: 'icon', icon: 'file.package', iconTone: 'opencard' },
      // 封面是包解开之后的资源：没解开的包没有封面，媒体区留空。
      ...(pkg?.cover ? { cover: { type: 'image' as const, src: pkg.cover.src, label: `${coordinate || title} ${t('packageManifest.coverAlt')}` } } : {}),
      tail: [...(coordinate ? [coordinate] : []), REVEAL_ACTION, removeAction(title)],
    })
  }
  for (const broken of projectStore.unreadableProjectResourcePackages.value) {
    const title = getPathBasename(broken.archivePath)
    items.set(broken.archivePath, {
      label: title,
      visual: { type: 'icon', icon: 'file.package', iconTone: 'danger' },
      // 读不出来的归档更要能从这里清掉：它当不了包，留在文件夹里只会每次打开都报一遍。
      tail: [t('packageManager.unreadable'), broken.reason, REVEAL_ACTION, removeAction(title)],
    })
  }
  return { rootKeys: [...items.keys()], items, children: new Map() }
})

/** 点卡片就是打开那个归档：详情由包清单编辑器给出，和从文件树打开同一个文件是同一条路。 */
function handleNodeActivate(event: OcNodeActivateEvent): void {
  emit('open-file', event.key)
}

function handleNodeAction(event: OcNodeActionEvent): void {
  if (event.actionKey === REVEAL_ACTION_KEY) {
    void projectStore.revealEntryInFileManager(event.key)
    return
  }
  // 移文件的事归壳层：它顺手管好开着的标签页，也顺手让这一页少一张卡。
  if (event.actionKey === CONFIRM_REMOVE_ACTION_KEY) emit('trash-file', event.key)
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
