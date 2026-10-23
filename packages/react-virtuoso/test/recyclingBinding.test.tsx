import React from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { createRecyclingController, RecyclingIntegrationProvider } from '../src/recycling/integration'
import { useRecyclingSystemBinding } from '../src/recycling/systemBinding'
import * as u from '../src/urx'

afterEach(cleanup)

it('publishes only the window on scroll and keeps multi-field updates transactional', () => {
  const controller = createRecyclingController()
  let binding!: ReturnType<typeof useRecyclingSystemBinding>
  function Probe() {
    binding = useRecyclingSystemBinding()
    return null
  }
  render(
    <RecyclingIntegrationProvider controller={controller}>
      <Probe />
    </RecyclingIntegrationProvider>
  )
  type System = Parameters<typeof binding.apply>[0]
  const system: System = {
    recyclingDrawDistance: u.statefulStream<number | undefined>(undefined),
    contentInsets: u.statefulStream({ start: 0, end: 0 }),
    propsReady: u.statefulStream(true),
    recycling: u.statefulStream<boolean | undefined>(true),
    getItemType: u.statefulStream<((item: any, index: number) => number | string | undefined) | undefined>(undefined),
    applyKnownLayout: u.stream(),
    recyclingWindowOverride: u.statefulStream<{ start: number; end: number } | undefined>(undefined),
    integrationFocusedKey: u.statefulStream<React.Key | null>(null),
    recyclingActive: u.statefulStream(true),
  }
  binding.apply(system)
  const unsubscribe = binding.subscribe(system)
  const events: string[] = []
  for (const key of ['contentInsets', 'propsReady', 'recyclingWindowOverride', 'integrationFocusedKey', 'recyclingActive'] as const) {
    u.subscribe(system[key] as u.Stream<unknown>, () => events.push(key))
  }
  events.length = 0
  act(() => controller.setWindow({ start: 100, end: 500 }))
  expect(events).toEqual(['recyclingWindowOverride'])
  expect(u.getValue(system.propsReady)).toBe(true)
  events.length = 0
  act(() => controller.setWindow({ start: 100, end: 500 }))
  expect(events).toEqual([])
  act(() =>
    controller.batch(() => {
      controller.setWindow({ start: 200, end: 600 })
      controller.setFocusedItem('next')
    })
  )
  expect(events).toEqual(['propsReady', 'recyclingWindowOverride', 'integrationFocusedKey', 'propsReady'])
  expect(u.getValue(system.integrationFocusedKey)).toBe('next')
  events.length = 0
  u.publish(system.propsReady, false)
  events.length = 0
  act(() => controller.setWindow({ start: 300, end: 700 }))
  expect(events).toEqual(['recyclingWindowOverride'])
  expect(u.getValue(system.propsReady)).toBe(false)
  unsubscribe()
  events.length = 0
  act(() => controller.setWindow(undefined))
  expect(events).toEqual([])
})
