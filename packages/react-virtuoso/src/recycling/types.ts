import type { Key } from 'react'

export interface PoolItem {
  readonly key: Key
  readonly type: number | string
  readonly index: number
}

export interface Slot extends PoolItem {
  readonly slotId: number
  readonly generation: number
  readonly active: boolean
  readonly lastUsed: number
}

export interface PoolState {
  readonly slots: readonly Slot[]
  readonly nextSlotId: number
  readonly clock: number
}

export interface PoolRequest {
  readonly required: readonly PoolItem[]
  readonly focusedKey: Key | null
  readonly idleBudget: number
}
