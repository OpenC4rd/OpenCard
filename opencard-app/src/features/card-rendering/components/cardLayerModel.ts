import type { RenderReadyCardBlock, RenderReadyCardFace } from '../render.types'

type CardLayerBlock = {
  id: string
  zIndex: number
  block: RenderReadyCardBlock
}

export type CardLayerGroup = {
  zIndex: number
  blocks: CardLayerBlock[]
}

export function buildCardLayerGroups(
  face: RenderReadyCardFace,
  atomicBlockIds: ReadonlySet<string> = new Set(),
): CardLayerGroup[] {
  const blocks: CardLayerBlock[] = []

  function visit(block: RenderReadyCardBlock, ancestorsVisible: boolean): void {
    const visible = ancestorsVisible && (typeof block.visible !== 'boolean' || block.visible)
    if (!visible) return

    blocks.push({ id: block.id, zIndex: typeof block.zIndex === 'number' ? block.zIndex : 0, block })
    if (atomicBlockIds.has(block.id)) return
    if (block.type === 'simple-container-block' || block.type === 'flow-container-block') {
      block.children.forEach(child => visit(child.block, visible))
    }
  }

  face.children.forEach(child => visit(child.block, true))

  const groups = new Map<number, CardLayerBlock[]>()
  blocks.forEach((block) => {
    const group = groups.get(block.zIndex)
    if (group) group.push(block)
    else groups.set(block.zIndex, [block])
  })

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([zIndex, layerBlocks]) => ({
      zIndex,
      blocks: [...layerBlocks].reverse(),
    }))
}
