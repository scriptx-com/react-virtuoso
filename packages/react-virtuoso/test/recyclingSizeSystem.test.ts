import { describe, expect, it } from 'vitest'

import { listSystem } from '../src/listSystem'
import { knownSizeAt } from '../src/recycling/layout'
import { offsetOf, sizeSystem } from '../src/sizeSystem'
import * as u from '../src/urx'

describe('exact layout integration', () => {
  it('seeds first-cell spacing and exact ranges before any item measurement', () => {
    const s = u.init(sizeSystem)
    u.publish(s.totalCount, 100)
    u.publish(s.applyKnownLayout, {
      revision: 1,
      ranges: [
        { startIndex: 0, endIndex: 0, size: 100 },
        { startIndex: 1, endIndex: 99, size: 110 },
      ],
    })
    expect(offsetOf(20, u.getValue(s.sizes).offsetTree, 0)).toBe(2190)
    expect(knownSizeAt(u.getValue(s.knownLayout), 99)).toBe(110)
  })

  it('invalidates exactness and old per-index sizes on same-length data replacement', () => {
    const s = u.init(sizeSystem)
    u.publish(s.data, ['a', 'b', 'c'])
    u.publish(s.totalCount, 3)
    u.publish(s.defaultItemSize, 50)
    u.publish(s.applyKnownLayout, { revision: 'same-layout', ranges: [{ startIndex: 0, endIndex: 0, size: 100 }] })
    u.publish(s.sizeRanges, [{ startIndex: 1, endIndex: 1, size: 150 }])
    u.publish(s.data, ['c', 'b', 'a'])
    expect(u.getValue(s.knownLayout)).toBeUndefined()
    expect(offsetOf(2, u.getValue(s.sizes).offsetTree, 0)).toBe(100)
    u.publish(s.sizeRanges, [{ startIndex: 2, endIndex: 2, size: 75 }])
    expect(offsetOf(3, u.getValue(s.sizes).offsetTree, 0)).toBe(175)
  })

  it('replaces coverage rather than merging old exact ranges into a new revision', () => {
    const s = u.init(sizeSystem)
    u.publish(s.totalCount, 4)
    u.publish(s.defaultItemSize, 50)
    u.publish(s.applyKnownLayout, { revision: 1, ranges: [{ startIndex: 0, endIndex: 3, size: 100 }] })
    u.publish(s.applyKnownLayout, { revision: 2, ranges: [{ startIndex: 2, endIndex: 3, size: 120 }] })
    expect(knownSizeAt(u.getValue(s.knownLayout), 0)).toBeUndefined()
    expect(knownSizeAt(u.getValue(s.knownLayout), 2)).toBe(120)
    expect(offsetOf(3, u.getValue(s.sizes).offsetTree, 0)).toBe(220)
    u.publish(s.applyKnownLayout, undefined)
    expect(u.getValue(s.knownLayout)).toBeUndefined()
    expect(offsetOf(3, u.getValue(s.sizes).offsetTree, 0)).toBe(150)
  })

  it('rejects invalid geometry and removes old coverage', () => {
    const s = u.init(sizeSystem)
    u.publish(s.totalCount, 4)
    u.publish(s.applyKnownLayout, { revision: 1, ranges: [{ startIndex: 0, endIndex: 3, size: 100 }] })
    u.publish(s.applyKnownLayout, { revision: 2, ranges: [{ startIndex: 0, endIndex: 4, size: 100 }] })
    expect(u.getValue(s.knownLayout)).toBeUndefined()
  })

  it('corrects the visible anchor once when known sizes change while scrolling upward', () => {
    const s = u.init(listSystem)
    u.publish(s.propsReady, true)
    u.publish(s.totalCount, 100)
    u.publish(s.applyKnownLayout, { revision: 1, ranges: [{ startIndex: 0, endIndex: 99, size: 100 }] })
    u.publish(s.viewportHeight, 400)
    u.publish(s.headerHeight, 60)
    u.publish(s.scrollTop, 1085)
    u.publish(s.scrollTop, 1065)
    const corrections: number[] = []
    u.subscribe(s.scrollBy, ({ top }) => corrections.push(top!))
    u.publish(s.applyKnownLayout, { revision: 2, ranges: [{ startIndex: 0, endIndex: 99, size: 120 }] })
    expect(corrections).toEqual([200])
  })
})
