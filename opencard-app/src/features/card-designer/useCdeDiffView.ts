/**
 * Owns the Card Designer comparison view: the projected comparison sides, their trees,
 * their property input pairs, the divider/view-mode state, and the diff selection.
 * Revealing a field in PropertyEditor, panel state, and the open document stay with the caller.
 *
 * Both compared sides are built by one side-parametrised projection, so a before/after pair is
 * never written twice and each side's block map is collected once per comparison change.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  getBlockProperty,
  type CardBlock,
  type CardDocument,
  type CardFaceKey,
  type CardInstanceRecord,
} from '../../entities/card/model'
import { isBlockContainer } from '../../entities/card/tree'
import { applyInstance } from '../../entities/card/instance'
import { compareOcdocuments } from '../version-control/ocdocumentDiff'
import {
  prepareCardRender,
  type CardRenderEnvironment,
  type PreparedCardRender,
} from '../card-rendering/renderPipeline'
import {
  type CardDiffHighlight,
  type CardViewportComparison,
  type CardViewportStatusFlash,
} from '../card-rendering/components/CardViewport.vue'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import { resolveCardPropertyFields } from '../card-properties/cardPropertyFieldDefinitions'
import type {
  EditorComparisonInput,
  EditorSnapshotContext,
} from '../editor-runtime/editorProtocol'
import type { EditorDiffViewMode, EditorDiffUiState } from '../editor-runtime/model/editorUiState'
import type {
  PropertyEditorFieldDefinition,
  PropertyEditorInput,
} from '../../shared/ui/property-editor/propertyEditor.types'
import type { OcNode, OcNodeCollection } from '../../shared/ui/node/node.types'
import type { ViewportInsets } from '../../shared/ui/viewport/viewportNavigation'
import { getBlockPresentation } from './blockPresentation'
import { CDE_OVERLAY_SPLIT_GAP } from './cdeOverlayConfig'

type CdeDiffSide = 'before' | 'after'

/** A block of one compared side, with the placement the comparison needs to report a move. */
type CdeDiffBlockDescriptor = {
  block: CardBlock
  faceKey: CardFaceKey
  parentId: string
  order: number
  location: unknown
}

/** One compared side, projected once and shared by every diff projection of that side. */
type CdeDiffSideProjection = {
  instance: ComputedRef<CardInstanceRecord | null>
  render: ComputedRef<PreparedCardRender | null>
  blocks: ComputedRef<Map<string, CdeDiffBlockDescriptor>>
}

/** A compared block addressed by id, without exposing the whole side projection. */
export type CdeDiffBlockRef = {
  blockId: string
  faceKey: CardFaceKey
}

type UseCdeDiffViewOptions = {
  mode: Readonly<Ref<'edit' | 'diff' | undefined>>
  comparison: Readonly<Ref<EditorComparisonInput | undefined>>
  diffUiState: Readonly<Ref<EditorDiffUiState | undefined>>
  renderEnvironment: Readonly<Ref<CardRenderEnvironment>>
  activeFaceKey: Readonly<Ref<CardFaceKey>>
  viewportInsets: Readonly<Ref<ViewportInsets>>
  blueprintCardId: string
  translate: (messageKey: string) => string
  hasMessage: (messageKey: string) => boolean
  flashStatus: (status: CardViewportStatusFlash) => void
  emitDiffUiState: (state: EditorDiffUiState) => void
}

/** Pseudo-parent the tree projection uses for a face's own children. */
const FACE_ROOT_KEY = '__face__'

