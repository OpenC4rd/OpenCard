import type {
  CardBlock,
  CardDocument,
  FlowContainerBlock,
  ImageBlock,
  QrCodeBlock,
  ShapeBlock,
  SimpleContainerBlock,
  TextBlock,
} from '../../../entities/card/model'
import { parseRenderDocument } from '../renderParser'
import type {
  RenderReadyCardBlock,
  RenderReadyFlowContainerBlock,
  RenderReadyImageBlock,
  RenderReadyQrCodeBlock,
  RenderReadyShapeBlock,
  RenderReadySimpleContainerBlock,
  RenderReadyTextBlock,
} from '../render.types'
export function parseRenderReadyBlockForTest(block: TextBlock): RenderReadyTextBlock
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
