import { act } from 'react'

import { createRoot } from 'react-dom/client'
/* eslint-disable require-await -- Async act drains React work after synchronous publication. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

import { Virtuoso } from '../src'

import type { VirtuosoProps } from '../src'
import type { Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const data = Array.from({ length: 40 }, (_, index) => `item-${index}`)
const observers: MeasurementObserver[] = []
class MeasurementObserver {
  nodes = new Set<Element>()
  attachments = 0
  detachments = 0
  private callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observers.push(this)
  }
  observe(node: Element) {
    this.nodes.add(node)
    this.attachments++
  }
  unobserve(node: Element) {
    this.nodes.delete(node)
    this.detachments++
  }
  notify(node: Element) {
    this.callback([{ target: node } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  disconnect() {
    this.nodes.clear()
  }
}

let container: HTMLDivElement
let root: Root
const originalObserver = global.ResizeObserver
const renderList = async (props: Partial<VirtuosoProps<string, string>> = {}) => {
  await act(async () => {
    root.render(<Virtuoso data={data} initialItemCount={10} context="home" {...props} />)
  })
}
const totals = () =>
  observers.reduce(
    (result, observer) => ({
      attachments: result.attachments + observer.attachments,
      detachments: result.detachments + observer.detachments,
    }),
    { attachments: 0, detachments: 0 }
  )

beforeEach(() => {
  observers.length = 0
  global.ResizeObserver = MeasurementObserver as unknown as typeof ResizeObserver
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  global.ResizeObserver = originalObserver
})

it('updates item content without detaching unchanged measurement nodes', async () => {
  await renderList({ itemContent: (index, item) => `${index}:${item}` })
  const before = totals()
  expect(before.attachments).toBeGreaterThan(0)
  await renderList({
    itemContent: (index, item) => `updated ${index}:${item}`,
  })
  expect(container.textContent).toContain('updated 0:item-0')
  expect(totals()).toEqual(before)
})

it('stops observing nodes when the list unmounts', async () => {
  await renderList()
  expect(observers.some((observer) => observer.nodes.size > 0)).toBe(true)
  await act(async () => root.render(null))
  expect(observers.every((observer) => observer.nodes.size === 0)).toBe(true)
})

it('keeps item indices, data and context intact with a nonzero first index', async () => {
  const itemContent = vi.fn((index: number, item: string, context: string) => `${context}:${index}:${item}`)
  await renderList({ firstItemIndex: 100, itemContent })
  expect(container.textContent).toContain('home:100:item-0')
  expect(container.querySelector('[data-index="0"]')?.getAttribute('data-item-index')).toBe('100')
  expect(data[0]).toBe('item-0')
})

it('detaches the old list node when its element type changes', async () => {
  await renderList()
  const oldList = container.querySelector('[data-testid="virtuoso-item-list"]')!
  await renderList({ components: { List: 'section' as any } })
  const list = container.querySelector('[data-testid="virtuoso-item-list"]')!
  expect(list.tagName).toBe('SECTION')
  expect(observers.every((observer) => !observer.nodes.has(oldList))).toBe(true)
  expect(observers.some((observer) => observer.nodes.has(list))).toBe(true)
})

it('detaches item measurement when fixed sizes are enabled and reattaches when disabled', async () => {
  await renderList()
  const list = container.querySelector('[data-testid="virtuoso-item-list"]')!
  await renderList({ fixedItemHeight: 30 })
  expect(observers.every((observer) => !observer.nodes.has(list))).toBe(true)
  await renderList({ fixedItemHeight: undefined } as any)
  expect(observers.some((observer) => observer.nodes.has(list))).toBe(true)
})

it('continues publishing real item measurements after content changes', async () => {
  const itemSize = () => 42
  await renderList({ itemSize, skipAnimationFrameInResizeObserver: true })
  await renderList({
    itemSize,
    skipAnimationFrameInResizeObserver: true,
    itemContent: () => 'updated',
  })
  const viewport = container.querySelector('[data-viewport-type="element"]')!
  Object.defineProperty(viewport, 'offsetParent', {
    value: viewport.parentElement,
  })
  viewport.getBoundingClientRect = () => ({ height: 300, width: 400 }) as DOMRect
  await act(async () => observers.find((candidate) => candidate.nodes.has(viewport))!.notify(viewport))
  const list = container.querySelector('[data-testid="virtuoso-item-list"]')!
  ;(list as HTMLElement).style.rowGap = '0px'
  Object.defineProperty(list, 'offsetParent', { value: list.parentElement })
  const observer = observers.find((candidate) => candidate.nodes.has(list))!
  await act(async () => observer.notify(list))
  expect(container.querySelector('[data-index="0"]')?.getAttribute('data-known-size')).toBe('42')
})

it('ignores a queued notification from a replaced observer callback', async () => {
  const oldReader = vi.fn(() => 100)
  const newReader = vi.fn(() => 120)
  await renderList({ itemSize: oldReader, skipAnimationFrameInResizeObserver: true })
  const list = container.querySelector('[data-testid="virtuoso-item-list"]')! as HTMLElement
  list.style.rowGap = '0px'
  Object.defineProperty(list, 'offsetParent', { value: list.parentElement })
  const oldObserver = observers.find((candidate) => candidate.nodes.has(list))!
  await renderList({ itemSize: newReader, skipAnimationFrameInResizeObserver: true })
  await act(async () => oldObserver.notify(list))
  expect(oldReader).not.toHaveBeenCalled()
})
