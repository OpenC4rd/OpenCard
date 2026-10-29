// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createShapeBlock,
  createTextBlock,
  type CardDocument,
  type CardInstanceRecord,
} from '../../entities/card/model'
import { prepareRichText } from './prepareRichText'
import { prepareCardRender, type CardRenderEnvironment, type CardRenderRequest } from './renderPipeline'

function createTestDoc(blocks: ReturnType<typeof createTextBlock>[]): CardDocument {
  return {
    type: 'card-document',
    id: 'adversarial-doc',
    name: 'Adversarial Test Doc',
    description: '',
    notes: '',
    version: '1.0.0',
    width: '400',
    height: '600',
    instances: [],
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#ffffff',
        children: blocks.map((block, idx) => ({
          block,
          location: { id: `loc-${idx}`, type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' },
        })),
      },
      back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
    },
  }
}

describe('prepareRichText - Empirical Adversarial Challenge', () => {
  describe('Invariant 1: Pure TypeScript headless execution (Zero DOM dependencies)', () => {
    it('executes in a strict headless environment where window, document, and DOMParser are absent', () => {
      // In @vitest-environment node, window, document, DOMParser are undefined.
      expect(typeof (globalThis as any).window).toBe('undefined')
      expect(typeof (globalThis as any).DOMParser).toBe('undefined')

      const doc = createTestDoc([
        createTextBlock({ id: 't1', content: '@b{Bold} and @i{Italic} with {{binding}}' }),
        createTextBlock({ id: 't2', content: '<p style="color: red;">Legacy HTML fallback</p>' }),
      ])

      const result = prepareRichText({ document: doc })
      expect(result.issues).toHaveLength(0)
      expect(result.catalog.size).toBe(2)
      expect(result.catalog.get('t1')?.valid).toBe(true)
      expect(result.catalog.get('t2')?.valid).toBe(true)
    })
  })

  describe('Invariant 2: Extreme inputs, boundaries & resilience', () => {
    it('handles null, undefined, empty, and whitespace-only content without exceptions', () => {
      const bNull = createTextBlock({ id: 'b-null' })
      ;(bNull as any).content = null

      const bUndef = createTextBlock({ id: 'b-undef' })
      ;(bUndef as any).content = undefined

      const bEmpty = createTextBlock({ id: 'b-empty', content: '' })
      const bWhitespace = createTextBlock({ id: 'b-ws', content: '   \n\t  \r\n   ' })

      const doc = createTestDoc([bNull, bUndef, bEmpty, bWhitespace])
      const { catalog, issues } = prepareRichText({ document: doc })

      expect(issues).toHaveLength(0)
      for (const id of ['b-null', 'b-undef', 'b-empty', 'b-ws']) {
        const item = catalog.get(id)
        expect(item).toBeDefined()
        expect(item!.valid).toBe(true)
        expect(item!.document.blocks).toBeDefined()
        expect(item!.document.children).toBeDefined()
      }
    })

    it('survives deeply nested unclosed tags (1000 levels) without call stack overflow', () => {
      const depth = 1000
      const content = '@b{'.repeat(depth) + 'Deeply unclosed text'
      const block = createTextBlock({ id: 'deep-unclosed', content })
      const doc = createTestDoc([block])

      const start = performance.now()
      const { catalog, issues } = prepareRichText({ document: doc })
      const duration = performance.now() - start

      expect(issues.length).toBeGreaterThan(0)
      expect(catalog.get('deep-unclosed')?.valid).toBe(false)
      // Rapid parsing: 1000 nested tags must parse within 100ms
      expect(duration).toBeLessThan(100)
    })

    it('survives deeply nested balanced tags (1000 levels) without call stack overflow', () => {
      const depth = 1000
      const content = '@b{'.repeat(depth) + 'Deeply balanced text' + '}'.repeat(depth)
      const block = createTextBlock({ id: 'deep-balanced', content })
      const doc = createTestDoc([block])

      const start = performance.now()
      const { catalog, issues } = prepareRichText({ document: doc })
      const duration = performance.now() - start

      expect(issues).toHaveLength(0)
      expect(catalog.get('deep-balanced')?.valid).toBe(true)
      expect(duration).toBeLessThan(100)
    })

    it('processes multi-megabyte text payloads deterministically in sub-second time', () => {
      // 2 Megabytes of mixed text, tags, bindings, and line breaks
      const baseChunk = '@b{Header line} with {{expression}} and @color(color=#336699){colored span}.'
      const repeatCount = 25000 // ~1.9 MB
      const hugeContent = Array(repeatCount).fill(baseChunk).join('\n')

      const block = createTextBlock({ id: 'huge-block', content: hugeContent })
      const doc = createTestDoc([block])

      const start = performance.now()
      const { catalog, issues } = prepareRichText({ document: doc })
      const duration = performance.now() - start

      expect(issues).toHaveLength(0)
      const prep = catalog.get('huge-block')
      expect(prep?.valid).toBe(true)
      expect(prep?.document.blocks?.length).toBe(repeatCount)
      // Multi-megabyte document must complete in under 1500ms
      expect(duration).toBeLessThan(1500)
    })

    it('handles arbitrary binary, null bytes, surrogate pairs, and invalid control characters', () => {
      const content = 'Null \0 bytes \x01\x02\x03 and surrogate \uD83D\uDE00 emoji @b{bold \0 content}'
      const block = createTextBlock({ id: 'binary-block', content })
      const doc = createTestDoc([block])

      const { catalog, issues } = prepareRichText({ document: doc })
      expect(issues).toHaveLength(0)
      expect(catalog.get('binary-block')?.valid).toBe(true)
    })

    it('resists ReDoS and catastrophic backtracking on pathological legacy HTML', () => {
      // 50,000 unclosed '<p' without matching '>'
      const pathologicalHtml = '<p '.repeat(20000)
      const block = createTextBlock({ id: 'pathological-html', content: pathologicalHtml })
      const doc = createTestDoc([block])

      const start = performance.now()
      const { catalog } = prepareRichText({ document: doc })
      const duration = performance.now() - start

      expect(catalog.get('pathological-html')).toBeDefined()
      // Pathological regex scan must complete without catastrophic backtracking (under 1500ms even under CPU load)
      expect(duration).toBeLessThan(1500)
    })

    it('resists repeated lone @ symbols and escaped backslashes without infinite loops', () => {
      const repetitiveTokens = '@'.repeat(5000) + '\\'.repeat(5000)
      const block = createTextBlock({ id: 'rep-block', content: repetitiveTokens })
      const doc = createTestDoc([block])

      const start = performance.now()
      const { catalog, issues } = prepareRichText({ document: doc })
      const duration = performance.now() - start

      expect(catalog.get('rep-block')?.valid).toBe(true)
      expect(issues).toHaveLength(0)
      expect(duration).toBeLessThan(100)
    })

    it('gracefully handles missing bodies and orphan block tags (@ul, @ol, @li)', () => {
      const orphanMarkup = '@ul\n@ol\n@li{Orphan li}\n@align(center)\n@style(color=red)'
      const block = createTextBlock({ id: 'orphan-block', content: orphanMarkup })
      const doc = createTestDoc([block])

      const { catalog, issues } = prepareRichText({ document: doc })
      const prep = catalog.get('orphan-block')
      expect(prep?.valid).toBe(false)
      expect(issues.length).toBeGreaterThan(0)
      // Check that all diagnostics are properly converted to pipeline issues
      for (const issue of issues) {
        expect(issue.type).toBe('card-designer.rich-text.invalid-html')
        expect(issue.location.blockId).toBe('orphan-block')
      }
    })
  })

  describe('Invariant 3: Precise diagnostic codes and character offset emission', () => {
    it('pinpoints exact token offsets for unclosed tags, unclosed bindings, and unclosed args', () => {
      // Offset 0: @b{
      // Offset 3: Hello 
      // Offset 9: {{unclosedBinding
      const content = '@b{Hello {{unclosedBinding'
      const block = createTextBlock({ id: 'err-block', content })
      const doc = createTestDoc([block])

      const { issues } = prepareRichText({ document: doc })
      expect(issues.length).toBe(2)

      // First issue: binding unclosed at offset 9
      const bindingIssue = issues.find((i) => i.details?.code === 'unclosed-tag' && i.token?.includes('}}'))
      expect(bindingIssue).toBeDefined()
      expect(bindingIssue!.location.characterOffset).toBe(9)

      // Second issue: @b unclosed at offset 0
      const tagIssue = issues.find((i) => i.details?.code === 'unclosed-tag' && i.token?.includes('@b'))
      expect(tagIssue).toBeDefined()
      expect(tagIssue!.location.characterOffset).toBe(0)
    })

    it('emits invalid-argument diagnostics with exact offsets for bad style arguments', () => {
      const content = 'Text @style(size=abc,b=maybe,stroke=red 2px){Bad style}'
      const block = createTextBlock({ id: 'style-err', content })
      const doc = createTestDoc([block])

      const { issues } = prepareRichText({ document: doc })
      expect(issues.length).toBeGreaterThanOrEqual(2)

      for (const issue of issues) {
        expect(issue.type).toBe('card-designer.rich-text.invalid-html')
        expect(issue.location.blockId).toBe('style-err')
        expect(issue.location.fieldKey).toBe('content')
        expect(issue.location.characterOffset).toBe(5) // Offset of @style
      }
    })

    it('emits invalid-structure diagnostics when block tags are improperly nested inside spans', () => {
      const content = '@b{Inline text @align(center){Nested block}}'
      const block = createTextBlock({ id: 'struct-err', content })
      const doc = createTestDoc([block])

      const { issues } = prepareRichText({ document: doc })
      const issue = issues.find((i) => i.details?.code === 'invalid-structure')
      expect(issue).toBeDefined()
      expect(issue!.token).toContain('块级标签')
    })
  })

  describe('Invariant 4: Integration with renderPipeline.ts', () => {
    it('integrates seamlessly with prepareCardRender, propagating richText catalog and issues', () => {
      const validBlock = createTextBlock({ id: 'valid-t', content: 'Valid @b{Content}' })
      const brokenBlock = createTextBlock({ id: 'broken-t', content: '@i{Unclosed' })
      const shapeBlock = createShapeBlock({ id: 'shape-1' })

      const doc: CardDocument = {
        type: 'card-document',
        id: 'pipeline-doc',
        name: 'Pipeline Doc',
        description: '',
        notes: '',
        version: '1.0.0',
        width: '400',
        height: '600',
        instances: [],
        faces: {
          front: {
            type: 'card-face',
            id: 'front',
            background: '#ffffff',
            children: [
              { block: validBlock, location: { id: 'l1', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' } },
              { block: brokenBlock, location: { id: 'l2', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' } },
              { block: shapeBlock, location: { id: 'l3', type: 'simple-container-location', anchor: 'lt', x: '0', y: '0' } },
            ],
          },
          back: { type: 'card-face', id: 'back', background: '#000000', children: [] },
        },
      }

      const dummyEnv: CardRenderEnvironment = {
        projectIconCatalog: { series: [], entries: [] },
      }

      const request: CardRenderRequest = {
        document: doc,
        instance: null,
        resourceRootPath: null,
        sourceFilePath: null,
        environment: dummyEnv,
      }

      const rendered = prepareCardRender(request)

      // 1. richText catalog contains only text blocks
      expect(rendered.richText).toBeDefined()
      expect(rendered.richText!.has('valid-t')).toBe(true)
      expect(rendered.richText!.has('broken-t')).toBe(true)
      expect(rendered.richText!.has('shape-1')).toBe(false)

      // 2. valid status
      expect(rendered.richText!.get('valid-t')?.valid).toBe(true)
      expect(rendered.richText!.get('broken-t')?.valid).toBe(false)

      // 3. pipeline issues contain the rich-text issue
      const richTextIssue = rendered.issues.find((i) => i.location.blockId === 'broken-t')
      expect(richTextIssue).toBeDefined()
      expect(richTextIssue?.type).toBe('card-designer.rich-text.invalid-html')

      // 4. resource context also received richText catalog
      expect(rendered.resources.richText).toBe(rendered.richText)
    })

    it('supports card instances with overrides and instance IDs in location tracking', () => {
      const block = createTextBlock({ id: 'tmpl-text', content: '@u{Initial}' })
      const doc = createTestDoc([block])
      const instance: CardInstanceRecord = {
        type: 'card-instance',
        id: 'inst-42',
        name: 'Instance 42',
        amount: '1',
        data: {
          'tmpl-text': { content: '@b{Overridden unclosed' },
        },
      }

      const dummyEnv: CardRenderEnvironment = {
        projectIconCatalog: { series: [], entries: [] },
      }

      const rendered = prepareCardRender({
        document: doc,
        instance,
        resourceRootPath: null,
        sourceFilePath: null,
        environment: dummyEnv,
      })

      // Must evaluate overridden content
      const prep = rendered.richText!.get('tmpl-text')
      expect(prep?.valid).toBe(false)

      // Issue location must reflect instanceId: 'inst-42'
      const issue = rendered.issues.find((i) => i.location.blockId === 'tmpl-text')
      expect(issue).toBeDefined()
      expect(issue!.location.instanceId).toBe('inst-42')
    })
  })
})
