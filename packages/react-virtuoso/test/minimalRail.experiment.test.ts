// eslint-disable-next-line import/no-nodejs-modules -- Optional local benchmark artifact output.
import { writeFileSync } from 'node:fs'

// Throwaway experiment: not exported or selected by the product.
import { expect, it } from 'vitest'

import { listSystem } from '../src/listSystem'
import { minimalRailSystem } from '../src/minimalRailSystem'
import * as u from '../src/urx'

const minimal = minimalRailSystem(listSystem)

it.each([false, true])('matches measured/fixed rail ranges: fixed=%s', (fixed) => {
  function scenario(spec: typeof listSystem) {
    const s = u.init(spec)
    u.publish(s.horizontalDirection, true)
    u.publish(s.scrollTop, 0)
    u.publish(s.totalCount, 1000)
    if (fixed) {
      u.publish(s.fixedItemHeight, 100)
    }
    u.publish(s.propsReady, true)
    u.publish(s.viewportHeight, 600)
    if (!fixed) {
      u.publish(s.sizeRanges, [{ startIndex: 0, endIndex: 999, size: 100 }])
    }
    return [0, 300, 1500, 12000, 300, 0].map((offset) => {
      u.publish(s.scrollTop, offset)
      const state = u.getValue(s.listState)
      return { items: state.items, offsetTop: state.offsetTop, offsetBottom: state.offsetBottom }
    })
  }
  expect(scenario(minimal)).toEqual(scenario(listSystem))
})

it('records a construction-only experiment, not TV FPS', () => {
  for (let i = 0; i < 200; i++) {
    u.init(listSystem)
    u.init(minimal)
  }
  const samples: { iteration: number; mode: string; msPerList: number }[] = []
  for (let iteration = 0; iteration < 16; iteration++) {
    for (const mode of iteration % 2 ? ['minimal', 'full'] : ['full', 'minimal']) {
      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        u.init(mode === 'minimal' ? minimal : listSystem)
      }
      samples.push({ iteration, mode, msPerList: (performance.now() - start) / 1000 })
    }
  }
  if (process.env.RAIL_CONSTRUCTION_REPORT !== undefined) {
    writeFileSync(process.env.RAIL_CONSTRUCTION_REPORT, JSON.stringify(samples, null, 2))
  }
  for (const mode of ['full', 'minimal']) {
    const values = samples
      .filter((s) => s.mode === mode)
      .map((s) => s.msPerList)
      .sort((a, b) => a - b)
    console.log(mode, (values[7]! + values[8]!) / 2)
  }
})
