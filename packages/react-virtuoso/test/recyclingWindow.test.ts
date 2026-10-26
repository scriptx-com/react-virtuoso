import { describe, expect, it, test } from 'vitest'

import { normalizeDrawDistance, resolveRecyclingWindow } from '../src/recycling/window'
import { createWindowTracker } from '../src/recycling/windowTracker'

const base = {
  offset: 1000,
  projectedOffset: 1000,
  viewportSize: 1000,
  contentSize: 10000,
  drawDistance: 400,
  direction: 'forward' as const,
}

describe('recycling pixel window', () => {
  it.each([
    ['forward', {}, { start: 760, end: 2560 }],
    ['backward', { direction: 'backward' }, { start: 440, end: 2240 }],
    ['start boundary', { offset: 0, projectedOffset: 0 }, { start: 0, end: 1800 }],
    ['end boundary', { offset: 9000, projectedOffset: 9000 }, { start: 8200, end: 10000 }],
    ['zero buffer', { drawDistance: 0 }, { start: 1000, end: 2000 }],
    ['short content', { offset: 0, projectedOffset: 0, contentSize: 300 }, { start: 0, end: 300 }],
    ['empty content', { contentSize: 0 }, { start: 0, end: 0 }],
    ['forward projection covers actual viewport', { projectedOffset: 3000 }, { start: 1000, end: 4560 }],
    ['backward projection covers actual viewport', { projectedOffset: 0, direction: 'backward' }, { start: 0, end: 2000 }],
  ])('%s', (_, changes, expected) => {
    expect(resolveRecyclingWindow({ ...base, ...changes } as Parameters<typeof resolveRecyclingWindow>[0])).toEqual(expected)
  })
})

describe('recycling velocity tracker', () => {
  it('uses median velocity and the measured render horizon', () => {
    const tracker = createWindowTracker()
    expect(tracker.sample(0, 0)).toEqual({
      direction: 'forward',
      projectedOffset: 0,
    })
    for (let i = 1; i <= 5; i++) {
      tracker.sample(i * 16, i * 16)
    }
    expect(tracker.sample(96, 96)).toEqual({
      direction: 'forward',
      projectedOffset: 112,
    })
    tracker.setRenderTime(32)
    expect(tracker.sample(112, 112)).toEqual({
      direction: 'forward',
      projectedOffset: 144,
    })
  })
  it('ignores invalid timestamps and resets projection history', () => {
    const tracker = createWindowTracker()
    tracker.sample(100, 10)
    expect(tracker.sample(200, 10).projectedOffset).toBe(200)
    tracker.reset()
    expect(tracker.sample(500, 100)).toEqual({
      direction: 'forward',
      projectedOffset: 500,
    })
  })
  it('retains backward direction when stationary and rejects invalid render times', () => {
    const tracker = createWindowTracker()
    tracker.sample(1000, 0)
    for (let i = 1; i <= 6; i++) {
      tracker.sample(1000 - i * 16, i * 16)
    }
    for (let i = 7; i <= 12; i++) {
      expect(tracker.sample(904, i * 16).direction).toBe('backward')
    }
    tracker.setRenderTime(Number.NaN)
    expect(Number.isFinite(tracker.sample(888, 208).projectedOffset)).toBe(true)
  })
})

test.each([
  [undefined, 200],
  [Number.NaN, 200],
  [Number.POSITIVE_INFINITY, 200],
  [-5, 0],
  [0, 0],
  [450, 450],
])('normalizes drawDistance %s without replacing explicit zero', (input, expected) => {
  expect(normalizeDrawDistance(input, 200)).toBe(expected)
})
