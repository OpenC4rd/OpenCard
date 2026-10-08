<!-- 代码编辑器：Monaco 体积很大，只在真正需要编辑时才按需加载。 -->
<template>
  <div class="monaco-editor-shell">
    <div ref="editorContainer" class="monaco-editor-host"></div>
    <div v-if="loadState !== 'ready'" class="monaco-editor-loading" role="status" aria-live="polite">
      <OcText tone="muted" size="sm">
        {{ t(loadState === 'failed' ? 'monacoEditor.loadFailed' : 'monacoEditor.loading') }}
      </OcText>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import OcText from '../base/OcText.vue'
import type { OcThemeColorOverrides, OcThemeId } from '../../shared/ui/foundation'
import { registerOcMonacoTheme } from '../../features/editor-runtime/services/monacoTheme'
import type { EditorSession } from '../../features/editor-runtime/session/editorSession'
import { notifyAppError } from '../../features/notifications/titlebarNotices'
import type { HistoryOperationMeta } from '../../features/editor-runtime/history/history.types'
import type { EditorComparisonInput } from '../../features/editor-runtime/editorProtocol'

type MonacoApi = typeof import('monaco-editor')
type MonacoEditorInstance = import('monaco-editor').editor.IStandaloneCodeEditor
type MonacoDiffEditorInstance = import('monaco-editor').editor.IStandaloneDiffEditor
type MonacoTextModel = import('monaco-editor').editor.ITextModel

const props = withDefaults(defineProps<{
  modelValue?: string
  session?: EditorSession
  language?: string
  themeId?: OcThemeId
  themeOverrides?: OcThemeColorOverrides
  readOnly?: boolean
  mode?: 'edit' | 'diff'
  comparison?: EditorComparisonInput
}>(), {
  language: 'plaintext',
  themeId: 'dark',
})

const emit = defineEmits<{
  'update:modelValue': [value: string, history?: HistoryOperationMeta]
  'save': []
}>()

const { t } = useI18n()
const editorContainer = ref<HTMLElement>()
/** 编辑器模块是按需加载的，加载失败要让用户看到原因而不是留一块空白。 */
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
let monacoApi: MonacoApi | null = null
let editor: MonacoEditorInstance | null = null
let diffEditor: MonacoDiffEditorInstance | null = null
let diffModels: MonacoTextModel[] = []
/** 每次挂载递增：加载返回时若已不是本次挂载，就丢弃结果，避免为已卸载的组件建编辑器。 */
let mountGeneration = 0

async function loadMonacoApi(): Promise<MonacoApi> {
  // 同一个窗口内多次打开编辑器共用同一份按需模块。
  monacoApi ??= await import('monaco-editor')
  return monacoApi
}

function createEditor(api: MonacoApi, container: HTMLElement): void {
  const appearance = registerOcMonacoTheme(api, props.themeId, props.themeOverrides)
  if ((props.session?.state.mode ?? props.mode) === 'diff' && props.comparison) {
    const before = props.comparison.before
    const after = props.comparison.after
    const beforeModel = api.editor.createModel(before.content, props.language, api.Uri.parse(`inmemory://opencard/diff/${before.revisionId ?? 'current'}/before`))
    const afterModel = api.editor.createModel(after.content, props.language, api.Uri.parse(`inmemory://opencard/diff/${after.revisionId ?? 'current'}/after`))
    diffModels = [beforeModel, afterModel]
    diffEditor = api.editor.createDiffEditor(container, {
      theme: appearance.themeName,
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      overviewRulerBorder: false,
      fontFamily: appearance.fontFamily,
    })
    diffEditor.setModel({ original: beforeModel, modified: afterModel })
    return
  }
  const sessionModel = props.session?.textModel.get() ?? null
  const managedModel = sessionModel ?? (props.session
    ? api.editor.createModel(
        props.session.state.draftContent,
        props.language,
        api.Uri.parse(`inmemory://opencard/${props.session.state.id}`),
      )
    : null)
  if (props.session && managedModel && !sessionModel) {
    props.session.textModel.attach(managedModel)
  }
  editor = api.editor.create(container, {
    ...(managedModel ? { model: managedModel } : { value: props.modelValue ?? '' }),
    language: props.language,
    theme: appearance.themeName,
    automaticLayout: true,
    fontFamily: appearance.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    padding: { top: 8, bottom: 8 },
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    overviewRulerBorder: false,
    renderLineHighlight: 'all',
    roundedSelection: false,
    smoothScrolling: true,
    readOnly: props.readOnly,
    cursorSmoothCaretAnimation: 'on',
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  })

  // 监听内容变化
  if (!managedModel) {
    editor.onDidChangeModelContent(() => {
      emit('update:modelValue', editor?.getValue() || '', {
        mode: 'debounced',
        merge: { family: 'source-edit', target: 'document-source' },
      })
    })
  }

  if (props.session) {
    const viewState = props.session.state.viewState.monaco as { editor?: import('monaco-editor').editor.ICodeEditorViewState } | undefined
    if (viewState?.editor) editor.restoreViewState(viewState.editor)
  }

  // 监听保存快捷键 (Ctrl+S / Cmd+S)
  editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => {
    if (props.session) void props.session.save().catch(error => notifyAppError('OC-E4002', error))
    else emit('save')
  })
}

onMounted(async () => {
  const container = editorContainer.value
  if (!container) return
  const generation = ++mountGeneration
  let api: MonacoApi
  try {
    api = await loadMonacoApi()
  } catch (error) {
    if (generation === mountGeneration) loadState.value = 'failed'
    console.error('[MonacoEditor] Unable to load the code editor.', error)
    return
  }
  if (generation !== mountGeneration) return
  loadState.value = 'ready'
  if (editorContainer.value) createEditor(api, editorContainer.value)
})

// 监听语言变化
watch(() => props.language, (newLang) => {
  if (monacoApi && editor && newLang) {
    const model = editor.getModel()
    if (model) {
      monacoApi.editor.setModelLanguage(model, newLang)
    }
  }
})

watch(() => props.readOnly, (readOnly) => {
  editor?.updateOptions({ readOnly })
})

watch(() => [props.themeId, props.themeOverrides] as const, ([themeId, themeOverrides]) => {
  if (!monacoApi) return
  const appearance = registerOcMonacoTheme(monacoApi, themeId, themeOverrides)
  monacoApi.editor.setTheme(appearance.themeName)
  editor?.updateOptions({ fontFamily: appearance.fontFamily })
})

// 监听外部内容变化
watch(() => props.modelValue, (newValue) => {
  if (props.session?.textModel.get() === editor?.getModel()) return
  if (editor && newValue !== editor.getValue()) {
    editor.setValue(newValue ?? '')
  }
})

onUnmounted(() => {
  mountGeneration += 1
  diffEditor?.dispose()
  diffModels.forEach(model => model.dispose())
  diffModels = []
  const model = editor?.getModel()
  if (props.session && editor) props.session.updateViewState('monaco', { editor: editor.saveViewState() })
  editor?.dispose()
  editor = null
  diffEditor = null
  if (!props.session) model?.dispose()
})
</script>

<style scoped>
.monaco-editor-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--oc-bg-raised);
}

.monaco-editor-host {
  width: 100%;
  height: 100%;
}

.monaco-editor-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
