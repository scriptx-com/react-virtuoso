import React, { act } from 'react'

import { createRoot } from 'react-dom/client'
/* eslint-disable require-await -- Async act drains React work after synchronous publication. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

import { Virtuoso } from '../src'

import type { VirtuosoHandle, VirtuosoProps } from '../src'
import type { Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

type GeometryProps = Partial<VirtuosoProps<string, unknown>>
const geometry = {
  viewportWidth: 300,
  itemWidth: 100,
  itemGap: 10,
  paddingLeft: 0,
  paddingRight: 0,
}
const data = Array.from({ length: 40 }, (_, i) => `item-${i}`)
const observers: Observer[] = []
class Observer {
  nodes = new Set<Element>()
  private callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observers.push(this)
  }
  observe(node: Element) {
    this.nodes.add(node)
  }
  unobserve(node: Element) {
    this.nodes.delete(node)
  }
  disconnect() {
    this.nodes.clear()
  }
  notify(node: Element) {
    this.callback([{ target: node } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
}

let host: HTMLDivElement
let root: Root
let handle: React.RefObject<VirtuosoHandle | null>
let reads: string[]
const originalObserver = global.ResizeObserver
const originalGetComputedStyle = window.getComputedStyle
const Scroller = React.forwardRef<HTMLDivElement, any>((props, ref) => (
  <div
    {...props}
    ref={(node) => {
      if (node) {
        const observedReads = reads
        for (const [name, value] of Object.entries({
          scrollLeft: 0,
          scrollWidth: 4390,
          offsetWidth: 300,
        })) {
          Object.defineProperty(node, name, {
            configurable: true,
            get: () => {
              observedReads.push(name)
              return value
            },
          })
        }
      }
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    }}
  />
))
Scroller.displayName = 'MeasuredScroller'
const components = { Scroller }
const renderList = async (props: GeometryProps = {}) => {
  await act(async () =>
    root.render(
      <Virtuoso
        ref={handle}
        data={data}
        horizontalDirection
        initialItemCount={4}
        components={components}
        skipAnimationFrameInResizeObserver
        {...props}
      />
    )
  )
}
const notifyList = async () => {
  const list = host.querySelector('[data-testid="virtuoso-item-list"]')!
  Object.defineProperty(list, 'offsetParent', { value: list.parentElement })
  ;(list as HTMLElement).style.columnGap = '0px'
  await act(async () => observers.find((observer) => observer.nodes.has(list))!.notify(list))
}

beforeEach(() => {
  observers.length = 0
  reads = []
  global.ResizeObserver = Observer as unknown as typeof ResizeObserver
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  handle = React.createRef<VirtuosoHandle>()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  global.ResizeObserver = originalObserver
  window.getComputedStyle = originalGetComputedStyle
  vi.restoreAllMocks()
})

it('initializes known horizontal geometry without synchronous scroller reads', async () => {
  await renderList({ initialGeometry: geometry })
  expect(reads).toEqual([])
  expect(host.querySelector('[data-index="0"]')?.getAttribute('data-known-size')).toBe('100')
  expect(host.querySelector('[data-index="1"]')?.getAttribute('data-known-size')).toBe('110')
  let snapshot: unknown
  handle.current!.getState((state) => (snapshot = state))
  expect(snapshot).toEqual({
    ranges: [
      { startIndex: 0, endIndex: 0, size: 100 },
      { startIndex: 1, endIndex: Infinity, size: 110 },
    ],
    scrollTop: 0,
  })
})

it.each([
  ['unknown geometry', {}],
  ['invalid viewport', { initialGeometry: { ...geometry, viewportWidth: 0 } }],
  ['restored position', { initialGeometry: geometry, initialTopMostItemIndex: 5 }],
  [
    'header',
    {
      initialGeometry: geometry,
      components: { ...components, Header: () => 'header' },
    },
  ],
])('retains browser measurement for %s', async (_, props) => {
  await renderList(props)
  expect(reads).toContain('scrollLeft')
  expect(reads).toContain('scrollWidth')
  expect(reads).toContain('offsetWidth')
})

it.each([false, true])('continues correcting item sizes after initialization (recycling=%s)', async (recycling) => {
  await renderList({ initialGeometry: geometry, itemSize: () => 120, recycling })
  await notifyList()
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
  expect(reads).toContain('scrollWidth')
  expect(host.querySelector('[data-index="0"]')?.getAttribute('data-known-size')).toBe('120')
})

it('does not reset an existing scrolled list when geometry arrives after mount', async () => {
  await renderList({ defaultItemHeight: 100 })
  const scroller = host.querySelector('[data-virtuoso-scroller]')!
  Object.defineProperty(scroller, 'scrollLeft', { get: () => 500 })
  await act(async () => scroller.dispatchEvent(new Event('scroll')))
  await renderList({ initialGeometry: geometry })
  let offset: number | undefined
  handle.current!.getState((state) => (offset = state.scrollTop))
  expect(offset).toBe(500)
})

it('reads gap geometry before publishing a range change to application callbacks', async () => {
  const order: string[] = []
  await renderList({
    defaultItemHeight: 100,
    itemSize: () => 100,
    itemsRendered: () => order.push('publish'),
  })
  const viewport = host.querySelector('[data-viewport-type="element"]')!
  Object.defineProperty(viewport, 'offsetParent', {
    value: viewport.parentElement,
  })
  viewport.getBoundingClientRect = () => ({ width: 300, height: 100 }) as DOMRect
  await act(async () => observers.find((observer) => observer.nodes.has(viewport))!.notify(viewport))
  const scroller = host.querySelector('[data-virtuoso-scroller]')!
  Object.defineProperty(scroller, 'scrollLeft', { get: () => 500 })
  const getStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (node) => {
    order.push('read')
    return getStyle(node)
  }
  order.length = 0
  await notifyList()
  expect(order).toContain('publish')
  expect(order.indexOf('read')).toBeLessThan(order.indexOf('publish'))
})
