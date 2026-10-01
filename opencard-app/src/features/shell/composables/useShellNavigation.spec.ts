import { describe, expect, it } from 'vitest'
import { useShellNavigation } from './useShellNavigation'

describe('useShellNavigation', () => {
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
  })

  it('returns from a flow without losing its base location', () => {
    const navigation = useShellNavigation()
    navigation.showSettings('general')
    navigation.location.value = {
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
      flow: { type: 'about' },
    }

    navigation.returnFromFlow()
    expect(navigation.location.value).toEqual({
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
    })
  })
})
