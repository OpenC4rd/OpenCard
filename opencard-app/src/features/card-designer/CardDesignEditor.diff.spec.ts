import { nextTick } from 'vue'
import { getTestSession } from '../editor-runtime/editorTestSession'
/**
 * Diff-mode coverage for `CardDesignEditor`.
 *
 * The editor is mounted for real through `cardDesignerMount.ts`, and the viewport is the real
 * `CardViewport` (`CardViewport: false`) so the assertions below read the projected props and the
 * emitted payloads the production components actually produce. `modelValue` carries a third,
 * unrelated "working" document on purpose: anything that reads the working document instead of
 * `props.comparison` becomes visible as a wrong label, a wrong input pair, or a wrong selection.
 *
 * The three compared documents share one shape so every delta is intentional:
 *
 * | block             | before              | after                | diff       |
 * | ----------------- | ------------------- | -------------------- | ---------- |
 * | container-1       | unchanged           | unchanged            | none       |
 * | nested-1 (in it)  | unchanged           | unchanged            | none       |
 * | text-1            | "Hello"             | "Hello world" + x    | changed    |
 * | text-removed      | "Gone"              | absent               | removed    |
 * | text-added        | absent              | "New"                | added      |
 *
 * Instances behave the same way: `instance-1` is identical, `instance-changed` only changes its
 * name, `instance-removed` is before-only and `instance-added` is after-only. The open document
 * shares `instance-1` (by id) so the edit-mode instance selection stays valid.
 */
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCardFace,
  createSimpleContainerBlock,
  createTextBlock,
  type CardFace,
} from '../../entities/card/model'
import type { EditorComparisonInput } from '../editor-runtime/editorProtocol'
import type { SessionNavigationToken } from '../editor-runtime/model/editorIssue'
import type { PropertyEditorInput } from '../../shared/ui/property-editor/propertyEditor.types'
import {
  createCdeDocument,
  editorTrees,
  editorViewport,
  mountCde,
  type CdeMountOptions,
} from './cardDesignerMount'

type FaceChild = CardFace['children'][number]
type DiffUiStatePayload = { divider?: number, viewMode?: 'split' | 'side-by-side' }

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Builds a root-level text block child; `location` overrides model a moved block. */
function textChild(
  id: string,
  name: string,
  content: string,
  location: Partial<FaceChild['location']> = {},
): FaceChild {
  return {
    block: createTextBlock({ id, name, content }),
    location: { id: `location-${id}`, type: 'simple-container-location', anchor: 'lt', ...location },
  }
}

/** Present and byte-identical in both compared documents, to pin the "no highlight" case. */
const unchangedContainer: FaceChild = {
  block: createSimpleContainerBlock({
    id: 'container-1',
    name: 'Container',
    children: [{
      block: createTextBlock({ id: 'nested-1', name: 'Nested', content: 'Nested text' }),
      location: { id: 'location-nested-1', type: 'simple-container-location', anchor: 'lt' },
    }],
  }),
  location: { id: 'location-container-1', type: 'simple-container-location', anchor: 'lt' },
}

const beforeDocument = createCdeDocument({
  name: 'Before document',
  instances: [
    { type: 'card-instance', id: 'instance-1', name: 'Instance 1', amount: '1', data: {} },
    { type: 'card-instance', id: 'instance-removed', name: 'Removed instance', amount: '1', data: {} },
    { type: 'card-instance', id: 'instance-changed', name: 'Old name', amount: '1', data: {} },
  ],
  faces: {
    front: createCardFace({
      id: 'face-front',
      children: [
        unchangedContainer,
        textChild('text-1', 'Title', 'Hello'),
        textChild('text-removed', 'Removed block', 'Gone'),
      ],
    }),
    back: createCardFace({ id: 'face-back' }),
  },
})

const afterDocument = createCdeDocument({
  name: 'After document',
  instances: [
    { type: 'card-instance', id: 'instance-1', name: 'Instance 1', amount: '1', data: {} },
    { type: 'card-instance', id: 'instance-changed', name: 'New name', amount: '1', data: {} },
    { type: 'card-instance', id: 'instance-added', name: 'Added instance', amount: '1', data: {} },
  ],
  faces: {
    front: createCardFace({
      id: 'face-front',
      children: [
        unchangedContainer,
        textChild('text-1', 'Title', 'Hello world', { x: '12mm' }),
        textChild('text-added', 'Added block', 'New'),
      ],
    }),
    back: createCardFace({ id: 'face-back' }),
  },
})

