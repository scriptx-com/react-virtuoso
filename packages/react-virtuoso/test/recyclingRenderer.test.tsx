import React from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { RecycledItems } from '../src/recycling/RecycledItems'
import { RecyclingContext, useRecyclingContext } from '../src/recycling/RecyclingContext'
import { useRecyclingState } from '../src/recycling/useRecyclingState'
import { initialSizeState, sizeStateReducer } from '../src/sizeSystem'

import type { ListItem } from '../src/interfaces'

afterEach(cleanup)
const data = Array.from({ length: 100 }, (_, index) => ({ id: index }))
const knownLayout = { revision: 1, ranges: [{ startIndex: 0, endIndex: 99, size: 100 }] }
const sizes = sizeStateReducer(initialSizeState(), [[...knownLayout.ranges], [], () => {}, 0])
const computeItemKey = (_index: number, item: { id: number }) => item.id
const itemSize = () => 100
const noop = () => {}
const range = (start: number, count = 3): ListItem<{ id: number }>[] =>
  Array.from({ length: count }, (_, offset) => ({
    index: start + offset,
    originalIndex: start + offset,
    offset: (start + offset) * 100,
    size: 100,
    data: data[start + offset]!,
  }))
const base = {
  data,
  totalCount: 100,
  firstItemIndex: 0,
  totalSize: 10000,
  horizontal: false,
  rtl: false,
  gap: 0,
  sizes,
  knownLayout,
  computeItemKey,
  itemSize,
  sizeRanges: noop,
  listRef: noop,
  ListComponent: 'div' as const,
  ItemComponent: 'div' as const,
  context: undefined,
  focusedKey: null,
  onFocusedItem: noop,
}

it('reuses hosts and mounted children, rendering only reassigned content', () => {
  const mounts = vi.fn()
  const renders = vi.fn()
  function Cell({ id }: { id: number }) {
    React.useEffect(() => {
      mounts()
    }, [])
    const [value] = useRecyclingState(() => id, [])
    return (
      <span>
        {id}:{value}
      </span>
    )
  }
  const itemContent = (index: number) => {
    renders(index)
    return <Cell id={index} />
  }
  const view = render(<RecycledItems {...base} items={range(0)} itemContent={itemContent} />)
  const hosts = [...view.container.querySelectorAll('[data-recycling-slot]')]
  expect(mounts).toHaveBeenCalledTimes(3)
  renders.mockClear()
  view.rerender(<RecycledItems {...base} items={range(1)} itemContent={itemContent} />)
  expect(mounts).toHaveBeenCalledTimes(3)
  expect(renders.mock.calls).toEqual([[3]])
  expect(view.container.textContent).toBe('1:12:23:3')
  expect(view.container.querySelector('[data-item-index="3"]')).toBe(hosts[0])
  expect([...view.container.querySelectorAll('[data-item-index]')].map((node) => node.getAttribute('data-item-index'))).toEqual([
    '1',
    '2',
    '3',
  ])
})

it('preserves intentional descendant keys while reusing the outer host', () => {
  const mounts = vi.fn()
  function Keyed({ id }: { id: number }) {
    React.useEffect(() => {
      mounts(id)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Count mounts, not identity updates.
    }, [])
    return <span>{id}</span>
  }
  const itemContent = (index: number) => <Keyed id={index} key={index} />
  const view = render(<RecycledItems {...base} items={range(0, 1)} itemContent={itemContent} />)
  const host = view.container.querySelector('[data-recycling-slot]')
  view.rerender(<RecycledItems {...base} items={range(1, 1)} itemContent={itemContent} />)
  expect(view.container.querySelector('[data-recycling-slot]')).toBe(host)
  expect(mounts.mock.calls).toEqual([[0], [1]])
})

