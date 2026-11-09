// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildImagePdf } from './imagePdf'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
const page = { width: 210, height: 297, pixelWidth: 2, pixelHeight: 3, jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }

describe('buildImagePdf', () => {
  it('writes one page per image at the physical paper size', () => {
    const pdf = text(buildImagePdf([page, { ...page, width: 100, height: 100 }]))

    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('/Count 2')
    expect(pdf).toContain('/MediaBox [0 0 595.276 841.890]')
    expect(pdf).toContain('/Width 2 /Height 3')
    expect(pdf).toContain('/Filter /DCTDecode /Length 4')
  })

  it('points the cross-reference table at every object', () => {
    const pdf = text(buildImagePdf([page]))
    const xrefPosition = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(xrefPosition, xrefPosition + 4)).toBe('xref')

    const offsets = [...pdf.slice(xrefPosition).matchAll(/(\d{10}) 00000 n/g)].map(match => Number(match[1]))
    expect(offsets).toHaveLength(5)
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset, offset + 8)).toBe(`${index + 1} 0 obj\n`)
    })
  })
})
