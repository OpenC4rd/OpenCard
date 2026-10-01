import type { ComputedRef } from 'vue'
import type { ShellListGroup } from './shell.types'
import type { ShellFlowKey, ShellLocation, SpaceKey } from './shellLocation'

/** 六类功能各自产生描述符；此处只选择当前功能，不接收它们的领域状态。 */
export function resolveShellSection(
  location: ShellLocation,
  spaces: Record<SpaceKey, ComputedRef<ShellListGroup[]>>,
  flows: Record<ShellFlowKey, ComputedRef<ShellListGroup[]>>,
): ShellListGroup[] {
  return location.flow ? flows[location.flow.type].value : spaces[location.base.space].value
}

/** 仅保留树公开的重命名能力，避免侧栏投影持有整个组件实例。 */
export function captureBeginRename(instance: unknown): { beginRename: (key: string) => Promise<void> } | null {
  const tree = instance as { beginRename?: (key: string) => Promise<void> } | null
  return typeof tree?.beginRename === 'function' ? { beginRename: tree.beginRename.bind(tree) } : null
}
