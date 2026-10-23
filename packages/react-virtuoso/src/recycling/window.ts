export type ScrollDirection = 'forward' | 'backward'
export interface PixelWindow {
  start: number
  end: number
}

export function normalizeDrawDistance(value: number | undefined, fallback: number): number {
  return Math.max(0, Number.isFinite(value) ? value! : fallback)
}

export function resolveRecyclingWindow({
  offset,
  projectedOffset,
  viewportSize,
  contentSize,
  drawDistance,
  direction,
}: {
  offset: number
  projectedOffset: number
  viewportSize: number
  contentSize: number
  drawDistance: number
  direction: ScrollDirection
}): PixelWindow {
  if (contentSize <= 0 || viewportSize <= 0) {
    return { start: 0, end: 0 }
  }
  const actual = Math.max(0, Math.min(offset, Math.max(0, contentSize - viewportSize)))
  const projected = Number.isFinite(projectedOffset) ? projectedOffset : actual
  const budget = normalizeDrawDistance(drawDistance, 0) * 2
  const before = Math.ceil(budget * (direction === 'backward' ? 0.7 : 0.3))
  const after = Math.ceil(budget * (direction === 'backward' ? 0.3 : 0.7))
  let start = Math.max(0, Math.min(projected - before, actual))
  let end = Math.max(projected + viewportSize + after + Math.max(0, before - projected), actual + viewportSize)
  if (end > contentSize) {
    start = Math.max(0, start - (end - contentSize))
    end = contentSize
  }
  return { start, end }
}
