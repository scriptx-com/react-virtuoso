import React from 'react'

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { VirtuosoGrid, VirtuosoGridMockContext } from '../src'
import { RecycledGridItems } from '../src/recycling/RecycledGridItems'
import { RecyclingContext } from '../src/recycling/RecyclingContext'
import { useRecyclingState } from '../src/recycling/useRecyclingState'

import type { GridState } from '../src/gridSystem'

afterEach(cleanup)
const data = Array.from({ length: 100 }, (_, id) => ({ id, type: 'tile' }))
const key = (_index: number, item: (typeof data)[number]) => item.id
const type = (item: (typeof data)[number]) => item.type
const mounts = vi.fn()
function Tile({ id }: { id: number }) {
  const [value] = useRecyclingState(() => id, [])
  React.useEffect(() => {
    mounts()
  }, [])
  return <button>{value}</button>
}
const content = (_index: number, item: (typeof data)[number]) => <Tile id={item.id} />
function state(start: number, count = 6): GridState {
  return {
    itemHeight: 100,
    itemWidth: 100,
    items: data.slice(start, start + count).map((item, i) => ({ index: start + i, data: item })),
    top: (start / 3) * 100,
    bottom: ((start + count) / 3) * 100,
    offsetTop: (start / 3) * 100,
    offsetBottom: 0,
  }
}
const tree = (start: number, count = 6, changes = {}) => (
  <RecycledGridItems
    state={state(start, count)}
    data={data}
    totalCount={data.length}
    columns={3}
    rowGap={0}
    columnGap={0}
    focusedKey={null}
    computeItemKey={key}
    getItemType={type}
    itemContent={content}
    ItemComponent="div"
    className="tile"
    context={null}
    {...changes}
  />
)

it('reuses compatible hosts and resets item state across grid windows', () => {
  mounts.mockClear()
  const view = render(tree(0))
  const hosts = [...view.container.children]
  expect(mounts).toHaveBeenCalledTimes(6)
  view.rerender(tree(6))
  expect(mounts).toHaveBeenCalledTimes(6)
  expect(new Set(view.container.children)).toEqual(new Set(hosts))
  expect(view.container.textContent).toBe('67891011')
  expect([...view.container.children].map((el) => Number(el.getAttribute('data-index')))).toEqual([6, 7, 8, 9, 10, 11])
})

it('parks a bounded reserve without exposing it to layout or measurement', () => {
  const view = render(tree(0, 12))
  view.rerender(tree(6, 3))
  expect(view.container.querySelectorAll('[data-grid-visible]')).toHaveLength(3)
  expect(view.container.children.length).toBeLessThanOrEqual(6)
  for (const cell of view.container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')) {
    expect(cell.style.display).toBe('none')
    expect(cell.hasAttribute('data-index')).toBe(false)
  }
})

it('keeps incompatible item types in separate pools', () => {
  const view = render(tree(0))
  const before = [...view.container.children]
  view.rerender(tree(6, 6, { getItemType: () => 'other' }))
  for (const cell of view.container.querySelectorAll('[data-grid-visible]')) {
    expect(before).not.toContain(cell)
  }
})

it('retains a focused cell outside flow and retires it when removed', () => {
  const view = render(tree(0))
  const focused = view.container.querySelector('[data-index="2"]')!
  view.rerender(tree(6, 6, { focusedKey: 2 }))
  expect(view.container.querySelector('[data-index="2"]')).toBe(focused)
  expect((focused as HTMLElement).style.position).toBe('absolute')
  expect(focused.hasAttribute('data-grid-visible')).toBe(false)
  view.rerender(tree(6, 6, { focusedKey: 2, data: data.map((item) => (item.id === 2 ? { ...item, id: 999 } : item)) }))
  expect(view.container.querySelector('[data-index="2"]')).toBeNull()
})

it('freezes content and drops inner idle reserves while its parent parks', () => {
  const scope = {}
  const wrapped = (active: boolean, start: number, count: number) => (
    <RecyclingContext.Provider value={{ scope, logicalKey: 'outer', slotId: 0, generation: 1, active }}>
      {tree(start, count)}
    </RecyclingContext.Provider>
  )
  const view = render(wrapped(true, 0, 12))
  view.rerender(wrapped(true, 6, 3))
  view.rerender(wrapped(false, 12, 3))
  expect(view.container.children).toHaveLength(3)
  expect(view.container.textContent).toBe('678')
  expect(view.container.querySelectorAll('[data-grid-visible]')).toHaveLength(0)
  view.rerender(wrapped(true, 12, 3))
  expect(view.container.textContent).toBe('121314')
})

it('wires defaults, opt-out, item types, resizing and actual scroll ranges', () => {
  const grid = (recycling?: boolean, width = 300) => (
    <VirtuosoGridMockContext.Provider value={{ itemHeight: 100, itemWidth: 100, viewportHeight: 200, viewportWidth: width }}>
      <VirtuosoGrid
        data={data}
        computeItemKey={key}
        getItemType={type}
        itemContent={content}
        {...(recycling !== undefined ? { recycling } : {})}
      />
    </VirtuosoGridMockContext.Provider>
  )
  const view = render(grid())
  expect(view.container.querySelectorAll('[data-grid-visible]')).toHaveLength(6)
  const scroller = view.container.querySelector('[data-virtuoso-scroller]')! as HTMLElement
  Object.defineProperty(scroller, 'offsetHeight', { value: 200 })
  Object.defineProperty(scroller, 'scrollHeight', { value: 3400 })
  void act(() => fireEvent.scroll(scroller, { target: { scrollTop: 400 } }))
  expect(view.container.querySelector('[data-grid-visible][data-index="12"]')).not.toBeNull()
  view.rerender(grid(false))
  expect(view.container.querySelector('[data-recycling-slot]')).toBeNull()
  view.rerender(grid(undefined, 200))
  expect(view.container.querySelectorAll('[data-grid-visible]')).toHaveLength(4)
})

it('does not consume a nested recycled list focus as its own grid index', () => {
  const view = render(
    <VirtuosoGridMockContext.Provider value={{ itemHeight: 100, itemWidth: 100, viewportHeight: 200, viewportWidth: 300 }}>
      <VirtuosoGrid
        recycling={false}
        data={data}
        computeItemKey={key}
        itemContent={() => (
          <div data-recycling-slot="0" data-index="999">
            <button>nested</button>
          </div>
        )}
      />
    </VirtuosoGridMockContext.Provider>
  )
  expect(() => fireEvent.focus(view.container.querySelector('button')!)).not.toThrow()
})

it('keeps bootstrap cells mounted when their first measurement arrives', () => {
  mounts.mockClear()
  const grid = (size: number) => (
    <VirtuosoGridMockContext.Provider value={{ itemHeight: size, itemWidth: size, viewportHeight: 200, viewportWidth: 300 }}>
      <VirtuosoGrid data={data} initialItemCount={6} itemContent={content} computeItemKey={key} />
    </VirtuosoGridMockContext.Provider>
  )
  const view = render(grid(0))
  const first = view.container.querySelector('[data-index="0"]')
  expect(mounts).toHaveBeenCalledTimes(6)
  view.rerender(grid(100))
  expect(view.container.querySelector('[data-index="0"]')).toBe(first)
  expect(mounts).toHaveBeenCalledTimes(6)
})
