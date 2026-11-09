/** 最小的 PDF 写入器：每页一张铺满的 JPEG。JPEG 原样嵌入（DCTDecode），不重新编码。 */
export type PdfImagePage = {
  /** 页面尺寸，单位 mm。 */
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  jpeg: Uint8Array
}

const POINTS_PER_MM = 72 / 25.4

export function buildImagePdf(pages: readonly PdfImagePage[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let position = 0
  const write = (chunk: string | Uint8Array): void => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    chunks.push(bytes)
    position += bytes.length
  }
  const writeObject = (id: number, ...parts: (string | Uint8Array)[]): void => {
    offsets[id] = position
    write(`${id} 0 obj\n`)
    parts.forEach(write)
    write('\nendobj\n')
  }

  // 每页三个对象：页面、内容流、图片；1、2 号留给目录和页树。
  const pageId = (index: number): number => 3 + index * 3
  write('%PDF-1.4\n')
  writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>')
  const kids = pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')
  writeObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  pages.forEach((page, index) => {
    const id = pageId(index)
    const width = (page.width * POINTS_PER_MM).toFixed(3)
    const height = (page.height * POINTS_PER_MM).toFixed(3)
    const content = `q ${width} 0 0 ${height} 0 0 cm /Page Do Q`
    writeObject(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] `
      + `/Resources << /XObject << /Page ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`)
    writeObject(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    writeObject(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    page.jpeg, '\nendstream')
  })

  const objectCount = offsets.length
  const xrefPosition = position
  const entries = offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  write(`xref\n0 ${objectCount}\n0000000000 65535 f \n${entries}`)
  write(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`)

  const output = new Uint8Array(position)
  let cursor = 0
  for (const chunk of chunks) {
    output.set(chunk, cursor)
    cursor += chunk.length
  }
  return output
}
