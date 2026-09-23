import { describe, expect, it } from 'vitest'
import type { ProjectIconCatalog } from '../../workspace/services/projectIconCatalog'
import { renderMarkdown } from './renderMarkdown'

const catalog: ProjectIconCatalog = {
  series: [{ name: 'Status icons', key: 'status' }],
  entries: [{ iconKey: 'wide', name: 'Wide', source: 'icons/wide.svg', tint: 'theme', seriesKey: 'status', src: 'asset://status' }],
  errors: [],
}
/** Sizes as the resolver reports them once the icon has been painted. */
const readSize = () => ({ width: 16, height: 8 })

describe('renderMarkdown project icons', () => {
  it('renders a valid project icon at its original crop ratio', () => {
    const html = renderMarkdown('A [[icon:status/wide]] B', { projectIconCatalog: catalog, readIconDimensions: readSize })
    expect(html).toContain('project-inline-icon oc-project-icon')
    expect(html).toContain('width:2em')
  })

  it('renders missing references as a stable placeholder and ignores inline code and escaped syntax', () => {
    const missing = renderMarkdown('[[icon:status/missing]]', {
      projectIconCatalog: catalog,
      missingProjectIconLabel: 'Unavailable icon',
    })
    expect(missing).toContain('project-inline-icon--missing')
    expect(missing).toContain('aria-label="Unavailable icon"')
    expect(missing).not.toContain('[[icon:status/missing]]')
    expect(renderMarkdown('`[[icon:status/wide]]`', { projectIconCatalog: catalog })).not.toContain('project-inline-icon')
    expect(renderMarkdown('\\[[icon:status/wide]]', { projectIconCatalog: catalog })).not.toContain('project-inline-icon')
  })

  it('resolves each icon through the supplied reference resolver', () => {
    const references: string[] = []
    const html = renderMarkdown('[[icon:status/wide]]', {
      resolveIconReference: source => {
        references.push(source)
        return catalog.entries[0]!
      },
    })
    expect(references).toEqual(['icon:status/wide'])
    expect(html).toContain('project-inline-icon oc-project-icon')
  })

  it('reads the coordinate#icon spelling and leaves the retired package@icon spelling alone', () => {
    const references: string[] = []
    const resolveIconReference = (source: string) => {
      references.push(source)
      return catalog.entries[0]!
    }

    expect(renderMarkdown('[[alice/theme@1.0.0#icon:status/wide]]', { resolveIconReference }))
      .toContain('project-inline-icon oc-project-icon')
    expect(references).toEqual(['alice/theme@1.0.0#icon:status/wide'])
    expect(renderMarkdown('[[alice/theme@icon:status/wide]]', { resolveIconReference }))
      .not.toContain('project-inline-icon')
  })
})
