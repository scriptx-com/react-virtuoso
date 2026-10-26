import type { SizeRange } from '../interfaces'

/** Exact sizes for one logical dataset/layout generation, never inferred estimates. */
export interface KnownLayout {
  readonly revision: number | string
  readonly ranges: readonly SizeRange[]
}

export function validateKnownLayout(layout: KnownLayout, count: number): boolean {
  if (!Number.isInteger(count) || count < 0 || (typeof layout.revision === 'number' && !Number.isFinite(layout.revision))) {
    return false
  }
  let previousEnd = -1
  for (const { startIndex, endIndex, size } of layout.ranges) {
    if (
      !Number.isInteger(startIndex) ||
      !Number.isInteger(endIndex) ||
      startIndex <= previousEnd ||
      endIndex < startIndex ||
      endIndex >= count ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return false
    }
    previousEnd = endIndex
  }
  return true
}

function rangeIndexAt(layout: KnownLayout, index: number): number {
  let low = 0
  let high = layout.ranges.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const range = layout.ranges[middle]!
    if (index < range.startIndex) {
      high = middle - 1
    } else if (index > range.endIndex) {
      low = middle + 1
    } else {
      return middle
    }
  }
  return -1
}

export function knownSizeAt(layout: KnownLayout | undefined, index: number): number | undefined {
  if (!layout || !Number.isInteger(index)) {
    return undefined
  }
  return layout.ranges[rangeIndexAt(layout, index)]?.size
}

export function coversKnownRange(layout: KnownLayout | undefined, start: number, end: number): boolean {
  if (end < start) {
    return true
  }
  if (!layout) {
    return false
  }
  let cursor = rangeIndexAt(layout, start)
  if (cursor < 0) {
    return false
  }
  let coveredEnd = layout.ranges[cursor]!.endIndex
  while (coveredEnd < end) {
    const next = layout.ranges[++cursor]
    if (!next || next.startIndex !== coveredEnd + 1) {
      return false
    }
    coveredEnd = next.endIndex
  }
  return true
}
