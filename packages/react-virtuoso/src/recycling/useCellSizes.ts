import type { Key } from 'react'

import type { SizeFunction, SizeRange } from '../interfaces'

export interface CellMeasurement {
  element: HTMLElement
  index: number
  logicalKey: Key
  assignmentGeneration: number
  layoutRevision: number | string
  active: boolean
  exact: boolean
  knownSize: number
}

interface Binding {
  cell: CellMeasurement
  size: number
}

/** One observer per list; a queued read belongs to a particular committed assignment. */
export function createCellSizeObserver({
  horizontal,
  itemSize,
  callback,
  createObserver = (cb) => new ResizeObserver(cb),
  schedule = requestAnimationFrame,
  cancel = cancelAnimationFrame,
}: {
  horizontal: boolean
  itemSize: SizeFunction
  callback: (ranges: SizeRange[]) => void
  createObserver?: (callback: ResizeObserverCallback) => ResizeObserver
  schedule?: (callback: () => void) => number
  cancel?: (handle: number) => void
}) {
  const bindings = new Map<HTMLElement, Binding>()
  const pending = new Map<HTMLElement, Binding>()
  let frame: number | undefined
  let destroyed = false

  function queue(element: HTMLElement, binding: Binding) {
    pending.set(element, binding)
    frame ??= schedule(flush)
  }

  function flush() {
    frame = undefined
    if (destroyed) {
      return
    }
    const changed: SizeRange[] = []
    for (const [element, binding] of pending) {
      if (bindings.get(element) !== binding) {
        continue
      }
      // Read current natural geometry, not ResizeObserverEntry's potentially stale size.
      const size = itemSize(element, horizontal ? 'offsetWidth' : 'offsetHeight')
      if (!Number.isFinite(size) || size <= 0 || size === binding.size) {
        continue
      }
      binding.size = size
      changed.push({ startIndex: binding.cell.index, endIndex: binding.cell.index, size })
    }
    pending.clear()
    if (!changed.length) {
      return
    }
    changed.sort((a, b) => a.startIndex - b.startIndex)
    const ranges: SizeRange[] = []
    for (const range of changed) {
      const last = ranges[ranges.length - 1]
      if (last && last.endIndex + 1 === range.startIndex && last.size === range.size) {
        last.endIndex = range.endIndex
      } else {
        ranges.push(range)
      }
    }
    callback(ranges)
  }

  const observer = createObserver((entries) => {
    if (destroyed) {
      return
    }
    for (const entry of entries) {
      const element = entry.target as HTMLElement
      const binding = bindings.get(element)
      if (binding) {
        queue(element, binding)
      }
    }
  })

  return {
    setCells(cells: readonly CellMeasurement[]) {
      if (destroyed) {
        return
      }
      const retained = new Set<HTMLElement>()
      for (const cell of cells) {
        if (!cell.active || cell.exact) {
          continue
        }
        retained.add(cell.element)
        const previous = bindings.get(cell.element)
        if (
          previous &&
          previous.cell.index === cell.index &&
          previous.cell.logicalKey === cell.logicalKey &&
          previous.cell.assignmentGeneration === cell.assignmentGeneration &&
          previous.cell.layoutRevision === cell.layoutRevision
        ) {
          continue
        }
        const binding: Binding = { cell: { ...cell }, size: cell.knownSize }
        bindings.set(cell.element, binding)
        if (!previous) {
          observer.observe(cell.element)
        }
        queue(cell.element, binding)
      }
      for (const [element] of bindings) {
        if (retained.has(element)) {
          continue
        }
        observer.unobserve(element)
        bindings.delete(element)
        pending.delete(element)
      }
    },
    destroy() {
      destroyed = true
      if (frame !== undefined) {
        cancel(frame)
      }
      observer.disconnect()
      bindings.clear()
      pending.clear()
    },
  }
}
