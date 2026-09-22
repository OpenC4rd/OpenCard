/**
 * Diff-mode coverage for `CardDesignEditor`.
 *
 * The editor is mounted for real through `cardDesignerMount.ts`, and the viewport is the real
 * `CardViewport` (`CardViewport: false`) so the assertions below read the markup, the projected
 * props and the emitted payloads the production components actually produce. `modelValue` carries a
 * third, unrelated "working" document on purpose: anything that reads the working document instead
 * of `props.comparison` becomes visible as a wrong label, a wrong input pair, or a missing
 * highlight. The preview panel keeps rendering that working document, which is asserted once as the
 * positive control.
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
 * shares `instance-1` (by id) so the edit-mode instance selection stays valid, and it is the only
 * place `Working title` / `Working text` may appear.
 */
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCardFace,
  createSimpleContainerBlock,
  createTextBlock,
  type CardFace,
} from '../../entities/card/model'
import type { EditorComparisonInput } from '../editor-runtime/registry/editorRegistry'
import type { SessionNavigationToken } from '../editor-runtime/model/editorIssue'
import type { PropertyEditorInput } from '../../shared/ui/property-editor/propertyEditor.types'
import {
  createCdeDocument,
  editorTrees,
  editorViewport,
  mountCde,
  type CdeMountOptions,
} from './cardDesignerMount'
import { CDE_OVERLAY_SPLIT_GAP } from './cdeOverlayConfig'

type FaceChild = CardFace['children'][number]
type DiffUiStatePayload = { divider?: number; viewMode?: 'split' | 'side-by-side' }
type ToolbarActionProps = { key: string; title: string }

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
        textChild('text-1', 'Title', 'Hello world', { x: '12px' }),
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
  return (wrapper.props as unknown as (name: string) => T)(key)
}

function diffUiPayloads(wrapper: VueWrapper): DiffUiStatePayload[] {
  return ((wrapper.emitted('update-diff-ui-state') ?? []) as Array<[DiffUiStatePayload]>)
    .map(([value]) => value)
}

function treeLabels(tree: VueWrapper): string[] {
  return [...tree.element.querySelectorAll('.oc-tree__label')]
    .map(element => element.textContent ?? '')
}

