import { expect, it } from 'vitest'

import { listSystem } from '../src/listSystem'
import * as u from '../src/urx'

it('maps the internal pixel window through the existing size tree without overscan duplication', () => {
  const s = u.init(listSystem)
  u.publish(s.totalCount, 100)
  u.publish(s.fixedItemHeight, 100)
  u.publish(s.viewportHeight, 300)
  u.publish(s.headerHeight, 50)
  u.publish(s.overscan, 1000)
  u.publish(s.increaseViewportBy, 1000)
  u.publish(s.scrollTop, 1050)
  u.publish(s.recyclingWindow, { start: 950, end: 1450 })
  u.publish(s.propsReady, true)
  const indices = u.getValue(s.listState).items.map((item) => item.index)
  expect(indices).toEqual([9, 10, 11, 12, 13])
})

it('keeps the actual viewport covered if an internal projected window falls behind', () => {
  const s = u.init(listSystem)
  u.publish(s.totalCount, 100)
  u.publish(s.fixedItemHeight, 100)
  u.publish(s.viewportHeight, 300)
  u.publish(s.scrollTop, 1000)
  u.publish(s.recyclingWindow, { start: 0, end: 100 })
  u.publish(s.propsReady, true)
  expect(u.getValue(s.listState).items.some((item) => item.index === 12)).toBe(true)
})

it('does not expose a new dataset with old geometry during a props transaction', () => {
  const s = u.init(listSystem)
  u.publish(s.data, ['a', 'b', 'c'])
  u.publish(s.fixedItemHeight, 100)
  u.publish(s.viewportHeight, 200)
  u.publish(s.scrollTop, 0)
  u.publish(s.propsReady, true)
  const previous = u.getValue(s.listState)
  u.publish(s.propsReady, false)
  u.publish(s.data, ['d', 'e', 'f'])
  expect(u.getValue(s.listState)).toBe(previous)
  u.publish(s.applyKnownLayout, { revision: 2, ranges: [{ startIndex: 0, endIndex: 2, size: 120 }] })
  u.publish(s.propsReady, true)
  expect(u.getValue(s.listState).items[0]!.data).toBe('d')
  expect(u.getValue(s.listState).items[0]!.size).toBe(120)
})

it('does not publish a new list snapshot while the resolved cells stay identical', () => {
  const s = u.init(listSystem)
  u.publish(s.totalCount, 100)
  u.publish(s.fixedItemHeight, 100)
  u.publish(s.viewportHeight, 250)
  u.publish(s.scrollTop, 0)
  u.publish(s.recyclingWindow, { start: 0, end: 300 })
  u.publish(s.propsReady, true)
  const previous = u.getValue(s.listState)
  u.publish(s.recyclingWindow, { start: 1, end: 299 })
  expect(u.getValue(s.listState)).toBe(previous)
})
