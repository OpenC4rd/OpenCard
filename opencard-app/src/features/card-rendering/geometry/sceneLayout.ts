import type { AnchorPosition } from '../../../entities/card/model'
import type {
  RenderReadyCardBlock,
  RenderReadyCardFace,
  RenderReadyFlowContainerBlock,
  RenderReadySimpleContainerBlock,
} from '../render.types'
import { anchorFractions, offsetToPosition } from './anchor'
import { evaluateRenderLength } from './lengthMath'
import {
  invertMatrix,
  multiplyMatrix,
  rotationMatrix,
  scaleMatrix,
  transformPoint,
  translationMatrix,
  identityMatrix,
  type Matrix2D,
  type Point2D,
  type Rect2D,
} from './matrix2d'

export type SceneNodeLayout = {
  id: string
  block: RenderReadyCardBlock
  parentId: string | null
  localRect: Rect2D
  localMatrix: Matrix2D
  worldMatrix: Matrix2D
  inverseWorldMatrix: Matrix2D
  parentWorldMatrix: Matrix2D
  inverseParentWorldMatrix: Matrix2D
  obbCorners: readonly [Point2D, Point2D, Point2D, Point2D] // lt, rt, rb, lb
  worldAabb: Rect2D
  clip: boolean
  zIndex: number
  visible: boolean
  children: readonly SceneNodeLayout[]
}

export type CardSceneGraph = {
  face: RenderReadyCardFace
  width: number
  height: number
  rootNodes: readonly SceneNodeLayout[]
  nodeMap: ReadonlyMap<string, SceneNodeLayout>
  paintOrderNodes: readonly SceneNodeLayout[]
}

type Size = { width: number; height: number }
type Placed = { block: RenderReadyCardBlock; rect: Rect2D }
type ParentFrame = { id: string | null; world: Matrix2D; visible: boolean; size: Size }

/** 节点所在父容器的内容尺寸；缩放手柄需要它把局部位置换回锚点偏移。 */
const parentSizeByNode = new WeakMap<SceneNodeLayout, Size>()

export function getParentSize(node: SceneNodeLayout): Size {
  return parentSizeByNode.get(node) ?? { width: 0, height: 0 }
}

/**
 * 块局部矩阵（父容器局部坐标系）：
 * `T(rect + translate) · T(origin) · R · S · T(-origin)`，origin 由 transformAnchor 在 rect 尺寸内取得。
 */
export function composeBlockLocalMatrix(
  rect: Rect2D,
  anchor: AnchorPosition,
  translateX: number,
  translateY: number,
  rotationDeg: number,
  scaleX: number,
  scaleY: number,
): Matrix2D {
  const { fx, fy } = anchorFractions(anchor)
  const ox = rect.width * fx
  const oy = rect.height * fy
  let m = translationMatrix(rect.x + translateX, rect.y + translateY)
  m = multiplyMatrix(m, translationMatrix(ox, oy))
  m = multiplyMatrix(m, rotationMatrix(rotationDeg))
  m = multiplyMatrix(m, scaleMatrix(scaleX, scaleY))
  return multiplyMatrix(m, translationMatrix(-ox, -oy))
}

export function resolveBlockTranslation(block: RenderReadyCardBlock, width: number, height: number): Point2D {
  return {
    x: evaluateRenderLength(block.translateX, width),
    y: evaluateRenderLength(block.translateY, height),
  }
}

function resolveBlockSize(block: RenderReadyCardBlock, parent: Size): Size {
  return {
    width: evaluateRenderLength(block.width, parent.width),
    height: evaluateRenderLength(block.height, parent.height),
  }
}

function placeSimpleChildren(container: RenderReadySimpleContainerBlock | RenderReadyCardFace, parent: Size): Placed[] {
  return container.children.map(({ block, location }) => {
    const size = resolveBlockSize(block, parent)
    const { fx, fy } = anchorFractions(location.anchor)
    const ox = evaluateRenderLength(location.x, parent.width)
    const oy = evaluateRenderLength(location.y, parent.height)
    return {
      block,
      rect: {
        x: offsetToPosition(fx, ox, size.width, parent.width),
        y: offsetToPosition(fy, oy, size.height, parent.height),
        ...size,
      },
    }
  })
}

