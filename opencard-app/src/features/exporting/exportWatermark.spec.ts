// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createExportWatermark, type ExportWatermark } from '../workspace/model/projectExportProfile'
import { createExportWatermarkChildren } from './exportWatermark'

const tile = (patch: Partial<ExportWatermark>) =>
  createExportWatermarkChildren({ ...createExportWatermark(), enabled: true, text: 'DRAFT', ...patch }, 210, 297)
const block = (child: ReturnType<typeof tile>[number]) => child.block as unknown as Record<string, string>

describe('createExportWatermarkChildren', () => {
  it('makes nothing when off or empty', () => {
    expect(tile({ enabled: false })).toEqual([])
    expect(tile({ text: '  ' })).toEqual([])
  })

  it('carries the text and style on every block', () => {
    const [first] = tile({ angle: 45, opacity: 0.2, size: 8, text: '@bold{样张}', color: '#ff0000' })
    expect(block(first!)).toMatchObject({ content: '@bold{样张}', rotation: '45', opacity: '0.2', fontSize: '8mm', color: '#ff0000' })
  })

  it('places more blocks when denser and reaches every corner', () => {
    const dense = tile({ density: 'dense', angle: 0 })
    expect(dense.length).toBeGreaterThan(tile({ density: 'sparse', angle: 0 }).length)
    const xs = dense.map(child => Number.parseFloat(child.location.x!))
    const ys = dense.map(child => Number.parseFloat(child.location.y!))
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(210 - 48)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(297 - 24)
  })
})
