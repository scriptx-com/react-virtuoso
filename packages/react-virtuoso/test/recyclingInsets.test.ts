import { expect, it } from 'vitest'

import { listSystem } from '../src/listSystem'
import * as u from '../src/urx'

it('accounts for content insets once in windows, total extent and index navigation', () => {
  const s = u.init(listSystem)
  u.publish(s.totalCount, 10)
  u.publish(s.fixedItemHeight, 100)
  u.publish(s.viewportHeight, 200)
  u.publish(s.headerHeight, 50)
  u.publish(s.contentInsets, { start: 40, end: 60 })
  u.publish(s.scrollTop, 290)
  u.publish(s.recyclingWindow, { start: 290, end: 490 })
  u.publish(s.propsReady, true)
  expect(u.getValue(s.listState).items.map((item) => item.index)).toEqual([2, 3])
  expect(u.getValue(s.totalListHeight)).toBe(1150)
  let target: ScrollToOptions | undefined
  u.subscribe(s.scrollTo, (location) => {
    target = location
  })
  u.publish(s.scrollToIndex, { index: 2, align: 'start' })
  expect(target?.top).toBe(290)
  u.publish(s.scrollToIndex, { index: 9, align: 'end' })
  expect(target?.top).toBe(950)
})
