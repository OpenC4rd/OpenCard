import { describe, expect, it } from 'vitest'
import {
  createSpaceLocation,
  getActiveSpace,
  getPrimarySpace,
  leaveFlow,
  openFlow,
  openSettings,
  resolveLocationAfterProjectClose,
  resolveShellPage,
  showSpace,
} from './shellLocation'

describe('shellLocation', () => {
  it('resolves one visible page and gives flows precedence over their base space', () => {
    expect(resolveShellPage(createSpaceLocation('welcome'))).toBe('welcome')
    expect(resolveShellPage(createSpaceLocation('workbench'))).toBe('workbench')
    expect(resolveShellPage(openSettings(createSpaceLocation('welcome'), 'general'))).toBe('settings')
    expect(resolveShellPage(openFlow(createSpaceLocation('workbench'), 'create-project'))).toBe('create-project')
    expect(resolveShellPage(openFlow(createSpaceLocation('settings'), 'about'))).toBe('about')
  })

  it('keeps the primary space when entering a flow', () => {
    const location = openFlow(createSpaceLocation('workbench'), 'create-project')

    expect(getPrimarySpace(location)).toBe('workbench')
    expect(getActiveSpace(location)).toBe('workbench')
    expect(location.flow).toEqual({ type: 'create-project' })
  })

  it('keeps the settings return space in the base location', () => {
    const location = openSettings(createSpaceLocation('workbench'), 'general')

    expect(getPrimarySpace(location)).toBe('workbench')
    expect(getActiveSpace(location)).toBe('settings')
    expect(location.base).toEqual({
      space: 'settings',
      categoryKey: 'general',
      returnSpace: 'workbench',
    })
  })

  it('leaves a flow without losing its originating base space', () => {
    const settings = openSettings(createSpaceLocation('workbench'), 'appearance', 'appearance.locale')
    const location = openFlow(settings, 'about')
    expect(leaveFlow(location)).toEqual(settings)
    expect(getActiveSpace(location)).toBe('settings')
  })

  it('switches to settings from a flow using the flow origin', () => {
    expect(showSpace(openFlow(createSpaceLocation('workbench'), 'about'), 'settings')).toEqual({
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'workbench' },
    })
  })

  it('leaves project-dependent template export for the workbench', () => {
    expect(resolveLocationAfterProjectClose(
      openFlow(createSpaceLocation('welcome'), 'export-template'),
    )).toEqual({ base: { space: 'workbench' } })
  })

  it('returns to welcome only when the close command explicitly requests it', () => {
    expect(resolveLocationAfterProjectClose(createSpaceLocation('workbench'), 'welcome'))
      .toEqual({ base: { space: 'welcome' } })
  })

  it('enters project creation while preserving the originating primary page', () => {
    expect(resolveLocationAfterProjectClose(
      openSettings(createSpaceLocation('welcome'), 'general'),
      'create-project',
    )).toEqual({
      base: { space: 'settings', categoryKey: 'general', returnSpace: 'welcome' },
      flow: { type: 'create-project' },
    })
  })
})
