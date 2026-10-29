/**
 * Shared mount scaffolding for CardDesignEditor specs.
 *
 * The editor is the unit under test, so the helper mounts it for real and replaces only the children
 * this suite already replaced by hand. The default stub set is the common one:
 *
 * - `CardViewport` — a named double beside the real `CardViewport.spec.ts`, so tests can read the
 *   props the editor projects and re-emit the viewport events the editor listens for.
 * - `OcCard` and `OcPanel` — slot passthroughs.
 * - `Teleport`.
 *
 * Everything else renders for real unless a test asks for a stub: `OcTree`, `CardDataTable`,
 * `PropertyEditor`, `OcOverlayToolbar`, `CdeOverlayDock`, `OcEmpty`, `CardFaceRenderer`. Tests that
 * deliberately render a default-stubbed child for real say so with `Child: false`
 * (`PropertyEditor: false`, `CardViewport: false`), and tests that need their own double pass their
 * own component. No test's real/stub posture is decided by this helper beyond that shared set.
 *
 * The document factory mirrors the fixture every test in `CardDesignEditor.navigation.spec.ts`
 * shares: one instance, a front face holding a simple container with one text block, and an empty
 * back face.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, type Component } from 'vue'
import {
  createCardFace,
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import enUS from '../../locales/en-US'
import type { CardDesignerProps, CardDesignerSessionView } from './cardDesigner.types'
import type { EditorSessionState } from '../editor-runtime/session/editorSession'
import { useAppSettingsStore } from '../settings/store/appSettingsStore'
import { createTestSession, getTestSession } from '../editor-runtime/editorTestSession'
import CardDesignEditor from './CardDesignEditor.vue'

/** A child replacement: a double component, or `false` to force the real child. */
export type CdeStub = Component | boolean

export interface CdeMountOptions {
  /** Editor props; `filePath` and `modelValue` have suite defaults, `modelValue` accepts a document. */
  props?: Partial<CardDesignerProps> & { modelValue?: CardDocument | string; filePath?: string; fileName?: string; mode?: 'edit' | 'diff'; diffUiState?: NonNullable<EditorSessionState['diff']>['uiState']; cardDesignerMode?: CardDesignerSessionView['mode']; cardDesignerLayout?: CardDesignerSessionView['layout']; cardDesignerView?: CardDesignerSessionView['view']; viewportTransform?: CardDesignerSessionView['viewportTransform']; structureTreeSelectionBehavior?: 'none' | 'expand' | 'expand-exclusive'; structureTreeScrollToSelection?: boolean; alignmentSnappingEnabledByDefault?: boolean }
  /** Child overrides merged over the default stub set; `false` forces the real child. */
  stubs?: Record<string, CdeStub>
  /** Mounts the editor into `document.body`, for tests that dispatch keyboard events on the host. */
  attachToBody?: boolean
}

export interface CdeStubOptions {
  props?: Record<string, unknown>
  emits?: string[]
  exposed?: Record<string, unknown>
  className?: string
  /** Observes every render of the double, for tests that snapshot the props the editor projects. */
  onRender?: (props: Record<string, unknown>) => void
}

/** Exposed but unused viewport methods, so the editor can call them without a real component. */
const cdeNoopViewportMethods = {
  zoomBy: () => undefined,
  zoomByWheelAt: () => undefined,
  fitView: () => undefined,
  flashStatus: () => undefined,
  nudgeSelection: () => undefined,
  runSelectionQuickAction: () => undefined,
  stepLayer: () => undefined,
  focusLayerBlock: () => undefined,
  getFocusedLayerBlockId: () => undefined,
  cycleLayerByInitial: () => undefined,
}

/** The viewport double the editor projects into; the real viewport is covered by `CardViewport.spec.ts`. */
export const CdeCardViewportStub = defineComponent({
  name: 'CardViewport',
  props: {
    selectedBlockId: String,
    showInfo: Boolean,
    face: Object,
    clipToFace: Boolean,
    alignmentSnappingEnabled: Boolean,
    selectionCommandActions: Array,
    selectionActionLabels: Object,
    layerViewActive: Boolean,
    layerViewShortcutLegendLabel: String,
    layerViewShortcutHints: Array,
    transform: Object,
    viewportInsets: Object,
  },
  emits: [
    'block-click',
    'blank-click',
    'selection-action',
    'selection-command',
    'z-index-step',
    'face-dimension-change',
    'viewport-size-change',
  ],
  setup(_, { expose, slots }) {
    expose(cdeNoopViewportMethods)
    return () => h('div', { class: 'card-viewport-stub' }, slots.info?.())
  },
})

/** Renders only its slot, under the child's own name so `findComponent({ name })` still resolves. */
function slotStub(name: string, props: string[]): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    props,
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  })
}

