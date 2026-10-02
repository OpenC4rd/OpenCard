/** Card structure operations and their node collection projection. */
import { computed, toRaw, watch, type Ref } from 'vue'
import type { CardBlockPayload } from '../../shared/model/clipboard/cardBlockClipboard'
import {
  createBlock,
  getBlockProperty,
  setBlockProperty,
  type CardBlock,
  type CardDocument,
  type CardFace,
  type FlowContainerLocationInfo,
  type SimpleContainerLocationInfo,
} from '../../entities/card/model'
import {
  addBlockToContainer,
  isBlockContainer,
  isBlockPackaged,
  removeBlockFromContainer,
  visitCardBlockTree,
  type BlockContainer,
  type ParentLookup,
} from '../../entities/card/tree'
import type {
  OcNode,
  OcNodeAction,
  OcNodeActionEvent,
  OcNodeCollection,
  OcNodeContextEntry,
  OcNodeMoveEvent,
  OcNodeRenameCommitEvent,
  OcNodeSelectionEvent,
} from '../../shared/ui/node/node.types'
import { getBlockPresentation } from './blockPresentation'
import { cdeNodeAction } from './cdeNodeAction'
import type { CdeDocumentChangeMode } from './useCdeDocumentState'

type CardLocation = SimpleContainerLocationInfo | FlowContainerLocationInfo

type IndexedBlock = {
  block: CardBlock
  location: CardLocation
  order: number
}

type BlockActionSet = {
  show: OcNodeAction
  hide: OcNodeAction
  copyBlock: OcNodeAction
  pasteBlock: OcNodeAction
  rename: OcNodeAction
  duplicate: OcNodeAction
  remove: OcNodeAction
  add: OcNodeAction
  package: OcNodeAction
  unpackage: OcNodeAction
  blockMore: OcNodeAction
  containerMore: OcNodeAction
  packagedContainerMore: OcNodeAction
  exportCustomBlock: OcNodeAction
}

const BLOCK_ADD_ACTION_DEFINITIONS: readonly { key: string; type: CardBlock['type'] }[] = [
  { key: 'add-text-block', type: 'text-block' },
  { key: 'add-markdown-text-block', type: 'markdown-text-block' },
  { key: 'add-image-block', type: 'image-block' },
  { key: 'add-qrcode-block', type: 'qrcode-block' },
  { key: 'add-shape-block', type: 'shape-block' },
  { key: 'add-simple-container-block', type: 'simple-container-block' },
  { key: 'add-flow-container-block', type: 'flow-container-block' },
  { key: 'add-custom-block', type: 'custom-block' },
]

export function createBlockAddActions(translate: (messageKey: string) => string): OcNodeAction[] {
  return BLOCK_ADD_ACTION_DEFINITIONS.map(({ key, type }) => ({
    key,
    title: translate(`cardDesigner.blockNames.${type}`),
    ...getBlockPresentation(type),
  }))
}

function createBlockActions(translate: (messageKey: string) => string): BlockActionSet {
  const copyBlock = cdeNodeAction('copy-block', 'action.copy', translate('cardDesigner.treeActions.copyBlock'), { shortcut: 'block.copy' })
  const pasteBlock = cdeNodeAction('paste-block', 'action.copy', translate('cardDesigner.treeActions.pasteBlock'), { shortcut: 'block.paste' })
  const rename = cdeNodeAction('rename', 'action.edit', translate('cardDesigner.treeActions.rename'), { shortcut: 'block.rename' })
  const duplicate = cdeNodeAction('duplicate', 'action.copy', translate('cardDesigner.treeActions.duplicate'), { shortcut: 'block.duplicate' })
  const remove = cdeNodeAction('delete', 'action.delete', translate('cardDesigner.treeActions.delete'), { shortcut: 'block.delete' })
  const add = cdeNodeAction('add', 'action.add', translate('cardDesigner.treeActions.addChild'), { children: createBlockAddActions(translate) })
  const pack = cdeNodeAction('package', 'entity.block-package', translate('cardDesigner.treeActions.package'))
  const unpack = cdeNodeAction('unpackage', 'entity.block-package', translate('cardDesigner.treeActions.unpackage'))
  const exportCustomBlock = cdeNodeAction('export-custom-block', 'entity.block-custom', translate('cardDesigner.treeActions.exportCustomBlock'))
  const more = (key: string, children: readonly OcNodeAction[]): OcNodeAction => (
    cdeNodeAction(key, 'nav.more', translate('cardDesigner.treeActions.more'), { children })
  )

  return {
    show: cdeNodeAction('show-block', 'status.eye-off', translate('cardDesigner.treeActions.show')),
    hide: cdeNodeAction('hide-block', 'status.eye', translate('cardDesigner.treeActions.hide')),
    copyBlock,
    pasteBlock,
    rename,
    duplicate,
    remove,
    add,
    package: pack,
    unpackage: unpack,
    blockMore: more('block-more', [copyBlock, pasteBlock, rename, duplicate, remove]),
    containerMore: more('container-more', [copyBlock, pasteBlock, rename, add, pack, exportCustomBlock, duplicate, remove]),
    packagedContainerMore: more('packaged-container-more', [rename, unpack, duplicate, remove]),
    exportCustomBlock,
  }
}