export function useCdeDiffView(options: UseCdeDiffViewOptions) {
  const diffModel = computed(() => {
    const comparison = options.comparison.value
    if (options.mode.value !== 'diff' || !comparison) return null
    const result = compareOcdocuments(comparison.before.content, comparison.after.content)
    return result.ok ? result : null
  })
  const hasDiffModel = computed(() => Boolean(diffModel.value))

  function diffDocument(side: CdeDiffSide): CardDocument | null {
    return (side === 'before' ? diffModel.value?.beforeDocument : diffModel.value?.afterDocument) ?? null
  }

  // 对比模式的选择与编辑选择平行存在：它只作用于对比投影 不写文档 也不写会话状态。
  const diffSelectedBlockKeys = ref<string[]>([])
  const diffSelectedInstanceKeys = ref<string[]>([])
  const diffSelectedInstanceId = computed(() => {
    const key = diffSelectedInstanceKeys.value[0]
    return options.mode.value === 'diff' && key && key !== options.blueprintCardId ? key : null
  })
  // 对比中可投影的实例 id 全集：对比模式的有效性判断以它为准 而不是当前打开的文档。
  const diffInstanceIds = computed<ReadonlySet<string>>(() => new Set([
    ...(diffModel.value?.beforeDocument.instances ?? []).map(instance => instance.id),
    ...(diffModel.value?.afterDocument.instances ?? []).map(instance => instance.id),
  ]))
  watch([diffSelectedInstanceKeys, diffInstanceIds], ([keys, instanceIds]) => {
    const validKeys = keys.filter(key => key === options.blueprintCardId || instanceIds.has(key))
    if (validKeys.length === keys.length) return
    diffSelectedInstanceKeys.value = validKeys
  })

  function createDiffSide(side: CdeDiffSide): CdeDiffSideProjection {
    const instance = computed<CardInstanceRecord | null>(() => {
      const instanceId = diffSelectedInstanceId.value
      if (!instanceId) return null
      return diffDocument(side)?.instances.find(candidate => candidate.id === instanceId) ?? null
    })
    const blocks = computed(() => {
      const source = diffDocument(side)
      return collectDiffBlocks(source ? applyInstance(source, instance.value) : null)
    })
    const render = computed<PreparedCardRender | null>(() => {
      const model = diffModel.value
      const revision = options.comparison.value?.[side]
      if (!model || !revision) return null
      return prepareCardRender({
        document: side === 'before' ? model.beforeDocument : model.afterDocument,
        instance: instance.value,
        resourceRootPath: revision.resourceRootPath ?? null,
        sourceFilePath: revision.sourceFilePath ?? null,
        environment: {
          ...(revision.resourceEnvironment?.renderEnvironment.value ?? { projectIconCatalog: EMPTY_PROJECT_ICON_CATALOG }),
          customBlockLimits: options.renderEnvironment.value.customBlockLimits,
        },
      })
    })
    return { instance, render, blocks }
  }

  const before = createDiffSide('before')
  const after = createDiffSide('after')
  // 一次比较只解析一次两侧块表 供高亮/结构树/属性投影共同复用。
  const changedBlockIds = computed(() => collectChangedDiffBlockIds(before.blocks.value, after.blocks.value))

  function createDiffHighlights(
    own: ComputedRef<Map<string, CdeDiffBlockDescriptor>>,
    other: ComputedRef<Map<string, CdeDiffBlockDescriptor>>,
    kind: 'added' | 'removed',
  ): ComputedRef<readonly CardDiffHighlight[]> {
    return computed(() => {
      const faceKey = options.activeFaceKey.value
      const changed = changedBlockIds.value
      return [...own.value].flatMap(([blockId, descriptor]) => {
        if (descriptor.faceKey !== faceKey) return []
        const highlightKind = !other.value.has(blockId)
          ? kind
          : changed.has(blockId) ? 'changed' as const : undefined
        return highlightKind ? [{ blockId, kind: highlightKind }] : []
      })
    })
  }
  const beforeHighlights = createDiffHighlights(before.blocks, after.blocks, 'removed')
  const afterHighlights = createDiffHighlights(after.blocks, before.blocks, 'added')

  const diffDivider = ref(clampDivider(options.diffUiState.value?.divider ?? 0.5))
  const diffViewMode = ref<EditorDiffViewMode>(options.diffUiState.value?.viewMode ?? 'split')
  const diffDividerTransitionRevision = ref(0)
  watch(options.diffUiState, value => {
    diffDivider.value = clampDivider(value?.divider ?? 0.5)
    diffViewMode.value = value?.viewMode ?? 'split'
  })

  function formatDiffRevisionLabel(snapshot: EditorSnapshotContext | undefined): string {
    if (!snapshot) return ''
    return snapshot.revisionId?.slice(0, 7) || options.translate('versionControl.diffViewer.diskVersion')
  }

  const diffViewportComparison = computed<CardViewportComparison | undefined>(() => {
    const beforeRender = before.render.value
    const afterRender = after.render.value
    if (!beforeRender || !afterRender) return undefined
    const addedInstance = Boolean(diffSelectedInstanceId.value && !before.instance.value && after.instance.value)
    const removedInstance = Boolean(diffSelectedInstanceId.value && before.instance.value && !after.instance.value)
    const beforeFace = beforeRender.document.faces[options.activeFaceKey.value]
    const afterFace = afterRender.document.faces[options.activeFaceKey.value]
    return {
      before: {
        face: addedInstance ? afterFace : beforeFace,
        resourceContext: beforeRender.resources,
        placeholder: addedInstance,
        diffHighlights: beforeHighlights.value,
      },
      after: {
        face: removedInstance ? beforeFace : afterFace,
        resourceContext: afterRender.resources,
        placeholder: removedInstance,
        diffHighlights: afterHighlights.value,
      },
      divider: diffDivider.value,
      viewMode: diffViewMode.value,
      transitionRevision: diffDividerTransitionRevision.value,
      beforeLabel: formatDiffRevisionLabel(options.comparison.value?.before),
      afterLabel: formatDiffRevisionLabel(options.comparison.value?.after),
    }
  })

  const diffViewportInsets = computed(() => ({
    ...options.viewportInsets.value,
    left: (options.viewportInsets.value.left ?? 0) + CDE_OVERLAY_SPLIT_GAP,
    right: (options.viewportInsets.value.right ?? 0) + CDE_OVERLAY_SPLIT_GAP,
  }))

  const diffInstanceTreeData = computed<OcNodeCollection>(() => {
    const items = new Map<string, OcNode>()
    const rootKeys = [options.blueprintCardId]
    items.set(options.blueprintCardId, {
      label: options.translate('cardDesigner.dataTable.blueprint'),
      visual: { type: 'icon', icon: 'file.opencard' },
    })
    const model = diffModel.value
    for (const id of diffInstanceIds.value) {
      const beforeInstance = model?.beforeDocument.instances.find(instance => instance.id === id)
      const afterInstance = model?.afterDocument.instances.find(instance => instance.id === id)
      const changed = Boolean(beforeInstance && afterInstance
        && JSON.stringify(beforeInstance) !== JSON.stringify(afterInstance))
      items.set(id, {
        label: afterInstance?.name || beforeInstance?.name || id,
        visual: { type: 'icon', icon: 'file.opencard' },
        tone: afterInstance && !beforeInstance
          ? 'success'
          : beforeInstance && !afterInstance ? 'danger' : changed ? 'warning' : undefined,
        tail: afterInstance && !beforeInstance
          ? { type: 'badge', icon: 'action.add', tone: 'success', label: options.translate('versionControl.diffViewer.added') }
          : beforeInstance && !afterInstance
            ? {
                type: 'badge',
                icon: 'action.minus',
                tone: 'danger',
                label: options.translate('versionControl.diffViewer.removed'),
              }
            : changed
              ? {
                  type: 'badge',
                  icon: 'status.circle-medium',
                  tone: 'warning',
                  label: options.translate('versionControl.diffViewer.changed'),
                }
              : undefined,
      })
      rootKeys.push(id)
    }
    return { rootKeys, items, children: new Map() }
  })

  const diffBlockTreeData = computed<OcNodeCollection>(() => {
    const faceKey = options.activeFaceKey.value
    const beforeBlocks = before.blocks.value
    const afterBlocks = after.blocks.value
    const changed = changedBlockIds.value
    const children = new Map<string, string[]>()
    const beforeFaceBlocks = projectFaceTopology(beforeBlocks, faceKey, children)
    const afterFaceBlocks = projectFaceTopology(afterBlocks, faceKey, children)

    const items = new Map<string, OcNode>()
    for (const id of new Set([...beforeFaceBlocks.keys(), ...afterFaceBlocks.keys()])) {
      const block = afterFaceBlocks.get(id) ?? beforeFaceBlocks.get(id)
      if (!block) continue
      const kind = !beforeBlocks.has(id)
        ? 'added'
        : !afterBlocks.has(id)
          ? 'removed'
          : changed.has(id)
            ? 'changed'
            : undefined
      items.set(id, {
        label: getBlockProperty<string>(block, 'name') || id,
        visual: {
          type: 'icon',
          icon: getBlockPresentation(block.type).icon,
          iconTone: getBlockPresentation(block.type).iconTone,
        },
        tone: kind === 'added' ? 'success' : kind === 'removed' ? 'danger' : kind === 'changed' ? 'warning' : undefined,
        tail: kind ? {
          type: 'badge',
          icon: kind === 'added' ? 'action.add' : kind === 'removed' ? 'action.minus' : 'status.circle-medium',
          tone: kind === 'added' ? 'success' : kind === 'removed' ? 'danger' : 'warning',
          label: options.translate(`versionControl.diffViewer.${kind}`),
        } : undefined,
      })
    }
    const rootKeys = [...(children.get(FACE_ROOT_KEY) ?? [])]
    children.delete(FACE_ROOT_KEY)
    return { rootKeys, items, children }
  })

  const diffPropertyInputs = computed<readonly PropertyEditorInput[]>(() => {
    const blockId = diffSelectedBlockKeys.value[0]
    if (!blockId) return []
    const beforeDescriptor = before.blocks.value.get(blockId)
    const afterDescriptor = after.blocks.value.get(blockId)
    if (!beforeDescriptor && !afterDescriptor) return []
    const block = afterDescriptor?.block ?? beforeDescriptor!.block
    const blockRecord = block as unknown as Readonly<Record<string, unknown>>
    const blockFields = resolveCardPropertyFields(blockRecord, {
      allowDelete: false,
      translate: options.translate,
      hasMessage: options.hasMessage,
    })
    const blockProjection = createDiffPropertyProjection(
      beforeDescriptor?.block as unknown as Readonly<Record<string, unknown>> | null ?? null,
      afterDescriptor?.block as unknown as Readonly<Record<string, unknown>> | null ?? null,
      blockFields,
      options.translate,
    )
    const inputs: PropertyEditorInput[] = [{
      key: blockId,
      title: getBlockProperty<string>(block, 'name')?.trim() || blockId,
      record: blockProjection.record,
      fields: blockProjection.fields,
    }]
    const beforeLayout = beforeDescriptor ? {
      parent: beforeDescriptor.parentId,
      order: beforeDescriptor.order,
      face: beforeDescriptor.faceKey,
      ...(beforeDescriptor.location as Readonly<Record<string, unknown>>),
    } : null
    const afterLayout = afterDescriptor ? {
      parent: afterDescriptor.parentId,
      order: afterDescriptor.order,
      face: afterDescriptor.faceKey,
      ...(afterDescriptor.location as Readonly<Record<string, unknown>>),
    } : null
    if (!diffValuesEqual(beforeLayout, afterLayout)) {
      const layoutRecord = afterLayout ?? beforeLayout!
      const layoutFields = resolveCardPropertyFields(layoutRecord, {
        allowDelete: false,
        translate: options.translate,
        hasMessage: options.hasMessage,
      })
      const layoutProjection = createDiffPropertyProjection(
        beforeLayout,
        afterLayout,
        layoutFields,
        options.translate,
      )
      inputs.push({
        key: `${blockId}:layout`,
        title: 'Layout',
        record: layoutProjection.record,
        fields: layoutProjection.fields,
      })
    }
    return inputs.filter(input => Object.keys(input.record).length > 0)
  })

  /** Addresses a compared block the way navigation does: the after side wins over the before side. */
  function resolveDiffBlock(blockId: string): CdeDiffBlockRef | null {
    const descriptor = after.blocks.value.get(blockId) ?? before.blocks.value.get(blockId)
    return descriptor ? { blockId: descriptor.block.id, faceKey: descriptor.faceKey } : null
  }

  function commitDiffUiState(): void {
    options.emitDiffUiState({ divider: diffDivider.value, viewMode: diffViewMode.value })
  }

  function handleDiffDividerChange(value: number): void {
    diffDivider.value = clampDivider(value)
    commitDiffUiState()
  }

  function toggleDiffViewMode(): void {
    diffViewMode.value = diffViewMode.value === 'split' ? 'side-by-side' : 'split'
    commitDiffUiState()
    options.flashStatus({
      icon: 'layout.columns',
      message: options.translate(diffViewMode.value === 'side-by-side'
        ? 'cardDesigner.viewportStatus.diffSideBySide'
        : 'cardDesigner.viewportStatus.diffSplit'),
    })
  }

  function setDiffDividerPreset(divider: 0 | 0.5 | 1): void {
    const switchedFromSideBySide = diffViewMode.value === 'side-by-side'
    diffViewMode.value = 'split'
    diffDivider.value = divider
    diffDividerTransitionRevision.value += 1
    commitDiffUiState()
    if (switchedFromSideBySide) {
      options.flashStatus({
        icon: 'layout.columns',
        message: options.translate('cardDesigner.viewportStatus.diffSplit'),
      })
    }
  }

  return {
    diffBeforeRender: before.render,
    diffAfterRender: after.render,
    diffViewportComparison,
    diffViewportInsets,
    diffBlockTreeData,
    diffInstanceTreeData,
    diffPropertyInputs,
    diffSelectedBlockKeys,
    diffSelectedInstanceKeys,
    diffInstanceIds,
    diffViewMode,
    hasDiffModel,
    resolveDiffBlock,
    handleDiffDividerChange,
    setDiffDividerPreset,
    toggleDiffViewMode,
  }
}

