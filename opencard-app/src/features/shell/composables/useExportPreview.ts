/**
 * 导出空间的预览状态：配置一变就防抖重算计划，只渲染正在看的那一页。
 * 新图出来前旧图留在舞台上，调参数时画面不闪。
 */
import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { exportPreviewPageCount } from '../../exporting/exportPreview'
import type { ExportPlan, ExportPreparationResult, ExportTaskValidationIssue } from '../../exporting/exportTask'
import type { ExportProfile } from '../../workspace/model/projectExportProfile'

const PREVIEW_DELAY_MS = 300

export type ExportPreviewOptions = {
  profile: Readonly<Ref<ExportProfile | null>>
  active: Readonly<Ref<boolean>>
  /** 换了一条配置（不是改名）就加一，预览回到第一页。 */
  switched: Readonly<Ref<number>>
  /** PDF 按跨页看：同时显示相邻两页。图片规则每页是独立文件，不分跨页。 */
  spread: Readonly<Ref<boolean>>
  plan: (profile: ExportProfile, signal: AbortSignal) => Promise<ExportPreparationResult>
  renderPage: (plan: ExportPlan, index: number, signal: AbortSignal) => Promise<Blob>
  release: () => void
}

export function useExportPreview(options: ExportPreviewOptions) {
  const plan = shallowRef<ExportPlan | null>(null)
  const pageIndex = ref(0)
  const imageUrls = ref<readonly string[]>([])
  const loading = ref(false)
  const issue = shallowRef<ExportTaskValidationIssue | null>(null)
  const pageCount = computed(() => plan.value ? exportPreviewPageCount(plan.value) : 0)
  const spreadAvailable = computed(() => Boolean(plan.value?.pdf))
  const pageStep = computed(() => spreadAvailable.value && options.spread.value ? 2 : 1)
  const images = new Map<number, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let request: AbortController | undefined

  function takeImages(): string[] {
    const urls = [...images.values()]
    images.clear()
    return urls
  }
  function revoke(urls: readonly string[]): void {
    urls.forEach(url => URL.revokeObjectURL(url))
  }

  async function showPage(activePlan: ExportPlan, index: number, owner: AbortController): Promise<void> {
    const start = index - index % pageStep.value
    pageIndex.value = start
    const indices = [start, start + 1].slice(0, pageStep.value).filter(page => page < pageCount.value)
    const urls: string[] = []
    for (const page of indices) {
      let url = images.get(page)
      if (!url) {
        const blob = await options.renderPage(activePlan, page, owner.signal)
        if (owner.signal.aborted) return
        url = URL.createObjectURL(blob)
        images.set(page, url)
      }
      urls.push(url)
    }
    imageUrls.value = urls
  }

  async function run(work: (owner: AbortController) => Promise<void>): Promise<void> {
    request?.abort()
    const owner = new AbortController()
    request = owner
    loading.value = true
    try {
      await work(owner)
    } catch (error) {
      if (owner.signal.aborted) return
      plan.value = null
      imageUrls.value = []
      issue.value = { code: 'preview-failed', message: error instanceof Error ? error.message : String(error) }
    } finally {
      if (request === owner) loading.value = false
    }
  }

  function refresh(profile: ExportProfile): Promise<void> {
    return run(async (owner) => {
      const result = await options.plan(profile, owner.signal)
      if (owner.signal.aborted) return
      const stale = takeImages()
      if (result.ok) {
        plan.value = result.plan
        issue.value = null
        await showPage(result.plan, Math.min(pageIndex.value, pageCount.value - 1), owner)
      } else {
        plan.value = null
        imageUrls.value = []
        issue.value = result.issues[0] ?? null
      }
      revoke(stale)
    })
  }

  function selectPage(index: number): void {
    const activePlan = plan.value
    if (activePlan && index >= 0 && index < pageCount.value) void run(owner => showPage(activePlan, index, owner))
  }

  function reset(): void {
    clearTimeout(timer)
    request?.abort()
    plan.value = null
    pageIndex.value = 0
    imageUrls.value = []
    issue.value = null
    loading.value = false
    revoke(takeImages())
    options.release()
  }

  watch([options.profile, options.active, options.switched], ([profile, active, switched], previous) => {
    clearTimeout(timer)
    if (!profile || !active) return reset()
    if (switched !== previous?.[2]) pageIndex.value = 0
    timer = setTimeout(() => { void refresh(profile) }, PREVIEW_DELAY_MS)
  }, { immediate: true })
  watch(options.spread, () => {
    const activePlan = plan.value
    if (activePlan) void run(owner => showPage(activePlan, pageIndex.value, owner))
  })
  onScopeDispose(reset)

  return { pageIndex, pageCount, pageStep, spreadAvailable, imageUrls, loading, issue, selectPage }
}
