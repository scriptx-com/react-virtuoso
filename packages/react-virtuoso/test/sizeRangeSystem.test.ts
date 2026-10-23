import { describe, expect, it, vi } from 'vitest'

import { domIOSystem } from '../src/domIOSystem'
import { BOTTOM, getOverscan, sizeRangeSystem, TOP } from '../src/sizeRangeSystem'
import { DOWN, UP } from '../src/stateFlagsSystem'
import { getValue, init, publish, subscribe, system, tup } from '../src/urx'

void getValue
void publish
void subscribe

describe('overscan calculation', () => {
  it('returns the number for the respective direction', () => {
    expect(getOverscan(50, TOP, UP)).toBe(50)
    expect(getOverscan(50, TOP, DOWN)).toBe(0)
    expect(getOverscan(50, BOTTOM, DOWN)).toBe(50)
    expect(getOverscan(50, BOTTOM, UP)).toBe(0)
  })

  it('returns the number for the respective direction', () => {
    const overscan = { main: 50, reverse: 30 }
    expect(getOverscan(overscan, TOP, UP)).toBe(50)
    expect(getOverscan(overscan, TOP, DOWN)).toBe(30)
    expect(getOverscan(overscan, BOTTOM, DOWN)).toBe(50)
    expect(getOverscan(overscan, BOTTOM, UP)).toBe(30)
  })
})

describe('extend viewport by', () => {
  it('increases the calculated range statically', () => {
    const sys = system(([a, b]) => ({ ...a, ...b }), tup(sizeRangeSystem, domIOSystem))
    const { increaseViewportBy, listBoundary, scrollTop, viewportHeight, visibleRange } = init(sys)
    const spy = vi.fn()
    subscribe(visibleRange, spy)
    publish(scrollTop, 0)
    publish(viewportHeight, 200)
    publish(increaseViewportBy, 100)
    publish(listBoundary, [0, 0])

    expect(spy).toHaveBeenCalledWith([0, 300])
  })

  it('allows separate config for each list end', () => {
    const sys = system(([a, b]) => ({ ...a, ...b }), tup(sizeRangeSystem, domIOSystem))
    const { increaseViewportBy, listBoundary, scrollTop, viewportHeight, visibleRange } = init(sys)
    const spy = vi.fn()
    subscribe(visibleRange, spy)
    publish(scrollTop, 200)
    publish(viewportHeight, 200)
    publish(increaseViewportBy, { bottom: 100, top: 50 })
    publish(listBoundary, [0, 0])

    expect(spy).toHaveBeenCalledWith([150, 500])
  })
})

describe('recycling window scroll synchronization', () => {
  it.each([
    { from: 0, to: 10000 },
    { from: 10000, to: 0 },
  ])('does not fill the gap to a stale window on a jump from $from to $to', ({ from, to }) => {
    const sys = system(([a, b]) => ({ ...a, ...b }), tup(sizeRangeSystem, domIOSystem))
    const state = init(sys)
    publish(state.viewportHeight, 400)
    publish(state.listBoundary, [0, 0])
    publish(state.scrollTop, from)
    publish(state.recyclingWindow, { start: Math.max(0, from - 100), end: from + 500 })
    publish(state.scrollTop, to)
    expect(getValue(state.visibleRange)).toEqual([to, to + 400])
    publish(state.recyclingWindow, { start: Math.max(0, to - 100), end: to + 500 })
    expect(getValue(state.visibleRange)).toEqual([Math.max(0, to - 100), to + 500])
  })

  it('retains overlapping overscan and translates past header and padding', () => {
    const sys = system(([a, b]) => ({ ...a, ...b }), tup(sizeRangeSystem, domIOSystem))
    const state = init(sys)
    publish(state.viewportHeight, 400)
    publish(state.listBoundary, [0, 0])
    publish(state.headerHeight, 30)
    publish(state.contentInsets, { start: 20, end: 0 })
    publish(state.scrollTop, 300)
    publish(state.recyclingWindow, { start: 200, end: 800 })
    publish(state.scrollTop, 400)
    expect(getValue(state.visibleRange)).toEqual([150, 750])
  })
})
