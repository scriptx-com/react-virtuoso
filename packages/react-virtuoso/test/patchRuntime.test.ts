import { describe, it, expect, vi } from 'vitest'

import * as u from '../src/urx'

describe('consumer runtime optimization parity', () => {
  it('reuses construction plans without sharing instance state', () => {
    const leaf = u.system(() => ({ value: u.statefulStream(0) }))
    const root = u.system(([left, right]) => ({ left: left.value, right: right.value }), u.tup(leaf, leaf))
    const first = u.init(root)
    const maps = vi.spyOn(globalThis, 'Map')
    const second = u.init(root)
    const count = maps.mock.calls.length
    maps.mockRestore()
    expect(count).toBe(0)
    expect(first.left).toBe(first.right)
    expect(second.left).toBe(second.right)
    expect(first.left).not.toBe(second.left)
    u.publish(first.left, 42)
    expect(u.getValue(second.left)).toBe(0)
  })
  it.each([0, 1])('avoids subscriber array copies for %i listeners', (count) => {
    const stream = u.stream<number>()
    const received: number[] = []
    if (count) {
      u.subscribe(stream, (value) => received.push(value))
    }
    const slice = vi.spyOn(Array.prototype, 'slice')
    u.publish(stream, 7)
    const copies = slice.mock.calls.length
    slice.mockRestore()
    expect(received).toEqual(count ? [7] : [])
    expect(copies).toBe(0)
  })
  it('preserves snapshot delivery and unbound receivers under reentrant subscriptions', () => {
    const stream = u.stream<string>()
    const received: string[] = []
    const receivers: unknown[] = []
    let remove = () => {}
    u.subscribe(stream, function (this: unknown, value) {
      receivers.push(this)
      received.push(`first:${value}`)
      remove()
    })
    remove = u.subscribe(stream, (value) => received.push(`second:${value}`))
    u.publish(stream, 'a')
    u.publish(stream, 'b')
    expect(received).toEqual(['first:a', 'second:a', 'first:b'])
    expect(receivers).toEqual([undefined, undefined])
  })
})
