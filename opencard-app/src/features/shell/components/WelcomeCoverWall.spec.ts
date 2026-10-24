import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WelcomeCoverWall, { type WelcomeCoverWallCover } from './WelcomeCoverWall.vue'

function cover(index: number): WelcomeCoverWallCover {
  return {
    projectKey: `recent-project:/Project ${index}`,
    src: `asset:///Project ${index}/cover.png`,
  }
}

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

describe('WelcomeCoverWall', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('stays a decorative layer that assistive technology and input never reach', () => {
    const wrapper = mount(WelcomeCoverWall, { props: { covers: [cover(0)] } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})
