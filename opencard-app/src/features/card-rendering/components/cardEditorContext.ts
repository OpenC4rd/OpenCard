import { inject, type ComputedRef, type InjectionKey } from 'vue'
import type { CardResourceResolver } from '../cardRenderResources'
import type { CardFaceKey } from '../../../entities/card/model'
import type { ProjectInformation } from '../../workspace/model/projectMetadata'
import type { PreparedRichTextCatalog } from '../prepareRichText'
import type { CardVisualReadinessRegistrar } from './cardRenderReadiness'

export interface CardEditorContext {
  transformDisabledBlockIds: ComputedRef<Set<string>>
  handleBlockClick: (blockId: string, event: MouseEvent) => void
  resources: CardResourceResolver
  richText?: ComputedRef<PreparedRichTextCatalog>
  visualReadiness?: CardVisualReadinessRegistrar
  documentId: string
  faceKey: CardFaceKey
  bindingProject?: ComputedRef<Readonly<ProjectInformation> | null | undefined>
  bindingDictionary?: ComputedRef<Readonly<Record<string, string>> | null | undefined>
}

export const cardEditorContextKey: InjectionKey<CardEditorContext> = Symbol('card-editor-context')

export function useCardEditorContext(): CardEditorContext {
  const context = inject(cardEditorContextKey)
  if (!context) throw new Error('Card renderer context is required')
  return context
}
