import { afterEach, describe, expect, it } from 'vitest'
import { prefersReducedMotion, reducedMotionQuery } from './prefersReducedMotion'

/**
 * jsdom ships no `window.matchMedia`, and the guard is what keeps every motion-reading component
 * from throwing from inside its mount, transition, or unmount hooks in that environment.
 */
function stubMotionPreference(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches, media: query }),
  })
}

describe('reduced motion preference', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('treats motion as allowed where the media query API is missing', () => {
    expect(reducedMotionQuery()).toBeNull()
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reports the preference the system asked for', () => {
    stubMotionPreference(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(reducedMotionQuery()?.matches).toBe(true)

    stubMotionPreference(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
