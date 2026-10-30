import { describe, expect, it } from 'vitest'
import type { ProjectIconCatalog } from '../../../features/workspace/services/projectIconCatalog'
import { renderMarkdown } from './renderMarkdown'

const catalog: ProjectIconCatalog = {
  series: [{ name: 'Status icons', key: 'status' }],
  entries: [{ iconKey: 'wide', name: 'Wide', source: 'icons/wide.svg', tint: 'context', seriesKey: 'status', src: 'asset://status' }],
}

describe('renderMarkdown project icons', () => {
  it('renders a missing reference as an accessible placeholder and leaves code and escapes literal', () => {
    const missing = renderMarkdown('[[icon:status/missing]]', {
      projectIconCatalog: catalog,
      missingProjectIconLabel: 'Unavailable icon',
    })
    expect(missing).toContain('aria-label="Unavailable icon"')
    expect(missing).not.toContain('[[icon:status/missing]]')
    expect(renderMarkdown('`[[icon:status/wide]]`', { projectIconCatalog: catalog }))
      .toContain('[[icon:status/wide]]')
    expect(renderMarkdown('\\[[icon:status/wide]]', { projectIconCatalog: catalog }))
      .toContain('[[icon:status/wide]]')
  })

  it('resolves each icon through the supplied reference resolver', () => {
    const references: string[] = []
    renderMarkdown('[[icon:status/wide]]', {
      resolveIconReference: source => {
        references.push(source)
        return catalog.entries[0]!
      },
    })
    expect(references).toEqual(['icon:status/wide'])
  })

  it('reads the coordinate#icon spelling and leaves the retired package@icon spelling alone', () => {
    const references: string[] = []
    const resolveIconReference = (source: string) => {
      references.push(source)
      return catalog.entries[0]!
    }

    renderMarkdown('[[alice/theme@1.0.0#icon:status/wide]]', { resolveIconReference })
    expect(references).toEqual(['alice/theme@1.0.0#icon:status/wide'])
    expect(renderMarkdown('[[alice/theme@icon:status/wide]]', { resolveIconReference }))
      .toContain('[[alice/theme@icon:status/wide]]')
    expect(references).toHaveLength(1)
  })
})
