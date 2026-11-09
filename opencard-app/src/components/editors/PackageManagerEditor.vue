<template>
  <ProjectRegistryEditorShell content-mode="workspace">
    <ProjectResourceWorkbench :inspector-title="t('packageManifest.information')">
      <OcEmpty v-if="treeData.rootKeys.length === 0" icon="mdiPackageVariantClosed" tone="muted" fill>
        {{ t('packageManager.empty') }}
        <OcButton size="sm" icon="mdiPlus" @click="emit('add-package')">{{ t('packageManager.add') }}</OcButton>
      </OcEmpty>
      <!-- 相册卡片：封面由 OcAlbum 用 OcCover 画出来，动作都挂在节点尾部。 -->
      <OcAlbum
        v-else
        fill
        :data="treeData"
        :aria-label="t('packageManager.title')"
        :selected-keys="selectedPath ? [selectedPath] : []"
        selection-mode="single"
        @selection-change="selectedPath = $event.selectedKeys[0] ?? selectedPath"
        @node-activate="handleNodeActivate"
        @action="handleNodeAction"
      />
      <template v-if="treeData.rootKeys.length" #inspector>
        <div class="package-manager-editor__inspector">
          <PackageManifestContent v-if="selectedPath" :path="selectedPath" compact />
        </div>
      </template>
    </ProjectResourceWorkbench>
  </ProjectRegistryEditorShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorEmits, EditorProps } from '../../features/editor-runtime/editorProtocol'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { EditorPresentation } from '../../shared/ui/editorPresentation.types'
import type { OcNode, OcNodeAction, OcNodeActionEvent, OcNodeActivateEvent, OcNodeCollection } from '../../shared/ui/node/node.types'
import { formatPackageCoordinate } from '../../features/workspace/model/packageCoordinate'
import { getPathBasename } from '../../shared/model/filePath'
import { useProjectStore } from '../../features/workspace/store/projectStore'
import OcAlbum from '../standard/OcAlbum.vue'
import OcButton from '../base/OcButton.vue'
import OcEmpty from '../base/OcEmpty.vue'
import PackageManifestContent from './PackageManifestContent.vue'
import ProjectRegistryEditorShell from './ProjectRegistryEditorShell.vue'
import ProjectResourceWorkbench from './ProjectResourceWorkbench.vue'

defineProps<EditorProps>()
const emit = defineEmits<EditorEmits>()
const { t } = useI18n()
const projectStore = useProjectStore()
const selectedPath = ref<string | null>(null)

const REVEAL_ACTION_KEY = 'package-manager.reveal'
const REMOVE_ACTION_KEY = 'package-manager.remove'
const CONFIRM_REMOVE_ACTION_KEY = 'package-manager.confirm-remove'

const ADD_ACTION: OcActionDefinition = { key: 'package-manager.add', icon: 'mdiPlus', title: t('packageManager.add') }

const REVEAL_ACTION: OcNodeAction = {
  key: REVEAL_ACTION_KEY,
  title: t('packageManager.reveal'),
  icon: 'mdiFolderOpenOutline',
}

/**
 * 移除包 = 把这个归档移到回收站。破坏性动作两步走：先点删除，菜单里再确认一次 ——
 * 和文件树里删一个文件是同一套，确认那一项的标题带上文件名。
 */
function removeAction(name: string): OcNodeAction {
  return {
    key: REMOVE_ACTION_KEY,
    title: t('packageManager.remove'),
    icon: 'mdiTrashCanOutline',
    children: [{
      key: CONFIRM_REMOVE_ACTION_KEY,
      title: t('packageManager.confirmRemove', { name }),
      icon: 'mdiTrashCanOutline',
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
      visual: { type: 'icon', icon: 'mdiPackageVariantClosed', iconTone: 'file-opencard' },
      // 封面是包解开之后的资源：没解开的包没有封面，媒体区画包图标，不留一块空白。
      cover: pkg?.cover
        ? { type: 'image' as const, src: pkg.cover.src, label: `${coordinate || title} ${t('packageManifest.coverAlt')}` }
        : { type: 'icon' as const, icon: 'mdiPackageVariantClosed' },
      tail: [...(coordinate ? [coordinate] : []), REVEAL_ACTION, removeAction(title)],
    })
  }
  for (const broken of projectStore.unreadableProjectResourcePackages.value) {
    const title = getPathBasename(broken.archivePath)
    items.set(broken.archivePath, {
      label: title,
      visual: { type: 'icon', icon: 'mdiPackageVariantClosed', iconTone: 'danger' },
      cover: { type: 'icon', icon: 'mdiPackageVariantClosed', iconTone: 'danger' },
      // 读不出来的归档更要能从这里清掉：它当不了包，留在文件夹里只会每次打开都报一遍。
      tail: [t('packageManager.unreadable'), broken.reason, REVEAL_ACTION, removeAction(title)],
    })
  }
  return { rootKeys: [...items.keys()], items, children: new Map() }
})

/** 选中跟着文件走：被移除的包让位给第一张卡，新页面默认看第一个。 */
watch(() => treeData.value.rootKeys, keys => {
  if (!selectedPath.value || !keys.includes(selectedPath.value)) selectedPath.value = keys[0] ?? null
}, { immediate: true })

/** 单击在检视器里看详情，双击打开那个归档：和从文件树打开同一个文件是同一条路。 */
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
  icon: 'mdiPackageVariantClosed',
}))

const headerActions = computed<OcActionDefinition[]>(() => (treeData.value.rootKeys.length ? [ADD_ACTION] : []))
function onHeaderAction(actionKey: string): void {
  if (actionKey === ADD_ACTION.key) emit('add-package')
}

defineExpose({ presentation, headerActions, onHeaderAction })

</script>

<style scoped>
.package-manager-editor__inspector {
  grid-row: 1 / -1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
</style>
