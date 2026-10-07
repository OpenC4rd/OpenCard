import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  TemplateServiceError,
  PROJECT_TEMPLATE_PACKAGE_SUFFIX,
  validateTemplateDescription,
  validateTemplateName,
  type TemplateProjectInspection,
} from '../model/projectTemplate'
import { useProjectTemplateStore } from '../store/projectTemplateStore'
import { notifyError } from '../../notifications/titlebarNotices'
import { publishAppOutput } from '../../logging/appOutput'

export function createTemplateExportForm(options: {
  projectPath: Readonly<Ref<string>>
  onExported: (path: string) => void
}) {
  const { t } = useI18n()
  const store = useProjectTemplateStore()
  const inspection = ref<TemplateProjectInspection | null>(null)
  const name = ref('')
  const description = ref('')
  const entries = ref<string[]>([])
  const covers = ref<string[]>([])
  const excludedPaths = ref<string[]>([])
  const isInspecting = ref(false)
  const isExporting = ref(false)

  const isBusy = computed(() => isInspecting.value || isExporting.value)
  const nameError = computed(() => name.value.length > 0 && validateTemplateName(name.value) !== null)
  const canExport = computed(() => Boolean(
    inspection.value
    && entries.value.length > 0
    && !validateTemplateName(name.value)
    && !validateTemplateDescription(description.value)
    && !isBusy.value,
  ))

  function normalizeRelativePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  }

  function pathContains(parent: string, child: string): boolean {
    return child === parent || child.startsWith(`${parent}/`)
  }

  function coverSource(cover: string): string {
    const separator = options.projectPath.value.includes('\\') ? '\\' : '/'
    return convertFileSrc(`${options.projectPath.value.replace(/[\\/]+$/, '')}${separator}${cover.replace(/\//g, separator)}`)
  }

  const selection = computed(() => ({
    excludedPaths: excludedPaths.value, entries: entries.value,
    entryNames: inspection.value?.entryNames ?? {}, covers: covers.value,
  }))

  let inspectionTicket = 0
  async function reset(inspect = true): Promise<void> {
    const ticket = ++inspectionTicket
    const path = options.projectPath.value
    inspection.value = null
    name.value = ''; description.value = ''; entries.value = []; covers.value = []; excludedPaths.value = []
    if (!path || !inspect) { isInspecting.value = false; return }
    isInspecting.value = true
    try {
      const result = await store.inspectProjectSource(path)
      if (ticket !== inspectionTicket || options.projectPath.value !== path) return
      inspection.value = result
      name.value = result.suggestedName
      entries.value = result.entries.slice(0, 1)
    } catch (cause) { if (ticket === inspectionTicket) reportFailure(cause) }
    finally { if (ticket === inspectionTicket) isInspecting.value = false }
  }

  function togglePathIncluded(path: string): void {
    const normalized = normalizeRelativePath(path)
    if (!normalized || normalized === 'project.json' || normalized === 'fonts.json' || normalized === 'icons.json' || normalized === 'locale.json') return
    const coveringExclusion = excludedPaths.value.find((excluded) => pathContains(excluded, normalized))
    if (coveringExclusion) {
      excludedPaths.value = excludedPaths.value.filter((excluded) => excluded !== coveringExclusion)
    } else {
      excludedPaths.value = excludedPaths.value
        .filter((excluded) => !pathContains(normalized, excluded))
        .concat(normalized)
      entries.value = entries.value.filter((entry) => !pathContains(normalized, entry))
      covers.value = covers.value.filter((cover) => !pathContains(normalized, cover))
    }
  }

  function toggleEntry(path: string): void {
    const normalized = normalizeRelativePath(path)
    if (!inspection.value?.entries.includes(normalized) || isPathExcluded(normalized)) return
    entries.value = entries.value.includes(normalized)
      ? entries.value.filter((entry) => entry !== normalized)
      : [...entries.value, normalized]
  }

  function toggleCover(path: string): void {
    const normalized = normalizeRelativePath(path)
    if (!inspection.value?.coverCandidates.includes(normalized) || isPathExcluded(normalized)) return
    covers.value = covers.value.includes(normalized)
      ? covers.value.filter((cover) => cover !== normalized)
      : [...covers.value, normalized]
  }

  function isPathExcluded(path: string): boolean {
    const normalized = normalizeRelativePath(path)
    return normalized === '.opencard-cache'
      || normalized.startsWith('.opencard-cache/')
      || excludedPaths.value.some((excluded) => pathContains(excluded, normalized))
  }


  function safeFileName(value: string): string {
    return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'template'
  }

  async function exportTemplate(): Promise<void> {
    if (!canExport.value || !inspection.value) return
    const ticket = inspectionTicket
    const snapshot = {
      sourcePath: options.projectPath.value, name: name.value, description: description.value,
      entry: entries.value[0], entries: [...entries.value], covers: [...covers.value], excludedPaths: [...excludedPaths.value],
    }
    isExporting.value = true
    try {
      const outputPath = await store.pickTemplateExportPath(
        `${safeFileName(snapshot.name)}${PROJECT_TEMPLATE_PACKAGE_SUFFIX}`,
        t('templateExport.dialogs.chooseOutput'),
      )
      if (!outputPath || ticket !== inspectionTicket || options.projectPath.value !== snapshot.sourcePath) return
      const exportedPath = await store.exportProjectTemplate({ ...snapshot, outputPath })
      options.onExported(exportedPath)
    } catch (cause) {
      reportFailure(cause)
    } finally {
      isExporting.value = false
    }
  }

  /** 一次性失败交给即时信息，具体原因留在输出里，页面不再长期挂着过期报错。 */
  function reportFailure(cause: unknown): void {
    const message = resolveError(cause)
    notifyError(message)
    publishAppOutput({ severity: 'error', message, detail: describeFailure(cause) })
  }

  function describeFailure(cause: unknown): string {
    if (cause instanceof TemplateServiceError) return `${cause.code}: ${cause.message}`
    return cause instanceof Error ? cause.message : String(cause)
  }

  function resolveError(cause: unknown): string {
    if (!(cause instanceof TemplateServiceError)) return t('projectTemplates.errors.unknown')
    const keys: Partial<Record<TemplateServiceError['code'], string>> = {
      'invalid-template-name': 'invalidTemplateName',
      'description-too-long': 'descriptionTooLong',
      'source-not-project': 'sourceNotProject',
      'source-has-symlink': 'sourceHasSymlink',
      'entry-not-found': 'entryNotFound',
      'cover-not-found': 'coverNotFound',
      'archive-failed': 'archiveFailed',
    }
    return t(`projectTemplates.errors.${keys[cause.code] ?? 'unknown'}`)
  }

  return { inspection, name, description, entries, covers, excludedPaths, isInspecting, isExporting, isBusy, nameError, canExport, coverSource, togglePathIncluded, toggleEntry, toggleCover, exportTemplate, selection, reset }
}
