/**
 * 模块说明：
 * - 把选中的一个或多个图标投影成属性面板的一份输入，并把面板里的改动写回每个图标
 * 职责边界：
 * - 纯数据：不读文件、不持有状态；尺寸由调用方读出后传入
 */
import {
  isRasterProjectIconSource,
  PROJECT_ICON_TINTS,
  type ProjectIcon,
} from '../../features/workspace/model/projectIcons'
import { iconSize, iconSourceRect } from '../../shared/model/iconGeometry'
import type {
  PropertyEditorFieldDefinition,
  PropertyEditorInput,
} from '../../shared/ui/property-editor/propertyEditor.types'

type Translate = (key: string, params?: Record<string, unknown>) => string
type Size = { width: number, height: number }

export type ProjectIconKind = 'vector' | 'raster'

/** What the file lets an icon be: a vector is tinted; a bitmap keeps its pixels and may be cropped. */
export function projectIconKind(icon: ProjectIcon): ProjectIconKind {
  return isRasterProjectIconSource(icon.source) ? 'raster' : 'vector'
}

const CROP_FIELDS = { cropX: 'x', cropY: 'y', cropW: 'w', cropH: 'h' } as const

/**
 * One input for the whole selection, the way a rich-text selection over several runs shows one panel:
 * a field every selected icon shares shows its value, a field they disagree on shows "mixed", and an
 * edit is written to all of them. Fields that name one icon (its Key, its name, its crop) only appear
 * when one icon is selected, and fields that mean nothing for a kind (tint on a raster) are left out.
 */
export function createProjectIconPropertyInput(
  icons: readonly ProjectIcon[],
  options: { t: Translate, readSize: (icon: ProjectIcon) => Size | undefined },
): PropertyEditorInput | null {
  const { t } = options
  const first = icons[0]
  if (!first) return null
  const single = icons.length === 1 ? first : null
  const mixedLabel = t('propertyEditor.richText.mixed')
  const record: Record<string, unknown> = {}
  const fields: Record<string, PropertyEditorFieldDefinition> = {}
  const shared = (read: (icon: ProjectIcon) => string) => {
    const value = read(first)
    return icons.every(icon => read(icon) === value) ? value : null
  }
  /** A fact about the file: read-only, and "mixed" when the selection disagrees. */
  const fact = (key: string, title: string, order: number, read: (icon: ProjectIcon) => string) => {
    const value = shared(read)
    record[key] = value ?? mixedLabel
    fields[key] = { title, fieldType: 'string', category: 'file', order, isReadonly: true, valueState: value === null ? 'mixed' : 'value' }
  }

  if (single) {
    record.iconKey = single.iconKey
    record.name = single.name
    fields.iconKey = { title: t('projectConfig.icons.referenceName'), fieldType: 'string', category: 'identity', order: 1, unremovable: true, commitMode: 'blur' }
    fields.name = { title: t('projectConfig.icons.iconName'), fieldType: 'string', category: 'identity', order: 2, commitMode: 'blur' }
  }

  fact('kind', t('projectConfig.icons.kind'), 1, icon => t(`projectConfig.icons.kinds.${projectIconKind(icon)}`))
  fact('file', t('projectConfig.icons.file'), 2, icon => icon.source.slice(icon.source.lastIndexOf('/') + 1))
  fact('size', t('projectConfig.icons.size'), 3, (icon) => {
    const size = iconSize(icon, options.readSize(icon))
    return size ? `${size.width} × ${size.height}` : '…'
  })

  if (icons.every(icon => !isRasterProjectIconSource(icon.source))) {
    const tint = shared(icon => icon.tint)
    record.tint = tint ?? ''
    fields.tint = {
      title: t('projectConfig.icons.tint'), fieldType: 'string', category: 'appearance', order: 1,
      options: [...PROJECT_ICON_TINTS],
      optionLabels: { context: t('projectConfig.icons.tintContext'), original: t('projectConfig.icons.tintOriginal') },
      presentation: 'select',
      valueState: tint === null ? 'mixed' : 'value',
      ...(tint === null ? { placeholder: mixedLabel } : {}),
    }
  } else if (icons.every(icon => isRasterProjectIconSource(icon.source))) {
    const pixelated = shared(icon => String(icon.pixelated === true))
    record.pixelated = pixelated ?? 'false'
    fields.pixelated = {
      title: t('projectConfig.icons.pixelated'), fieldType: 'boolean', category: 'appearance', order: 2,
      valueState: pixelated === null ? 'mixed' : 'value',
    }
  }

  if (single && isRasterProjectIconSource(single.source)) {
    record.cropped = String(Boolean(single.crop))
    fields.cropped = { title: t('projectConfig.icons.cropEnabled'), fieldType: 'boolean', category: 'crop', order: 0 }
  }
  if (single?.crop) {
    for (const [order, [key, part]] of Object.entries(CROP_FIELDS).entries()) {
      // The panel's records carry text, as every field editor reads them; a number would show as empty.
      record[key] = String(single.crop[part])
      fields[key] = {
        title: t(`projectConfig.icons.crop.${part}`), fieldType: 'number', category: 'crop', order: order + 1,
        min: part === 'w' || part === 'h' ? 1 : 0, step: 1, suffix: 'px',
      }
    }
  }

  return {
    key: single ? `icon:${single.iconKey}` : 'icons',
    title: single ? single.name : t('projectConfig.icons.selectedIconsCount', { count: icons.length }),
    record,
    fields,
  }
}

/**
 * One edit from the panel applied to one icon; a value the field cannot hold leaves the icon unchanged.
 * Turning cropping on starts from the whole file, so it needs the file's size.
 */
export function applyProjectIconProperty(icon: ProjectIcon, fieldKey: string, value: unknown, file?: Size): ProjectIcon {
  if (fieldKey === 'cropped') {
    if (value !== true && value !== 'true') return icon.crop ? withoutCrop(icon) : icon
    return icon.crop || !file || !isRasterProjectIconSource(icon.source) ? icon : { ...icon, crop: iconSourceRect(icon, file) }
  }
  if (fieldKey === 'iconKey') return { ...icon, iconKey: String(value) }
  if (fieldKey === 'name') return { ...icon, name: String(value) }
  if (fieldKey === 'tint') return value === 'original' || value === 'context' ? { ...icon, tint: value } : icon
  if (fieldKey === 'pixelated') return { ...icon, pixelated: value === true || value === 'true' }
  if (fieldKey in CROP_FIELDS && icon.crop) {
    const part = CROP_FIELDS[fieldKey as keyof typeof CROP_FIELDS]
    const number = Number(value)
    const least = part === 'w' || part === 'h' ? 1 : 0
    return Number.isInteger(number) && number >= least ? { ...icon, crop: { ...icon.crop, [part]: number } } : icon
  }
  return icon
}

function withoutCrop(icon: ProjectIcon): ProjectIcon {
  const { crop: _crop, ...rest } = icon
  return rest
}
