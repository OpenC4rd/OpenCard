import type {
  CardBlock,
  CardDocument,
  FlowContainerBlock,
  ImageBlock,
  MarkdownTextBlock,
  QrCodeBlock,
  ShapeBlock,
  SimpleContainerBlock,
  TextBlock,
} from '../../../entities/card/model'
import { computed } from 'vue'
import { cardEditorContextKey } from './cardEditorContext'
import { parseRenderDocument } from '../renderParser'
import type {
  RenderReadyCardBlock,
  RenderReadyFlowContainerBlock,
  RenderReadyImageBlock,
  RenderReadyMarkdownTextBlock,
  RenderReadyQrCodeBlock,
  RenderReadyShapeBlock,
  RenderReadySimpleContainerBlock,
  RenderReadyTextBlock,
} from '../render.types'
import { parseRichTextHtml } from '../../../shared/rich-text/richTextHtml'
import type { PreparedRichTextCatalog } from '../prepareRichText'
import { EMPTY_PROJECT_ICON_CATALOG, type ProjectIconCatalog } from '../../workspace/services/projectIconCatalog'
import type { CardResourceResolver } from '../cardRenderResources'

export function createRendererTestResources(projectIconCatalog: ProjectIconCatalog = EMPTY_PROJECT_ICON_CATALOG): CardResourceResolver {
  const resolver: CardResourceResolver = {
    resolve: request => {
      if (!request.value.trim()) return { kind: 'empty' }
      if (request.expect === 'font') return { kind: 'font', cssFamily: request.value }
      if (!request.value.includes('icon:')) return { kind: 'url', src: `asset://${request.value}` }
      const [, path] = request.value.split(':', 2)
      const [seriesKey, iconKey] = path?.split('/') ?? []
      const entry = projectIconCatalog.entries.find(candidate => (
        candidate.seriesKey.toLowerCase() === seriesKey?.toLowerCase()
        && candidate.iconKey.toLowerCase() === iconKey?.toLowerCase()
      ))
      return entry ? { kind: 'icon', entry } : { kind: 'unavailable', code: 'resource-unavailable', message: 'Referenced icon is unavailable' }
    },
    resolveIconDimensions: () => undefined,
    withScopes: () => resolver,
  }
  return resolver
}

export const rendererTestGlobal = {
  provide: {
    [cardEditorContextKey as symbol]: {
      transformDisabledBlockIds: computed(() => new Set<string>()),
      handleBlockClick: () => undefined,
      resources: createRendererTestResources(),
    },
  },
}

export function richTextRendererTestGlobal(block: RenderReadyTextBlock, projectIconCatalog?: unknown) {
  const parsed = parseRichTextHtml(block.content)
  const prepared: PreparedRichTextCatalog = new Map([[block.id, {
    document: parsed.document,
    embeddedBlocks: new Map(),
    diagnostics: [],
    valid: parsed.canEnterVisualMode,
  }]])
  return {
    provide: {
      [cardEditorContextKey as symbol]: {
        transformDisabledBlockIds: computed(() => new Set<string>()),
        handleBlockClick: () => undefined,
        resources: createRendererTestResources(
          (projectIconCatalog as ProjectIconCatalog | undefined) ?? EMPTY_PROJECT_ICON_CATALOG,
        ),
        richText: computed(() => prepared),
      },
    },
  }
}

export function parseRenderReadyBlockForTest(block: TextBlock): RenderReadyTextBlock
export function parseRenderReadyBlockForTest(block: MarkdownTextBlock): RenderReadyMarkdownTextBlock
export function parseRenderReadyBlockForTest(block: ImageBlock): RenderReadyImageBlock
export function parseRenderReadyBlockForTest(block: QrCodeBlock): RenderReadyQrCodeBlock
export function parseRenderReadyBlockForTest(block: ShapeBlock): RenderReadyShapeBlock
export function parseRenderReadyBlockForTest(block: SimpleContainerBlock): RenderReadySimpleContainerBlock
export function parseRenderReadyBlockForTest(block: FlowContainerBlock): RenderReadyFlowContainerBlock
export function parseRenderReadyBlockForTest(block: CardBlock): RenderReadyCardBlock {
  const document: CardDocument = {
    type: 'card-document',
    id: 'render-test-document',
    name: 'Render test',
    version: '1.0.0',
    width: '540',
    height: '850',
    instances: [],
    faces: {
      front: {
        type: 'card-face', id: 'render-test-front', background: '#ffffff',
        children: [{
          block,
          location: {
            id: `location-${block.id}`,
            type: 'simple-container-location',
            anchor: 'lt',
            x: '0px',
            y: '0px',
          },
        }],
      },
      back: { type: 'card-face', id: 'render-test-back', background: '#ffffff', children: [] },
    },
  }

  const parsed = parseRenderDocument(document).document.faces.front.children[0]!.block
  if (parsed.type !== block.type) throw new Error(`Unexpected parsed block type: ${parsed.type}`)
  return parsed
}
