import { describe, expect, it } from 'vitest'
import {
  parseProjectIconRegistry,
  parseProjectIconRegistryText,
  serializeProjectIconRegistry,
} from './projectIconRegistry'

describe('project icon registry', () => {
  it('keeps icon series and ignores unknown document and icon fields', () => {
    expect(parseProjectIconRegistry({
      schemaVersion: 1,
      iconSeries: [{
        name: 'Status icons',
        key: 'status',
        grid: { snapToGrid: true, rows: 2, columns: 3 },
        icons: [{
          iconKey: 'warning', name: 'Warning',
          source: 'alice/theme@1.0.0#icons/warning.svg', tint: 'original', pixelated: true,
          x: 0, y: 0, width: 16, height: 16, atlasRotation: 90,
        }],
      }],
    })).toEqual({
      iconSeries: [{
        name: 'Status icons',
        key: 'status',
        icons: [{
          iconKey: 'warning', name: 'Warning',
          source: 'alice/theme@1.0.0#icons/warning.svg', tint: 'original', pixelated: true,
        }],
      }],
    })
  })

  it('ignores unknown nested fields without accepting missing names', () => {
    expect(parseProjectIconRegistry({
      iconSeries: [{ name: 'Status icons', key: 'status', width: 32, icons: [] }],
    })).toEqual({ iconSeries: [{ name: 'Status icons', key: 'status', icons: [] }] })
    expect(parseProjectIconRegistry({
      iconSeries: [{ key: 'status', icons: [] }],
    })).toBeNull()
  })

  it('uses an empty canonical document and rejects invalid JSON', () => {
    expect(JSON.parse(serializeProjectIconRegistry({ iconSeries: [] }))).toEqual({})
    expect(parseProjectIconRegistryText('{broken')).toBeNull()
  })
})
