import { describe, expect, it, vi } from 'vitest'

import { getChangedChildSizes } from '../src/hooks/useChangedChildSizes'
import { coversKnownRange, knownSizeAt, validateKnownLayout } from '../src/recycling/layout'

import type { KnownLayout } from '../src/recycling/layout'

const layout: KnownLayout = {
  revision: 1,
  ranges: [
    { startIndex: 0, endIndex: 0, size: 100 },
    { startIndex: 1, endIndex: 4, size: 110 },
    { startIndex: 6, endIndex: 8, size: 120 },
  ],
}

describe('trusted geometry', () => {
  it('keeps exact coverage separate from interpolated neighboring sizes', () => {
    expect(validateKnownLayout(layout, 10)).toBe(true)
    expect(knownSizeAt(layout, 0)).toBe(100)
    expect(knownSizeAt(layout, 4)).toBe(110)
    expect(knownSizeAt(layout, 5)).toBeUndefined()
    expect(knownSizeAt(layout, 8)).toBe(120)
    expect(knownSizeAt(layout, 9)).toBeUndefined()
    expect(knownSizeAt(undefined, 0)).toBeUndefined()
    expect(coversKnownRange(layout, 0, 4)).toBe(true)
    expect(coversKnownRange(layout, 0, 6)).toBe(false)
    expect(coversKnownRange(layout, 6, 8)).toBe(true)
    expect(coversKnownRange(layout, 9, 9)).toBe(false)
  })

  it.each([
    [{ startIndex: 0, endIndex: 10, size: 1 }],
    [{ startIndex: -1, endIndex: 0, size: 1 }],
    [{ startIndex: 1.5, endIndex: 2, size: 1 }],
    [{ startIndex: 2, endIndex: 1, size: 1 }],
    [{ startIndex: 0, endIndex: Infinity, size: 1 }],
    [{ startIndex: 0, endIndex: 1, size: 0 }],
    [{ startIndex: 0, endIndex: 1, size: -1 }],
    [{ startIndex: 0, endIndex: 1, size: NaN }],
    [{ startIndex: 0, endIndex: 1, size: Infinity }],
    [
      { startIndex: 2, endIndex: 3, size: 1 },
      { startIndex: 0, endIndex: 1, size: 1 },
    ],
    [
      { startIndex: 0, endIndex: 2, size: 1 },
      { startIndex: 2, endIndex: 3, size: 1 },
    ],
  ])('rejects invalid ranges %j', (...ranges) => {
    expect(validateKnownLayout({ revision: 1, ranges }, 10)).toBe(false)
  })

  it('accepts empty coverage and rejects invalid counts/revisions', () => {
    expect(validateKnownLayout({ revision: 'empty', ranges: [] }, 0)).toBe(true)
    expect(validateKnownLayout(layout, NaN)).toBe(false)
    expect(validateKnownLayout(layout, -1)).toBe(false)
    expect(validateKnownLayout({ ...layout, revision: NaN }, 10)).toBe(false)
  })

  it('reads only unknown cells and coalesces changed measurements', () => {
    const parent = document.createElement('div')
    for (const index of [0, 4, 5, 6, 8, 9]) {
      const node = document.createElement('div')
      node.dataset.index = String(index)
      node.dataset.knownSize = '110'
      parent.appendChild(node)
    }
    const reader = vi.fn(() => 130)
    expect(getChangedChildSizes(parent.children, reader, 'offsetHeight', vi.fn(), layout)).toEqual([
      { startIndex: 5, endIndex: 5, size: 130 },
      { startIndex: 9, endIndex: 9, size: 130 },
    ])
    expect(reader).toHaveBeenCalledTimes(2)
    reader.mockClear()
    getChangedChildSizes(parent.children, reader, 'offsetHeight', vi.fn(), undefined)
    expect(reader).toHaveBeenCalledTimes(6)
  })

  it('publishes no batch for unchanged measurements', () => {
    const parent = document.createElement('div')
    parent.innerHTML = '<div data-index="0" data-known-size="100"></div>'
    expect(getChangedChildSizes(parent.children, () => 100, 'offsetWidth', vi.fn())).toBeNull()
  })
})
