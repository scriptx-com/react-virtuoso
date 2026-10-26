import type { ScrollDirection } from './window'

export function createWindowTracker() {
  const history = [0, 0, 0, 0.1, 0.1]
  const sorted = new Array<number>(5)
  let cursor = 0
  let previousOffset: number | undefined
  let previousTime: number | undefined
  let direction: ScrollDirection = 'forward'
  let renderTime = 16

  return {
    sample(offset: number, timestamp: number) {
      if (!Number.isFinite(offset) || !Number.isFinite(timestamp)) {
        return { direction, projectedOffset: previousOffset ?? 0 }
      }
      if (previousTime === undefined || previousOffset === undefined) {
        previousTime = timestamp
        previousOffset = offset
        return { direction, projectedOffset: offset }
      }
      const elapsed = timestamp - previousTime
      if (elapsed <= 0) {
        return { direction, projectedOffset: offset }
      }
      history[cursor] = (offset - previousOffset) / elapsed
      cursor = (cursor + 1) % history.length
      previousOffset = offset
      previousTime = timestamp
      let forward = 0
      let backward = 0
      for (let index = 0; index < history.length; index++) {
        const value = history[index]!
        if (value > 0) {
          forward++
        }
        if (value < 0) {
          backward++
        }
        let target = index
        while (target > 0 && sorted[target - 1]! > value) {
          sorted[target] = sorted[target - 1]!
          target--
        }
        sorted[target] = value
      }
      if (forward || backward) {
        direction = backward > forward ? 'backward' : 'forward'
      }
      return { direction, projectedOffset: offset + sorted[2]! * renderTime }
    },
    setRenderTime(ms: number) {
      if (Number.isFinite(ms) && ms >= 0) {
        renderTime = ms
      }
    },
    reset() {
      history[0] = 0
      history[1] = 0
      history[2] = 0
      history[3] = 0.1
      history[4] = 0.1
      cursor = 0
      previousOffset = undefined
      previousTime = undefined
      direction = 'forward'
      renderTime = 16
    },
  }
}