type UseCdeTreeOpsOptions = {
  activeFace: Readonly<Ref<CardFace | null>>
  cardDoc?: Readonly<Ref<CardDocument | null>>
  documentRevision: Readonly<Ref<number>>
  parentLookup: Ref<ParentLookup>
  selectedBlockKeys: Ref<string[]>
  getDefaultBlockName: (type: CardBlock['type']) => string
  translate: (messageKey: string) => string
  refreshDocumentState: (structural?: boolean) => void
  markDocumentChanged: (mode?: CdeDocumentChangeMode, target?: string, structural?: boolean) => void
  exportCustomBlock?: (block: CardBlock) => void
}

export function useCdeTreeOps(options: UseCdeTreeOpsOptions) {
  const blockIndex = computed(() => {
    options.documentRevision.value
    const index = new Map<string, IndexedBlock>()
    let order = 0

    function visit(block: CardBlock, location: CardLocation): void {
      index.set(block.id, { block, location, order })
      order += 1
      if (!isBlockContainer(block)) return
      for (const child of block.children) visit(child.block, child.location)
    }

    for (const child of options.activeFace.value?.children ?? []) visit(child.block, child.location)
    return index
  })

  const blockTreeData = computed<OcNodeCollection>(() => {
    options.documentRevision.value
    const rootKeys: string[] = []
    const items = new Map<string, OcNode>()
    const children = new Map<string, readonly string[]>()
    const actions = createBlockActions(options.translate)

    function visit(block: CardBlock): void {
      const packaged = isBlockPackaged(block)
      const container = isBlockContainer(block)
      const childKeys = container && !packaged
        ? block.children.map((child) => child.block.id)
        : []
      const visibility = getBlockProperty<string>(block, 'visible') === 'false' ? 'hidden' : 'visible'
      const presentation = getBlockPresentation(block.type)
      const visibilityAction = visibility === 'hidden' ? actions.show : actions.hide
      const moreAction = container
        ? (packaged ? actions.packagedContainerMore : actions.containerMore)
        : actions.blockMore
      const structureEntries: OcNodeContextEntry[] = container
        ? (packaged ? [actions.unpackage] : [actions.add, actions.package, actions.exportCustomBlock])
        : []
      const tail = block.type === 'custom-block'
        ? [block.source, visibilityAction, moreAction]
        : [visibilityAction, moreAction]
      items.set(block.id, {
        label: getBlockProperty<string>(block, 'name')?.trim() || block.id,
        visual: {
          type: 'icon',
          icon: packaged ? 'entity.block-package' : presentation.icon,
          iconTone: visibility === 'hidden' ? 'muted' : presentation.iconTone,
        },
        renamable: true,
        draggable: true,
        tail,
        contextActions: [
          visibilityAction,
          { type: 'divider', key: 'block-edit-divider' },
          actions.copyBlock,
          actions.pasteBlock,
          actions.rename,
          actions.duplicate,
          { type: 'divider', key: 'block-structure-divider' },
          ...structureEntries,
          { type: 'divider', key: 'block-delete-divider' },
          actions.remove,
        ],
      })
      if (childKeys.length > 0) children.set(block.id, childKeys)
      if (container && !packaged) {
        for (const child of block.children) visit(child.block)
      }
    }

    for (const child of options.activeFace.value?.children ?? []) {
      rootKeys.push(child.block.id)
      visit(child.block)
    }
    return { rootKeys, items, children }
  })

  const selectedEntry = computed<IndexedBlock | null>(() => {
    if (options.selectedBlockKeys.value.length !== 1) return null
    const key = options.selectedBlockKeys.value[0]
    return key ? blockIndex.value.get(key) ?? null : null
  })
  const selectedBlock = computed(() => selectedEntry.value?.block ?? null)
  const selectedLocation = computed(() => selectedEntry.value?.location ?? null)

  function getBlockById(blockId: string): CardBlock | null {
    return blockIndex.value.get(blockId)?.block ?? null
  }

  function resolveVisibleBlockKey(blockId: string): string | null {
    let current = blockIndex.value.get(blockId)?.block ?? null
    if (!current) return null

    let visibleKey = current.id
    while (current) {
      const parent = options.parentLookup.value.get(current.id)
      if (!parent || parent.type === 'card-face') break
      if (isBlockPackaged(parent)) visibleKey = parent.id
      current = parent
    }
    return visibleKey
  }

  watch(
    [blockIndex, options.selectedBlockKeys],
    ([index, selectedKeys]) => {
      const nextKeys = normalizeVisibleSelectionKeys(selectedKeys, index)
      if (
        selectedKeys.length === nextKeys.length
        && selectedKeys.every((key, index) => key === nextKeys[index])
      ) return
      options.selectedBlockKeys.value = nextKeys
    },
    { immediate: true },
  )

  function selectKeys(keys: readonly string[]): void {
    options.selectedBlockKeys.value = normalizeVisibleSelectionKeys(keys, blockIndex.value)
  }

  function normalizeVisibleSelectionKeys(
    keys: readonly string[],
    index: ReadonlyMap<string, IndexedBlock>,
  ): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()
    for (const key of keys) {
      const visibleKey = resolveVisibleBlockKey(key)
      if (!visibleKey || !index.has(visibleKey) || seen.has(visibleKey)) continue
      seen.add(visibleKey)
      normalized.push(visibleKey)
    }
    return normalized
  }

  function handleViewportBlockClick(blockId: string): void {
    selectKeys([blockId])
  }

  function clearSelection(): void {
    if (options.selectedBlockKeys.value.length > 0) options.selectedBlockKeys.value = []
  }

  function handleBlockSelection(event: OcNodeSelectionEvent): void {
    selectKeys(event.selectedKeys)
  }

  function handleBlockAction(event: OcNodeActionEvent): void {
    if (event.actionKey === 'delete' && options.selectedBlockKeys.value.includes(event.key)) {
      deleteBlocks(options.selectedBlockKeys.value)
      return
    }
    selectKeys([event.key])
    executeBlockAction(event.actionKey, blockIndex.value.get(event.key)?.block ?? null)
  }

  function handleBlockRenameCommit(event: OcNodeRenameCommitEvent): void {
    renameBlock(event.key, event.name)
  }

  function handleBlockMove(event: OcNodeMoveEvent): void {
    moveBlocks(
      options.selectedBlockKeys.value.includes(event.key)
        ? options.selectedBlockKeys.value
        : [event.key],
      event.targetKey,
      event.position,
    )
  }

  function handleRootAction(actionKey: string): void {
    if (actionKey === 'delete-selected') {
      deleteBlocks(options.selectedBlockKeys.value)
      return
    }
    const target = actionKey.endsWith('-selected') ? selectedBlock.value : null
    executeBlockAction(actionKey, target)
  }

  function executeBlockAction(actionKey: string, target: CardBlock | null): void {
    const targetContainer: BlockContainer | null = target && isBlockContainer(target) && !isBlockPackaged(target)
      ? target
      : target ? null : options.activeFace.value
    switch (actionKey) {
      case 'add-text-block':
        if (targetContainer) createBlockAt(targetContainer, 'text-block')
        return
      case 'add-markdown-text-block':
        if (targetContainer) createBlockAt(targetContainer, 'markdown-text-block')
        return
      case 'add-image-block':
        if (targetContainer) createBlockAt(targetContainer, 'image-block')
        return
      case 'add-qrcode-block':
        if (targetContainer) createBlockAt(targetContainer, 'qrcode-block')
        return
      case 'add-shape-block':
        if (targetContainer) createBlockAt(targetContainer, 'shape-block')
        return
      case 'add-simple-container-block':
        if (targetContainer) createBlockAt(targetContainer, 'simple-container-block')
        return
      case 'add-flow-container-block':
        if (targetContainer) createBlockAt(targetContainer, 'flow-container-block')
        return
      case 'add-custom-block':
        if (targetContainer) createBlockAt(targetContainer, 'custom-block')
        return
      case 'duplicate':
      case 'duplicate-selected':
        if (target) duplicateBlock(target)
        return
      case 'delete':
        if (target) deleteBlocks([target.id])
        return
      case 'hide-block':
        if (target) setBlockVisibility(target, false)
        return
      case 'show-block':
        if (target) setBlockVisibility(target, true)
        return
      case 'package':
        if (target && isBlockContainer(target)) setBlockPackaged(target, true)
        return
      case 'unpackage':
        if (target && isBlockContainer(target)) setBlockPackaged(target, false)
        return
      case 'export-custom-block':
        if (target && (target.type === 'simple-container-block' || target.type === 'flow-container-block')) {
          options.exportCustomBlock?.(target)
        }
        return
    }
  }

  function setBlockPackaged(block: Exclude<BlockContainer, CardFace>, packaged: boolean): void {
    if (isBlockPackaged(block) === packaged) return
    if (packaged) block.packaged = 'true'
    else delete block.packaged
    options.refreshDocumentState(true)
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function setBlockVisibility(block: CardBlock, visible: boolean): void {
    const nextValue = visible ? 'true' : 'false'
    if (getBlockProperty<string>(block, 'visible') === nextValue) return
    setBlockProperty(block, 'visible', nextValue)
    options.refreshDocumentState(true)
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function renameBlock(key: string, name: string): void {
    const block = blockIndex.value.get(key)?.block
    const nextName = name.trim()
    if (!block || !nextName || getBlockProperty<string>(block, 'name') === nextName) return
    setBlockProperty(block, 'name', nextName)
    options.refreshDocumentState(true)
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function moveBlocks(
    requestedKeys: readonly string[],
    targetKey: string | null,
    position: 'before' | 'inside' | 'after',
  ): void {
    const selectedKeys = normalizeVisibleSelectionKeys(requestedKeys, blockIndex.value)
    const movedKeys = resolveTopLevelSelectionKeys(selectedKeys)
    const targetEntry = targetKey ? blockIndex.value.get(targetKey) : null
    if (movedKeys.length === 0 || (targetKey && !targetEntry)) return
    if (targetKey && movedKeys.some(key => targetKey === key || isDescendantOf(targetKey, key))) return

    const targetContainer = resolveTargetContainer(targetEntry?.block ?? null, position)
    let insertionIndex = resolveInsertionIndex(targetEntry?.block ?? null, targetContainer, position)
    if (!targetContainer || insertionIndex === null || isBlockPackaged(targetContainer)) return

    const entries = movedKeys.flatMap((key) => {
      const indexed = blockIndex.value.get(key)
      const sourceContainer = options.parentLookup.value.get(key)
      const sourceIndex = sourceContainer?.children.findIndex(child => child.block.id === key) ?? -1
      return indexed && sourceContainer && sourceIndex >= 0
        ? [{ key, ...indexed, sourceContainer, sourceIndex }]
        : []
    })
    if (entries.length !== movedKeys.length) return

    insertionIndex -= entries.filter(entry => (
      entry.sourceContainer === targetContainer && entry.sourceIndex < insertionIndex!
    )).length

    for (const entry of entries) {
      removeBlockFromContainer(entry.sourceContainer, entry.key, options.parentLookup.value)
    }
    entries.forEach((entry, offset) => {
      const nextIndex = insertionIndex! + offset
      addBlockToContainer(
        targetContainer,
        entry.block,
        options.parentLookup.value,
        createDropLocation(entry.location, targetContainer, nextIndex),
        nextIndex,
      )
    })

    options.refreshDocumentState(true)
    selectKeys(selectedKeys)
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function resolveTopLevelSelectionKeys(keys: readonly string[]): string[] {
    const selected = new Set(keys)
    return [...selected]
      .filter((key) => {
        let parent = options.parentLookup.value.get(key)
        while (parent && parent.type !== 'card-face') {
          if (selected.has(parent.id)) return false
          parent = options.parentLookup.value.get(parent.id)
        }
        return true
      })
      .sort((left, right) => (
        (blockIndex.value.get(left)?.order ?? Number.MAX_SAFE_INTEGER)
        - (blockIndex.value.get(right)?.order ?? Number.MAX_SAFE_INTEGER)
      ))
  }

  function isDescendantOf(targetKey: string, ancestorKey: string): boolean {
    let current = blockIndex.value.get(targetKey)?.block ?? null
    while (current) {
      if (current.id === ancestorKey) return true
      const parent = options.parentLookup.value.get(current.id)
      current = parent && parent.type !== 'card-face' ? parent : null
    }
    return false
  }

  function resolveTargetContainer(target: CardBlock | null, position: 'before' | 'inside' | 'after'): BlockContainer | null {
    if (!target) return position === 'inside' ? options.activeFace.value : null
    if (position === 'inside') return isBlockContainer(target) && !isBlockPackaged(target) ? target : null
    return options.parentLookup.value.get(target.id) ?? null
  }

  function resolveInsertionIndex(
    target: CardBlock | null,
    targetContainer: BlockContainer | null,
    position: 'before' | 'inside' | 'after',
  ): number | null {
    if (!targetContainer) return null
    if (!target || position === 'inside') return targetContainer.children.length
    const targetIndex = targetContainer.children.findIndex((child) => child.block.id === target.id)
    if (targetIndex < 0) return null
    return position === 'before' ? targetIndex : targetIndex + 1
  }

  function createDropLocation(
    current: CardLocation,
    targetContainer: BlockContainer,
    insertionIndex: number,
  ): CardLocation {
    if (targetContainer.type === 'flow-container-block') {
      return {
        id: current.id ?? `flow-location-${crypto.randomUUID()}`,
        type: 'flow-container-location',
        index: String(insertionIndex),
        align: current.type === 'flow-container-location' ? current.align : undefined,
      }
    }
    if (current.type === 'simple-container-location') return { ...current }
    return {
      id: `simple-location-${crypto.randomUUID()}`,
      type: 'simple-container-location',
      anchor: 'lt',
      x: '0',
      y: '0',
    }
  }

  function createBlockAt(container: BlockContainer, type: CardBlock['type']): void {
    if (isBlockPackaged(container)) return
    const name = options.getDefaultBlockName(type).trim() || undefined
    let block: CardBlock
    switch (type) {
      case 'text-block':
        block = createBlock('text-block', { name })
        break
      case 'markdown-text-block':
        block = createBlock('markdown-text-block', { name })
        break
      case 'image-block':
        block = createBlock('image-block', { name })
        break
      case 'qrcode-block':
        block = createBlock('qrcode-block', { name })
        break
      case 'shape-block':
        block = createBlock('shape-block', { name })
        break
      case 'simple-container-block':
        block = createBlock('simple-container-block', { name })
        break
      case 'flow-container-block':
        block = createBlock('flow-container-block', { name })
        break
      case 'custom-block':
        block = createBlock('custom-block', { name })
        break
    }
    insertBlockAt(container, block)
  }

  function insertBlockAt(container: BlockContainer, block: CardBlock): void {
    if (isBlockPackaged(container)) return
    addBlockToContainer(container, block, options.parentLookup.value)
    options.refreshDocumentState(true)
    options.selectedBlockKeys.value = [block.id]
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function insertBlockAtRoot(block: CardBlock): boolean {
    const face = options.activeFace.value
    if (!face) return false
    addBlockToContainer(face, block, options.parentLookup.value)
    options.refreshDocumentState(true)
    options.selectedBlockKeys.value = [block.id]
    options.markDocumentChanged('action', 'structure-tree', true)
    return true
  }

  function exportSelectedBlockPayloads(): CardBlockPayload[] {
    const keys = resolveTopLevelSelectionKeys(
      normalizeVisibleSelectionKeys(options.selectedBlockKeys.value, blockIndex.value),
    )
    return keys.flatMap(key => {
      const entry = blockIndex.value.get(key)
      return entry ? [{
        block: structuredClone(toRaw(entry.block)),
        location: structuredClone(toRaw(entry.location)),
      }] : []
    })
  }

  function pasteBlockPayloads(payloads: readonly CardBlockPayload[]): string[] {
    if (payloads.length === 0) return []
    const target = selectedBlock.value
    const container = target && isBlockContainer(target) && !isBlockPackaged(target)
      ? target
      : target ? options.parentLookup.value.get(target.id) ?? null : options.activeFace.value
    if (!container || isBlockPackaged(container)) return []
    const insertionIndex = container.children.length
    const pastedIds: string[] = []
    payloads.forEach((payload, offset) => {
      const location = createDropLocation(payload.location, container, insertionIndex + offset)
      addBlockToContainer(container, payload.block, options.parentLookup.value, location, insertionIndex + offset)
      pastedIds.push(payload.block.id)
    })
    options.refreshDocumentState(true)
    options.selectedBlockKeys.value = pastedIds
    options.markDocumentChanged('action', 'clipboard-paste', true)
    return pastedIds
  }

  function deleteBlocks(requestedKeys: readonly string[]): void {
    const keys = resolveTopLevelSelectionKeys(
      normalizeVisibleSelectionKeys(requestedKeys, blockIndex.value),
    )
    const targets = keys.flatMap((key) => {
      const container = options.parentLookup.value.get(key)
      return container?.children.some(child => child.block.id === key)
        ? [{ key, container }]
        : []
    })
    if (targets.length !== keys.length || targets.length === 0) return

    const deletedBlockIds = new Set<string>()
    for (const target of targets) {
      const removed = removeBlockFromContainer(target.container, target.key, options.parentLookup.value)
      if (!removed) continue
      visitCardBlockTree(removed, block => deletedBlockIds.add(block.id))
    }
    if (deletedBlockIds.size > 0) {
      for (const instance of options.cardDoc?.value?.instances ?? []) {
        for (const blockId of deletedBlockIds) delete instance.data[blockId]
      }
    }
    options.selectedBlockKeys.value = []
    options.refreshDocumentState(true)
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function duplicateBlock(block: CardBlock): void {
    const container = options.parentLookup.value.get(block.id)
    if (!container) return
    const sourceIndex = container.children.findIndex((child) => child.block.id === block.id)
    if (sourceIndex < 0) return
    const sourceChild = container.children[sourceIndex]
    const duplicated = cloneBlockWithNewIds(sourceChild.block)
    const insertionIndex = sourceIndex + 1
    const location = cloneLocationForDuplicate(sourceChild.location, container, insertionIndex)
    addBlockToContainer(container, duplicated, options.parentLookup.value, location, insertionIndex)
    options.refreshDocumentState(true)
    options.selectedBlockKeys.value = [duplicated.id]
    options.markDocumentChanged('action', 'structure-tree', true)
  }

  function cloneBlockWithNewIds(source: CardBlock): CardBlock {
    const raw = toRaw(source) as CardBlock
    const rootName = getBlockProperty<string>(raw, 'name')?.trim() || raw.id
    let duplicate: CardBlock
    try {
      duplicate = structuredClone(raw)
    } catch {
      duplicate = JSON.parse(JSON.stringify(raw)) as CardBlock
    }
    remapBlockIds(duplicate, true, rootName)
    return duplicate
  }

  function remapBlockIds(block: CardBlock, root: boolean, rootName: string): void {
    block.id = `${block.type}-${crypto.randomUUID()}`
    if (root) setBlockProperty(block, 'name', `${rootName} 副本`)
    if (!isBlockContainer(block)) return
    for (const child of block.children) remapBlockIds(child.block, false, rootName)
  }

  function cloneLocationForDuplicate(
    location: CardLocation,
    targetContainer: BlockContainer,
    insertionIndex: number,
  ): CardLocation {
    if (targetContainer.type === 'flow-container-block') {
      return {
        id: `flow-location-${crypto.randomUUID()}`,
        type: 'flow-container-location',
        index: String(insertionIndex),
        align: location.type === 'flow-container-location' ? location.align : undefined,
      }
    }
    if (location.type === 'simple-container-location') {
      return { ...location, id: `simple-location-${crypto.randomUUID()}` }
    }
    return {
      id: `simple-location-${crypto.randomUUID()}`,
      type: 'simple-container-location',
      anchor: 'lt',
      x: '0',
      y: '0',
    }
  }

  return {
    blockTreeData,
    selectedBlock,
    selectedLocation,
    getBlockById,
    insertBlockAtRoot,
    exportSelectedBlockPayloads,
    pasteBlockPayloads,
    handleBlockSelection,
    handleBlockAction,
    handleBlockRenameCommit,
    handleBlockMove,
    selectBlockKeys: selectKeys,
    handleRootAction,
    handleViewportBlockClick,
    resolveVisibleBlockKey,
    clearSelection,
  }
}
