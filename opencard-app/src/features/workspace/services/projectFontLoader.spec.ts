import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectFontCss, createResourceFontLoader } from './projectFontLoader'

const originalFontSetDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts')
const font = (key: string, source: string) => ({ key, name: key, files: { normal: { upright: source } } })

describe('projectFontLoader', () => {
  afterEach(() => {
    document.head.querySelectorAll('style[data-opencard-resource-fonts]').forEach(style => style.remove()); vi.restoreAllMocks()
    if (originalFontSetDescriptor) Object.defineProperty(document, 'fonts', originalFontSetDescriptor)
    else Reflect.deleteProperty(document, 'fonts')
  })

  it('registers only real six-slot files with fixed descriptors', async () => {
    const generated = await createProjectFontCss([{ key: 'brand', name: 'Brand', files: {
      light: { upright: 'fonts/Light.ttf' }, normal: { upright: 'fonts/Regular.ttf', italic: 'fonts/Italic.ttf' }, bold: { upright: 'fonts/Bold.ttf' },
    } }], [], source => `asset://${source}`)
    expect(generated.cssText.split('\n')).toHaveLength(4)
    expect(generated.cssText).toContain('font-weight: 300')
    expect(generated.cssText).toContain('font-weight: 700')
    expect(generated.cssText).toContain('font-style: italic')
    expect(generated.cssText).not.toContain('font-stretch')
  })

  it('creates disjoint coverage rules per slot for compositions', async () => {
    const generated = await createProjectFontCss([font('latin', 'fonts/Latin.ttf'), font('fallback', 'fonts/Fallback.ttf')], [{
      key: 'body', name: 'Body', members: [{ fontKey: 'latin', ranges: [{ start: 65, end: 90 }] }, { fontKey: 'fallback' }],
    }], source => source, async source => source.includes('Latin') ? new Set([65, 66]) : new Set([65, 66, 67]))
    const rules = generated.cssText.split('\n').filter(rule => rule.includes('OpenCardProjectFontComposition-body'))
    expect(rules).toHaveLength(2)
    expect(rules[0]).toContain('unicode-range: U+41-42')
    expect(rules[1]).toContain('unicode-range: U+43')
  })

  it('keeps two environments independent and removes only the disposed stylesheet', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn(async () => [{}]) } })
    const first = createResourceFontLoader(key => `First-${key}`)
    const second = createResourceFontLoader(key => `Second-${key}`)
    await first.sync([font('body', 'fonts/First.ttf')], [], source => source, async () => new Set())
    await second.sync([font('body', 'fonts/Second.ttf')], [], source => source, async () => new Set())
    first.dispose()
    const styles = document.head.querySelectorAll('style[data-opencard-resource-fonts]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toContain('Second-body')
    second.dispose()
    expect(document.head.querySelectorAll('style[data-opencard-resource-fonts]')).toHaveLength(0)
  })
})
