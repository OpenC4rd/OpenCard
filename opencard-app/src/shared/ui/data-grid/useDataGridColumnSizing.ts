import { reactive, type Ref } from 'vue'
import { resolveOcPixelToken, type OcThemeTokenKey } from '../foundation'

type DataGridColumnSizingOptions = {
  root: Ref<HTMLElement | null>
  defaultWidthToken: (key: string) => OcThemeTokenKey
}

export function useDataGridColumnSizing(options: DataGridColumnSizingOptions) {
  const widths = reactive<Record<string, number>>({})
  let resizeState: { key: string, startX: number, startWidth: number } | null = null
  let previousDocumentCursor = ''
  let previousDocumentUserSelect = ''

  function metric(token: OcThemeTokenKey): number {
    return resolveOcPixelToken(token, options.root.value)
  }

  function getColumnWidth(key: string): number {
    return widths[key] ?? metric(options.defaultWidthToken(key))
  }

  function setColumnWidth(key: string, width: number): void {
    const minimum = metric('--oc-data-grid-column-min-width')
    const maximum = metric('--oc-data-grid-column-max-width')
    widths[key] = Math.min(maximum, Math.max(minimum, Math.round(width)))
  }

  function finishColumnResize(): void {
    if (!resizeState) return
    resizeState = null
    document.documentElement.style.cursor = previousDocumentCursor
    document.documentElement.style.userSelect = previousDocumentUserSelect
    options.root.value?.classList.remove('is-resizing-column')
    window.removeEventListener('pointermove', handleColumnResizeMove)
    window.removeEventListener('pointerup', finishColumnResize)
    window.removeEventListener('pointercancel', finishColumnResize)
    window.removeEventListener('blur', finishColumnResize)
  }

  function handleColumnResizeMove(event: PointerEvent): void {
    if (!resizeState) return
    setColumnWidth(resizeState.key, resizeState.startWidth + event.clientX - resizeState.startX)
  }

  function beginColumnResize(event: PointerEvent, key: string): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    finishColumnResize()
    resizeState = { key, startX: event.clientX, startWidth: getColumnWidth(key) }
    previousDocumentCursor = document.documentElement.style.cursor
    previousDocumentUserSelect = document.documentElement.style.userSelect
    document.documentElement.style.cursor = 'col-resize'
    document.documentElement.style.userSelect = 'none'
    options.root.value?.classList.add('is-resizing-column')
    window.addEventListener('pointermove', handleColumnResizeMove)
    window.addEventListener('pointerup', finishColumnResize)
    window.addEventListener('pointercancel', finishColumnResize)
    window.addEventListener('blur', finishColumnResize)
  }

  function handleColumnResizeKeydown(event: KeyboardEvent, key: string): void {
    const minimum = metric('--oc-data-grid-column-min-width')
    const maximum = metric('--oc-data-grid-column-max-width')
    const step = metric('--oc-data-grid-column-resize-step')
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') nextWidth = getColumnWidth(key) - step
    else if (event.key === 'ArrowRight') nextWidth = getColumnWidth(key) + step
    else if (event.key === 'Home') nextWidth = minimum
    else if (event.key === 'End') nextWidth = maximum
    if (nextWidth === null) return
    event.preventDefault()
    setColumnWidth(key, nextWidth)
  }

  return {
    getColumnWidth,
    setColumnWidth,
    beginColumnResize,
    handleColumnResizeKeydown,
    finishColumnResize,
    minimumWidth: () => metric('--oc-data-grid-column-min-width'),
    maximumWidth: () => metric('--oc-data-grid-column-max-width'),
    tailColumnWidth: () => metric('--oc-data-grid-tail-column-width'),
  }
}
