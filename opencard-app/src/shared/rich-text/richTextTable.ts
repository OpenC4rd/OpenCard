/** HTML table geometry shared by editing, sanitizing, and rendering projections. */
export function richTextCellAttributes(cell: Element): Record<string, string> {
  const span = (name: string) => {
    const value = Number(cell.getAttribute(name))
    return Number.isInteger(value) && value > 0 ? Math.min(value, 1000) : 1
  }
  const colspan = span('colspan')
  const widths = (cell.getAttribute('colwidth') ?? '').split(',').slice(0, colspan)
    .map(value => /^\d+$/.test(value) && Number(value) <= 1_000_000 ? Number(value) : 0)
  return {
    colspan: String(colspan), rowspan: String(span('rowspan')),
    ...(widths.length === colspan && widths.some(Boolean) ? { colwidth: widths.join(',') } : {}),
  }
}

export function richTextColumnWidths(table: HTMLTableElement): number[] {
  return Array.from(table.rows[0]?.cells ?? []).flatMap(cell => {
    const attrs = richTextCellAttributes(cell)
    return attrs.colwidth?.split(',').map(Number) ?? Array<number>(Number(attrs.colspan)).fill(0)
  })
}

/** Project column layout into the cell attributes understood by the editor schema.
 * Colgroups and table min-width are derived; explicit unsupported layouts stay visible
 * to the source handoff check instead of silently disappearing.
 */
export function normalizeRichTextTables(root: HTMLElement): void {
  for (const table of root.querySelectorAll('table')) {
    for (const row of Array.from(table.rows)) for (const cell of Array.from(row.cells)) {
      const attrs = richTextCellAttributes(cell)
      if (!attrs.colwidth) cell.removeAttribute('colwidth')
      for (const [name, value] of Object.entries(attrs)) cell.setAttribute(name, value)
    }
    const cells = Array.from(table.rows[0]?.cells ?? [])
    const columns = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'))
    let column = 0
    for (const cell of cells) {
      const attrs = richTextCellAttributes(cell)
      if (!attrs.colwidth) {
        const widths = columns.slice(column, column + Number(attrs.colspan)).map(col =>
          /^\d+(?:\.\d+)?px$/.test(col.style.width) ? Math.round(Number.parseFloat(col.style.width)) : 0)
        if (widths.length === Number(attrs.colspan) && widths.some(Boolean)) attrs.colwidth = widths.join(',')
      }
      for (const [name, value] of Object.entries(attrs)) cell.setAttribute(name, value)
      column += Number(attrs.colspan)
    }
    // Strip only the pixel layout generated from cell widths; keep custom layout for comparison.
    const widths = richTextColumnWidths(table)
    const total = widths.reduce((sum, width) => sum + (width || 25), 0)
    if (table.style.width === `${total}px` && widths.every(Boolean)) table.style.removeProperty('width')
    if (table.style.minWidth === `${total}px`) table.style.removeProperty('min-width')
    for (const group of table.querySelectorAll(':scope > colgroup')) {
      if (Array.from(group.children).every(col => {
        const style = (col as HTMLElement).style
        return (!style.width || /^\d+(?:\.\d+)?px$/.test(style.width))
          && (!style.minWidth || style.minWidth === '25px')
      })) group.remove()
    }
    // Header meaning lives on TH cells, not on the optional HTML row-group wrapper.
    const rows = Array.from(table.rows)
    const body = table.ownerDocument.createElement('tbody')
    body.append(...rows)
    for (const group of table.querySelectorAll(':scope > thead, :scope > tbody')) group.remove()
    table.append(body)
  }
}
