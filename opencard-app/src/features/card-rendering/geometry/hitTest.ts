import type { AnchorPosition } from '../../../entities/card/model'
import { anchorFractions, positionToOffset } from './anchor'
import { invertMatrix, transformPoint, transformVector, type Point2D } from './matrix2d'
import {
  getParentSize,
  resolveBlockTranslation,
  type CardSceneGraph,
  type SceneNodeLayout,
} from './sceneLayout'

export type ResizeHandleDirection = 'lt' | 'rt' | 'lb' | 'rb' | 'l' | 'r' | 't' | 'b'

function insideLocalBox(node: SceneNodeLayout, world: Point2D): boolean {
  const local = transformPoint(node.inverseWorldMatrix, world)
  const { width, height } = node.localRect
  return local.x >= 0 && local.y >= 0 && local.x <= width && local.y <= height
}

/** 返回世界坐标点命中的最上层可见块；任一 clip 祖先裁掉该点则视为未命中。 */
export function hitTestScene(scene: CardSceneGraph, worldPoint: Point2D): SceneNodeLayout | null {
  for (let index = scene.paintOrderNodes.length - 1; index >= 0; index -= 1) {
    const node = scene.paintOrderNodes[index]!
    if (!insideLocalBox(node, worldPoint)) continue
    let clipped = false
    for (let id = node.parentId; id !== null && !clipped; ) {
      const ancestor = scene.nodeMap.get(id)
      if (!ancestor) break
      clipped = ancestor.clip && !insideLocalBox(ancestor, worldPoint)
      id = ancestor.parentId
    }
    if (!clipped) return node
  }
  return null
}

/** 世界位移 → 该块在其定位锚点下的 (x, y) 偏移增量；靠终点边的锚点方向取反。 */
export function projectWorldDeltaToParentLocation(
  node: SceneNodeLayout,
  worldDelta: Point2D,
  locationAnchor: AnchorPosition = 'lt',
): { dx: number; dy: number } {
  const local = transformVector(node.inverseParentWorldMatrix, worldDelta)
  const { fx, fy } = anchorFractions(locationAnchor)
  return { dx: fx === 1 ? -local.x : local.x, dy: fy === 1 ? -local.y : local.y }
}

const HANDLE_AXES: Record<ResizeHandleDirection, { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }> = {
  lt: { hx: -1, hy: -1 },
  rt: { hx: 1, hy: -1 },
  lb: { hx: -1, hy: 1 },
  rb: { hx: 1, hy: 1 },
  l: { hx: -1, hy: 0 },
  r: { hx: 1, hy: 0 },
  t: { hx: 0, hy: -1 },
  b: { hx: 0, hy: 1 },
}

/**
 * 拖动缩放手柄后的新几何。与手柄相对的锚点（角或边中点）在世界坐标中保持静止，
 * 与块自身或祖先的旋转/缩放无关；返回的 x/y 是 `locationAnchor` 下的位置偏移。
 */
export function computeResizedBlockGeometry(
  node: SceneNodeLayout,
  handle: ResizeHandleDirection,
  worldPointer: Point2D,
  options: { minSize?: number; locationAnchor?: AnchorPosition } = {},
): { width: number; height: number; x: number; y: number } {
  const { minSize = 1, locationAnchor = 'lt' } = options
  const { hx, hy } = HANDLE_AXES[handle]
  const { width: w, height: h } = node.localRect
  const m = node.localMatrix

  // 固定点在旧块局部盒内的位置，及其在父局部坐标中的当前位置
  const fixedOld = { x: hx === 1 ? 0 : hx === -1 ? w : w / 2, y: hy === 1 ? 0 : hy === -1 ? h : h / 2 }
  const fixedParent = transformPoint(m, fixedOld)
  const pointer = transformPoint(node.inverseParentWorldMatrix, worldPointer)
  const linearInverse = invertMatrix([m[0], m[1], m[2], m[3], 0, 0])
  const delta = transformVector(linearInverse, { x: pointer.x - fixedParent.x, y: pointer.y - fixedParent.y })

  const width = hx === 0 ? w : Math.max(minSize, hx * delta.x)
  const height = hy === 0 ? h : Math.max(minSize, hy * delta.y)

  // 解出新 rect 位置，使新盒内的固定点仍落在 fixedParent
  const { block } = node
  const translation = resolveBlockTranslation(block, width, height)
  const { fx: ox, fy: oy } = anchorFractions(block.transformAnchor)
  const origin = { x: width * ox, y: height * oy }
  const fixedNew = { x: hx === 1 ? 0 : hx === -1 ? width : width / 2, y: hy === 1 ? 0 : hy === -1 ? height : height / 2 }
  const rel = { x: fixedNew.x - origin.x, y: fixedNew.y - origin.y }
  const rotated = transformVector(m, rel)
  const rectX = fixedParent.x - translation.x - origin.x - rotated.x
  const rectY = fixedParent.y - translation.y - origin.y - rotated.y

  const parent = getParentSize(node)
  const { fx, fy } = anchorFractions(locationAnchor)
  return {
    width,
    height,
    x: positionToOffset(fx, rectX, width, parent.width),
    y: positionToOffset(fy, rectY, height, parent.height),
  }
}
