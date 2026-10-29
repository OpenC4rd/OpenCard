import type { CardDocument, CardInstanceRecord } from '../../entities/card/model'
import { cardIssueMessageKey, type CardPipelineIssue } from '../card-rendering/cardPipelineIssue'
import type { RenderPipelineResult } from '../card-rendering/renderPipeline'
import type { EditorIssue, EditorIssueSnapshot } from '../editor-runtime/model/editorIssue'
import type { CardDesignerNavigationToken } from './cardDesignerNavigation'

type Translate = (key: string, parameters?: Readonly<Record<string, string | number>>) => string
type ResolveFieldLabel = (fieldKey: string) => string

const valueKindMessageKeys: Readonly<Record<string, string>> = {
  string: 'app.problems.valueKinds.string',
  number: 'app.problems.valueKinds.number',
  boolean: 'app.problems.valueKinds.boolean',
  object: 'app.problems.valueKinds.object',
  array: 'app.problems.valueKinds.array',
  undefined: 'app.problems.valueKinds.undefined',
  'interpolated-string': 'app.problems.valueKinds.interpolatedString',
}

export const CARD_DESIGNER_BLUEPRINT_SCOPE_KEY = 'card:blueprint'

export function createCardInstanceScopeKey(instanceId: string): string {
  return `card:instance:${instanceId}`
}

export function createCardIssueScopeOrder(document: CardDocument): readonly string[] {
  return [
    CARD_DESIGNER_BLUEPRINT_SCOPE_KEY,
    ...(document.instances ?? []).map((instance) => createCardInstanceScopeKey(instance.id)),
  ]
}

function createNavigationToken(issue: CardPipelineIssue): CardDesignerNavigationToken | undefined {
  if (
    (issue.location.owner.kind === 'block' || issue.location.owner.kind === 'location')
    && !issue.location.blockId
  ) {
    return undefined
  }
  const instanceId = issue.location.owner.kind === 'document'
    ? null
    : issue.location.instanceId
  return {
    protocol: 'card-designer',
    version: 2,
    target: {
      kind: 'property',
      instanceId,
      faceKey: issue.location.faceKey,
      ...(issue.location.blockId ? { blockId: issue.location.blockId } : {}),
      owner: issue.location.owner.kind,
      fieldKey: issue.location.fieldKey,
      ...(issue.location.characterOffset !== undefined
        ? { characterOffset: issue.location.characterOffset }
        : {}),
    },
  }
}

function resolveCardLabel(
  instance: CardInstanceRecord | null,
  faceKey: CardPipelineIssue['location']['faceKey'],
  translate: Translate,
): string {
  const card = !instance
    ? translate('app.problems.locations.blueprint')
    : translate('app.problems.locations.instance', {
        instanceName: instance.name?.trim() || instance.id,
      })
  if (!faceKey) return card
  return translate('app.problems.locations.cardFace', {
    card,
    face: translate(`app.problems.locations.${faceKey}Face`),
  })
}

function abbreviateId(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function resolveValueKind(value: unknown, translate: Translate): string {
  if (typeof value !== 'string') return ''
  const messageKey = valueKindMessageKeys[value]
  return messageKey ? translate(messageKey) : value
}

function createDescriptionParameters(
  issue: CardPipelineIssue,
  translate: Translate,
  resolveFieldLabel: ResolveFieldLabel,
): Readonly<Record<string, string | number>> {
  const parameters: Record<string, string | number> = { ...issue.parameters }
  const referencedFieldKey = typeof issue.parameters?.referencedFieldKey === 'string'
    ? issue.parameters.referencedFieldKey
    : issue.location.fieldKey
  const displayFieldKey = typeof issue.parameters?.fieldName === 'string'
    ? issue.parameters.fieldName
    : referencedFieldKey

  parameters.fieldName = resolveFieldLabel(displayFieldKey)
  parameters.fieldKey = referencedFieldKey
  parameters.token = issue.token ?? ''
  parameters.sourceTypeName = resolveValueKind(issue.parameters?.sourceType, translate)
  parameters.targetTypeName = resolveValueKind(issue.parameters?.targetType, translate)
  return parameters
}

function createLocationText(
  issue: CardPipelineIssue,
  cardLabel: string,
  translate: Translate,
  resolveFieldLabel: ResolveFieldLabel,
): string {
  const displayFieldKey = typeof issue.parameters?.fieldName === 'string'
    ? issue.parameters.fieldName
    : issue.location.fieldKey
  const parameters = {
    card: cardLabel,
    blockPath: issue.location.blockPath || translate('app.problems.locations.unnamedBlock'),
    blockId: abbreviateId(issue.location.blockId || issue.location.owner.id),
    fieldName: resolveFieldLabel(displayFieldKey),
    fieldKey: issue.location.fieldKey,
    ...(issue.location.characterOffset !== undefined
      ? { character: issue.location.characterOffset + 1 }
      : {}),
  }
  const isBlockField = issue.location.owner.kind === 'block'
    || issue.location.owner.kind === 'location'
  const hasCharacter = issue.location.characterOffset !== undefined
  const messageKey = isBlockField
    ? hasCharacter
      ? 'app.problems.locations.blockFieldAtCharacter'
      : 'app.problems.locations.blockField'
    : hasCharacter
      ? 'app.problems.locations.fieldAtCharacter'
      : 'app.problems.locations.field'

  return translate(messageKey, parameters)
}

export function createCardDesignerIssues(
  result: RenderPipelineResult | null,
  instance: CardInstanceRecord | null,
  translate: Translate,
  resolveFieldLabel: ResolveFieldLabel,
): readonly EditorIssue[] {
  if (!result) return []
  function convert(issue: CardPipelineIssue): EditorIssue {
    const cardLabel = resolveCardLabel(instance, issue.location.faceKey, translate)
    const navigationToken = createNavigationToken(issue)
    return {
      id: issue.id,
      type: issue.type,
      severity: issue.severity,
      locationText: createLocationText(issue, cardLabel, translate, resolveFieldLabel),
      description: translate(
        cardIssueMessageKey(issue.type),
        createDescriptionParameters(issue, translate, resolveFieldLabel),
      ),
      ...(navigationToken ? { navigationToken } : {}),
      ...(issue.details ? { details: issue.details } : {}),
      ...(issue.children?.length
        ? { children: issue.children.map(convert) }
        : {}),
    }
  }
  return result.issues.map(convert)
}

export function createCardDesignerIssueSnapshot(options: {
  document: CardDocument | null
  instance: CardInstanceRecord | null
  result: RenderPipelineResult | null
  translate: Translate
  resolveFieldLabel: ResolveFieldLabel
}): EditorIssueSnapshot {
  const scopeKey = options.instance
    ? createCardInstanceScopeKey(options.instance.id)
    : CARD_DESIGNER_BLUEPRINT_SCOPE_KEY
  return {
    scopeKey,
    scopeOrder: options.document ? createCardIssueScopeOrder(options.document) : [],
    issues: [
      ...createCardDesignerIssues(
        options.result,
        options.instance,
        options.translate,
        options.resolveFieldLabel,
      ),
    ],
  }
}