/** The open document, which the diff projections must ignore. */
const workingDocument = createCdeDocument({
  name: 'Working document',
  instances: [
    // Sharing `instance-1` with the comparison keeps the edit-mode instance selection valid.
    { type: 'card-instance', id: 'instance-1', name: 'Working instance 1', amount: '1', data: {} },
    { type: 'card-instance', id: 'instance-working', name: 'Working instance', amount: '1', data: {} },
  ],
  faces: {
    front: createCardFace({
      id: 'face-front',
      children: [textChild('working-text', 'Working title', 'Working text')],
    }),
    back: createCardFace({ id: 'face-back' }),
  },
})

const comparison: EditorComparisonInput = {
  before: { revisionId: 'a1b2c3d4e5f6', label: 'Version A', content: JSON.stringify(beforeDocument) },
  after: { revisionId: null, label: 'Disk version', content: JSON.stringify(afterDocument) },
}

const mountedWrappers: VueWrapper[] = []

/** Mounts the real editor in diff mode with the real viewport, and tracks it for teardown. */
function mountDiff(
  props: CdeMountOptions['props'] = {},
  stubs: CdeMountOptions['stubs'] = {},
): VueWrapper {
  const wrapper = mountCde({
    attachToBody: true,
    props: { mode: 'diff', comparison, modelValue: workingDocument, ...props },
    stubs: { CardViewport: false, ...stubs },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Waits out the document load, the render pipeline, and the viewport's overlay synchronisation. */
async function settle(wrapper: VueWrapper): Promise<void> {
  await wrapper.vm.$nextTick()
  await flushPromises()
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
}

/** `mountCde` returns an unparameterised wrapper, so reading a root prop needs one local cast. */
function editorProp<T>(wrapper: VueWrapper, key: string): T {
  if (key === 'modelValue') return getTestSession(wrapper).state.draftContent as T
  return (wrapper.props as unknown as (name: string) => T)(key)
}

function diffUiPayloads(wrapper: VueWrapper): DiffUiStatePayload[] {
  return ((wrapper.emitted('update-diff-ui-state') ?? []) as Array<[DiffUiStatePayload]>)
    .map(([value]) => value)
}

function selectStructureBlock(wrapper: VueWrapper, blockId: string): void {
  editorTrees(wrapper).structureTree.vm.$emit('selection-change', {
    triggerKey: blockId,
    selectedKeys: [blockId],
  })
}

function selectInstance(wrapper: VueWrapper, instanceId: string): void {
  editorTrees(wrapper).instanceTree.vm.$emit('selection-change', {
    triggerKey: instanceId,
    selectedKeys: [instanceId],
  })
}

type NavigationTargetInput = {
  owner: 'document' | 'face' | 'instance' | 'block' | 'location'
  fieldKey: string
  instanceId?: string
  faceKey?: 'front' | 'back'
  blockId?: string
  characterOffset?: number
}

function navigationToken(input: NavigationTargetInput): SessionNavigationToken {
  return {
    protocol: 'card-designer',
    version: 2,
    target: {
      kind: 'property',
      instanceId: input.instanceId ?? null,
      faceKey: input.faceKey ?? null,
      owner: input.owner,
      fieldKey: input.fieldKey,
      ...(input.blockId ? { blockId: input.blockId } : {}),
      ...(input.characterOffset === undefined ? {} : { characterOffset: input.characterOffset }),
    },
  }
}

async function navigateInDiff(wrapper: VueWrapper, token: SessionNavigationToken): Promise<string> {
  return await (wrapper.vm as unknown as {
    navigate: (value: SessionNavigationToken) => Promise<string>
  }).navigate(token)
}

describe('CardDesignEditor diff mode', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
    vi.unstubAllGlobals()
  })

  it('keeps the viewport unmounted while the comparison is missing or unreadable', async () => {
    const loading = mountDiff({ comparison: undefined })
    await settle(loading)
    expect(loading.findAllComponents({ name: 'CardViewport' })).toHaveLength(0)

    const broken = mountDiff({
      comparison: {
        before: { revisionId: 'a1b2c3d', label: 'Version A', content: 'not a card document' },
        after: { revisionId: null, label: 'Disk version', content: JSON.stringify(afterDocument) },
      },
    })
    await settle(broken)
    expect(broken.findAllComponents({ name: 'CardViewport' })).toHaveLength(0)
  })

  it('projects diff property inputs as before and after field pairs from the comparison documents', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    selectStructureBlock(wrapper, 'text-1')
    await settle(wrapper)

    const inputs = wrapper.getComponent({ name: 'PropertyEditor' }).props('inputs') as PropertyEditorInput[]
    expect(inputs.map(input => input.key)).toEqual(['text-1', 'text-1:layout'])

    const blockInput = inputs[0]!
    expect(blockInput.title).toBe('Title')
    expect(blockInput.record).toEqual({
      'content@old': 'Hello',
      'content@new': 'Hello world',
    })
    expect(blockInput.fields['content@old']?.isReadonly).toBe(true)
    expect(blockInput.fields['content@new']?.isReadonly).toBe(true)

    // Only the field that actually differs is projected; a moved block adds a layout pair.
    const layoutInput = inputs[1]!
    expect(layoutInput.record).toEqual({ 'x@new': '12mm' })
    expect(layoutInput.fields['x@new']?.isReadonly).toBe(true)

    // A blank canvas click clears the diff selection without touching the edit-mode selection.
    editorViewport(wrapper).vm.$emit('blank-click')
    await settle(wrapper)
    expect(wrapper.getComponent({ name: 'PropertyEditor' }).props('inputs')).toEqual([])
  })

  it('does not expand the diff structure tree on double-click activation', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const { structureTree } = editorTrees(wrapper)

    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await settle(wrapper)
    // `handleStructureTreeNodeActivate` is diff-guarded, so activation leaves the tree collapsed.
    expect(structureTree.props('expandedKeys')).toEqual([])

    // The unguarded expansion path still drives the shared expanded-key state.
    structureTree.vm.$emit('expansion-change', { key: 'container-1', expanded: true })
    await settle(wrapper)
    expect(structureTree.props('expandedKeys')).toEqual(['container-1'])
  })

  it('keeps block and instance selection in diff mode out of the document', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')

    selectStructureBlock(wrapper, 'text-1')
    await settle(wrapper)
    // The selection really happened before the "nothing was written" assertions below.
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-1'])

    selectInstance(wrapper, 'instance-1')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['instance-1'])

    // A comparison-only instance keeps its diff-tree highlight: the diff selection is validated
    // against the comparison document, not against the open document.
    selectInstance(wrapper, 'instance-added')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['instance-added'])

    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('selects a block from the comparison canvas without writing the document', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')

    // In Canvas viewport, block click emits 'block-click' with the clicked block id
    editorViewport(wrapper).vm.$emit('block-click', 'text-added')
    await settle(wrapper)

    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-added'])
    const inputs = wrapper.getComponent({ name: 'PropertyEditor' }).props('inputs') as PropertyEditorInput[]
    // An added block has no before side, so every field plus its placement is an added pair.
    expect(inputs.map(input => input.key)).toEqual(['text-added', 'text-added:layout'])
    expect(inputs[0]!.record).toMatchObject({ 'name@new': 'Added block', 'content@new': 'New' })
    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('swallows a save request in diff mode', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')

    await expect(getTestSession(wrapper).save()).resolves.toBe('skipped')
    await settle(wrapper)

    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('navigates to a compared block change in diff mode without writing the document', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')

    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'block', faceKey: 'front', blockId: 'text-1', fieldKey: 'content',
    }))).resolves.toBe('success')
    await settle(wrapper)

    const structureTree = editorTrees(wrapper).structureTree
    expect(structureTree.props('selectedKeys')).toEqual(['text-1'])

    // A location-owned target still resolves inside the comparison.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'location', faceKey: 'front', blockId: 'text-1', fieldKey: 'x',
    }))).resolves.toBe('success')
    await settle(wrapper)
    expect(structureTree.props('selectedKeys')).toEqual(['text-1'])

    // Navigating inside the comparison never commits the open document's selection.
    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('navigates to the removed side of a block that only exists before', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)

    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'block', faceKey: 'front', blockId: 'text-removed', fieldKey: 'content',
    }))).resolves.toBe('success')
    await settle(wrapper)

    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-removed'])
  })

  it('returns not-found in diff mode when the target is not in the comparison', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')
    selectStructureBlock(wrapper, 'text-1')
    await settle(wrapper)

    // A block that only exists in the open document must not be selected through the working
    // document; the diff selection is cleared and the request is reported as not-found.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'block', faceKey: 'front', blockId: 'working-text', fieldKey: 'content',
    }))).resolves.toBe('not-found')
    await settle(wrapper)
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual([])

    // A compared block whose field did not change has no diff entry to reveal.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'block', faceKey: 'front', blockId: 'text-1', fieldKey: 'name',
    }))).resolves.toBe('not-found')
    await settle(wrapper)
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-1'])

    // Document-owned targets exist in the comparison, but the comparison projects block fields
    // only, so nothing can be revealed.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'document', fieldKey: 'version',
    }))).resolves.toBe('not-found')
    await settle(wrapper)
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual([])

    // An instance the comparison cannot project is rejected, and the selection it replaced is kept
    // (the earlier null-instance targets left the blueprint selected).
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'instance', instanceId: 'instance-working', fieldKey: 'name',
    }))).resolves.toBe('not-found')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['__blueprint__'])

    // A compared instance is selected even though the comparison has no instance field to reveal.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'instance', instanceId: 'instance-added', fieldKey: 'name',
    }))).resolves.toBe('not-found')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['instance-added'])

    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('reports viewport divider changes through update-diff-ui-state and clamps them', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const viewport = editorViewport(wrapper)

    viewport.vm.$emit('diff-divider-change', 0.25)
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)).toEqual([{ divider: 0.25, viewMode: 'split' }])
    expect(viewport.props('comparison')).toMatchObject({ divider: 0.25, viewMode: 'split' })

    viewport.vm.$emit('diff-divider-change', 1.5)
    viewport.vm.$emit('diff-divider-change', -0.5)
    await settle(wrapper)
    expect(diffUiPayloads(wrapper).slice(1)).toEqual([
      { divider: 1, viewMode: 'split' },
      { divider: 0, viewMode: 'split' },
    ])
  })

  it('applies a controlled diffUiState prop without echoing it back', async () => {
    const wrapper = mountDiff({ diffUiState: { divider: 0.2, viewMode: 'side-by-side' } })
    await settle(wrapper)
    const viewport = editorViewport(wrapper)

    expect(viewport.props('comparison')).toMatchObject({ divider: 0.2, viewMode: 'side-by-side' })
    expect(diffUiPayloads(wrapper)).toEqual([])

    getTestSession(wrapper).updateDiffUiState({ divider: 0.75, viewMode: 'split' })
    await nextTick()
    await settle(wrapper)
    expect(viewport.props('comparison')).toMatchObject({ divider: 0.75, viewMode: 'split' })
    expect(diffUiPayloads(wrapper)).toEqual([])
  })

  it('applies the A, S and D divider presets and keeps S off the snapping shortcut', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const root = wrapper.get('.card-design-editor')
    const viewport = editorViewport(wrapper)

    await root.trigger('keydown', { key: 'v' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)).toEqual([{ divider: 0.5, viewMode: 'side-by-side' }])

    await root.trigger('keydown', { key: 'a' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[1]).toEqual({ divider: 0, viewMode: 'split' })
    expect(viewport.props('comparison')).toMatchObject({ divider: 0, viewMode: 'split' })

    await root.trigger('keydown', { key: 'd' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[2]).toEqual({ divider: 1, viewMode: 'split' })

    await root.trigger('keydown', { key: 's' })
    await settle(wrapper)
    // `S` is also `view.toggle-snapping`; in diff mode the divider preset is registered first.
    expect(diffUiPayloads(wrapper)[3]).toEqual({ divider: 0.5, viewMode: 'split' })
  })

  it('toggles split and side-by-side through the face toolbar', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const viewport = editorViewport(wrapper)
    const toolbarAction = (key: string) => wrapper.findAllComponents({ name: 'OcActionButton' })
      .find(button => (button.props('action') as { key: string }).key === key)!

    toolbarAction('toggle-diff-view-mode').vm.$emit('select', { key: 'toggle-diff-view-mode' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)).toEqual([{ divider: 0.5, viewMode: 'side-by-side' }])
    expect(viewport.props('comparison')).toMatchObject({ divider: 0.5, viewMode: 'side-by-side' })

    toolbarAction('toggle-diff-view-mode').vm.$emit('select', { key: 'toggle-diff-view-mode' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[1]).toEqual({ divider: 0.5, viewMode: 'split' })
  })
})
