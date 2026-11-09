import { describe, expect, it } from 'vitest'
import type { ProjectIcon } from '../../features/workspace/model/projectIcons'
import { applyProjectIconProperty, createProjectIconPropertyInput, projectIconKind } from './projectIconProperties'

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
const vector: ProjectIcon = { iconKey: 'warn', name: 'Warn', source: '.opencard/icons/s/warn.svg', tint: 'context' }
const raster: ProjectIcon = { iconKey: 'gem', name: 'Gem', source: '.opencard/icons/s/gem.png', tint: 'original' }
const sprite: ProjectIcon = { iconKey: 'c1', name: 'C1', source: '.opencard/icons/s/sheet.png', tint: 'original', pixelated: true, crop: { x: 16, y: 0, w: 16, h: 16 } }
const project = (icons: ProjectIcon[], size = { width: 24, height: 24 }) => createProjectIconPropertyInput(icons, { t, readSize: () => size })!

describe('createProjectIconPropertyInput', () => {
  it('tells what kind of icon it is, which file, and how big, without letting those be edited', () => {
    const input = project([sprite])
    expect(projectIconKind(vector)).toBe('vector')
    expect(projectIconKind(raster)).toBe('raster')
    expect(input.record).toMatchObject({ kind: 'projectConfig.icons.kinds.raster', file: 'sheet.png', size: '16 × 16' })
    for (const key of ['kind', 'file', 'size']) expect(input.fields[key]).toMatchObject({ isReadonly: true, category: 'file' })
    // A cropped icon's size is its crop; anything else is the measured file.
    expect(project([raster]).record.size).toBe('24 × 24')
  })

  it('offers only what the kind can use, and the cell only for a sprite', () => {
    expect(Object.keys(project([vector]).fields)).toEqual(expect.arrayContaining(['tint']))
    expect(project([vector]).fields).not.toHaveProperty('pixelated')
    expect(project([raster]).fields).not.toHaveProperty('tint')
    expect(project([raster]).fields).not.toHaveProperty('cropX')
    expect(project([raster]).record.cropped).toBe('false')
    expect(project([sprite]).record.cropped).toBe('true')
    // A vector cannot be cropped, so it is not offered.
    expect(project([vector]).fields).not.toHaveProperty('cropped')
    expect(project([sprite]).record).toMatchObject({ cropX: '16', cropY: '0', cropW: '16', cropH: '16' })
    // Field editors read text: any other value type renders as an empty field.
    for (const icons of [[vector], [raster], [sprite], [raster, sprite]]) {
      expect(Object.values(project(icons).record).every(value => typeof value === 'string')).toBe(true)
    }
  })

  it('merges a multiple selection into one input, marking disagreement as mixed', () => {
    const input = project([raster, sprite])
    expect(input.fields).not.toHaveProperty('iconKey')
    expect(input.fields).not.toHaveProperty('name')
    expect(input.fields).not.toHaveProperty('cropX')
    expect(input.fields).not.toHaveProperty('cropped')
    // Both are bitmaps: the kind is shared even though one is cropped.
    expect(input.fields.kind?.valueState).toBe('value')
    expect(project([vector, raster]).record.kind).toBe('propertyEditor.richText.mixed')
    expect(input.fields.pixelated?.valueState).toBe('mixed')
    // The sprite's size is its 16-pixel cell, the bitmap's its 24-pixel file: they disagree.
    expect(input.fields.size?.valueState).toBe('mixed')
    expect(project([raster, { ...raster, iconKey: 'gem2' }]).fields.pixelated?.valueState).toBe('value')
    // A vector and a raster share no display option at all.
    expect(project([vector, raster]).fields).not.toHaveProperty('tint')
    expect(project([vector, raster]).fields).not.toHaveProperty('pixelated')
  })
})

describe('applyProjectIconProperty', () => {
  it('writes what the field holds and refuses what it cannot', () => {
    expect(applyProjectIconProperty(raster, 'pixelated', 'true').pixelated).toBe(true)
    expect(applyProjectIconProperty(vector, 'tint', 'original').tint).toBe('original')
    expect(applyProjectIconProperty(vector, 'tint', 'blue')).toBe(vector)
    expect(applyProjectIconProperty(sprite, 'cropX', '32').crop).toEqual({ x: 32, y: 0, w: 16, h: 16 })
    expect(applyProjectIconProperty(sprite, 'cropW', '0')).toBe(sprite)
    expect(applyProjectIconProperty(sprite, 'cropY', '1.5')).toBe(sprite)
    expect(applyProjectIconProperty(raster, 'cropX', '4')).toBe(raster)
    // Turning cropping on starts from the whole file, and needs its size; turning it off drops the crop.
    expect(applyProjectIconProperty(raster, 'cropped', 'true', { width: 48, height: 32 }).crop).toEqual({ x: 0, y: 0, w: 48, h: 32 })
    expect(applyProjectIconProperty(raster, 'cropped', 'true')).toBe(raster)
    expect(applyProjectIconProperty(sprite, 'cropped', 'false')).not.toHaveProperty('crop')
    expect(applyProjectIconProperty(vector, 'cropped', 'true', { width: 24, height: 24 })).toBe(vector)
  })
})