it('parks incompatible idle cells without measurement attributes or active lifecycle', () => {
  function Cell({ id }: { id: number }) {
    return (
      <span>
        {id}:{String(useRecyclingContext()!.active)}
      </span>
    )
  }
  const getItemType = (_item: unknown, index: number) => (index < 3 ? 'a' : 'b')
  const itemContent = (index: number) => <Cell id={index} />
  const view = render(<RecycledItems {...base} items={range(0)} itemContent={itemContent} getItemType={getItemType} />)
  view.rerender(<RecycledItems {...base} items={range(3)} itemContent={itemContent} getItemType={getItemType} />)
  const idle = [...view.container.querySelectorAll('[aria-hidden="true"]')]
  expect(idle).toHaveLength(3)
  for (const node of idle) {
    expect(node.getAttribute('data-index')).toBeNull()
    expect((node as HTMLElement).style.display).toBe('none')
    expect(node.textContent).toContain('false')
  }
})

it('retains one focused exception without filling all intervening indexes', () => {
  const itemContent = (index: number) => <button>{index}</button>
  const view = render(<RecycledItems {...base} items={range(0)} itemContent={itemContent} />)
  const host = view.container.querySelector('[data-item-index="0"]')
  view.rerender(<RecycledItems {...base} items={range(90)} itemContent={itemContent} focusedKey={0} />)
  expect(view.container.querySelectorAll('[data-item-index]')).toHaveLength(4)
  expect(view.container.querySelector('[data-item-index="0"]')).toBe(host)
})

it('suspends descendants and drops idle reserves when an ancestor parks', () => {
  const scope = {}
  const value = { scope, logicalKey: 'outer', slotId: 0, generation: 1, active: true }
  const getItemType = (_item: unknown, index: number) => (index < 3 ? 'a' : 'b')
  const itemContent = (index: number) => <span>{index}</span>
  const tree = (start: number, active: boolean) => (
    <RecyclingContext.Provider value={{ ...value, active }}>
      <RecycledItems {...base} items={range(start)} itemContent={itemContent} getItemType={getItemType} />
    </RecyclingContext.Provider>
  )
  const view = render(tree(0, true))
  view.rerender(tree(3, true))
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(6)
  view.rerender(tree(3, false))
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
  expect(view.container.querySelectorAll('[data-index]')).toHaveLength(0)
})

it('does not update retained content while its ancestor is inactive', () => {
  const scope = {}
  const renders = vi.fn()
  const tree = (start: number, active: boolean) => (
    <RecyclingContext.Provider value={{ scope, logicalKey: 'outer', slotId: 0, generation: 1, active }}>
      <RecycledItems
        {...base}
        items={range(start)}
        itemContent={(index) => {
          renders(index)
          return <span>{index}</span>
        }}
      />
    </RecyclingContext.Provider>
  )
  const view = render(tree(0, true))
  view.rerender(tree(0, false))
  renders.mockClear()
  view.rerender(tree(20, false))
  expect(renders).not.toHaveBeenCalled()
  expect(view.container.textContent).toBe('012')
  view.rerender(tree(20, true))
  expect(view.container.textContent).toBe('202122')
})

it('commits reusable assignments under Strict Mode and abandons suspended candidates', () => {
  const commits: number[] = []
  const pending = new Promise<never>(() => {})
  function Cell({ id, suspend }: { id: number; suspend: boolean }) {
    const [value] = useRecyclingState(() => id, [])
    React.useLayoutEffect(() => {
      commits.push(id)
    }, [id])
    if (suspend) {
      // eslint-disable-next-line only-throw-error -- Suspense deliberately throws a promise.
      throw pending
    }
    return (
      <span>
        {id}:{value}
      </span>
    )
  }
  const content = (index: number) => <Cell id={index} suspend={index === 40} />
  const tree = (start: number) => (
    <React.StrictMode>
      <React.Suspense fallback="waiting">
        <RecycledItems {...base} items={range(start)} itemContent={content} />
      </React.Suspense>
    </React.StrictMode>
  )
  const view = render(tree(0))
  const hosts = [...view.container.querySelectorAll('[data-recycling-slot]')]
  act(() => React.startTransition(() => view.rerender(tree(40))))
  view.rerender(tree(1))
  expect(commits).not.toContain(40)
  expect(view.container.textContent).toBe('1:12:23:3')
  expect(view.container.querySelector('[data-item-index="3"]')).toBe(hosts[0])
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
})

