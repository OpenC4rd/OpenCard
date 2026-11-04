import { describe, expect, it, vi } from 'vitest'
import { useCdePreviewBackground } from './cdePreviewBackground'

describe('useCdePreviewBackground', () => {
  it('defaults to the checkerboard and cycles through all three, reporting each change', () => {
    const onChange = vi.fn()
    const background = useCdePreviewBackground(undefined, key => key, onChange)
    expect(background.previewBackground.value).toBe('checker')

    const visited = [0, 1, 2].map(() => {
      background.cyclePreviewBackground()
      return background.previewBackground.value
    })
    expect(visited).toEqual(['white', 'black', 'checker'])
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('shows the current background as the icon and names the next one', () => {
    const background = useCdePreviewBackground('white', key => key, () => {})
    expect(background.previewBackgroundStyle.value.background).toBe('#fff')
    expect(background.previewBackgroundActions.value).toEqual([{
      key: 'cycle-preview-background',
      icon: 'mdiSquareOutline',
      title: 'cardDesigner.view.previewBackgroundBlack',
    }])
  })
})
