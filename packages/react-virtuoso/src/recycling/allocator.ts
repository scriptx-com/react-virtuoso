import type { Key } from 'react'

import type { PoolItem, PoolRequest, PoolState, Slot } from './types'

export function emptyPool(): PoolState {
  return { slots: [], nextSlotId: 0, clock: 0 }
}

/** Pure candidate allocation; React commits it only after a successful render. */
export function allocateSlots(previous: Readonly<PoolState>, request: PoolRequest): PoolState {
  const clock = previous.clock + 1
  let nextSlotId = previous.nextSlotId
  const required = new Map<Key, PoolItem>()
  for (const item of request.required) {
    if (required.has(item.key)) {
      throw new Error(`Duplicate recycling item key: ${String(item.key)}`)
    }
    required.set(item.key, item)
  }

  const retained = new Map<Key, Slot>()
  const reusable = new Map<PoolItem['type'], Slot[]>()
  let focused: Slot | undefined
  for (const slot of previous.slots) {
    const item = required.get(slot.key)
    if (item && item.type === slot.type && !retained.has(slot.key)) {
      retained.set(slot.key, slot)
    } else if (!item && slot.key === request.focusedKey && slot.active && !focused) {
      focused = slot
    } else {
      const bucket = reusable.get(slot.type)
      if (bucket) {
        bucket.push(slot)
      } else {
        reusable.set(slot.type, [slot])
      }
    }
  }

  const slots: Slot[] = []
  for (const item of request.required) {
    const existing = retained.get(item.key)
    if (existing) {
      slots.push(
        existing.index === item.index && existing.active ? existing : { ...existing, index: item.index, active: true, lastUsed: clock }
      )
      continue
    }
    const bucket = reusable.get(item.type)
    const available = bucket?.pop()
    if (bucket?.length === 0) {
      reusable.delete(item.type)
    }
    slots.push({
      ...item,
      slotId: available?.slotId ?? nextSlotId++,
      generation: available ? available.generation + 1 : 1,
      active: true,
      lastUsed: clock,
    })
  }
  if (focused) {
    slots.push(focused)
  }

  // A single global idle budget prevents rare item types from accumulating pools.
  const idleLimit = Math.min(request.required.length, Math.max(0, Number.isFinite(request.idleBudget) ? Math.floor(request.idleBudget) : 0))
  if (idleLimit > 0) {
    const idle: Slot[] = []
    for (const bucket of reusable.values()) {
      for (const slot of bucket) {
        idle.push(slot.active ? { ...slot, active: false, lastUsed: clock } : slot)
      }
    }
    idle.sort((a, b) => b.lastUsed - a.lastUsed || a.slotId - b.slotId)
    slots.push(...idle.slice(0, idleLimit))
  }
  if (slots.length === previous.slots.length && slots.every((slot, index) => slot === previous.slots[index])) {
    return previous
  }
  return { slots, nextSlotId, clock }
}
