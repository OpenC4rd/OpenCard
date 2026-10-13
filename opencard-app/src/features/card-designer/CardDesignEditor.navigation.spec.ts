import { createResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import type { FileSystemService } from '../workspace/services/fileSystemService'
import type { CardDesignerSessionView, CardDesignerViewState } from './cardDesigner.types'
import { getTestSession } from '../editor-runtime/editorTestSession'
import { defineComponent, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCardFace,
  createFlowContainerBlock,
  createImageBlock,
  createSimpleContainerBlock,
  createTextBlock,
  setBlockProperty,
} from '../../entities/card/model'
import type { IconToken } from '../../shared/ui/icon/iconRegistry'
import type { SessionNavigationToken } from '../editor-runtime/model/editorIssue'
import * as notices from '../notifications/titlebarNotices'
import { fileSystemService } from '../workspace/services/fileSystemService'
import {
  cdeStub,
  createCdeDocument,
  editorTrees,
  editorViewport,
  emittedDocument,
  mountCde,
} from './cardDesignerMount'

type EditorHandle = {
  navigate: (value: SessionNavigationToken) => Promise<string>
  selectViewportBlock: (blockId: string) => void
  toggleActiveFace: () => void
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const heroFilePath = 'D:/Project/cards/hero.ocdocument'
const heroFileName = 'hero.ocdocument'
const flowFilePath = 'D:/Project/cards/flow.ocdocument'
const flowFileName = 'flow.ocdocument'
const neutralView = () => ({ activeFace: 'front' as const, clipToFace: false, selectedInstanceId: null })
const sessionView = (wrapper: Parameters<typeof getTestSession>[0]) => (getTestSession(wrapper).state.viewState['card-designer'] as CardDesignerSessionView).view as CardDesignerViewState

describe('CardDesignEditor issue navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exports the captured card and faces after props change, while preventing duplicate requests', async () => {
    let finish!: (path: string | null) => void
    const pick = vi.spyOn(fileSystemService, 'pickDirectory').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const bytes = new Uint8Array([1])
    const render = vi.fn().mockResolvedValue(new Map([['front', bytes], ['back', bytes]]))
    const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue()
    const wrapper = mountCde({ props: { fileName: 'hero.ocdocument', renderCardImages: render } })
    const editor = wrapper.vm as unknown as { onHeaderAction: (key: string) => Promise<void> }
    await editor.onHeaderAction('card-designer.toggle-mode')
    expect(getTestSession(wrapper).state.viewState['card-designer']).toMatchObject({ mode: 'data-table' })
    const pending = editor.onHeaderAction('render.both.2')
    await editor.onHeaderAction('render.both.2')
    expect(pick).toHaveBeenCalledTimes(1)
    getTestSession(wrapper).remapPath('other.ocdocument')
    getTestSession(wrapper).updateContent(JSON.stringify({ ...createCdeDocument(), name: 'Other' }))
    await nextTick()
    finish('D:/exports')
    await pending
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ document: expect.objectContaining({ name: 'Document' }) }), ['front', 'back'], 2, new Map([['front', 'D:/exports/hero_front.png'], ['back', 'D:/exports/hero_back.png']]))
    expect(write).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('runs table workbook actions through the editor and locks the open picker', async () => {
    const document = createCdeDocument()
    document.dataTable = { blocks: { 'text-1': ['content'] } }
    let finish!: (path: string | null) => void
    const pick = vi.spyOn(fileSystemService, 'pickSavePath').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockResolvedValue()
    const wrapper = mountCde({ props: { modelValue: document, cardDesignerMode: 'data-table' } })
    const editor = wrapper.vm as unknown as { onHeaderAction: (key: string) => Promise<void> }
    const pending = editor.onHeaderAction('card-designer.data-table.export')
    await editor.onHeaderAction('card-designer.data-table.export')
    expect(pick).toHaveBeenCalledTimes(1)
    finish('D:/table.xlsx')
    await pending
    const bytes = write.mock.calls[0]![1]
    vi.spyOn(fileSystemService, 'pickFile').mockResolvedValue('D:/table.xlsx')
    vi.spyOn(fileSystemService, 'readBinaryFile').mockResolvedValue(bytes)
    await editor.onHeaderAction('card-designer.data-table.import')
    expect(wrapper.findComponent({ name: 'DataTableWorkbookImportDialog' }).props('result')).toBeTruthy()
    wrapper.unmount()
  })

  it('does not render cancelled or unmounted requests and reports image write errors', async () => {
    const pick = vi.spyOn(fileSystemService, 'pickSavePath').mockResolvedValue(null)
    const render = vi.fn().mockRejectedValue(new Error('disk full'))
    const write = vi.spyOn(fileSystemService, 'writeBinaryFile').mockRejectedValue(new Error('disk full'))
    const notice = vi.spyOn(notices, 'notifyError').mockReturnValue(0)
    const wrapper = mountCde({ props: { renderCardImages: render } })
    const editor = wrapper.vm as unknown as { onHeaderAction: (key: string) => Promise<void> }
    await editor.onHeaderAction('render.current.0.5')
    expect(render).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    pick.mockResolvedValue('D:/export.png')
    await editor.onHeaderAction('render.current.0.5')
    expect(render).toHaveBeenCalledWith(expect.anything(), ['front'], 0.5, new Map([['front', 'D:/export.png']]))
    expect(notice).toHaveBeenCalledWith('disk full')
    let finish!: (path: string | null) => void
    pick.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = editor.onHeaderAction('render.current.1')
    wrapper.unmount()
    finish('D:/late.png')
    await pending
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('toggles structure containers through double-click activation', async () => {
    const wrapper = mountCde({
      stubs: {
        OcTree: cdeStub('OcTree', {
          props: { role: String, activationMode: String, expandedKeys: Array, tabNavigation: String },
          emits: ['node-activate'],
        }),
      },
    })
    const { structureTree } = editorTrees(wrapper)

    expect(structureTree.props('activationMode')).toBe('double-click')
    expect(structureTree.props('tabNavigation')).toBe('none')
    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await nextTick()
    expect(structureTree.props('expandedKeys')).toContain('container-1')

    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await nextTick()
    expect(structureTree.props('expandedKeys')).not.toContain('container-1')
  })

  it('shows a centered summary and hides single-block viewport controls for multiple selection', async () => {
    const wrapper = mountCde({
      stubs: {
        OcCard: false,
        OcTree: cdeStub('OcTree', {
          props: { role: String, selectedKeys: Array, selectionMode: String },
          emits: ['selection-change'],
        }),
        PropertyEditor: cdeStub('PropertyEditor', { className: 'property-editor-stub' }),
      },
    })
    const { structureTree } = editorTrees(wrapper)
    expect(structureTree.props('selectionMode')).toBe('multiple')

    structureTree.vm.$emit('selection-change', {
      triggerKey: 'text-1',
      selectedKeys: ['container-1', 'text-1'],
    })
    await nextTick()

    expect(wrapper.get('.card-design-editor__multi-selection-summary').text()).toBe('2 blocks selected')
    expect(wrapper.find('.property-editor-stub').exists()).toBe(false)
    const viewport = editorViewport(wrapper)
    expect(viewport.props('selectedBlockId')).toBeNull()
    expect(viewport.props('showInfo')).toBe(true)
    expect(wrapper.findAllComponents({ name: 'OcCard' }).map(card => card.props('title')).filter(Boolean))
      .toEqual(['Cards', 'Preview', 'Structure', 'Properties'])
    const propertyCard = wrapper.findAllComponents({ name: 'OcCard' }).find(card => card.props('title') === 'Properties')!
    expect(propertyCard.props('actions')).toEqual([])

    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()
    expect(viewport.props('selectedBlockId')).toBe('text-1')
    expect(wrapper.find('.property-editor-stub').exists()).toBe(true)
  })

  it('deletes a multiple structure selection through one shortcut action', async () => {
    const wrapper = mountCde({
      attachToBody: true,
      stubs: {
        OcTree: cdeStub('OcTree', {
          props: { role: String, selectedKeys: Array },
          emits: ['selection-change'],
        }),
      },
    })
    const { structureTree } = editorTrees(wrapper)
    structureTree.vm.$emit('selection-change', {
      triggerKey: 'text-1',
      selectedKeys: ['container-1', 'text-1'],
    })
    await nextTick()

    await wrapper.get('.card-design-editor').trigger('keydown', { key: 'Delete' })
    await nextTick()

    const updated = emittedDocument(wrapper)
    expect(updated.faces.front.children).toEqual([])
    expect(structureTree.props('selectedKeys')).toEqual([])
    wrapper.unmount()
  })

  it('selects the instance and block, forces tree reveal, and focuses the property field', async () => {
    const revealField = vi.fn().mockResolvedValue(true)
    const treePropSnapshots: Array<Record<string, unknown>> = []
    const wrapper = mountCde({
      props: {
        structureTreeSelectionBehavior: 'none',
        structureTreeScrollToSelection: false,
      },
      stubs: {
        PropertyEditor: cdeStub('PropertyEditor', { exposed: { revealField } }),
        OcTree: cdeStub('OcTree', {
          props: {
            role: String,
            selectedKeys: Array,
            selectionExpansionMode: String,
            scrollToSelection: Boolean,
          },
          onRender: props => treePropSnapshots.push({
            role: props.role,
            selectedKeys: [...(props.selectedKeys as string[] | undefined ?? [])],
            selectionExpansionMode: props.selectionExpansionMode,
            scrollToSelection: props.scrollToSelection,
          }),
        }),
      },
    })
    await nextTick()
    await nextTick()

    const token: SessionNavigationToken = {
      protocol: 'card-designer',
      version: 2,
      target: {
        kind: 'property',
        instanceId: 'instance-1',
        faceKey: 'front',
        blockId: 'text-1',
        owner: 'block',
        fieldKey: 'opacity',
        characterOffset: 4,
      },
    }
    const navigation = (wrapper.vm as unknown as EditorHandle).navigate(token)
    await nextTick()

    expect(treePropSnapshots).toContainEqual(expect.objectContaining({
      selectedKeys: ['text-1'],
      selectionExpansionMode: 'expand',
      scrollToSelection: true,
    }))
    await expect(navigation).resolves.toBe('success')
    expect(revealField).toHaveBeenCalledWith('text-1', 'opacity', 4)

    const { instanceTree } = editorTrees(wrapper)
    expect(instanceTree.props('selectedKeys')).toEqual(['instance-1'])
  })

  it('stops issue navigation at the outermost packaged container', async () => {
    const document = createCdeDocument()
    const container = document.faces.front.children[0]!.block
    if (container.type !== 'simple-container-block') throw new Error('Expected simple container')
    container.packaged = 'true'

    const revealField = vi.fn().mockResolvedValue(true)
    const wrapper = mountCde({
      props: { modelValue: document },
      stubs: {
        PropertyEditor: cdeStub('PropertyEditor', { exposed: { revealField } }),
        OcTree: cdeStub('OcTree', {
          props: { role: String, selectedKeys: Array, scrollToSelection: Boolean },
        }),
      },
    })
    await nextTick()
    await nextTick()

    const result = (wrapper.vm as unknown as EditorHandle).navigate({
      protocol: 'card-designer',
      version: 2,
      target: {
        kind: 'property',
        instanceId: null,
        faceKey: 'front',
        blockId: 'text-1',
        owner: 'block',
        fieldKey: 'content',
      },
    })

    await expect(result).resolves.toBe('not-found')
    await nextTick()
    const { structureTree } = editorTrees(wrapper)
    expect(structureTree.props('selectedKeys')).toEqual(['container-1'])
    expect(revealField).not.toHaveBeenCalled()
  })

  it('shows reset after an instance Block field is overridden', async () => {
    const wrapper = mountCde({
      props: {
        structureTreeSelectionBehavior: 'none',
        structureTreeScrollToSelection: false,
      },
      stubs: {
        PropertyEditor: cdeStub('PropertyEditor', {
          props: { inputs: Array },
          emits: ['update-property'],
          exposed: { revealField: vi.fn().mockResolvedValue(true) },
        }),
        OcTree: cdeStub('OcTree', {
          props: { role: String, selectedKeys: Array },
          emits: ['selection-change'],
        }),
      },
    })

    const { instanceTree, structureTree } = editorTrees(wrapper)
    instanceTree.vm.$emit('selection-change', {
      triggerKey: 'instance-1',
      selectedKeys: ['instance-1'],
    })
    structureTree.vm.$emit('selection-change', {
      triggerKey: 'text-1',
      selectedKeys: ['text-1'],
    })
    await nextTick()

    const propertyEditor = wrapper.findComponent({ name: 'PropertyEditor' })
    propertyEditor.vm.$emit('update-property', {
      key: 'text-1',
      fieldKey: 'content',
      value: 'Instance title',
    })
    await nextTick()

    const inputs = propertyEditor.props('inputs') as Array<{
      key: string
      fields: Record<string, { resettable?: boolean }>
    }>
    expect(inputs.find(input => input.key === 'text-1')?.fields.content?.resettable).toBe(true)
  })

  it('keeps data-table mode and reveals a block field Cell', async () => {
    const document = createCdeDocument()
    document.dataTable = { blocks: { 'text-1': ['content'] } }
    const revealCell = vi.fn().mockResolvedValue(true)
    const wrapper = mountCde({
      props: {
        modelValue: document,
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
      stubs: {
        CardDataTable: cdeStub('CardDataTable', {
          className: 'card-data-table-stub',
          exposed: { revealCell },
        }),
      },
    })
    await nextTick()

    const result = await (wrapper.vm as unknown as EditorHandle).navigate({
      protocol: 'card-designer',
      version: 2,
      target: {
        kind: 'property',
        instanceId: 'instance-1',
        faceKey: 'front',
        blockId: 'text-1',
        owner: 'block',
        fieldKey: 'content',
        characterOffset: 2,
      },
    })

    expect(result).toBe('success')
    expect(revealCell).toHaveBeenCalledWith('instance-1', 'text-1', 'content', 2)
    expect(wrapper.find('.card-data-table-stub').exists()).toBe(true)
    const viewUpdates = sessionView(wrapper)
    expect(viewUpdates).toMatchObject({
      selectedInstanceId: 'instance-1',
    })
  })

  it('marks a data-table instance Cell as resettable after editing it', async () => {
    const document = createCdeDocument()
    document.dataTable = { blocks: { 'text-1': ['content'] } }
    const wrapper = mountCde({
      props: { modelValue: document, cardDesignerMode: 'data-table' },
      stubs: {
        CardDataTable: cdeStub('CardDataTable', {
          props: { faceGroups: Array },
          emits: ['update-cell'],
        }),
      },
    })
    const table = wrapper.findComponent({ name: 'CardDataTable' })
    table.vm.$emit('update-cell', {
      cardId: 'instance-1',
      blockId: 'text-1',
      fieldKey: 'content',
      value: 'Instance title',
    })
    await nextTick()

    const faceGroups = table.props('faceGroups') as Array<{
      blocks: Array<{ fields: Array<{ cells: Array<{ cardId: string; overridden: boolean }> }> }>
    }>
    const instanceCell = faceGroups[0]?.blocks[0]?.fields[0]?.cells
      .find(cell => cell.cardId === 'instance-1')
    expect(instanceCell?.overridden).toBe(true)
  })

  it('returns from data-table mode to PropertyEditor for a non-block issue', async () => {
    const revealField = vi.fn().mockResolvedValue(true)
    const wrapper = mountCde({
      props: {
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
      stubs: {
        PropertyEditor: cdeStub('PropertyEditor', {
          className: 'property-editor-stub',
          exposed: { revealField },
        }),
      },
    })
    await nextTick()

    const navigation = (wrapper.vm as unknown as EditorHandle).navigate({
      protocol: 'card-designer',
      version: 2,
      target: {
        kind: 'property',
        instanceId: null,
        faceKey: null,
        owner: 'document',
        fieldKey: 'version',
      },
    })
    await nextTick()
    expect(getTestSession(wrapper).state.viewState['card-designer']).toMatchObject({ mode: 'design' })
    getTestSession(wrapper).updateViewState('card-designer', { mode: 'design' })
    await nextTick()
    const result = await navigation

    expect(result).toBe('success')
    expect(revealField).toHaveBeenCalledWith('document-1', 'version', undefined)
    expect(wrapper.find('.property-editor-stub').exists()).toBe(true)
  })

  it('projects relative file, blueprint, and instance information for the viewport', async () => {
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
        resourceRootPath: 'D:/Project',
      },
      stubs: { CardViewport: false },
    })
    await nextTick()

    const infoValues = () => wrapper.findAll('.card-design-editor__card-info > span')
      .map((item) => item.text())
    expect(infoValues()).toEqual([
      'cards/hero.ocdocument',
      'Document @ 1.0.0',
      '"Reusable hero\ncard."',
      '1 instances',
      'Front Face',
      '2 blocks',
      'Review print\nmargins.',
    ])
    expect(wrapper.findAll('.card-design-editor__card-info > span')
      .every(item => item.attributes('data-tooltip') === undefined)).toBe(true)
    expect(wrapper.findAll('.card-design-editor__card-info > .is-group-separated').map((item) => item.text()))
      .toEqual(['Front Face', 'Review print\nmargins.'])

    getTestSession(wrapper).updateViewState('card-designer', { view: { ...neutralView(), selectedInstanceId: 'instance-1' } })
    await nextTick()
    await nextTick()

    expect(infoValues()).toEqual([
      'cards/hero.ocdocument',
      'Document @ 1.0.0',
      '"Reusable hero\ncard."',
      '1 instances',
      '"Instance 1" (1 of 1)',
      'Front Face',
      '2 blocks',
      'Review print\nmargins.',
    ])
    expect(wrapper.findAll('.card-design-editor__card-info > .is-group-separated').map((item) => item.text()))
      .toEqual(['"Instance 1" (1 of 1)', 'Front Face', 'Review print\nmargins.'])
  })

  it('switches face and clipping through session state without modifying the document', async () => {
    const wrapper = mountCde({
      props: {
        filePath: 'draft://53e4786d-a867-4a8c-b235-cbedb03ea801',
        fileName: 'UNTITLED.ocdocument',
        cardDesignerView: { ...neutralView(), activeFace: 'back' },
        alignmentSnappingEnabledByDefault: false,
      },
    })
    await nextTick()
    await nextTick()

    const viewport = editorViewport(wrapper)
    expect(viewport.props('face')).toEqual(expect.objectContaining({ faceKey: 'back' }))
    expect(viewport.props('clipToFace')).toBe(false)
    expect(viewport.props('alignmentSnappingEnabled')).toBe(false)
    expect(wrapper.find('.card-viewport-stub').text()).toContain('UNTITLED.ocdocument')
    expect(wrapper.find('.card-viewport-stub').text()).not.toContain('53e4786d-a867')

    const actions = wrapper.findAllComponents({ name: 'OcActionButton' })
    const toolbar = wrapper.findComponent({ name: 'OcOverlayToolbar' })
    const toolbarItems = toolbar.props('items') as readonly unknown[]
    expect(toolbarItems).toHaveLength(8)
    expect(toolbarItems[1]).toBe('100%')
    expect(toolbarItems[4]).toEqual({ type: 'divider', key: 'viewport-actions' })
    const faceAction = actions.find((action) => action.props('action').key === 'switch-face')
    const clipAction = actions.find((action) => action.props('action').key === 'toggle-face-clip')
    const alignmentSnappingAction = actions.find(
      action => action.props('action').key === 'toggle-alignment-snapping',
    )
    expect(faceAction?.props('variant')).toBe('ghost')
    expect(faceAction?.props('size')).toBe('sm')
    expect(faceAction?.props('iconSize')).toBe('action')
    expect(faceAction?.props('action').icon).toBe('tool.flip-to-back')
    expect(clipAction?.props('variant')).toBe('ghost')
    expect(clipAction?.props('active')).toBe(false)
    expect(clipAction?.props('size')).toBe('sm')
    expect(clipAction?.props('iconSize')).toBe('action')
    expect(clipAction?.props('action').icon).toBe('tool.box-cutter-off')
    expect(alignmentSnappingAction?.props('variant')).toBe('ghost')
    expect(alignmentSnappingAction?.props('active')).toBe(false)
    expect(alignmentSnappingAction?.props('size')).toBe('sm')
    expect(alignmentSnappingAction?.props('iconSize')).toBe('action')
    expect(alignmentSnappingAction?.props('action').icon).toBe('tool.snap-grid')
    faceAction?.vm.$emit('select', { key: 'switch-face' })
    clipAction?.vm.$emit('select', { key: 'toggle-face-clip' })
    alignmentSnappingAction?.vm.$emit('select', { key: 'toggle-alignment-snapping' })
    await nextTick()

    expect(faceAction?.props('action').icon).toBe('tool.flip-to-front')
    expect(clipAction?.props('action').icon).toBe('tool.box-cutter')
    expect(clipAction?.props('variant')).toBe('soft')
    expect(clipAction?.props('active')).toBe(true)
    expect(clipAction?.props('action').iconTone).toBeUndefined()
    expect(alignmentSnappingAction?.props('variant')).toBe('soft')
    expect(alignmentSnappingAction?.props('active')).toBe(true)
    expect(alignmentSnappingAction?.props('action').iconTone).toBeUndefined()
    expect(alignmentSnappingAction?.props('action').icon).toBe('tool.snap-grid-on')
    expect(viewport.props('alignmentSnappingEnabled')).toBe(true)

    const viewUpdates = sessionView(wrapper)
    expect(viewUpdates).toEqual({
      activeFace: 'front',
      clipToFace: true,
      alignmentSnappingEnabled: true,
      selectedInstanceId: null,
      selectedBlockIdsByFace: { front: [], back: [] },
    })
    expect(getTestSession(wrapper).state.isDirty).toBe(false)
    expect(getTestSession(wrapper).state.isDirty).toBe(false)

    viewport.vm.$emit('face-dimension-change', { dimension: 'width', value: 600, final: false })
    viewport.vm.$emit('face-dimension-change', { dimension: 'width', value: 600, final: true })
    await nextTick()
    expect(emittedDocument(wrapper).width).toBe('600')
    expect(getTestSession(wrapper).state.isDirty).toBe(true)
  })

  it('keeps independent block selections for each face', async () => {
    const document = createCdeDocument()
    document.faces.back = createCardFace({
      id: 'face-back',
      children: [{
        block: createTextBlock({ id: 'back-text-1', name: 'Back title', content: 'Back' }),
        location: { id: 'back-location-1', type: 'simple-container-location', anchor: 'lt' },
      }],
    })
    const wrapper = mountCde({
      props: { modelValue: document },
      stubs: {
        CardViewport: cdeStub('CardViewport', { emits: ['block-click'] }),
      },
    })
    await nextTick()

    const editor = wrapper.vm as unknown as EditorHandle
    editor.selectViewportBlock('text-1')
    await nextTick()
    const selectionBefore = sessionView(wrapper)
    editor.selectViewportBlock('text-1')
    await nextTick()
    expect(sessionView(wrapper)).toEqual(selectionBefore)
    editor.toggleActiveFace()
    await nextTick()
    const updates = sessionView(wrapper)
    const backState = updates as { selectedBlockIdsByFace?: Record<string, string[]> }
    expect(backState.selectedBlockIdsByFace).toEqual({ front: ['text-1'], back: [] })
    editor.selectViewportBlock('back-text-1')
    await nextTick()
    const latest = sessionView(wrapper) as { selectedBlockIdsByFace?: Record<string, string[]> }
    expect(latest.selectedBlockIdsByFace).toEqual({ front: ['text-1'], back: ['back-text-1'] })
  })

  it('fills a simple-container child without changing its anchor', async () => {
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
      },
      stubs: {
        CardViewport: cdeStub('CardViewport', {
          props: { selectedBlockId: String },
          emits: ['block-click', 'selection-action'],
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()
    expect(viewport.props('selectedBlockId')).toBe('text-1')

    viewport.vm.$emit('selection-action', {
      type: 'fill-parent', blockId: 'text-1', width: true, height: true,
    })
    await nextTick()

    const document = emittedDocument(wrapper)
    const container = document.faces.front.children[0]!.block
    expect(container.type).toBe('simple-container-block')
    if (container.type !== 'simple-container-block') return
    const child = container.children[0]!
    expect(child.block).toMatchObject({ width: '100%', height: '100%' })
    expect(child.location).toMatchObject({ anchor: 'lt', x: '0px', y: '0px' })
  })

  it('projects rich-text selection Actions and activates the existing content field editor', async () => {
    const activateField = vi.fn(async () => true)
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
      },
      stubs: {
        CardViewport: cdeStub('CardViewport', {
          props: { selectedBlockId: String, selectionCommandActions: Array },
          emits: ['block-click', 'selection-command'],
        }),
        PropertyEditor: cdeStub('PropertyEditor', {
          className: 'property-editor-stub',
          exposed: { activateField, revealField: vi.fn(async () => true) },
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()
    expect(viewport.props('selectionCommandActions')).toEqual([{
      key: 'content.edit-rich-text',
      icon: 'format.text-variant-outline',
      title: 'Edit rich text',
    }])

    viewport.vm.$emit('selection-command', {
      key: 'content.edit-rich-text',
      blockId: 'text-1',
    })
    await nextTick()
    expect(activateField).toHaveBeenCalledWith('text-1', 'content')
  })

  it('projects four Flow Container direction Actions and writes each direction through Block commands', async () => {
    const source = createCdeDocument()
    source.faces.front.children[0]!.block = createFlowContainerBlock({
      id: 'flow-1',
      direction: 'lr',
    })
    const wrapper = mountCde({
      props: {
        filePath: flowFilePath,
        fileName: flowFileName,
        modelValue: source,
      },
      stubs: {
        CardViewport: cdeStub('CardViewport', {
          props: { selectedBlockId: String, selectionCommandActions: Array },
          emits: ['block-click', 'selection-command'],
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'flow-1', new MouseEvent('click'))
    await nextTick()
    expect(viewport.props('selectionCommandActions')).toEqual([
      { key: 'flow.direction.left', icon: 'nav.arrow-left', iconTone: 'default', title: 'Flow left' },
      { key: 'flow.direction.up', icon: 'nav.arrow-up', iconTone: 'default', title: 'Flow up' },
      { key: 'flow.direction.down', icon: 'nav.arrow-down', iconTone: 'default', title: 'Flow down' },
      { key: 'flow.direction.right', icon: 'nav.arrow-right', iconTone: 'accent', title: 'Flow right' },
    ])

    const directions = [
      ['flow.direction.left', 'rl'],
      ['flow.direction.up', 'bt'],
      ['flow.direction.down', 'tb'],
      ['flow.direction.right', 'lr'],
    ] as const
    for (const [key, direction] of directions) {
      viewport.vm.$emit('selection-command', { key, blockId: 'flow-1' })
      await nextTick()
      expect(emittedDocument(wrapper).faces.front.children[0]!.block).toMatchObject({ direction })
    }
  })

  it('restores the session viewport without refitting content updates', async () => {
    const fitView = vi.fn()
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
        viewportTransform: { x: 80, y: -40, scale: 2 },
      },
      stubs: {
        CardViewport: cdeStub('CardViewport', {
          props: { transform: Object },
          emits: ['viewport-size-change'],
          exposed: { fitView },
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    expect(viewport.props('transform')).toEqual({ x: 80, y: -40, scale: 2 })
    viewport.vm.$emit('viewport-size-change', { width: 1000, height: 800 })
    await nextTick()
    expect(fitView).not.toHaveBeenCalled()

    const updatedDocument = createCdeDocument({ name: 'Updated Document' })
    getTestSession(wrapper).updateContent(JSON.stringify(updatedDocument))
    await nextTick()
    expect(fitView).not.toHaveBeenCalled()

    getTestSession(wrapper).remapPath('D:/Project/cards/other.ocdocument')
    await nextTick()
    expect(fitView).not.toHaveBeenCalled()
  })

  it('maps canvas keyboard shortcuts to viewport selection commands', async () => {
    const nudgeSelection = vi.fn(() => true)
    const runSelectionQuickAction = vi.fn(() => true)
    const zoomBy = vi.fn()
    const fitView = vi.fn()
    const flashStatus = vi.fn()
    const stepLayer = vi.fn()
    const focusLayerBlock = vi.fn()
    const getFocusedLayerBlockId = vi.fn(() => 'container-1')
    const cycleLayerByInitial = vi.fn(() => true)
    const source = createCdeDocument()
    setBlockProperty(source.faces.front.children[0]!.block, 'zIndex', '2')
    const wrapper = mountCde({
      attachToBody: true,
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
        modelValue: source,
      },
      stubs: {
        CardViewport: defineComponent({
          name: 'CardViewport',
          props: {
            selectedBlockId: String,
            selectionActionLabels: Object,
            layerViewActive: Boolean,
            spaceModifierActive: Boolean,
            layerViewShortcutLegendLabel: String,
            layerViewShortcutHints: Array,
            face: Object,
          },
          emits: ['block-click', 'blank-click', 'z-index-step'],
          setup(_, { expose }) {
            expose({
              zoomBy,
              fitView,
              flashStatus,
              nudgeSelection,
              runSelectionQuickAction,
              stepLayer,
              focusLayerBlock,
              getFocusedLayerBlockId,
              cycleLayerByInitial,
            })
            return {}
          },
          template: '<div class="card-viewport-stub"><input class="shortcut-input" /></div>',
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()

    const labels = viewport.props('selectionActionLabels') as Record<string, string>
    expect(labels).toMatchObject({
      fillParent: 'Fill parent [key]F[/key]',
      centerInParent: 'Center in parent [key]C[/key]',
      inset: 'Inset 10 px [key]I[/key]',
      outset: 'Outset 10 px [key]O[/key]',
    })
    expect(viewport.props('layerViewShortcutLegendLabel')).toBe('Layer view shortcuts')
    expect(viewport.props('layerViewShortcutHints')).toEqual([
      {
        keys: [{ icon: 'input.mouse-scroll-wheel' }, { separator: 'or' }, '↑ / ↓'],
        label: 'Step through planes',
      },
      {
        keys: [
          { icon: 'input.keyboard-shift' },
          { icon: 'input.mouse-scroll-wheel' },
          { separator: 'or' },
          '↑ / ↓',
        ],
        label: 'Jump between layers',
      },
      { keys: ['A-Z'], label: 'Cycle by name or Pinyin initial' },
      {
        keys: [{ icon: 'input.keyboard-shift' }, 'A-Z'],
        label: 'Cycle names or Pinyin in current layer',
      },
      { keys: [{ icon: 'input.keyboard-space' }], label: 'Select the focused plane' },
      {
        keys: [
          { icon: 'input.keyboard-space' },
          { icon: 'input.mouse-scroll-wheel' },
          { separator: 'or' },
          '↑ / ↓',
        ],
        label: 'Adjust zIndex',
      },
      {
        keys: [
          { icon: 'input.keyboard-shift' },
          { icon: 'input.keyboard-space' },
          { icon: 'input.mouse-scroll-wheel' },
          { separator: 'or' },
          '↑ / ↓',
        ],
        label: 'Switch to an existing layer',
      },
    ])

    const root = wrapper.get('.card-design-editor')
    await root.trigger('keydown', { key: 'Tab' })
    expect(viewport.props('layerViewActive')).toBe(true)
    expect(wrapper.get('.card-design-editor__stage').classes()).toContain('is-layer-view-active')
    await root.trigger('keydown', { key: 'ArrowUp' })
    await root.trigger('keydown', { key: 'a' })
    await root.trigger('keydown', { key: 's' })
    await root.trigger('keydown', { key: 'x' })
    await root.trigger('keydown', { key: 'b' })
    expect(stepLayer).toHaveBeenCalledWith(-1, false)
    expect(cycleLayerByInitial.mock.calls).toEqual([['a', false], ['s', false], ['x', false], ['b', false]])
    expect(runSelectionQuickAction).not.toHaveBeenCalled()

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab' }))
    await root.trigger('keydown', { key: ' ', code: 'Space' })
    await nextTick()
    expect(viewport.props('selectedBlockId')).toBe('container-1')
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }))
    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    getFocusedLayerBlockId.mockReturnValue('text-1')
    await nextTick()

    await root.trigger('keydown', { key: ' ', code: 'Space' })
    await root.trigger('keydown', { key: 'ArrowUp' })
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }))
    await nextTick()
    const projectedFace = viewport.props('face') as {
      children: Array<{ block: { children: Array<{ block: { zIndex: number } }> } }>
    }
    expect(projectedFace.children[0]?.block.children[0]?.block.zIndex).toBe(1)
    expect(focusLayerBlock).toHaveBeenCalledWith('text-1')

    viewport.vm.$emit('z-index-step', { delta: -1, existingLayersOnly: false })
    await nextTick()
    const wheelAdjustedFace = viewport.props('face') as {
      children: Array<{ block: { children: Array<{ block: { zIndex: number } }> } }>
    }
    expect(wheelAdjustedFace.children[0]?.block.children[0]?.block.zIndex).toBe(0)

    await root.trigger('keydown', { key: 'ArrowRight' })
    await root.trigger('keydown', { key: 'f' })
    expect(nudgeSelection).toHaveBeenCalledWith(1, 0)
    expect(runSelectionQuickAction).toHaveBeenCalledWith('fill-parent')

    await root.trigger('keydown', { key: '0', ctrlKey: true })
    await root.trigger('keydown', { key: '+', ctrlKey: true, shiftKey: true })
    await root.trigger('keydown', { key: '-', ctrlKey: true })
    expect(fitView).toHaveBeenCalledTimes(1)
    expect(zoomBy.mock.calls).toEqual([[1.25], [0.8]])

    await root.trigger('keydown', { key: 'd', ctrlKey: true })
    await nextTick()
    const duplicatedFace = viewport.props('face') as {
      children: Array<{ block: { children: Array<{ block: { id: string } }> } }>
    }
    expect(duplicatedFace.children[0]?.block.children).toHaveLength(2)
    const duplicateViewUpdates = sessionView(wrapper)
    const duplicateViewState = duplicateViewUpdates as unknown as {
      selectedBlockIdsByFace: Record<string, string[]>
    }
    expect(duplicateViewState.selectedBlockIdsByFace.front)
      .toEqual([duplicatedFace.children[0]?.block.children[1]?.block.id])
    await root.trigger('keydown', { key: 'Delete' })
    await nextTick()
    const restoredFace = viewport.props('face') as {
      children: Array<{ block: { children: Array<{ block: { id: string } }> } }>
    }
    expect(restoredFace.children[0]?.block.children).toHaveLength(1)

    // 选择变化会提交视图状态：Delete 清空该面的块选择。
    const selectionViewUpdates = sessionView(wrapper)
    const clearedViewState = selectionViewUpdates as unknown as {
      selectedBlockIdsByFace: Record<string, string[]>
    }
    expect(clearedViewState.selectedBlockIdsByFace).toEqual({ front: [], back: [] })
    await root.trigger('keydown', { key: 's' })
    const snappingEvents = sessionView(wrapper)
    const snappingUpdate = snappingEvents as {
      alignmentSnappingEnabled: boolean
    }
    await root.trigger('keydown', { key: 's' })
    await root.trigger('keydown', { key: 'x' })
    await root.trigger('keydown', { key: 'b' })
    expect(sessionView(wrapper)).toMatchObject({
      alignmentSnappingEnabled: !snappingUpdate.alignmentSnappingEnabled, clipToFace: true, activeFace: 'back',
    })
    expect(flashStatus.mock.calls).toEqual(expect.arrayContaining([
      [{ icon: 'tool.snap-grid-on', message: 'Alignment snapping enabled' }],
      [{ icon: 'tool.snap-grid', message: 'Alignment snapping disabled' }],
      [{ icon: 'tool.box-cutter', message: 'Face clipping enabled' }],
      [{ icon: 'tool.flip-to-back', message: 'Switched to back face' }],
    ]))

    await wrapper.get('.shortcut-input').trigger('keydown', { key: 'ArrowLeft' })
    expect(nudgeSelection).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(viewport.props('layerViewActive')).toBe(false)
    wrapper.unmount()
  })

  it('fills and centers a flow child only on the cross axis', async () => {
    const source = createCdeDocument()
    source.faces.front.children[0]!.block = createFlowContainerBlock({
      id: 'flow-1',
      direction: 'lr',
      children: [{
        block: createTextBlock({ id: 'flow-text', width: '120px', height: '40px' }),
        location: { id: 'flow-location', type: 'flow-container-location', index: '0', align: 'start' },
      }],
    })
    const wrapper = mountCde({
      props: {
        filePath: flowFilePath,
        fileName: flowFileName,
        modelValue: source,
      },
      stubs: {
        CardViewport: cdeStub('CardViewport', { emits: ['block-click', 'selection-action'] }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'flow-text', new MouseEvent('click'))
    await nextTick()
    viewport.vm.$emit('selection-action', { type: 'fill-cross-axis', blockId: 'flow-text' })
    await nextTick()

    let document = emittedDocument(wrapper)
    let flow = document.faces.front.children[0]!.block
    expect(flow.type).toBe('flow-container-block')
    if (flow.type !== 'flow-container-block') return
    expect(flow.children[0]!.block).toMatchObject({ width: '120px', height: '100%' })
    expect(flow.children[0]!.location.align).toBe('justify')

    viewport.vm.$emit('selection-action', { type: 'center-cross-axis', blockId: 'flow-text' })
    await nextTick()
    document = emittedDocument(wrapper)
    flow = document.faces.front.children[0]!.block
    if (flow.type !== 'flow-container-block') return
    expect(flow.children[0]!.location.align).toBe('center')
  })

  it('keeps face tools visible and right-aligned with expanded docks', async () => {
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
        cardDesignerLayout: {
          leftTopHeight: null,
          rightTopHeight: null,
          leftDockExtent: 280,
          rightDockExtent: 280,
          leftExpandedDockExtent: 280,
          rightExpandedDockExtent: 280,
        },
      },
      stubs: { OcCard: false, OcOverlayToolbar: false },
    })
    await nextTick()

    const tools = wrapper.get('.card-design-editor__face-tools')
    expect(tools.classes()).not.toContain('is-right-sidebar-collapsed')
    expect((tools.element as HTMLElement).style.right).toBe('292px')
    expect(tools.classes()).toContain('oc-overlay-toolbar')
    expect(tools.findAllComponents({ name: 'OcActionButton' })).toHaveLength(6)
  })

  it('projects symmetric Dock extent updates without CSS variable state machines', async () => {
    const wrapper = mountCde({
      props: {
        filePath: heroFilePath,
        fileName: heroFileName,
      },
    })
    await nextTick()

    const docks = wrapper.findAllComponents({ name: 'CdeOverlayDock' })
    expect(docks).toHaveLength(2)
    expect(docks[0]?.props('widthTooltip'))
      .toBe('Resize left sidebar[br]Double-click to quickly toggle expand or collapse')
    expect(docks[1]?.props('widthTooltip'))
      .toBe('Resize right sidebar[br]Double-click to quickly toggle expand or collapse')
    expect(docks[0]?.props('extent')).toBe(280)
    expect(docks[1]?.props('extent')).toBe(280)

    docks[0]?.vm.$emit('update:extent', 120)
    await nextTick()
    expect(docks[0]?.props('extent')).toBe(120)
    expect((getTestSession(wrapper).state.viewState['card-designer'] as CardDesignerSessionView).layout).toBeUndefined()
    expect(editorViewport(wrapper).props('viewportInsets')).toMatchObject({
      left: expect.closeTo(120 + 6 * (120 / 280)),
      right: 286,
    })

    docks[0]?.vm.$emit('update:extent', 420)
    docks[0]?.vm.$emit('resize-end', 'width')
    await nextTick()
    expect((getTestSession(wrapper).state.viewState['card-designer'] as CardDesignerSessionView).layout).toMatchObject({
      leftDockExtent: 420,
      leftExpandedDockExtent: 420,
    })

    docks[1]?.vm.$emit('update:extent', 0)
    await nextTick()
    expect(docks[1]?.props('extent')).toBe(0)
    expect(editorViewport(wrapper).props('viewportInsets')).toMatchObject({
      right: 0,
    })
  })

  it('renders the Card Designer mode controlled by its prop', async () => {
    const wrapper = mountCde({
      props: {
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
    })
    await nextTick()

    const table = wrapper.findComponent({ name: 'CardDataTable' })
    expect(table.exists()).toBe(true)
    expect((table.props('faceGroups') as Array<{ blocks: unknown[] }>)[0]?.blocks).toEqual([])
    expect(wrapper.get('.card-design-editor__stage-layer').classes()).toContain('is-data-table-mode')

    table.vm.$emit('add-block', 'text-1')
    await nextTick()
    expect(emittedDocument(wrapper).dataTable?.blocks).toEqual({ 'text-1': [] })
    table.vm.$emit('include-field', 'text-1', 'content')
    await nextTick()
    const configuredGroups = table.props('faceGroups') as Array<{
      blocks: Array<{ key: string; fields: Array<{ key: string }> }>
    }>
    expect(configuredGroups[0]?.blocks).toEqual([
      expect.objectContaining({ key: 'text-1', fields: [expect.objectContaining({ key: 'content' })] }),
    ])
    expect(emittedDocument(wrapper).dataTable?.blocks).toEqual({ 'text-1': ['content'] })
    expect(getTestSession(wrapper).state.isDirty).toBe(true)

    getTestSession(wrapper).updateViewState('card-designer', { mode: 'design' })
    await nextTick()
    await nextTick()
    expect(wrapper.get('.card-design-editor__stage-layer').classes()).not.toContain('is-data-table-mode')
    expect(wrapper.get('.card-design-editor__data-table-view').classes()).not.toContain('is-active')
    expect(wrapper.findComponent({ name: 'OcOptionGroup' }).exists()).toBe(false)
  })

  it('keeps delete as a stable toggle and uses one property sort action', async () => {
    const wrapper = mountCde({
      stubs: { PropertyEditor: false },
    })
    await nextTick()

    const propertyCard = wrapper.findAllComponents({ name: 'OcCard' })
      .find(card => card.props('title') === 'Properties')!
    const getAction = (key: string) => (propertyCard.props('actions') as Array<{
      key: string
      icon: IconToken
      disabled?: boolean
    }>).find(action => action.key === key)!
    const propertyEditor = wrapper.getComponent({ name: 'PropertyEditor' })

    expect(getAction('toggle-property-sort').icon).toBe('action.sort-alphabetical-ascending')
    propertyCard.vm.$emit('action', { key: 'toggle-property-sort' })
    await nextTick()
    expect(propertyEditor.props('sortMode')).toBe('alphabetical')
    expect(getAction('toggle-property-sort').icon).toBe('action.sort-category')

    propertyCard.vm.$emit('action', { key: 'toggle-property-delete-mode' })
    await nextTick()
    expect(propertyEditor.props('deleteMode')).toBe(true)
    expect(wrapper.findAllComponents({ name: 'PropertyFieldActionRail' })
      .some(rail => rail.props('actions')?.some(
        (action: { key: string }) => action.key === 'delete-property',
      ))).toBe(true)
    expect(getAction('toggle-property-delete-mode').disabled).toBeUndefined()

  })

  it('creates a custom field for the explicit table Block and persists it in the document', async () => {
    const document = createCdeDocument()
    document.dataTable = { blocks: { 'text-1': [] } }
    const wrapper = mountCde({
      props: {
        modelValue: document,
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
    })
    await nextTick()

    wrapper.getComponent({ name: 'CardDataTable' }).vm.$emit('create-field', 'text-1')
    await nextTick()
    const dialog = wrapper.getComponent({ name: 'AdditionalFieldCreateDialog' })
    expect(dialog.props('open')).toBe(true)
    expect(dialog.props('fieldTypes')).toEqual([
      'string', 'filePath', 'anchorPosition', 'alignPosition', 'verticalAlignPosition',
      'flowDirection', 'number', 'boolean', 'color',
    ])
    dialog.vm.$emit('update-field-key', 'score')
    dialog.vm.$emit('update-field-type', 'number')
    dialog.vm.$emit('update-title', 'Score')
    await nextTick()
    dialog.vm.$emit('submit', { fieldType: 'number', title: 'Score' })
    await nextTick()

    const updatedDocument = emittedDocument(wrapper)
    const textBlock = (updatedDocument.faces.front.children[0]!.block as ReturnType<typeof createSimpleContainerBlock>)
      .children[0]!.block
    expect(textBlock.additionalFieldDefinition?.score).toMatchObject({ fieldType: 'number', title: 'Score' })

    expect(updatedDocument.dataTable?.blocks).toEqual({ 'text-1': ['score'] })
    expect(dialog.props('open')).toBe(false)
  })

  it('builds binding completion from each data-table column card', async () => {
    const document = createCdeDocument()
    document.dataTable = { blocks: { 'text-1': ['content'] } }
    const wrapper = mountCde({
      props: {
        modelValue: document,
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
    })
    await nextTick()

    const table = wrapper.findComponent({ name: 'CardDataTable' })
    const faceGroups = table.props('faceGroups') as Array<{
      blocks: Array<{
        key: string
        fields: Array<{
          key: string
          definition: Record<string, unknown>
          cells: Array<{ cardId: string; identity: string }>
        }>
      }>
    }>
    const content = faceGroups[0]?.blocks.find(block => block.key === 'text-1')
      ?.fields.find(field => field.key === 'content')
    expect(content).toBeDefined()
    const getDefinition = table.props('getCellDefinition') as (
      blockId: string,
      field: typeof content,
      cell: NonNullable<typeof content>['cells'][number],
    ) => { completion?: { provider?: (request: { value: string; cursor: number }) => unknown } }
    const completionItems = async (cellIndex: number) => {
      const definition = getDefinition('text-1', content, content!.cells[cellIndex]!)
      const result = await Promise.resolve(definition.completion?.provider?.({ value: '{{card:}}', cursor: 7 })) as {
        items?: Array<{ insertText: string }>
      } | null
      return result?.items?.map(item => item.insertText) ?? []
    }

    expect(await completionItems(0)).toContain('card:version')
    expect(await completionItems(1)).not.toContain('card:version')
    expect(await completionItems(1)).toContain('card:name')
  })

  it('provides file and font completion to data-table Cells', async () => {
    const document = createCdeDocument()
    document.faces.front.children.push({
      block: createImageBlock({ id: 'image-1', name: 'Portrait', source: '' }),
      location: { id: 'location-image', type: 'simple-container-location', anchor: 'lt' },
    })
    document.dataTable = {
      blocks: {
        'text-1': ['content', 'fontFamily'],
        'image-1': ['source'],
      },
    }
    const readDirectoryEntries = vi.spyOn(fileSystemService, 'readDirectoryEntries').mockResolvedValue([{
      name: 'portrait.png',
      isDirectory: false,
      isFile: true,
      isSymlink: false,
    }])
    const resourceEnvironment = await createResourceEnvironment('D:/Project', { watch: false, snapshotsRoot: 'D:/cache', fs: { fileExists: async () => false } as unknown as FileSystemService })
    const wrapper = mountCde({
      props: {
        filePath: 'D:/Project/cards/card.ocdocument',
        resourceRootPath: 'D:/Project', resourceEnvironment,
        modelValue: document,
        cardDesignerMode: 'data-table',
        cardDesignerView: neutralView(),
      },
    })
    await nextTick()

    const table = wrapper.findComponent({ name: 'CardDataTable' })
    const faceGroups = table.props('faceGroups') as Array<{
      blocks: Array<{
        key: string
        fields: Array<{
          key: string
          cells: Array<{ cardId: string; identity: string }>
        }>
      }>
    }>
    const getDefinition = table.props('getCellDefinition') as (
      blockId: string,
      field: { key: string; cells: Array<{ cardId: string; identity: string }> },
      cell: { cardId: string; identity: string },
    ) => {
      completion?: { provider?: (request: { value: string; cursor: number }) => unknown }
      directoryProvider?: (directory: string) => Promise<Array<{ name: string }>>
      fontOptions?: Array<{ value: string }>
    }
    const textBlock = faceGroups[0]!.blocks.find(block => block.key === 'text-1')!
    const fontField = textBlock.fields.find(field => field.key === 'fontFamily')!
    const fontDefinition = getDefinition('text-1', fontField, fontField.cells[0]!)
    const fontResult = await Promise.resolve(fontDefinition.completion?.provider?.({ value: 'Arial', cursor: 5 })) as {
      items?: Array<{ value?: string }>
    } | null
    const contentField = textBlock.fields.find(field => field.key === 'content')!
    const contentDefinition = getDefinition('text-1', contentField, contentField.cells[0]!)

    const imageBlock = faceGroups[0]!.blocks.find(block => block.key === 'image-1')!
    const imageField = imageBlock.fields.find(field => field.key === 'source')!
    const imageDefinition = getDefinition('image-1', imageField, imageField.cells[0]!)
    const imageEntries = await imageDefinition.directoryProvider?.('')

    expect(fontResult?.items).toEqual([])
    expect(contentDefinition.fontOptions).toEqual([])
    expect(imageEntries?.map(item => item.name)).toContain('portrait.png')
    expect(readDirectoryEntries).toHaveBeenCalledWith('D:/Project', 1)
    readDirectoryEntries.mockRestore(); wrapper.unmount(); await resourceEnvironment.dispose()
  })
})
