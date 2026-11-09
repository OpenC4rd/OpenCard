/**
 * 模块说明：
 * - 一个图标在它的文件里占哪一块、自己有多大
 * 职责边界：
 * - 纯几何：界面的图标样式与画布绘制都从这里取，不读文件、不关心图标从哪来
 *
 * 图标不等于它的文件：它可以只是文件的一块（裁切），多个图标可以共用一个文件。
 * 凡是要画图标、量图标的地方都经过这里，才不会有哪条路径把整张文件当成图标。
 */

/** A rectangle of a file, in the file's own pixels. */
export type IconCrop = { x: number, y: number, w: number, h: number }
export type IconSize = { width: number, height: number }

/** The part of an icon's file that an icon carries: its crop, or nothing, which means the whole file. */
export type IconShape = { crop?: IconCrop }

/** The icon's own size: its crop's, else the file's. Undefined while an uncropped file is unmeasured. */
export function iconSize(icon: IconShape, file: IconSize | undefined): IconSize | undefined {
  return icon.crop ? { width: icon.crop.w, height: icon.crop.h } : file
}

/** Where to sample the file to get exactly the icon, in file pixels. */
export function iconSourceRect(icon: IconShape, file: IconSize): IconCrop {
  return icon.crop ?? { x: 0, y: 0, w: file.width, h: file.height }
}
