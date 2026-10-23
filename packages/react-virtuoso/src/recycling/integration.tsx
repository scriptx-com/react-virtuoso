import React from 'react'

import type { KnownLayout } from './layout'

/** Half-open interval in normalized scroller pixels, including leading header/padding. */
export interface PixelWindow {
  readonly start: number
  readonly end: number
}

export interface ContentInsets {
  readonly start: number
  readonly end: number
}

export interface RecyclingSnapshot {
  readonly contentInsets: ContentInsets
  readonly drawDistance: number | undefined
  readonly window: PixelWindow | undefined
  readonly knownLayout: KnownLayout | undefined
  readonly focusedKey: React.Key | null
  readonly revision: number
}

function copySnapshot(value: RecyclingSnapshot) {
  return {
    contentInsets: value.contentInsets,
    window: value.window,
    drawDistance: value.drawDistance,
    knownLayout: value.knownLayout,
    focusedKey: value.focusedKey,
    revision: value.revision,
  }
}

export function createRecyclingController() {
  let snapshot: RecyclingSnapshot = {
    contentInsets: { start: 0, end: 0 },
    window: undefined,
    drawDistance: undefined,
    knownLayout: undefined,
    focusedKey: null,
    revision: 0,
  }
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
    if (
      next.drawDistance === snapshot.drawDistance &&
      next.window === snapshot.window &&
      next.knownLayout === snapshot.knownLayout &&
      next.focusedKey === snapshot.focusedKey &&
      next.contentInsets === snapshot.contentInsets
    ) {
      return
    }
    snapshot = {
      contentInsets: next.contentInsets,
      window: next.window,
      drawDistance: next.drawDistance,
      knownLayout: next.knownLayout,
      focusedKey: next.focusedKey,
      revision: snapshot.revision + 1,
    }
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
    setContentInsets(input: ContentInsets) {
      const start = Number.isFinite(input.start) ? Math.max(0, input.start) : 0
      const end = Number.isFinite(input.end) ? Math.max(0, input.end) : 0
      const value = current()
      if (value.contentInsets.start === start && value.contentInsets.end === end) {
        return
      }
      const next = copySnapshot(value)
      next.contentInsets = { start, end }
      pending = next
      flush()
    },
    setDrawDistance(input: number | undefined) {
      const drawDistance = input !== undefined && Number.isFinite(input) ? Math.max(0, input) : undefined
      const value = current()
      if (value.drawDistance === drawDistance) {
        return
      }
      pending = { ...value, drawDistance }
      flush()
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
      const next = copySnapshot(value)
      next.window = window ? { start: window.start, end: window.end } : undefined
      pending = next
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
      const next = copySnapshot(value)
      next.focusedKey = focusedKey
      pending = next
      flush()
    },
  }
}

export type RecyclingController = ReturnType<typeof createRecyclingController>
export const RecyclingIntegrationContext = React.createContext<RecyclingController | undefined>(undefined)

export function RecyclingIntegrationProvider({ controller, children }: { controller: RecyclingController; children: React.ReactNode }) {
  return <RecyclingIntegrationContext.Provider value={controller}>{children}</RecyclingIntegrationContext.Provider>
}
