// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createTutorialStore } from './tutorial'
import { findTutorialSpace } from './tutorialLayout'

const definitions = {
  demo: { title: 'Demo', steps: [{ id: 'first', targets: [] }, { id: 'second', targets: [] }] },
  other: { title: 'Other', steps: [{ id: 'only', targets: [] }] },
}

it('allows only one tutorial and only advances the matching current step', () => {
  const completed = vi.fn()
  const store = createTutorialStore(definitions, completed)
  expect(store.start('missing')).toBe(false)
  expect(store.start('demo')).toBe(true)
  expect(store.start('other')).toBe(false)
  expect(store.completeStep('other', 'first')).toBe(false)
  expect(store.completeStep('demo', 'second')).toBe(false)
  expect(store.completeStep('demo', 'first')).toBe(true)
  expect(store.completeStep('demo', 'first')).toBe(false)
  expect(completed).not.toHaveBeenCalled()
  expect(store.completeStep('demo', 'second')).toBe(true)
  expect(store.session.value).toBeNull()
  expect(completed).toHaveBeenCalledExactlyOnceWith('demo')
})

it('rejects a delayed result from an exited run, even after restarting the same step', () => {
  const completed = vi.fn()
  const store = createTutorialStore(definitions, completed)
  store.start('demo')
  const run = store.session.value!.run
  store.exit()
  expect(store.completeStep('demo', 'first', run)).toBe(false)
  store.start('demo')
  expect(store.completeStep('demo', 'first', run)).toBe(false)
  expect(store.session.value!.step.id).toBe('first')
  expect(completed).not.toHaveBeenCalled()
})

it.each([
  { width: 490, height: 700, targets: [
    { left: 348, top: 290, right: 482, bottom: 370 },
    { left: 348, top: 378, right: 482, bottom: 482 },
  ] },
  { width: 800, height: 640, targets: [
    { left: 20, top: 20, right: 220, bottom: 180 },
    { left: 580, top: 440, right: 780, bottom: 620 },
  ] },
  { width: 600, height: 700, targets: [
    { left: 0, top: -30, right: 600, bottom: 100 },
    { left: 0, top: 600, right: 600, bottom: 730 },
  ] },
])('places the card outside every target within a $width × $height viewport', ({ width, height, targets }) => {
  const card = findTutorialSpace(targets, width, height)
  expect(card.left).toBeGreaterThanOrEqual(8)
  expect(card.right).toBeLessThanOrEqual(width - 8)
  expect(card.top).toBeGreaterThanOrEqual(8)
  expect(card.bottom).toBeLessThanOrEqual(height - 8)
  expect(card.right - card.left).toBeGreaterThan(0)
  expect(card.bottom - card.top).toBeGreaterThan(0)
  for (const target of targets) {
    expect(card.right <= target.left - 12 || card.left >= target.right + 12
      || card.bottom <= target.top - 12 || card.top >= target.bottom + 12).toBe(true)
  }
})
