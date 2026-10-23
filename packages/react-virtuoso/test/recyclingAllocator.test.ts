import { describe, expect, it } from 'vitest'

import { allocateSlots, emptyPool } from '../src/recycling/allocator'

import type { PoolItem, PoolState } from '../src/recycling/types'

const items = (start: number, count: number, type: string | number = 0): PoolItem[] =>
  Array.from({ length: count }, (_, n) => ({ key: start + n, index: start + n, type }))
const next = (pool: PoolState, required: PoolItem[], focusedKey: string | number | null = null, idleBudget = required.length) =>
  allocateSlots(pool, { required, focusedKey, idleBudget })

describe('bounded compatible slots', () => {
  it('keeps continuing slots and recycles departing cells without new mounts after warm-up', () => {
    let pool = next(emptyPool(), items(0, 8))
    for (let start = 1; start < 1000; start++) {
      const previous = pool
      pool = next(pool, items(start, 8))
      expect(pool.nextSlotId).toBe(8)
      expect(pool.slots).toHaveLength(8)
      for (const slot of pool.slots.slice(0, 7)) {
        expect(slot).toBe(previous.slots.find((old) => old.key === slot.key))
      }
      const replacement = pool.slots.find((slot) => slot.key === start + 7)!
      expect(replacement.slotId).toBe(previous.slots.find((slot) => slot.key === start - 1)!.slotId)
      expect(replacement.generation).toBeGreaterThan(1)
    }
  })

  it('never reassigns an incompatible slot, even if its key matches', () => {
    const initial = next(emptyPool(), items(0, 1, 'poster'))
    const changed = next(initial, items(0, 1, 'banner'))
    expect(changed.slots.find((slot) => slot.active)!.slotId).not.toBe(initial.slots[0]!.slotId)
    const returning = next(changed, items(1, 1, 'poster'))
    expect(returning.slots.find((slot) => slot.active)!.slotId).toBe(initial.slots[0]!.slotId)
  })

  it('reserves all continuing items before satisfying entering items', () => {
    const initial = next(emptyPool(), items(0, 4))
    const changed = next(initial, [items(100, 1)[0]!, ...items(1, 3)])
    expect(changed.nextSlotId).toBe(4)
    expect(changed.slots[0]!.slotId).toBe(initial.slots[0]!.slotId)
    for (let index = 1; index < 4; index++) {
      expect(changed.slots[index]).toBe(initial.slots[index])
    }
  })

  it('keeps only the current focused exception and releases it when focus changes', () => {
    const initial = next(emptyPool(), items(0, 3))
    const focused = next(initial, items(3, 3), 0)
    expect(focused.slots.filter((slot) => slot.active)).toHaveLength(4)
    expect(focused.slots.find((slot) => slot.key === 0)).toBe(initial.slots[0])
    const moved = next(focused, items(6, 3), 3)
    expect(moved.slots.filter((slot) => slot.active).map((slot) => slot.key)).toEqual([6, 7, 8, 3])
    expect(moved.nextSlotId).toBe(4)
    expect(next(moved, [], null).slots).toEqual([])
  })

  it('keeps React number and string keys distinct and diagnoses duplicates', () => {
    const pool = next(emptyPool(), [
      { key: 1, type: 0, index: 0 },
      { key: '1', type: 0, index: 1 },
    ])
    expect(pool.slots[0]!.slotId).not.toBe(pool.slots[1]!.slotId)
    expect(() =>
      next(pool, [
        { key: 1, type: 0, index: 0 },
        { key: 1, type: 1, index: 1 },
      ])
    ).toThrow(/duplicate/i)
  })

  it('is immutable and repeatable when a candidate render is abandoned', () => {
    const initial = next(emptyPool(), items(0, 3))
    initial.slots.forEach(Object.freeze)
    Object.freeze(initial.slots)
    Object.freeze(initial)
    const candidate = next(initial, items(3, 3))
    expect(next(initial, items(3, 3))).toEqual(candidate)
    expect(next(initial, items(0, 3))).toBe(initial)
    expect(initial.slots.map((slot) => slot.key)).toEqual([0, 1, 2])
  })

  it('preserves identity across reorder and handles disjoint jumps/reversal', () => {
    const initial = next(emptyPool(), items(0, 4))
    const reordered = next(
      initial,
      items(0, 4)
        .reverse()
        .map((item, index) => ({ ...item, index }))
    )
    for (const slot of reordered.slots) {
      expect(slot.slotId).toBe(initial.slots.find((old) => old.key === slot.key)!.slotId)
      expect(slot.generation).toBe(1)
    }
    const jumped = next(reordered, items(1000, 4))
    const reversed = next(jumped, items(0, 4))
    expect(reversed.nextSlotId).toBe(4)
    expect(reversed.slots.every((slot) => slot.generation === 3)).toBe(true)
  })

  it('globally bounds all rare types and shrinks idle retention with the viewport', () => {
    let pool = emptyPool()
    for (let sweep = 0; sweep < 20; sweep++) {
      for (let type = 0; type < 100; type++) {
        pool = next(pool, items(type * 10, 8, type))
        expect(pool.slots.length).toBeLessThanOrEqual(16)
      }
    }
    pool = next(pool, items(1000, 2, 'small'), null, 100000)
    expect(pool.slots.filter((slot) => slot.active)).toHaveLength(2)
    expect(pool.slots.filter((slot) => !slot.active)).toHaveLength(2)
    expect(next(pool, [], null).slots).toEqual([])
  })

  it('evicts the least recently used idle cells across types', () => {
    let pool = next(emptyPool(), items(0, 2, 'a'))
    pool = next(pool, items(2, 2, 'b'))
    pool = next(pool, items(4, 2, 'c'))
    expect(pool.slots.filter((slot) => !slot.active).map((slot) => slot.type)).toEqual(['b', 'b'])
  })
})
