import type { AnchorPosition } from '../../../entities/card/model'

/** 九宫格锚点的水平/纵向比例：0 = 起点边，0.5 = 居中，1 = 终点边。 */
export function anchorFractions(anchor: AnchorPosition): { fx: number; fy: number } {
  const h = anchor[0]
  const v = anchor[1]
  return { fx: h === 'l' ? 0 : h === 'r' ? 1 : 0.5, fy: v === 't' ? 0 : v === 'b' ? 1 : 0.5 }
}

/** 位置偏移 → 父容器局部坐标：靠终点边的锚点，偏移向内（反方向）累加。 */
export function offsetToPosition(fraction: number, offset: number, size: number, parentSpan: number): number {
  if (fraction === 0) return offset
  if (fraction === 1) return parentSpan - size - offset
  return (parentSpan - size) / 2 + offset
}

/** `offsetToPosition` 的逆运算。 */
export function positionToOffset(fraction: number, position: number, size: number, parentSpan: number): number {
  if (fraction === 0) return position
  if (fraction === 1) return parentSpan - size - position
  return position - (parentSpan - size) / 2
}
