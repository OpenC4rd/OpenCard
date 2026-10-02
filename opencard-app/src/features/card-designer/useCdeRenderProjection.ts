/**
 * Projects the current raw Card document through the single render pipeline.
 * Diagnostics, selection, UI information, and viewport geometry stay with the caller.
 */
import { computed, type Ref } from 'vue'
import type {
  CardDocument,
  CardFaceKey,
  CardInstanceRecord,
} from '../../entities/card/model'
import type {
  RenderReadyCardBlock,
  RenderReadyCardDocument,
  RenderReadyCardFace,
} from '../card-rendering/render.types'
import {
  prepareCardRender,
  type CardRenderEnvironment,
  type PreparedCardRender,
} from '../card-rendering/renderPipeline'

type UseCdeRenderProjectionOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  documentRevision: Readonly<Ref<number>>
  instance: Readonly<Ref<CardInstanceRecord | null>>
  activeFaceKey: Readonly<Ref<CardFaceKey>>
  resourceRootPath: Readonly<Ref<string | null>>
  sourceFilePath: Readonly<Ref<string | null>>
  renderEnvironment: Readonly<Ref<Readonly<CardRenderEnvironment>>>
}

export function useCdeRenderProjection(options: UseCdeRenderProjectionOptions) {
  const preparedRender = computed<PreparedCardRender | null>(() => {
    options.documentRevision.value
    const document = options.cardDoc.value
    if (!document) return null
    return prepareCardRender({
      document,
      instance: options.instance.value,
      resourceRootPath: options.resourceRootPath.value,
      sourceFilePath: options.sourceFilePath.value,
      environment: options.renderEnvironment.value,
    })
  })
  const viewDocument = computed<RenderReadyCardDocument | null>(() => (
    preparedRender.value?.document ?? null
  ))
  const viewFace = computed<RenderReadyCardFace | null>(() => (
    viewDocument.value?.faces[options.activeFaceKey.value] ?? null
  ))
  const renderResources = computed(() => preparedRender.value?.resources ?? null)

  function findViewBlock(blockId: string): RenderReadyCardBlock | null {
    const face = viewFace.value
    return face ? findBlock(face.children.map(child => child.block), blockId) : null
  }

  return {
    findViewBlock,
    renderPipelineResult: preparedRender,
    renderResources,
    viewDocument,
    viewFace,
  }
}

function findBlock(
  blocks: readonly RenderReadyCardBlock[],
  blockId: string,
): RenderReadyCardBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block
    if (block.type === 'custom-block') {
      const descendant = findBlock([block.content], blockId)
      if (descendant) return descendant
    }
    if (block.type === 'simple-container-block' || block.type === 'flow-container-block') {
      const descendant = findBlock(block.children.map(child => child.block), blockId)
      if (descendant) return descendant
    }
  }
  return null
}
