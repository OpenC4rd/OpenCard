import { parseExportProfiles } from './projectExportProfile'
import { describe, expect, it } from 'vitest'
import {
  parseProjectMetadata,
  parseProjectMetadataText,
  serializeProjectMetadata,
} from './projectMetadata'

describe('project profile metadata', () => {
  it('accepts an empty profile', () => {
    expect(parseProjectMetadata({})).toEqual({})
    expect(parseProjectMetadataText('{}')).toEqual({})
  })

  it('ignores legacy registries and other unknown top-level fields', () => {
    expect(parseProjectMetadata({
      name: 'Demo',
      fonts: { 'brand-sans': { family: 'Brand Sans', faces: [] } },
      iconSeries: [{ invalid: true }],
      globalvariables: {},
    })).toEqual({ name: 'Demo' })
  })

  it('rejects wrong values for known fields', () => {
    expect(parseProjectMetadata({ version: 2 })).toBeNull()
    expect(parseProjectMetadataText('{broken')).toBeNull()
  })

  it('normalizes an HTTPS remote-resource host allowlist', () => {
    expect(parseProjectMetadata({
      remoteResources: {
        mode: 'allowlist',
        allowedHosts: ['Images.Example.com.', '*.cdn.example.com', 'images.example.com'],
      },
    })).toEqual({
      remoteResources: {
        mode: 'allowlist',
        allowedHosts: ['images.example.com', '*.cdn.example.com'],
      },
    })
  })

  it('rejects malformed remote-resource policies', () => {
    expect(parseProjectMetadata({ remoteResources: { mode: 'allow-all' } })).toEqual({
      remoteResources: { mode: 'allow-all' },
    })
    expect(parseProjectMetadata({ remoteResources: { mode: 'deny', allowedHosts: [] } })).toBeNull()
    expect(parseProjectMetadata({
      remoteResources: { mode: 'allowlist', allowedHosts: ['https://example.com/image.png'] },
    })).toBeNull()
  })

  it('omits empty fields when serializing', () => {
    expect(JSON.parse(serializeProjectMetadata({ name: '', description: '', version: '' }))).toEqual({})
  })

  it('normalizes a project cover path and drops unsafe or missing ones', () => {
    expect(parseProjectMetadata({ cover: '  assets\\cover.png  ' })).toEqual({ cover: 'assets/cover.png' })
    expect(parseProjectMetadata({ cover: '.opencard/cover.webp' })).toEqual({ cover: '.opencard/cover.webp' })
    expect(parseProjectMetadata({ name: 'Demo', cover: '../cover.png' })).toEqual({ name: 'Demo' })
    expect(parseProjectMetadata({ name: 'Demo', cover: 7 })).toEqual({ name: 'Demo' })
    expect(parseProjectMetadata({ name: 'Demo', cover: '' })).toEqual({ name: 'Demo' })
  })

  it('round-trips a declared cover without inventing a file check', () => {
    expect(JSON.parse(serializeProjectMetadata({ name: 'Demo', cover: 'assets/missing.png' })))
      .toEqual({ name: 'Demo', cover: 'assets/missing.png' })
  })

  it('ignores export configuration, which lives in its own files', () => {
    expect(parseProjectMetadata({ name: 'Demo', exportTask: { scale: 0 } })).toEqual({ name: 'Demo' })
  })
})

describe('parseExportProfiles', () => {
  it('fills defaults for a malformed profile instead of rejecting it', () => {
    const [profile] = parseExportProfiles([{ documents: 'nope', rule: { kind: 'pdf', dpi: 1, paper: { size: 'nope', gapX: -1 } } }])
    expect(profile).toMatchObject({ documents: [], rule: { kind: 'pdf', dpi: 300, paper: { size: 'a4', gapX: 0 } } })
  })

  it('ignores unknown fields', () => {
    const [profile] = parseExportProfiles([{ name: 'one', futureField: true }])
    expect(profile).toMatchObject({ name: 'one', errorPolicy: 'continue' })
    expect(profile).not.toHaveProperty('futureField')
  })
})
