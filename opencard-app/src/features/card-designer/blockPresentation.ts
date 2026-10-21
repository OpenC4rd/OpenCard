import type { CardBlock } from '../../entities/card/model'
import type { IconToken, IconTone } from '../../shared/ui/icon/iconRegistry'

export type BlockPresentation = {
  icon: IconToken
  iconTone: IconTone
}

const blockPresentations = {
  'text-block': { icon: 'mdiTextBoxOutline', iconTone: 'block-text' },
  'markdown-text-block': { icon: 'mdiLanguageMarkdownOutline', iconTone: 'block-markdown' },
  'image-block': { icon: 'mdiImageOutline', iconTone: 'block-image' },
  'qrcode-block': { icon: 'mdiQrcode', iconTone: 'block-qrcode' },
  'shape-block': { icon: 'mdiShapeOutline', iconTone: 'block-shape' },
  'simple-container-block': { icon: 'mdiViewGridOutline', iconTone: 'block-simple-container' },
  'flow-container-block': { icon: 'mdiViewSequentialOutline', iconTone: 'block-flow-container' },
  'custom-block': { icon: 'mdiToyBrickOutline', iconTone: 'block-simple-container' },
} as const satisfies Record<CardBlock['type'], BlockPresentation>

export function getBlockPresentation(type: CardBlock['type'] | string): BlockPresentation {
  return blockPresentations[type as CardBlock['type']] ?? {
    icon: 'mdiPackageVariantClosed',
    iconTone: 'muted',
  }
}
