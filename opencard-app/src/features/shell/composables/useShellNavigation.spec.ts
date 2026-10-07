import { beforeEach, describe, expect, it } from 'vitest'
import { useShellNavigation } from './useShellNavigation'

describe('useShellNavigation', () => {
  beforeEach(() => { useShellNavigation().selectSpace('welcome') })

  it('shares navigation across independent page callers', () => {
    const first = useShellNavigation()
    const second = useShellNavigation()
    first.showPrimarySpace('workbench')
    expect(second.page.value).toBe('workbench')
    second.showSettings('appearance')
    expect(first.page.value).toBe('settings')
  })
  it('switches spaces and restores the originating space after a flow', () => {
    const navigation = useShellNavigation()

    navigation.showPrimarySpace('workbench')
    navigation.showSettings('general')
    expect(navigation.location.value).toEqual({
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
    })

    navigation.selectSpace('welcome')
    expect(navigation.location.value).toEqual({ base: { space: 'welcome' } })
    expect(navigation.activeSpace.value).toBe('welcome')
    expect(navigation.page.value).toBe('welcome')
  })

  it('returns from a flow without losing its base location', () => {
    const navigation = useShellNavigation()
    navigation.showSettings('general')
    navigation.location.value = {
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
      flow: { type: 'about' },
    }

    navigation.returnFromFlow()
    expect(navigation.page.value).toBe('settings')
    expect(navigation.location.value).toEqual({
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
    })
  })
})