it('forwards custom hosts, data, refs and context without losing reuse', () => {
  const Item = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { item: { id: number }; context: string }>(
    function Item({ item, context, ...props }, ref) {
      return <div {...props} ref={ref} data-custom-item={item.id} data-context={context} />
    }
  )
  const List = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { context: string }>(function List(
    { context, ...props },
    ref
  ) {
    return <div {...props} ref={ref} data-custom-list={context} />
  })
  const listRef = vi.fn()
  const content = (index: number) => <span>{index}</span>
  const props = { ...base, ItemComponent: Item, ListComponent: List, listRef, context: 'list-context', itemContent: content }
  const view = render(<RecycledItems {...props} items={range(0)} />)
  const host = view.container.querySelector('[data-custom-item="0"]')
  expect(listRef).toHaveBeenCalledWith(view.container.querySelector('[data-custom-list="list-context"]'))
  view.rerender(<RecycledItems {...props} items={range(3)} />)
  expect(view.container.querySelectorAll('[data-context="list-context"]')).toHaveLength(3)
  expect([...view.container.querySelectorAll('[data-custom-item]')]).toContain(host)
})

it('positions both ordinary and focused cells inside content insets', () => {
  const content = (index: number) => <span>{index}</span>
  const view = render(<RecycledItems {...base} contentInsets={{ start: 40, end: 60 }} items={range(0)} itemContent={content} />)
  expect((view.container.firstElementChild as HTMLElement).style.height).toBe('10100px')
  expect(view.container.querySelector<HTMLElement>('[data-index="0"]')!.style.top).toBe('40px')
  view.rerender(<RecycledItems {...base} contentInsets={{ start: 40, end: 60 }} items={range(10)} itemContent={content} focusedKey={0} />)
  expect(view.container.querySelector<HTMLElement>('[data-index="0"]')!.style.top).toBe('40px')
  expect(view.container.querySelector<HTMLElement>('[data-index="10"]')!.style.top).toBe('1040px')
})

it('unmounts a deleted focused owner so the host cannot silently transfer focus to its replacement', () => {
  const unmounts = vi.fn()
  function Cell({ id }: { id: number }) {
    const mountedId = React.useRef(id)
    React.useEffect(() => () => unmounts(mountedId.current), [])
    return <span>{id}</span>
  }
  const itemContent = (_index: number, item: { id: number }) => <Cell id={item.id} />
  const view = render(<RecycledItems {...base} items={range(0, 2)} itemContent={itemContent} focusedKey={0} />)
  const focusedHost = view.container.querySelector('[data-item-index="0"]')
  const next = data.slice(1)
  const nextItems = range(1, 2).map((item, index) => ({ ...item, index, originalIndex: index, offset: index * 100 }))
  view.rerender(<RecycledItems {...base} data={next} totalCount={next.length} items={nextItems} itemContent={itemContent} focusedKey={0} />)
  expect(focusedHost?.isConnected).toBe(false)
  expect(unmounts).toHaveBeenCalledWith(0)
  expect(view.container.querySelectorAll('[data-item-index]')).toHaveLength(2)
})

it('retires a focused host when its logical item changes to an incompatible type', () => {
  const itemContent = (_index: number, item: { id: number }) => <span>{item.id}</span>
  const view = render(<RecycledItems {...base} items={range(0, 2)} itemContent={itemContent} focusedKey={0} getItemType={() => 'old'} />)
  const focusedHost = view.container.querySelector('[data-item-index="0"]')
  view.rerender(
    <RecycledItems
      {...base}
      items={range(0, 2)}
      itemContent={itemContent}
      focusedKey={0}
      getItemType={(item) => (item.id === 0 ? 'new' : 'old')}
    />
  )
  expect(focusedHost?.isConnected).toBe(false)
})