/** The children this suite replaces in nearly every test; see the module comment. */
export const CdeDefaultStubs: Record<string, CdeStub> = {
  CardViewport: CdeCardViewportStub,
  OcCard: slotStub('OcCard', ['title', 'actions', 'variant', 'icon']),
  OcPanel: slotStub('OcPanel', ['fill', 'tone', 'border', 'padding', 'overflow', 'align']),
  Teleport: true,
}

/** Builds a named double that keeps the props the editor projects and can re-emit child events. */
export function cdeStub(name: string, options: CdeStubOptions = {}): Component {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: Object.keys(options.props ?? {}) as string[],
    emits: options.emits ?? [],
    setup(props, { expose, slots }) {
      if (options.exposed) expose(options.exposed)
      return () => {
        options.onRender?.(props as Record<string, unknown>)
        return h('div', { class: options.className }, slots.default?.())
      }
    },
  })
}

/** Mounts the real editor with the default stub set, plus any per-test overrides. */
export function mountCde(options: CdeMountOptions = {}): VueWrapper {
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })
  const { modelValue, filePath: initialFilePath, fileName, mode, diffUiState, cardDesignerMode, cardDesignerLayout, cardDesignerView, viewportTransform, structureTreeSelectionBehavior, structureTreeScrollToSelection, alignmentSnappingEnabledByDefault, ...restProps } = options.props ?? {}
  const settings = useAppSettingsStore()
  settings.updateSetting('workspace.structureTreeSelectionBehavior', structureTreeSelectionBehavior ?? 'expand-exclusive')
  settings.updateSetting('workspace.structureTreeScrollToSelection', structureTreeScrollToSelection ?? true)
  settings.updateSetting('workspace.alignmentSnappingEnabledByDefault', alignmentSnappingEnabledByDefault ?? true)
  const model = modelValue ?? createCdeDocument()
  return mount(CardDesignEditor, {
    attachTo: options.attachToBody ? document.body : undefined,
    props: {
      session: createTestSession({ path: initialFilePath ?? 'card.ocdocument', name: fileName ?? 'card.ocdocument',
        resourceKind: 'external', editorId: 'card-designer', fileTypeId: 'opencard', draftContent: typeof model === 'string' ? model : JSON.stringify(model), mode,
        diff: mode === 'diff' ? { beforeRevisionId: null, afterRevisionId: null, uiState: diffUiState } : undefined,
        viewState: { 'card-designer': { mode: cardDesignerMode, layout: cardDesignerLayout, view: cardDesignerView, viewportTransform } },
      }),
      ...restProps,
    },
    global: {
      plugins: [i18n],
      stubs: { ...CdeDefaultStubs, ...options.stubs },
    },
  })
}

/** Builds the card document every navigation test starts from, with optional per-test edits. */
export function createCdeDocument(overrides: Partial<CardDocument> = {}): CardDocument {
  return {
    type: 'card-document',

    id: 'document-1',
    name: 'Document',
    description: 'Reusable hero\ncard.',
    notes: 'Review print\nmargins.',
    version: '1.0.0',
    width: '63',
    height: '88',
    instances: [{
      type: 'card-instance',
      id: 'instance-1',
      name: 'Instance 1',
      amount: '1',
      data: {},
    }],
    faces: {
      front: createCardFace({
        id: 'face-front',
        children: [{
          block: createSimpleContainerBlock({
            id: 'container-1',
            name: 'Container',
            children: [{
              block: createTextBlock({ id: 'text-1', name: 'Title', content: 'Hello' }),
              location: {
                id: 'location-2',
                type: 'simple-container-location',
                anchor: 'lt',
              },
            }],
          }),
          location: {
            id: 'location-1',
            type: 'simple-container-location',
            anchor: 'lt',
          },
        }],
      }),
      back: createCardFace({ id: 'face-back' }),
    },
    ...overrides,
  }
}

/** The editor-hosted viewport, not the one the preview panel renders. */
export function editorViewport(wrapper: VueWrapper) {
  const viewport = wrapper.find('.card-design-editor__stage-base')
    .findComponent({ name: 'CardViewport' })
  if (!viewport.exists()) throw new Error('CardDesignEditor rendered no stage viewport')
  return viewport
}

/** The structure tree and the instance tree, matched the way the suite matches them. */
export function editorTrees(wrapper: VueWrapper) {
  const trees = wrapper.findAllComponents({ name: 'OcTree' })
  return {
    instanceTree: trees.find(tree => tree.props('role') === 'listbox')!,
    structureTree: trees.find(tree => tree.props('role') !== 'listbox')!,
  }
}

/** Reads the most recent `update:modelValue` payload as a document. */
export function emittedDocument(wrapper: VueWrapper): CardDocument {
  return JSON.parse(getTestSession(wrapper).state.draftContent) as CardDocument
}