function clampDivider(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** One side's whole-document block map, keyed by block id. */
function collectDiffBlocks(document: CardDocument | null | undefined): Map<string, CdeDiffBlockDescriptor> {
  const result = new Map<string, CdeDiffBlockDescriptor>()
  if (!document) return result
  const visit = (block: CardBlock, faceKey: CardFaceKey, parentId: string, order: number, location: unknown) => {
    result.set(block.id, { block, faceKey, parentId, order, location })
    if (!isBlockContainer(block)) return
    block.children.forEach((child, index) => visit(child.block, faceKey, block.id, index, child.location))
  }
  for (const faceKey of ['front', 'back'] as const) {
    document.faces[faceKey].children.forEach((child, index) => {
      visit(child.block, faceKey, `face:${faceKey}`, index, child.location)
    })
  }
  return result
}

function diffBlockOwnRecord(block: CardBlock): Record<string, unknown> {
  const { children: _children, ...record } = block as CardBlock & { children?: unknown }
  return record
}

/** Block ids whose own record or placement differs between the two sides. */
function collectChangedDiffBlockIds(
  before: ReadonlyMap<string, CdeDiffBlockDescriptor>,
  after: ReadonlyMap<string, CdeDiffBlockDescriptor>,
): Set<string> {
  return new Set([...before].flatMap(([blockId, descriptor]) => {
    const afterDescriptor = after.get(blockId)
    if (!afterDescriptor) return []
    const ownBlockChanged = !diffValuesEqual(
      diffBlockOwnRecord(descriptor.block),
      diffBlockOwnRecord(afterDescriptor.block),
    )
    const layoutChanged = descriptor.parentId !== afterDescriptor.parentId
      || descriptor.faceKey !== afterDescriptor.faceKey
      || descriptor.order !== afterDescriptor.order
      || !diffValuesEqual(descriptor.location, afterDescriptor.location)
    return ownBlockChanged || layoutChanged ? [blockId] : []
  }))
}

/** One side's blocks on the active face plus its parent wiring, merged from the single block map. */
function projectFaceTopology(
  blocks: ReadonlyMap<string, CdeDiffBlockDescriptor>,
  faceKey: CardFaceKey,
  children: Map<string, string[]>,
): Map<string, CardBlock> {
  const faceBlocks = new Map<string, CardBlock>()
  for (const [blockId, descriptor] of blocks) {
    if (descriptor.faceKey !== faceKey) continue
    faceBlocks.set(blockId, descriptor.block)
    const parentKey = descriptor.parentId === `face:${descriptor.faceKey}` ? FACE_ROOT_KEY : descriptor.parentId
    const list = children.get(parentKey) ?? []
    if (!list.includes(blockId)) list.push(blockId)
    children.set(parentKey, list)
  }
  return faceBlocks
}

function diffValuesEqual(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true
  if (Array.isArray(before) || Array.isArray(after)) {
    return Array.isArray(before) && Array.isArray(after)
      && before.length === after.length
      && before.every((value, index) => diffValuesEqual(value, after[index]))
  }
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false
  const beforeRecord = before as Readonly<Record<string, unknown>>
  const afterRecord = after as Readonly<Record<string, unknown>>
  const beforeKeys = Object.keys(beforeRecord).sort()
  const afterKeys = Object.keys(afterRecord).sort()
  return diffValuesEqual(beforeKeys, afterKeys)
    && beforeKeys.every(key => diffValuesEqual(beforeRecord[key], afterRecord[key]))
}

type DiffPropertyProjection = {
  record: Readonly<Record<string, unknown>>
  fields: Readonly<Record<string, PropertyEditorFieldDefinition>>
}

/** Pairs one record's changed fields as `<field>@old` / `<field>@new` for a read-only projection. */
function createDiffPropertyProjection(
  beforeRecord: Readonly<Record<string, unknown>> | null,
  afterRecord: Readonly<Record<string, unknown>> | null,
  fields: PropertyEditorInput['fields'],
  translate: (messageKey: string) => string,
): DiffPropertyProjection {
  const record: Record<string, unknown> = {}
  const projectedFields: Record<string, PropertyEditorFieldDefinition> = {}
  const fieldKeys = new Set([...Object.keys(beforeRecord ?? {}), ...Object.keys(afterRecord ?? {})])
  const wholeRecordAddedOrRemoved = !beforeRecord || !afterRecord
  for (const fieldKey of fieldKeys) {
    const definition = fields[fieldKey]
    if (!definition || definition.isHidden) continue
    const hasBefore = Boolean(beforeRecord && Object.prototype.hasOwnProperty.call(beforeRecord, fieldKey))
    const hasAfter = Boolean(afterRecord && Object.prototype.hasOwnProperty.call(afterRecord, fieldKey))
    const beforeValue = beforeRecord?.[fieldKey]
    const afterValue = afterRecord?.[fieldKey]
    if (!wholeRecordAddedOrRemoved && hasBefore && hasAfter && diffValuesEqual(beforeValue, afterValue)) continue
    if (hasBefore) {
      const projectedKey = `${fieldKey}@old`
      record[projectedKey] = beforeValue
      projectedFields[projectedKey] = {
        ...definition,
        isReadonly: true,
        tail: {
          type: 'badge',
          icon: 'action.minus',
          tone: 'danger',
          label: translate('versionControl.diffViewer.removed'),
        },
      }
    }
    if (hasAfter) {
      const projectedKey = `${fieldKey}@new`
      record[projectedKey] = afterValue
      projectedFields[projectedKey] = {
        ...definition,
        isReadonly: true,
        tail: {
          type: 'badge',
          icon: 'action.add',
          tone: 'success',
          label: translate('versionControl.diffViewer.added'),
        },
      }
    }
  }
  return { record, fields: projectedFields }
}
