/** 设置页卡片与行的视图模型构件：卡片、动作、可编辑行与只读用量行。 */
import type { OcActionDefinition } from '../../../shared/ui/action/action.types'
import type { IconToken } from '../../../shared/ui/icon/iconRegistry'
import { formatCacheUsage } from '../../../shared/storage/appCache'
import type {
  EditorItem,
  EditorItemEditorPart,
  PropertyEditorFieldDefinition,
} from '../../../shared/ui/property-editor/propertyEditor.types'

export interface SettingsCardViewModel {
  key: string
  title: string
  icon?: IconToken
  /** 作用于这张 card 整组的操作，例如主题预设的复制、读取与重置。 */
  actions: OcActionDefinition[]
  items: readonly EditorItem[]
}

export function editorPart(
  key: string,
  definition: PropertyEditorFieldDefinition,
  value: unknown,
): EditorItemEditorPart {
  return { type: 'editor', key, definition, value }
}

/** 标题保持简短，解释放在 subtitle 里；没有说明就不带这个字段。 */
export function fieldItem(
  key: string,
  definition: PropertyEditorFieldDefinition,
  value: unknown,
  subtitle = '',
): EditorItem {
  return {
    key,
    title: definition.title,
    subtitle: subtitle || undefined,
    content: [editorPart('value', definition, value)],
  }
}

/** 只读用量行：用量条 + 文字，不参与编辑。 */
export function meterItem(
  key: string,
  title: string,
  subtitle: string,
  value: number,
  max: number | null,
): EditorItem {
  return {
    key,
    title,
    subtitle: subtitle || undefined,
    content: [{ type: 'meter', key: 'meter', value, max, text: formatCacheUsage(value, max ?? undefined) }],
  }
}

export function cardAction(
  key: string,
  title: string,
  icon: IconToken,
  disabled = false,
): OcActionDefinition {
  return { key, title, icon, disabled }
}

export function card(
  key: string,
  title: string,
  items: readonly EditorItem[],
  options: { icon?: IconToken; actions?: readonly OcActionDefinition[] } = {},
): SettingsCardViewModel {
  return { key, title, icon: options.icon, actions: [...(options.actions ?? [])], items }
}
