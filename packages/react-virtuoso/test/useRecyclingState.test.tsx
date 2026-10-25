import React from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { RecyclingContext } from '../src/recycling/RecyclingContext'
import { useRecyclingState } from '../src/recycling/useRecyclingState'

import type { RecyclingAssignment } from '../src/recycling/RecyclingContext'

afterEach(cleanup)
const scope = {}
const assignment = (logicalKey: string, generation: number): RecyclingAssignment => ({
  logicalKey,
  generation,
  slotId: 0,
  active: true,
  scope,
})

it('resets on A→B→A before commit and rejects stale setters', () => {
  let setter!: React.Dispatch<React.SetStateAction<number>>
  const commits: number[] = []
  function Cell({ initial }: { initial: number }) {
    const [value, setValue] = useRecyclingState(() => initial, [])
    React.useLayoutEffect(() => {
      setter = setValue
      commits.push(value)
    })
    return <span>{value}</span>
  }
  const cell = (key: string, generation: number, initial: number) => (
    <RecyclingContext.Provider value={assignment(key, generation)}>
      <Cell initial={initial} />
    </RecyclingContext.Provider>
  )
  const view = render(cell('a', 1, 1))
  const stale = setter
  act(() => setter((value) => value + 4))
  expect(view.container.textContent).toBe('5')
  view.rerender(cell('b', 2, 20))
  expect(commits).toEqual([1, 5, 20])
  const staleUpdate = vi.fn(() => 999)
  act(() => stale(staleUpdate))
  expect(staleUpdate).not.toHaveBeenCalled()
  expect(view.container.textContent).toBe('20')
  view.rerender(cell('a', 3, 1))
  expect(commits).toEqual([1, 5, 20, 1])
})

it('resets changed dependencies without reassignment and isolates nested list identities', () => {
  let setter!: React.Dispatch<React.SetStateAction<string>>
  function Cell({ source }: { source: string }) {
    const [value, update] = useRecyclingState(() => source, [source])
    React.useLayoutEffect(() => {
      setter = update
    })
    return <span>{value}</span>
  }
  const value = assignment('a', 1)
  const view = render(
    <RecyclingContext.Provider value={value}>
      <Cell source="first" />
    </RecyclingContext.Provider>
  )
  const stale = setter
  view.rerender(
    <RecyclingContext.Provider value={value}>
      <Cell source="second" />
    </RecyclingContext.Provider>
  )
  act(() => stale('stale'))
  expect(view.container.textContent).toBe('second')
  act(() => setter('modified'))
  view.rerender(
    <RecyclingContext.Provider value={{ ...value, scope: {} }}>
      <Cell source="second" />
    </RecyclingContext.Provider>
  )
  expect(view.container.textContent).toBe('second')
})

it('does not overwrite committed state when a replacement render suspends and is abandoned', () => {
  let setter!: React.Dispatch<React.SetStateAction<number>>
  const suspended = new Promise<never>(() => {})
  function Cell({ suspend }: { suspend: boolean }) {
    const [value, update] = useRecyclingState(() => 0, [])
    React.useLayoutEffect(() => {
      setter = update
    })
    if (suspend) {
      // eslint-disable-next-line only-throw-error -- Suspense deliberately throws a promise.
      throw suspended
    }
    return <span>{value}</span>
  }
  const tree = (key: string, generation: number, suspend = false) => (
    <React.Suspense fallback="waiting">
      <RecyclingContext.Provider value={assignment(key, generation)}>
        <Cell suspend={suspend} />
      </RecyclingContext.Provider>
    </React.Suspense>
  )
  const view = render(tree('a', 1))
  act(() => setter(7))
  act(() => React.startTransition(() => view.rerender(tree('b', 2, true))))
  view.rerender(tree('a', 1))
  expect(view.container.textContent).toBe('7')
})

it('rejects updates while parked or unmounted and accepts them after reactivation', () => {
  let setter!: React.Dispatch<React.SetStateAction<number>>
  function Cell() {
    const [value, update] = useRecyclingState(() => 0, [])
    React.useLayoutEffect(() => {
      setter = update
    })
    return <span>{value}</span>
  }
  const tree = (active: boolean) => (
    <RecyclingContext.Provider value={{ ...assignment('a', 1), active }}>
      <Cell />
    </RecyclingContext.Provider>
  )
  const view = render(tree(true))
  const retainedSetter = setter
  view.rerender(tree(false))
  const parkedUpdate = vi.fn(() => 100)
  act(() => retainedSetter(parkedUpdate))
  expect(parkedUpdate).not.toHaveBeenCalled()
  expect(view.container.textContent).toBe('0')
  view.rerender(tree(true))
  act(() => retainedSetter((value) => value + 1))
  expect(view.container.textContent).toBe('1')
  view.unmount()
  act(() => retainedSetter(200))
})

it('accepts child layout-effect updates on mount, reassignment and reactivation', () => {
  function Child({ update, active }: { update: React.Dispatch<React.SetStateAction<number>>; active: boolean }) {
    React.useLayoutEffect(() => {
      if (active) {
        update((value) => value + 1)
      }
    }, [update, active])
    return null
  }
  function Cell({ active }: { active: boolean }) {
    const [value, update] = useRecyclingState(() => 0, [])
    return (
      <>
        <span>{value}</span>
        <Child update={update} active={active} />
      </>
    )
  }
  const tree = (key: string, active = true) => (
    <RecyclingContext.Provider value={{ ...assignment(key, 1), active }}>
      <Cell active={active} />
    </RecyclingContext.Provider>
  )
  const view = render(tree('a'))
  expect(view.container.textContent).toBe('1')
  view.rerender(tree('b'))
  expect(view.container.textContent).toBe('1')
  view.rerender(tree('b', false))
  view.rerender(tree('b'))
  expect(view.container.textContent).toBe('2')
})

it('accepts callback-ref initialization outside recycling in Strict Mode', () => {
  function Cell() {
    const [value, update] = useRecyclingState(() => 0, [])
    const ref = React.useCallback(
      (element: HTMLSpanElement | null) => {
        if (element) {
          update(42)
        }
      },
      [update]
    )
    return <span ref={ref}>{value}</span>
  }
  expect(
    render(
      <React.StrictMode>
        <Cell />
      </React.StrictMode>
    ).container.textContent
  ).toBe('42')
})

it('rejects a setter captured from an abandoned replacement render', () => {
  let update!: React.Dispatch<React.SetStateAction<number>>
  const pending = new Promise<never>(() => {})
  function Cell({ suspend }: { suspend: boolean }) {
    const [value, setter] = useRecyclingState(() => 0, [])
    update = setter
    if (suspend) {
      // eslint-disable-next-line only-throw-error -- Suspense deliberately throws a promise.
      throw pending
    }
    return <span>{value}</span>
  }
  const tree = (key: string, suspend = false) => (
    <React.Suspense fallback="waiting">
      <RecyclingContext.Provider value={assignment(key, 1)}>
        <Cell suspend={suspend} />
      </RecyclingContext.Provider>
    </React.Suspense>
  )
  const view = render(tree('a'))
  const current = update
  act(() => React.startTransition(() => view.rerender(tree('b', true))))
  const abandoned = update
  expect(abandoned).not.toBe(current)
  view.rerender(tree('a'))
  act(() => abandoned(99))
  expect(view.container.textContent).toBe('0')
  act(() => current(7))
  expect(view.container.textContent).toBe('7')
})
