import { getCurrentInstance, ref } from 'vue'
import { budgetKeep, foldActionBar } from '../../shared/ui/action/actionBar'
import { readThemePixels } from '../../shared/ui/foundation/themeTokenPixels'
import { isNodeTailAction, normalizeNodeTail } from '../../shared/ui/node/node.types'
import type { OcNode, OcNodeKey, OcNodeTailPart } from '../../shared/ui/node/node.types'

const INDENT_STEP = readThemePixels('--oc-indent-step')
/** 行尾一个命令占的宽度。 */
const TAIL_SLOT = readThemePixels('--oc-size-sm') + readThemePixels('--oc-space-2xs')
/** 行里留给内边距、图标和名称的宽度，命令不挤占它。 */
const ROW_RESERVED_WIDTH = 160

/**
 * 树的行尾命令。行数多又是虚拟滚动，不逐行测量：整棵树的宽度减去这一行的缩进和常显命令，
 * 换算成预算后按操作条的规则折叠。再窄也至少留一格给「更多」。
 */
export function useTreeTailActions(getTreeElement: () => HTMLElement | null, getOverflowTitle: () => string | undefined) {
  const translate = getCurrentInstance()?.appContext.config.globalProperties.$t as
    | ((key: string) => string)
    | undefined
  /** 换算成格数再存：多放得下一格时才重渲染行，拖动侧栏不会逐像素刷新。 */
  const treeSlots = ref(1)

  function syncTailSlots(): void {
    treeSlots.value = Math.floor(((getTreeElement()?.clientWidth ?? 0) - ROW_RESERVED_WIDTH) / TAIL_SLOT)
  }

  function resolveTailParts(entry: { key: OcNodeKey, level: number, item: OcNode }): readonly OcNodeTailPart[] {
    const parts = normalizeNodeTail(entry.item.tail)
    const pinned = parts.filter(part => isNodeTailAction(part) && part.alwaysVisible).length
    const budget = treeSlots.value - Math.ceil(entry.level * INDENT_STEP / TAIL_SLOT) - pinned
    const { visible, overflow } = foldActionBar(parts, budgetKeep(parts, Math.max(1, budget)))
    if (overflow.length === 0) return parts
    return [...visible, {
      key: `__oc-tree-action-overflow__:${entry.key}`,
      icon: 'mdiDotsHorizontal',
      title: getOverflowTitle() ?? translate?.('app.menu.moreActions') ?? 'More actions',
      children: overflow,
    }]
  }

  return { syncTailSlots, resolveTailParts }
}
