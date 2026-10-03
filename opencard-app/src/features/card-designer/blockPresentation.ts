import type { CardBlock } from '../../entities/card/model'
import type { IconToken, IconTone } from '../../shared/ui/icon/iconRegistry'

export type BlockPresentation = {
  icon: IconToken
  iconTone: IconTone
}

const blockPresentations = {
  'text-block': { icon: 'entity.block-text', iconTone: 'block-text' },
  'markdown-text-block': { icon: 'entity.block-markdown', iconTone: 'block-markdown' },
  'image-block': { icon: 'entity.block-image', iconTone: 'block-image' },
  'qrcode-block': { icon: 'entity.block-qrcode', iconTone: 'block-qrcode' },
  'shape-block': { icon: 'entity.block-shape', iconTone: 'block-shape' },
  'simple-container-block': { icon: 'entity.block-simple-container', iconTone: 'block-simple-container' },
  'flow-container-block': { icon: 'entity.block-flow-container', iconTone: 'block-flow-container' },
  'custom-block': { icon: 'entity.block-custom', iconTone: 'block-simple-container' },
} as const satisfies Record<CardBlock['type'], BlockPresentation>

export function getBlockPresentation(type: CardBlock['type'] | string): BlockPresentation {
  return blockPresentations[type as CardBlock['type']] ?? {
    icon: 'entity.block-package',
    iconTone: 'muted',
  }
}
