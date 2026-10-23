import { expect, it, vi } from 'vitest'

import { createRecyclingController } from '../src/recycling/integration'

it('publishes an immutable snapshot once per dependent batch', () => {
  const controller = createRecyclingController()
  const initial = controller.getSnapshot()
  const listener = vi.fn()
  controller.subscribe(listener)
  controller.batch(() => {
    controller.setWindow({ start: 100, end: 500 })
    controller.setKnownLayout({ revision: 1, ranges: [{ startIndex: 0, endIndex: 9, size: 100 }] })
    controller.setFocusedItem('item-1')
  })
  expect(listener).toHaveBeenCalledTimes(1)
  expect(initial).toEqual({
    drawDistance: undefined,
    contentInsets: { start: 0, end: 0 },
    revision: 0,
    window: undefined,
    knownLayout: undefined,
    focusedKey: null,
  })
  expect(controller.getSnapshot()).toMatchObject({ revision: 1, window: { start: 100, end: 500 }, focusedKey: 'item-1' })
})

it('does not publish identical values and supports nested batches and teardown', () => {
  const controller = createRecyclingController()
  const listener = vi.fn()
  const unsubscribe = controller.subscribe(listener)
  controller.setWindow({ start: 0, end: 100 })
  const snapshot = controller.getSnapshot()
  controller.setWindow({ start: 0, end: 100 })
  controller.setFocusedItem(null)
  expect(controller.getSnapshot()).toBe(snapshot)
  controller.batch(() => controller.batch(() => controller.setFocusedItem(3)))
  expect(listener).toHaveBeenCalledTimes(2)
  unsubscribe()
  controller.setFocusedItem(null)
  expect(listener).toHaveBeenCalledTimes(2)
})

it('normalizes invalid windows and copies caller-owned geometry', () => {
  const controller = createRecyclingController()
  const window = { start: 0, end: 100 }
  const layout = { revision: 1, ranges: [{ startIndex: 0, endIndex: 9, size: 100 }] }
  controller.setWindow(window)
  controller.setKnownLayout(layout)
  window.end = 999
  layout.ranges[0]!.size = 999
  expect(controller.getSnapshot().window!.end).toBe(100)
  expect(controller.getSnapshot().knownLayout!.ranges[0]!.size).toBe(100)
  controller.setWindow({ start: NaN, end: 10 })
  expect(controller.getSnapshot().window).toBeUndefined()
})
