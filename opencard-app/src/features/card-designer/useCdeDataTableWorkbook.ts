import { computed, ref, shallowRef, type Ref } from 'vue'
import { notifyError } from '../notifications/titlebarNotices'
import type { CardDocument } from '../../entities/card/model'
import { fileSystemService } from '../workspace/services/fileSystemService'
import {
  exportCardDataWorkbook,
  importCardDataWorkbook,
  type CardDataWorkbookImportResult,
} from './cardDataWorkbook'
import type {
  CdeDataTableColumn,
  CdeDataTableFaceGroup,
} from './useCdeDataTableModel'

type UseCdeDataTableWorkbookOptions = {
  cardDoc: Readonly<Ref<CardDocument | null>>
  columns: Readonly<Ref<readonly CdeDataTableColumn[]>>
  faceGroups: Readonly<Ref<readonly CdeDataTableFaceGroup[]>>
  exportInstanceIds: Readonly<Ref<readonly string[]>>
  applyImport: (result: CardDataWorkbookImportResult) => boolean
  openAfterExport: Readonly<Ref<boolean>>
  translate: (key: string, parameters?: Record<string, unknown>) => string
}

export function useCdeDataTableWorkbook(options: UseCdeDataTableWorkbookOptions) {
  const busy = ref(false)
  const pendingImport = shallowRef<CardDataWorkbookImportResult | null>(null)
  const canExport = computed(() => Boolean(
    options.cardDoc.value
    && options.faceGroups.value.some(face => face.blocks.some(block => block.fields.length > 0)),
  ))

  async function exportWorkbook(): Promise<void> {
    const document = options.cardDoc.value
    if (!document || !canExport.value || busy.value) return
    busy.value = true
    try {
      const path = await fileSystemService.pickSavePath({
        defaultPath: `${safeFileName(document.name?.trim() || document.id)}.xlsx`,
        fileTypeName: 'Excel Workbook',
        extensions: ['xlsx'],
        title: options.translate('cardDesigner.dataTable.exportWorkbook'),
      })
      if (!path) return
      const bytes = await exportCardDataWorkbook({
        document,
        columns: options.columns.value,
        faceGroups: options.faceGroups.value,
        exportInstanceIds: options.exportInstanceIds.value,
        labels: {
          face: options.translate('cardDesigner.dataTable.workbookFaceColumn'),
          block: options.translate('cardDesigner.dataTable.workbookBlockColumn'),
          field: options.translate('cardDesigner.dataTable.workbookFieldColumn'),
        },
      })
      await fileSystemService.writeBinaryFile(path, bytes)
      if (options.openAfterExport.value) {
        try {
          await fileSystemService.openWithDefaultApp(path)
        } catch {
          notifyWorkbookError(options.translate('cardDesigner.dataTable.openExportedWorkbookFailed'))
        }
      }
    } catch (error) {
      notifyWorkbookError(errorMessage(error, options.translate('cardDesigner.dataTable.exportFailed')))
    } finally {
      busy.value = false
    }
  }

  async function importWorkbook(): Promise<void> {
    const document = options.cardDoc.value
    if (!document || busy.value) return
    busy.value = true
    try {
      const path = await fileSystemService.pickFile({
        title: options.translate('cardDesigner.dataTable.importWorkbook'),
        fileTypeName: 'Excel Workbook',
        extensions: ['xlsx'],
      })
      if (!path) return
      const bytes = await fileSystemService.readBinaryFile(path)
      pendingImport.value = await importCardDataWorkbook(bytes, document, options.faceGroups.value)
    } catch (error) {
      notifyWorkbookError(errorMessage(error, options.translate('cardDesigner.dataTable.importFailed')))
    } finally {
      busy.value = false
    }
  }

  function confirmImport(): void {
    if (!pendingImport.value) return
    options.applyImport(pendingImport.value)
    pendingImport.value = null
  }

  function cancelImport(): void {
    pendingImport.value = null
  }

  function notifyWorkbookError(body: string): void {
    notifyError(body)
  }

  return {
    busy,
    canExport,
    pendingImport,
    exportWorkbook,
    importWorkbook,
    confirmImport,
    cancelImport,
  }
}

function safeFileName(value: string): string {
  const normalized = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  return normalized || 'OpenCard Data'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
