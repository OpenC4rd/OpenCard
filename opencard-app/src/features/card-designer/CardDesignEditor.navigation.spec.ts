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

type FaceBlockShape = {
  children: Array<{ block: { children: Array<{ block: { id: string, zIndex: number } }> } }>
}

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
          props: { role: String, expandedKeys: Array },
          emits: ['node-activate'],
        }),
      },
    })
    const { structureTree } = editorTrees(wrapper)

    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await nextTick()
    expect(structureTree.props('expandedKeys')).toContain('container-1')

    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await nextTick()
    expect(structureTree.props('expandedKeys')).not.toContain('container-1')
  })

  it('collapses a multiple structure selection to no single viewport block', async () => {
    const wrapper = mountCde({
      stubs: {
        OcTree: cdeStub('OcTree', {
          props: { role: String, selectedKeys: Array },
          emits: ['selection-change'],
        }),
        PropertyEditor: cdeStub('PropertyEditor', { className: 'property-editor-stub' }),
      },
    })
    const { structureTree } = editorTrees(wrapper)

    structureTree.vm.$emit('selection-change', {
      triggerKey: 'text-1',
      selectedKeys: ['container-1', 'text-1'],
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    expect(viewport.props('selectedBlockId')).toBeNull()
    expect(wrapper.findComponent({ name: 'PropertyEditor' }).exists()).toBe(false)

    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()
    expect(viewport.props('selectedBlockId')).toBe('text-1')
    expect(wrapper.findComponent({ name: 'PropertyEditor' }).exists()).toBe(true)
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
        CardDataTable: cdeStub('CardDataTable', { exposed: { revealCell } }),
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
    expect(sessionView(wrapper)).toMatchObject({ selectedInstanceId: 'instance-1' })
    expect(getTestSession(wrapper).state.viewState['card-designer']).toMatchObject({ mode: 'data-table' })
  })

  it('returns from data-table mode to the property editor for a non-block issue', async () => {
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
  })

  it('switches face, clipping and snapping through session state without modifying the document', async () => {
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

    const action = (key: string) => wrapper.findAllComponents({ name: 'OcActionButton' })
      .find(candidate => candidate.props('action').key === key)!
    action('switch-face').vm.$emit('select', { key: 'switch-face' })
    action('toggle-face-clip').vm.$emit('select', { key: 'toggle-face-clip' })
    action('toggle-alignment-snapping').vm.$emit('select', { key: 'toggle-alignment-snapping' })
    await nextTick()

    expect(viewport.props('alignmentSnappingEnabled')).toBe(true)
    expect(sessionView(wrapper)).toEqual({
      activeFace: 'front',
      clipToFace: true,
      alignmentSnappingEnabled: true,
      selectedInstanceId: null,
      selectedBlockIdsByFace: { front: [], back: [] },
    })
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
    expect((sessionView(wrapper) as { selectedBlockIdsByFace?: Record<string, string[]> }).selectedBlockIdsByFace)
      .toEqual({ front: ['text-1'], back: [] })
    editor.selectViewportBlock('back-text-1')
    await nextTick()
    expect((sessionView(wrapper) as { selectedBlockIdsByFace?: Record<string, string[]> }).selectedBlockIdsByFace)
      .toEqual({ front: ['text-1'], back: ['back-text-1'] })
  })

  it('activates the existing rich-text field editor from a selection command', async () => {
    const activateField = vi.fn(async () => true)
    const wrapper = mountCde({
      props: { filePath: heroFilePath, fileName: heroFileName },
      stubs: {
        CardViewport: cdeStub('CardViewport', {
          props: { selectedBlockId: String, selectionCommandActions: Array },
          emits: ['block-click', 'selection-command'],
        }),
        PropertyEditor: cdeStub('PropertyEditor', {
          exposed: { activateField, revealField: vi.fn(async () => true) },
        }),
      },
    })
    await nextTick()

    const viewport = editorViewport(wrapper)
    viewport.vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()
    const commands = viewport.props('selectionCommandActions') as Array<{ key: string }>
    expect(commands.map(command => command.key)).toEqual(['content.edit-rich-text'])

    viewport.vm.$emit('selection-command', {
      key: 'content.edit-rich-text',
      blockId: 'text-1',
    })
    await nextTick()
    expect(activateField).toHaveBeenCalledWith('text-1', 'content')
  })

  it('writes each offered Flow Container direction through Block commands', async () => {
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
    expect((viewport.props('selectionCommandActions') as Array<{ key: string }>).map(command => command.key))
      .toEqual(['flow.direction.left', 'flow.direction.up', 'flow.direction.down', 'flow.direction.right'])

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

    getTestSession(wrapper).updateContent(JSON.stringify(createCdeDocument({ name: 'Updated Document' })))
    await nextTick()
    expect(fitView).not.toHaveBeenCalled()

    getTestSession(wrapper).remapPath('D:/Project/cards/other.ocdocument')
    await nextTick()
    expect(fitView).not.toHaveBeenCalled()
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
    if (flow.type !== 'flow-container-block') throw new Error('Expected flow container')
    expect(flow.children[0]!.block).toMatchObject({ width: '120px', height: '100%' })
    expect(flow.children[0]!.location.align).toBe('justify')

    viewport.vm.$emit('selection-action', { type: 'center-cross-axis', blockId: 'flow-text' })
    await nextTick()
    document = emittedDocument(wrapper)
    flow = document.faces.front.children[0]!.block
    if (flow.type !== 'flow-container-block') throw new Error('Expected flow container')
    expect(flow.children[0]!.location.align).toBe('center')
  })

  function mountShortcuts() {
    const nudgeSelection = vi.fn(() => true)
    const runSelectionQuickAction = vi.fn(() => true)
    const zoomBy = vi.fn()
    const fitView = vi.fn()
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
            layerViewActive: Boolean,
            spaceModifierActive: Boolean,
            face: Object,
          },
          emits: ['block-click', 'blank-click', 'z-index-step'],
          setup(_, { expose }) {
            expose({
              zoomBy,
              fitView,
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
    const layerZIndex = () => (editorViewport(wrapper).props('face') as FaceBlockShape)
      .children[0]?.block.children[0]?.block.zIndex
    return {
      cycleLayerByInitial,
      fitView,
      focusLayerBlock,
      getFocusedLayerBlockId,
      layerZIndex,
      nudgeSelection,
      runSelectionQuickAction,
      stepLayer,
      wrapper,
      zoomBy,
    }
  }

  it('routes Layer View keys, Space selection and zIndex steps', async () => {
    const {
      cycleLayerByInitial,
      focusLayerBlock,
      getFocusedLayerBlockId,
      layerZIndex,
      nudgeSelection,
      runSelectionQuickAction,
      stepLayer,
      wrapper,
    } = mountShortcuts()
    await nextTick()
    const root = wrapper.get('.card-design-editor')
    const viewport = editorViewport(wrapper)

    await root.trigger('keydown', { key: 'Tab' })
    expect(viewport.props('layerViewActive')).toBe(true)
    await root.trigger('keydown', { key: 'ArrowUp' })
    await root.trigger('keydown', { key: 'a' })
    await root.trigger('keydown', { key: 's' })
    await root.trigger('keydown', { key: 'x' })
    await root.trigger('keydown', { key: 'b' })
    expect(stepLayer).toHaveBeenCalledWith(-1, false)
    expect(cycleLayerByInitial.mock.calls).toEqual([['a', false], ['s', false], ['x', false], ['b', false]])
    expect(runSelectionQuickAction).not.toHaveBeenCalled()
    expect(nudgeSelection).not.toHaveBeenCalled()

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
    expect(layerZIndex()).toBe(1)
    expect(focusLayerBlock).toHaveBeenCalledWith('text-1')

    viewport.vm.$emit('z-index-step', { delta: -1, existingLayersOnly: false })
    await nextTick()
    expect(layerZIndex()).toBe(0)

    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(viewport.props('layerViewActive')).toBe(false)
    wrapper.unmount()
  })

  it('routes canvas shortcuts to nudge, quick actions, zoom, duplicate, delete and view toggles', async () => {
    const {
      fitView,
      nudgeSelection,
      runSelectionQuickAction,
      wrapper,
      zoomBy,
    } = mountShortcuts()
    await nextTick()
    const root = wrapper.get('.card-design-editor')
    editorViewport(wrapper).vm.$emit('block-click', 'text-1', new MouseEvent('click'))
    await nextTick()

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
    const duplicated = (editorViewport(wrapper).props('face') as FaceBlockShape)
      .children[0]!.block.children
    expect(duplicated).toHaveLength(2)
    expect((sessionView(wrapper) as unknown as { selectedBlockIdsByFace: Record<string, string[]> })
      .selectedBlockIdsByFace.front).toEqual([duplicated[1]!.block.id])

    await root.trigger('keydown', { key: 'Delete' })
    await nextTick()
    expect((editorViewport(wrapper).props('face') as FaceBlockShape).children[0]!.block.children).toHaveLength(1)
    expect((sessionView(wrapper) as unknown as { selectedBlockIdsByFace: Record<string, string[]> })
      .selectedBlockIdsByFace).toEqual({ front: [], back: [] })

    await root.trigger('keydown', { key: 's' })
    const snapping = sessionView(wrapper) as { alignmentSnappingEnabled: boolean }
    await root.trigger('keydown', { key: 's' })
    await root.trigger('keydown', { key: 'x' })
    await root.trigger('keydown', { key: 'b' })
    expect(sessionView(wrapper)).toMatchObject({
      alignmentSnappingEnabled: !snapping.alignmentSnappingEnabled, clipToFace: true, activeFace: 'back',
    })

    await wrapper.get('.shortcut-input').trigger('keydown', { key: 'ArrowLeft' })
    expect(nudgeSelection).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('persists a dock extent in the session layout only when its resize ends', async () => {
    const wrapper = mountCde({
      props: { filePath: heroFilePath, fileName: heroFileName },
    })
    await nextTick()

    const docks = wrapper.findAllComponents({ name: 'CdeOverlayDock' })
    docks[0]?.vm.$emit('update:extent', 420)
    await nextTick()
    expect((getTestSession(wrapper).state.viewState['card-designer'] as CardDesignerSessionView).layout).toBeUndefined()
    expect(docks[0]?.props('extent')).toBe(420)

    docks[0]?.vm.$emit('resize-end', 'width')
    await nextTick()
    expect((getTestSession(wrapper).state.viewState['card-designer'] as CardDesignerSessionView).layout).toMatchObject({
      leftDockExtent: 420,
      leftExpandedDockExtent: 420,
    })
  })

  it('clears a property value from the panel but keeps its definition', async () => {
    const document = createCdeDocument()
    const container = document.faces.front.children[0]!.block as ReturnType<typeof createSimpleContainerBlock>
    const textBlock = container.children[0]!.block as ReturnType<typeof createTextBlock> & Record<string, unknown>
    textBlock.additionalFieldDefinition = { score: { fieldType: 'number', title: 'Score' } }
    textBlock.score = 7

    const wrapper = mountCde({
      props: { modelValue: document, cardDesignerView: neutralView() },
      stubs: { PropertyEditor: false },
    })
    await nextTick()
    ;(wrapper.vm as unknown as EditorHandle).selectViewportBlock('text-1')
    await nextTick()

    wrapper.getComponent({ name: 'PropertyEditor' })
      .vm.$emit('delete-property', { key: 'text-1', fieldKey: 'score' })
    await nextTick()

    const savedBlock = (emittedDocument(wrapper).faces.front.children[0]!.block as ReturnType<typeof createSimpleContainerBlock>)
      .children[0]!.block as ReturnType<typeof createTextBlock> & Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(savedBlock, 'score')).toBe(false)
    expect(savedBlock.additionalFieldDefinition?.score).toMatchObject({ fieldType: 'number', title: 'Score' })
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

  it('provides resource capabilities and semantic field definitions to data-table cells', async () => {
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
          cells: Array<{ cardId: string, identity: string }>
        }>
      }>
    }>
    const getDefinition = table.props('getCellDefinition') as (
      blockId: string,
      field: { key: string, cells: Array<{ cardId: string, identity: string }> },
      cell: { cardId: string, identity: string },
    ) => { fieldType: string }
    const capabilities = table.props('capabilities') as {
      files?: Array<{ readDirectory: (directory: string) => Promise<Array<{ name: string }>> }>
    }
    const textBlock = faceGroups[0]!.blocks.find(block => block.key === 'text-1')!
    const fontField = textBlock.fields.find(field => field.key === 'fontFamily')!
    const fontDefinition = getDefinition('text-1', fontField, fontField.cells[0]!)
    const contentField = textBlock.fields.find(field => field.key === 'content')!
    const contentDefinition = getDefinition('text-1', contentField, contentField.cells[0]!)

    const imageBlock = faceGroups[0]!.blocks.find(block => block.key === 'image-1')!
    const imageField = imageBlock.fields.find(field => field.key === 'source')!
    const imageDefinition = getDefinition('image-1', imageField, imageField.cells[0]!)
    const imageEntries = await capabilities.files?.[0]?.readDirectory('')

    expect(fontDefinition.fieldType).toBe('fontFamily')
    expect(contentDefinition.fieldType).toBe('richText')
    expect(imageDefinition.fieldType).toBe('imageSource')
    expect(imageEntries?.map(item => item.name)).toContain('portrait.png')
    expect(readDirectoryEntries).toHaveBeenCalledWith('D:/Project', 1)
    readDirectoryEntries.mockRestore(); wrapper.unmount(); await resourceEnvironment.dispose()
  })
})