function treeBadgeLabels(tree: VueWrapper): string[] {
  return [...tree.element.querySelectorAll('.oc-node-tail__badge')]
    .map(element => element.getAttribute('aria-label') ?? '')
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

  it('renders the comparison viewport with both revision sides instead of the single-card view', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)

    expect(wrapper.find('.card-design-editor__diff-mode-stage').exists()).toBe(true)
    expect(wrapper.findAll('.card-viewport-stage')).toHaveLength(2)
    expect(wrapper.find('.card-viewport-stage--before').exists()).toBe(true)
    expect(wrapper.find('.card-viewport-stage--after').exists()).toBe(true)
    // The single-card branch contributes the info/dimension slots, which diff mode never renders.
    expect(wrapper.find('.card-design-editor__card-info').exists()).toBe(false)

    const viewport = wrapper.get('.card-design-editor__viewport')
    expect(viewport.classes()).toContain('card-viewport')
    expect(viewport.classes()).toContain('card-viewport--readonly')
    const divider = viewport.get('.card-viewport-comparison-divider')
    expect(divider.classes()).not.toContain('is-static')
    expect(divider.attributes('aria-label'))
      .toBe('Adjust version divider [key]A[/key] left [key]S[/key] center [key]D[/key] right')
    expect(viewport.get('.card-viewport-comparison-label--before').text()).toBe('a1b2c3d Version A')
    expect(viewport.get('.card-viewport-comparison-label--after').text()).toBe('Disk version')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows the loading placeholder while the comparison is unavailable', async () => {
    const wrapper = mountDiff({ comparison: undefined })
    await settle(wrapper)

    expect(wrapper.get('.card-design-editor__diff-mode-stage').text()).toContain('Loading versions…')
    expect(wrapper.find('.card-viewport').exists()).toBe(false)
    expect(wrapper.findAllComponents({ name: 'CardViewport' })).toHaveLength(0)
  })

  it('shows the parse-failure placeholder when a comparison side cannot be read', async () => {
    const wrapper = mountDiff({
      comparison: {
        before: { revisionId: 'a1b2c3d', label: 'Version A', content: 'not a card document' },
        after: { revisionId: null, label: 'Disk version', content: JSON.stringify(afterDocument) },
      },
    })
    await settle(wrapper)

    expect(wrapper.get('.card-design-editor__diff-mode-stage').text())
      .toContain('Unable to parse the .ocdocument versions')
    expect(wrapper.findAllComponents({ name: 'CardViewport' })).toHaveLength(0)
  })

  it('adds the split gap to the comparison viewport insets', async () => {
    const editWrapper = mountCde({
      props: { modelValue: workingDocument },
      stubs: { CardViewport: false },
    })
    mountedWrappers.push(editWrapper)
    await settle(editWrapper)
    const editInsets = editorViewport(editWrapper).props('viewportInsets') as { left: number; right: number }

    const diffWrapper = mountDiff()
    await settle(diffWrapper)
    const diffInsets = editorViewport(diffWrapper).props('viewportInsets') as { left: number; right: number }

    expect(diffInsets.left - editInsets.left).toBeCloseTo(CDE_OVERLAY_SPLIT_GAP)
    expect(diffInsets.right - editInsets.right).toBeCloseTo(CDE_OVERLAY_SPLIT_GAP)
  })

  it('projects the diff block and instance trees from the comparison documents', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const { instanceTree, structureTree } = editorTrees(wrapper)

    expect(treeLabels(structureTree))
      .toEqual(['Container', 'Title', 'Removed block', 'Added block'])
    expect(treeBadgeLabels(structureTree)).toEqual(['Changed', 'Removed', 'Added'])
    expect(treeLabels(instanceTree))
      .toEqual(['Blueprint', 'Instance 1', 'Removed instance', 'New name', 'Added instance'])
    expect(treeBadgeLabels(instanceTree)).toEqual(['Removed', 'Changed', 'Added'])

    // The open document is alive in the preview panel but must not reach the diff trees.
    expect(wrapper.get('.card-design-editor__transform-preview-host').text()).toContain('Working text')
    expect(treeLabels(structureTree)).not.toContain('Working title')
    expect(treeLabels(instanceTree)).not.toContain('Working instance')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
  })

  it('does not expand the diff structure tree on double-click activation', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const { structureTree } = editorTrees(wrapper)

    structureTree.vm.$emit('node-activate', { key: 'container-1' })
    await settle(wrapper)
    // `handleStructureTreeNodeActivate` is diff-guarded, so activation leaves the tree collapsed.
    expect(structureTree.props('expandedKeys')).toEqual([])
    expect(treeLabels(structureTree)).not.toContain('Nested')

    // The unguarded expansion path still drives the shared expanded-key state.
    structureTree.vm.$emit('expansion-change', { key: 'container-1', expanded: true })
    await settle(wrapper)
    expect(structureTree.props('expandedKeys')).toEqual(['container-1'])
    expect(treeLabels(structureTree)).toEqual(['Container', 'Nested', 'Title', 'Removed block', 'Added block'])
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
    expect(blockInput.fields['content@old']).toMatchObject({
      isReadonly: true,
      tail: { type: 'badge', icon: 'action.minus', tone: 'danger', label: 'Removed' },
    })
    expect(blockInput.fields['content@new']).toMatchObject({
      isReadonly: true,
      tail: { type: 'badge', icon: 'action.add', tone: 'success', label: 'Added' },
    })

    // Only the field that actually differs is projected.
    expect(Object.keys(blockInput.record).sort()).toEqual(['content@new', 'content@old'])
    // A moved block adds a second, layout-only input keyed `<blockId>:layout`.
    const layoutInput = inputs[1]!
    expect(layoutInput.title).toBe('Layout')
    expect(layoutInput.record).toEqual({ 'x@new': '12px' })
    expect(layoutInput.fields['x@new']).toMatchObject({
      isReadonly: true,
      tail: { type: 'badge', icon: 'action.add', tone: 'success', label: 'Added' },
    })

    // A blank canvas click clears the diff selection without touching the edit-mode selection.
    editorViewport(wrapper).vm.$emit('blank-click')
    await settle(wrapper)
    expect(wrapper.getComponent({ name: 'PropertyEditor' }).props('inputs')).toEqual([])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
  })

  it('summarises a multiple diff selection instead of projecting one block', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)

    editorTrees(wrapper).structureTree.vm.$emit('selection-change', {
      triggerKey: 'text-1',
      selectedKeys: ['text-1', 'text-added'],
    })
    await settle(wrapper)

    expect(wrapper.get('.card-design-editor__multi-selection-summary').text()).toBe('2 blocks selected')
    expect(wrapper.findComponent({ name: 'PropertyEditor' }).exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders diff highlight markup for added, removed and changed blocks', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)

    // One overlay per highlighted side: removed + changed on the left, added + changed on the right.
    expect(wrapper.findAll('.card-diff-overlay')).toHaveLength(4)
    expect(wrapper.find('.card-diff-overlay-layer--before .card-diff-overlay--removed').exists()).toBe(true)
    expect(wrapper.find('.card-diff-overlay-layer--before .card-diff-overlay--changed').exists()).toBe(true)
    expect(wrapper.find('.card-diff-overlay-layer--after .card-diff-overlay--added').exists()).toBe(true)
    expect(wrapper.find('.card-diff-overlay-layer--after .card-diff-overlay--changed').exists()).toBe(true)
    expect(wrapper.find('.card-diff-overlay-layer--before .card-diff-overlay--added').exists()).toBe(false)
    expect(wrapper.find('.card-diff-overlay-layer--after .card-diff-overlay--removed').exists()).toBe(false)
    // The overlay carries the side class of the layer it belongs to.
    expect(wrapper.find('.card-diff-overlay-layer--before .card-diff-overlay--before').exists()).toBe(true)
    expect(wrapper.find('.card-diff-overlay-layer--after .card-diff-overlay--after').exists()).toBe(true)

    const beforeStage = wrapper.get('.card-viewport-stage--before')
    expect(beforeStage.find('[data-block-id="text-1"]').attributes('data-diff-kind')).toBe('changed')
    expect(beforeStage.find('[data-block-id="text-removed"]').attributes('data-diff-kind')).toBe('removed')
    expect(beforeStage.find('[data-block-id="text-added"]').exists()).toBe(false)
    expect(beforeStage.find('[data-block-id="container-1"]').attributes('data-diff-kind')).toBeUndefined()

    const afterStage = wrapper.get('.card-viewport-stage--after')
    expect(afterStage.find('[data-block-id="text-1"]').attributes('data-diff-kind')).toBe('changed')
    expect(afterStage.find('[data-block-id="text-added"]').attributes('data-diff-kind')).toBe('added')
    expect(afterStage.find('[data-block-id="text-removed"]').exists()).toBe(false)
    expect(afterStage.find('[data-block-id="container-1"]').attributes('data-diff-kind')).toBeUndefined()
  })

  it('projects an added or removed instance onto the comparison as a placeholder side', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const layers = () => wrapper.findAll('.card-viewport-comparison-layer')

    expect(layers()[0]!.find('.card-comparison-placeholder').exists()).toBe(false)
    expect(layers()[1]!.find('.card-comparison-placeholder').exists()).toBe(false)

    selectInstance(wrapper, 'instance-added')
    await settle(wrapper)
    expect(layers()[0]!.find('.card-comparison-placeholder').exists()).toBe(true)
    expect(layers()[0]!.find('.card-canvas').exists()).toBe(false)
    expect(layers()[1]!.find('.card-canvas').exists()).toBe(true)

    selectInstance(wrapper, 'instance-removed')
    await settle(wrapper)
    expect(layers()[1]!.find('.card-comparison-placeholder').exists()).toBe(true)
    expect(layers()[1]!.find('.card-canvas').exists()).toBe(false)
    expect(layers()[0]!.find('.card-canvas').exists()).toBe(true)
  })

  it('keeps block and instance selection in diff mode out of the document', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')

    selectStructureBlock(wrapper, 'text-1')
    await settle(wrapper)
    // The selection really happened before the "nothing was written" assertions below.
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-1'])
    // A diff block selection is diff-scoped: no document write, no session view-state commit.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()

    selectInstance(wrapper, 'instance-1')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['instance-1'])

    // A comparison-only instance keeps its diff-tree highlight: the diff selection is validated
    // against the comparison document, not against the open document.
    selectInstance(wrapper, 'instance-added')
    await settle(wrapper)
    expect(editorTrees(wrapper).instanceTree.props('selectedKeys')).toEqual(['instance-added'])
    expect(wrapper.find('.card-viewport-comparison-layer .card-comparison-placeholder').exists()).toBe(true)

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
    expect(wrapper.emitted('save')).toBeUndefined()
    // Diff instance selection stays inside the diff projection: no session view-state commit.
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('selects a block from the comparison canvas without writing the document', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)

    // A real click on the block the after side renders; diff mode has no other canvas selection path.
    await wrapper.get('.card-viewport-stage--after [data-block-id="text-added"]').trigger('click')
    await settle(wrapper)

    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-added'])
    const inputs = wrapper.getComponent({ name: 'PropertyEditor' }).props('inputs') as PropertyEditorInput[]
    // An added block has no before side, so every field plus its placement is an added pair.
    expect(inputs.map(input => input.key)).toEqual(['text-added', 'text-added:layout'])
    expect(inputs[0]!.record).toMatchObject({ 'name@new': 'Added block', 'content@new': 'New' })
    expect(inputs[1]!.record).toMatchObject({ 'anchor@new': 'lt' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
  })

  it('swallows a save request in diff mode', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const modelValue = editorProp<string>(wrapper, 'modelValue')
    // The open document is loaded and rendered, so `save` reaches the real serialisation path.
    expect(wrapper.get('.card-design-editor__transform-preview-host').text()).toContain('Working text')

    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    await settle(wrapper)

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
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

    // The diff projection followed the target: block selected in the diff tree, and the real
    // property panel revealed the `@new` side of the compared field.
    expect(editorTrees(wrapper).structureTree.props('selectedKeys')).toEqual(['text-1'])
    expect(wrapper.get('.property-editor__row[data-input-key="text-1"][data-field-key="content@new"]')
      .classes()).toContain('is-revealed')

    // A location-owned target reveals the layout input pair instead.
    await expect(navigateInDiff(wrapper, navigationToken({
      owner: 'location', faceKey: 'front', blockId: 'text-1', fieldKey: 'x',
    }))).resolves.toBe('success')
    await settle(wrapper)
    expect(wrapper.get('.property-editor__row[data-input-key="text-1:layout"][data-field-key="x@new"]')
      .classes()).toContain('is-revealed')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
    // Navigating inside the comparison never commits the open document's selection.
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
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
    expect(wrapper.get('.property-editor__row[data-input-key="text-removed"][data-field-key="content@old"]')
      .classes()).toContain('is-revealed')
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
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

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('modified')).toBeUndefined()
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
    expect(editorProp<string>(wrapper, 'modelValue')).toBe(modelValue)
  })

  it('reports viewport divider changes through update-diff-ui-state', async () => {
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
    expect(viewport.get('.card-viewport-comparison-divider').classes()).toContain('is-static')
    expect(diffUiPayloads(wrapper)).toEqual([])

    await wrapper.setProps({ diffUiState: { divider: 0.75, viewMode: 'split' } })
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
    // Leaving side-by-side through a preset announces the split view.
    expect(wrapper.get('.card-viewport-status-flash').text()).toBe('Switched to split view')

    await root.trigger('keydown', { key: 'd' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[2]).toEqual({ divider: 1, viewMode: 'split' })

    await root.trigger('keydown', { key: 's' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[3]).toEqual({ divider: 0.5, viewMode: 'split' })
    // `S` is also `view.toggle-snapping`; in diff mode the divider preset is registered first.
    expect(wrapper.emitted('update-card-designer-view')).toBeUndefined()
  })

  it('toggles split and side-by-side through the face toolbar', async () => {
    const wrapper = mountDiff()
    await settle(wrapper)
    const viewport = editorViewport(wrapper)
    const toolbarAction = (key: string) => wrapper.findAllComponents({ name: 'OcActionButton' })
      .find(button => (button.props('action') as ToolbarActionProps).key === key)!

    expect(toolbarAction('toggle-diff-view-mode').props('action')).toMatchObject({
      title: 'Switch to side-by-side view [key]V[/key]',
      active: false,
      variant: 'ghost',
    })

    toolbarAction('toggle-diff-view-mode').vm.$emit('select', { key: 'toggle-diff-view-mode' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)).toEqual([{ divider: 0.5, viewMode: 'side-by-side' }])
    expect(viewport.props('comparison')).toMatchObject({ divider: 0.5, viewMode: 'side-by-side' })
    expect(viewport.get('.card-viewport-comparison-divider').classes()).toContain('is-static')
    expect(viewport.get('.card-viewport-comparison-divider').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.card-viewport-status-flash').text()).toBe('Switched to side-by-side view')
    expect(toolbarAction('toggle-diff-view-mode').props('action')).toMatchObject({
      title: 'Switch to split view [key]V[/key]',
      active: true,
      variant: 'soft',
    })

    toolbarAction('toggle-diff-view-mode').vm.$emit('select', { key: 'toggle-diff-view-mode' })
    await settle(wrapper)
    expect(diffUiPayloads(wrapper)[1]).toEqual({ divider: 0.5, viewMode: 'split' })
    expect(viewport.get('.card-viewport-comparison-divider').classes()).not.toContain('is-static')
  })
})
