import * as u from '../urx'
import { resolveRecyclingWindow } from './window'
import { createWindowTracker } from './windowTracker'

import type { PixelWindow } from './integration'

interface WindowSystem {
  data: u.StatefulStream<readonly unknown[] | undefined>
  horizontalDirection: u.StatefulStream<boolean>
  statefulScrollTop: u.StatefulStream<number>
  viewportHeight: u.Stream<number>
  totalListHeight: u.StatefulStream<number>
  propsReady: u.StatefulStream<boolean>
  recyclingActive: u.StatefulStream<boolean>
  recyclingWindow: u.StatefulStream<PixelWindow | undefined>
}

/** Uses the list's normalized scroll and geometry streams; no additional DOM observers. */
export function bindRecyclingWindow(system: WindowSystem) {
  const recyclingDrawDistance = u.statefulStream<number | undefined>(undefined)
  const recyclingWindowOverride = u.statefulStream<PixelWindow | undefined>(undefined)
  const recyclingRenderTime = u.stream<number>()
  const tracker = createWindowTracker()
  let viewport = 0
  let previousOffset: number | undefined
  let projection: ReturnType<typeof tracker.sample> | undefined
  const publish = (window: PixelWindow | undefined) => {
    const previous = u.getValue(system.recyclingWindow)
    if (previous?.start !== window?.start || previous?.end !== window?.end) {
      u.publish(system.recyclingWindow, window)
    }
  }
  const refresh = () => {
    if (!u.getValue(system.propsReady) || !u.getValue(system.recyclingActive)) {
      return
    }
    const override = u.getValue(recyclingWindowOverride)
    const distance = u.getValue(recyclingDrawDistance)
    if (override || distance === undefined) {
      publish(override)
      return
    }
    const contentSize = u.getValue(system.totalListHeight)
    if (viewport <= 0 || contentSize <= 0) {
      publish(undefined)
      return
    }
    const offset = Math.max(0, Math.min(u.getValue(system.statefulScrollTop), Math.max(0, contentSize - viewport)))
    if (previousOffset !== offset || !projection) {
      projection = tracker.sample(offset, performance.now())
      previousOffset = offset
    }
    publish(resolveRecyclingWindow({ offset, viewportSize: viewport, contentSize, drawDistance: distance, ...projection }))
  }
  u.subscribe(system.statefulScrollTop, refresh)
  u.subscribe(system.viewportHeight, (value) => {
    viewport = value
    refresh()
  })
  u.subscribe(system.totalListHeight, refresh)
  u.subscribe(system.propsReady, refresh)
  const reset = () => {
    tracker.reset()
    previousOffset = undefined
    projection = undefined
    refresh()
  }
  u.subscribe(u.duc(system.data), reset)
  u.subscribe(u.duc(system.horizontalDirection), reset)
  u.subscribe(recyclingDrawDistance, reset)
  u.subscribe(recyclingWindowOverride, refresh)
  u.subscribe(system.recyclingActive, reset)
  u.subscribe(recyclingRenderTime, (duration) => tracker.setRenderTime(duration))
  return { recyclingDrawDistance, recyclingWindowOverride, recyclingRenderTime }
}
