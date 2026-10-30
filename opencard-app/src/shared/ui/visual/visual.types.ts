/**
 * 一个视觉槽位只描述一种呈现：语义图标、调用方给定的内联样式，或已解析的图片源。
 * 三者互斥，所以渲染方不需要在它们之间排优先级。
 */
import type { IconToken, IconTone } from '../icon/iconRegistry'

/** 语义图标；图标对读屏是装饰性的，名称由相邻文字承担。 */
type OcIconVisual = {
  type: 'icon'
  icon: IconToken
  iconTone?: IconTone
}

/** 调用方给定的呈现，例如项目图标的精灵图裁剪样式。 */
type OcStyledVisual = {
  type: 'style'
  style: Readonly<Record<string, string>>
  /** 无障碍名称；缺省时由宿主元素回退到条目自身名称。 */
  label?: string
}

/** 已解析的图片源。 */
type OcImageVisual = {
  type: 'image'
  src: string
  /** 无障碍名称；缺省时由宿主元素回退到条目自身名称。 */
  label?: string
}

export type OcVisual = OcIconVisual | OcStyledVisual | OcImageVisual


