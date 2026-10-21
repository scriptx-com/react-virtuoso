import React from 'react'

import type { KnownLayout } from './layout'

/** Half-open interval in normalized scroller pixels, including leading header/padding. */
export interface PixelWindow {
  readonly start: number
  readonly end: number
}

export interface RecyclingSnapshot {
  readonly window: PixelWindow | undefined
  readonly knownLayout: KnownLayout | undefined
  readonly focusedKey: React.Key | null
  readonly revision: number
}

export function createRecyclingController() {
  let snapshot: RecyclingSnapshot = { window: undefined, knownLayout: undefined, focusedKey: null, revision: 0 }
  let pending: RecyclingSnapshot | undefined
  let depth = 0
  let layoutInput: KnownLayout | undefined
  const listeners = new Set<() => void>()
  const current = () => pending ?? snapshot
  function flush() {
    if (depth || !pending) {
      return
    }
    const next = pending
    pending = undefined
    if (next.window === snapshot.window && next.knownLayout === snapshot.knownLayout && next.focusedKey === snapshot.focusedKey) {
      return
    }
    snapshot = { ...next, revision: snapshot.revision + 1 }
    for (const listener of [...listeners]) {
      listener()
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    batch(update: () => void) {
      depth++
      try {
        update()
      } finally {
        depth--
        flush()
      }
    },
    setWindow(input: PixelWindow | undefined) {
      const window =
        input && Number.isFinite(input.start) && Number.isFinite(input.end) && input.start >= 0 && input.end >= input.start
          ? input
          : undefined
      const value = current()
      if (window?.start === value.window?.start && window?.end === value.window?.end) {
        return
      }
      pending = { ...value, window: window ? { ...window } : undefined }
      flush()
    },
    setKnownLayout(input: KnownLayout | undefined) {
      if (layoutInput === input) {
        return
      }
      layoutInput = input
      pending = {
        ...current(),
        knownLayout: input ? { revision: input.revision, ranges: input.ranges.map((range) => ({ ...range })) } : undefined,
      }
      flush()
    },
    setFocusedItem(focusedKey: React.Key | null) {
      const value = current()
      if (value.focusedKey === focusedKey) {
        return
      }
      pending = { ...value, focusedKey }
      flush()
    },
  }
}

export type RecyclingController = ReturnType<typeof createRecyclingController>
export const RecyclingIntegrationContext = React.createContext<RecyclingController | undefined>(undefined)

export function RecyclingIntegrationProvider({ controller, children }: { controller: RecyclingController; children: React.ReactNode }) {
  return <RecyclingIntegrationContext.Provider value={controller}>{children}</RecyclingIntegrationContext.Provider>
}