function placeFlowChildren(container: RenderReadyFlowContainerBlock, parent: Size): Placed[] {
  const vertical = container.direction === 'tb' || container.direction === 'bt'
  const reversed = container.direction === 'rl' || container.direction === 'bt'
  const mainSpan = vertical ? parent.height : parent.width
  const crossSpan = vertical ? parent.width : parent.height
  const gap = evaluateRenderLength(container.gap, mainSpan)
  const ordered = container.children
    .map((child, order) => ({ child, order }))
    .sort((a, b) => a.child.location.index - b.child.location.index || a.order - b.order)

  let cursor = reversed ? mainSpan : 0
  return ordered.map(({ child: { block, location } }) => {
    const size = resolveBlockSize(block, parent)
    if (!block.visible) return { block, rect: { x: 0, y: 0, ...size } }
    const stretch = location.align === 'justify'
    const main = vertical ? size.height : size.width
    const cross = stretch ? crossSpan : vertical ? size.width : size.height
    const mainPos = reversed ? cursor - main : cursor
    cursor = reversed ? mainPos - gap : cursor + main + gap
    const crossPos =
      location.align === 'center' ? (crossSpan - cross) / 2 : location.align === 'end' ? crossSpan - cross : 0
    return {
      block,
      rect: vertical
        ? { x: crossPos, y: mainPos, width: cross, height: size.height }
        : { x: mainPos, y: crossPos, width: size.width, height: cross },
    }
  })
}

function placeChildren(block: RenderReadyCardBlock, size: Size): Placed[] {
  if (block.type === 'simple-container-block') return placeSimpleChildren(block, size)
  if (block.type === 'flow-container-block') return placeFlowChildren(block, size)
  if (block.type === 'custom-block') {
    const content = block.content
    const contentSize = resolveBlockSize(content, size)
    return [{ block: content, rect: { x: 0, y: 0, ...contentSize } }]
  }
  return []
}

function buildNode(
  { block, rect }: Placed,
  parent: ParentFrame,
  nodeMap: Map<string, SceneNodeLayout>,
): SceneNodeLayout {
  const translation = resolveBlockTranslation(block, rect.width, rect.height)
  const localMatrix = composeBlockLocalMatrix(
    rect,
    block.transformAnchor,
    translation.x,
    translation.y,
    block.rotation,
    block.scaleX,
    block.scaleY,
  )
  const worldMatrix = multiplyMatrix(parent.world, localMatrix)
  const visible = parent.visible && block.visible
  const size = { width: rect.width, height: rect.height }
  const frame: ParentFrame = { id: block.id, world: worldMatrix, visible, size }
  const children = placeChildren(block, size).map((placed) => buildNode(placed, frame, nodeMap))

  const corners = [
    transformPoint(worldMatrix, { x: 0, y: 0 }),
    transformPoint(worldMatrix, { x: size.width, y: 0 }),
    transformPoint(worldMatrix, { x: size.width, y: size.height }),
    transformPoint(worldMatrix, { x: 0, y: size.height }),
  ] as const
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)

  const node: SceneNodeLayout = {
    id: block.id,
    block,
    parentId: parent.id,
    localRect: rect,
    localMatrix,
    worldMatrix,
    inverseWorldMatrix: invertMatrix(worldMatrix),
    parentWorldMatrix: parent.world,
    inverseParentWorldMatrix: invertMatrix(parent.world),
    obbCorners: corners,
    worldAabb: { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
    clip: 'clip' in block && block.clip === true,
    zIndex: block.zIndex,
    visible,
    children,
  }
  parentSizeByNode.set(node, parent.size)
  nodeMap.set(node.id, node)
  return node
}

/** 先序展开：父先于子；同级按 zIndex 升序（相等保持布局顺序），仅含可见节点。 */
function collectPaintOrder(nodes: readonly SceneNodeLayout[], out: SceneNodeLayout[]) {
  const sorted = nodes.map((node, order) => ({ node, order })).sort((a, b) => a.node.zIndex - b.node.zIndex || a.order - b.order)
  for (const { node } of sorted) {
    if (!node.visible) continue
    out.push(node)
    collectPaintOrder(node.children, out)
  }
}

export function computeSceneLayout(face: RenderReadyCardFace): CardSceneGraph {
  const size = { width: face.width, height: face.height }
  const nodeMap = new Map<string, SceneNodeLayout>()
  const root: ParentFrame = { id: null, world: identityMatrix(), visible: true, size }
  const rootNodes = placeSimpleChildren(face, size).map((placed) => buildNode(placed, root, nodeMap))
  const paintOrderNodes: SceneNodeLayout[] = []
  collectPaintOrder(rootNodes, paintOrderNodes)
  return { face, width: face.width, height: face.height, rootNodes, nodeMap, paintOrderNodes }
}
