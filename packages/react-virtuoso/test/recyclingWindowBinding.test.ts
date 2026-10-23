import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindRecyclingWindow } from '../src/recycling/windowBinding'
import * as u from '../src/urx'

import type { PixelWindow } from '../src/recycling/integration'

function fixture() {
  const system = {
    data: u.statefulStream<readonly unknown[] | undefined>(undefined),
    horizontalDirection: u.statefulStream(false),
    statefulScrollTop: u.statefulStream(1000),
    viewportHeight: u.stream<number>(),
    totalListHeight: u.statefulStream(5000),
    propsReady: u.statefulStream(true),
    recyclingActive: u.statefulStream(true),
    recyclingWindow: u.statefulStream<PixelWindow | undefined>(undefined),
  }
  const policy = bindRecyclingWindow(system)
  u.publish(system.viewportHeight, 400)
  u.publish(policy.recyclingDrawDistance, 200)
  return { ...system, ...policy }
}
let now = 0
beforeEach(() => {
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})
afterEach(() => vi.restoreAllMocks())

describe('fork-owned recycling window', () => {
  it('uses existing geometry streams and honors an explicit zero buffer', () => {
    const s = fixture()
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 880, end: 1680 })
    u.publish(s.recyclingDrawDistance, 0)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1000, end: 1400 })
    u.publish(s.viewportHeight, 600)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1000, end: 1600 })
    u.publish(s.totalListHeight, 1000)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 400, end: 1000 })
  })
  it('does not republish identical geometry or create motion samples on resize', () => {
    const s = fixture()
    const listener = vi.fn()
    u.subscribe(s.recyclingWindow, listener)
    listener.mockClear()
    now = 16
    u.publish(s.statefulScrollTop, 1000)
    u.publish(s.viewportHeight, 400)
    u.publish(s.totalListHeight, 5000)
    expect(listener).not.toHaveBeenCalled()
  })
  it('freezes parked lists and resets prediction when reactivated', () => {
    const s = fixture()
    const before = u.getValue(s.recyclingWindow)
    u.publish(s.recyclingActive, false)
    now = 16
    u.publish(s.statefulScrollTop, 3000)
    expect(u.getValue(s.recyclingWindow)).toBe(before)
    u.publish(s.recyclingActive, true)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 2880, end: 3680 })
  })
  it('waits until a geometry transaction commits', () => {
    const s = fixture()
    const before = u.getValue(s.recyclingWindow)
    u.publish(s.propsReady, false)
    u.publish(s.statefulScrollTop, 2000)
    u.publish(s.viewportHeight, 800)
    expect(u.getValue(s.recyclingWindow)).toBe(before)
    u.publish(s.propsReady, true)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1880, end: 3080 })
  })
  it('preserves explicit controller windows and restores normal virtualization when disabled', () => {
    const s = fixture()
    u.publish(s.recyclingWindowOverride, { start: 50, end: 500 })
    u.publish(s.statefulScrollTop, 3000)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 50, end: 500 })
    u.publish(s.recyclingWindowOverride, undefined)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 2880, end: 3680 })
    u.publish(s.recyclingDrawDistance, undefined)
    expect(u.getValue(s.recyclingWindow)).toBeUndefined()
  })
  it('uses committed render time for forward and backward predictions while covering the actual viewport', () => {
    const s = fixture()
    u.publish(s.recyclingRenderTime, 40)
    for (const offset of [1100, 1200, 1300, 1400, 1500]) {
      now += 20
      u.publish(s.statefulScrollTop, offset)
    }
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1500, end: 2380 })
    for (const offset of [1400, 1300, 1200, 1100, 1000]) {
      now += 20
      u.publish(s.statefulScrollTop, offset)
    }
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 520, end: 1400 })
  })
  it('resets velocity when the dataset or orientation changes', () => {
    const s = fixture()
    for (const offset of [1100, 1200, 1300, 1400, 1500]) {
      now += 20
      u.publish(s.statefulScrollTop, offset)
    }
    u.publish(s.data, [1, 2, 3])
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1380, end: 2180 })
    u.publish(s.horizontalDirection, true)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 1380, end: 2180 })
  })
  it('waits for a measurable viewport and content extent', () => {
    const s = fixture()
    u.publish(s.viewportHeight, 0)
    expect(u.getValue(s.recyclingWindow)).toBeUndefined()
    u.publish(s.viewportHeight, 400)
    expect(u.getValue(s.recyclingWindow)).toEqual({ start: 880, end: 1680 })
    u.publish(s.totalListHeight, 0)
    expect(u.getValue(s.recyclingWindow)).toBeUndefined()
  })
})
