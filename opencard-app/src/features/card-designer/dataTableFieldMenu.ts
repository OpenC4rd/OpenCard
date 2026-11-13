/** 数据表“添加属性”菜单：按分类收进二级菜单，或一次性全部展开。 */
import { propertyEditorCategoryDefinitions } from '../../entities/card/schema'
import type { OcActionDefinition } from '../../shared/ui/action/action.types'
import type { PropertyEditorFieldDefinition } from '../../shared/ui/property-editor/propertyEditor.types'
import { getPropertyFieldIcon } from '../../shared/ui/property-editor/propertyFieldRegistry'

type CategoryKey = keyof typeof propertyEditorCategoryDefinitions
type MenuField = { key: string, title: string, definition: PropertyEditorFieldDefinition }

export function dataTableFieldMenuActions(
  fields: readonly MenuField[],
  mode: 'category' | 'expanded' | undefined,
  keyPrefix: string,
  categoryTitle: (key: CategoryKey) => string,
): OcActionDefinition[] {
  const toAction = (field: MenuField): OcActionDefinition => ({
    key: `${keyPrefix}${field.key}`,
    icon: getPropertyFieldIcon(field.definition),
    title: field.title,
  })
  if (mode === 'expanded') return fields.map(toAction)

  const groups = new Map<string, MenuField[]>()
  for (const field of fields) {
    const category = field.definition.category
    const key = category && category in propertyEditorCategoryDefinitions ? category : 'uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), field])
  }
  return (Object.keys(propertyEditorCategoryDefinitions) as CategoryKey[])
    .filter(key => groups.has(key))
    .map(key => ({
      key: `field-category:${key}`,
      icon: propertyEditorCategoryDefinitions[key].icon,
      title: categoryTitle(key),
      children: groups.get(key)!.map(toAction),
    }))
}
