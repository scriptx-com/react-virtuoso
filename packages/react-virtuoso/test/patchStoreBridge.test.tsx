import React, { act } from 'react'

import { createRoot } from 'react-dom/client'
/* eslint-disable require-await -- Async act drains React work after synchronous publication. */
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'

import { systemToComponent } from '../src/react-urx'
import * as u from '../src/urx'

import type { Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe('source store bridge', () => {
  let host: HTMLDivElement
  let root: Root
  const keys = ['count', 'label', 'optional'] as const
  function setup(initial = 1) {
    const runtime = { bridge: systemToComponent, define: u.system, state: u.statefulStream, publish: u.publish }
    const system = {
      count: runtime.state(initial),
      label: runtime.state('ready'),
      optional: runtime.state<string | undefined>(undefined),
    }
    const bridge = runtime.bridge(
      runtime.define(() => system),
      {}
    )
    const read = bridge.useEmitterValues ?? ((names: typeof keys) => names.map(bridge.useEmitterValue))
    function Reader() {
      const [count, label, optional] = read(keys)
      return <span>{`${count}:${label}:${optional}`}</span>
    }
    return { runtime, system, bridge, Reader }
  }
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('reads a consistent multi-stream snapshot through one React store subscription', async () => {
    const { bridge, Reader } = setup()
    const readStore = vi.spyOn(React, 'useSyncExternalStore')
    await act(async () =>
      root.render(
        <bridge.Component>
          <Reader />
        </bridge.Component>
      )
    )
    expect(host.textContent).toBe('1:ready:undefined')
    expect(readStore).toHaveBeenCalledTimes(1)
  })

  it('keeps subscribe and snapshot callbacks stable when the same list renders again', async () => {
    const { bridge, Reader } = setup()
    const readStore = vi.spyOn(React, 'useSyncExternalStore')
    const render = () =>
      act(async () =>
        root.render(
          <bridge.Component>
            <Reader />
          </bridge.Component>
        )
      )
    await render()
    const first = readStore.mock.calls[0]!
    readStore.mockClear()
    await render()
    const next = readStore.mock.calls[0]!
    expect(next[0]).toBe(first[0])
    expect(next[1]).toBe(first[1])
    expect(next[1]()).toBe(first[1]())
  })

  it('delivers changes to every field and keeps unchanged snapshots cached', async () => {
    const { bridge, Reader, runtime, system } = setup()
    await act(async () =>
      root.render(
        <bridge.Component>
          <Reader />
        </bridge.Component>
      )
    )
    await act(async () => runtime.publish(system.count, 2))
    expect(host.textContent).toBe('2:ready:undefined')
    await act(async () => {
      runtime.publish(system.label, 'updated')
      runtime.publish(system.optional, 'value')
    })
    expect(host.textContent).toBe('2:updated:value')
    await act(async () => runtime.publish(system.optional, undefined))
    expect(host.textContent).toBe('2:updated:undefined')
  })

  it('isolates stores between mounted list instances', async () => {
    const first = setup(1)
    const second = setup(9)
    await act(async () =>
      root.render(
        <>
          <first.bridge.Component>
            <first.Reader />
          </first.bridge.Component>
          <second.bridge.Component>
            <second.Reader />
          </second.bridge.Component>
        </>
      )
    )
    await act(async () => first.runtime.publish(first.system.count, 3))
    expect(Array.from(host.querySelectorAll('span'), (node) => node.textContent)).toEqual(['3:ready:undefined', '9:ready:undefined'])
  })

  it('notifies every consumer when they share the same stream snapshot', async () => {
    const { bridge, Reader, runtime, system } = setup()
    await act(async () =>
      root.render(
        <bridge.Component>
          <Reader />
          <Reader />
        </bridge.Component>
      )
    )
    await act(async () => runtime.publish(system.count, 7))
    expect(Array.from(host.querySelectorAll('span'), (node) => node.textContent)).toEqual(['7:ready:undefined', '7:ready:undefined'])
  })

  it('observes a change between rendering and attaching the store subscription', async () => {
    const { bridge, Reader, runtime, system } = setup()
    function ChangeBeforeSubscription() {
      React.useLayoutEffect(() => runtime.publish(system.count, 6), [])
      return null
    }
    await act(async () =>
      root.render(
        <bridge.Component>
          <Reader />
          <ChangeBeforeSubscription />
        </bridge.Component>
      )
    )
    expect(host.textContent).toBe('6:ready:undefined')
  })

  it('keeps an unchanged snapshot cached and unsubscribes every underlying stream', async () => {
    const { bridge, Reader, runtime, system } = setup()
    const readStore = vi.spyOn(React, 'useSyncExternalStore')
    await act(async () =>
      root.render(
        <bridge.Component>
          <Reader />
        </bridge.Component>
      )
    )
    const [subscribe, snapshot] = readStore.mock.calls[0]!
    const before = snapshot()
    const listener = vi.fn()
    const remove = subscribe(listener)
    runtime.publish(system.count, 1)
    expect(snapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    remove()
    await act(async () => {
      runtime.publish(system.count, 8)
      runtime.publish(system.label, 'after')
    })
    expect(listener).not.toHaveBeenCalled()
    expect(host.textContent).toBe('8:after:undefined')
  })
})
