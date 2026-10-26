import React from 'react'

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'

import { Virtuoso, VirtuosoMockContext } from '../src'
import { RecyclingContext } from '../src/recycling/RecyclingContext'

import type { VirtuosoProps } from '../src'

afterEach(cleanup)
const data = Array.from({ length: 100 }, (_, index) => index)
const mock = ({ children }: { children: React.ReactNode }) => (
  <VirtuosoMockContext.Provider value={{ itemHeight: 100, viewportHeight: 300 }}>{children}</VirtuosoMockContext.Provider>
)

it('defaults to recycling and supports explicit false and runtime toggles', () => {
  const view = render(<Virtuoso data={data} />, { wrapper: mock })
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
  view.rerender(<Virtuoso data={data} recycling={true} />)
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
  view.rerender(<Virtuoso data={data} recycling={false} />)
  expect(view.container.querySelector('[data-recycling-slot]')).toBeNull()
  expect(view.container.querySelectorAll('[data-index]')).toHaveLength(3)
  view.rerender(<Virtuoso data={data} recycling={true} />)
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
})

it.each<Partial<VirtuosoProps<number, unknown>>>([
  { followOutput: true },
  { topItemCount: 1 },
  { firstItemIndex: 100 },
  { alignToBottom: true },
  { scrollSeekConfiguration: { enter: () => false, exit: () => true } },
])('preserves ordinary rendering for unsupported mode %j', (props) => {
  const view = render(<Virtuoso data={data} {...props} />, { wrapper: mock })
  expect(view.container.querySelector('[data-recycling-slot]')).toBeNull()
  expect(view.container.querySelector('[data-index]')).not.toBeNull()
})

it('stops scroll notifications while its parent is inactive', () => {
  const scope = {}
  const rangeChanged = vi.fn()
  const tree = (active: boolean) => (
    <RecyclingContext.Provider value={{ scope, logicalKey: 'parent', slotId: 0, generation: 1, active }}>
      <Virtuoso data={data} rangeChanged={rangeChanged} />
    </RecyclingContext.Provider>
  )
  const view = render(tree(true), { wrapper: mock })
  const scroller = view.container.querySelector('[data-virtuoso-scroller]')! as HTMLElement
  Object.defineProperty(scroller, 'offsetHeight', { value: 300 })
  Object.defineProperty(scroller, 'scrollHeight', { value: 10000 })
  view.rerender(tree(false))
  rangeChanged.mockClear()
  act(() => {
    fireEvent.scroll(scroller, { target: { scrollTop: 1000 } })
  })
  expect(rangeChanged).not.toHaveBeenCalled()
})

it('diagnoses an explicit unsupported request once without warning for the default', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const view = render(<Virtuoso data={data} topItemCount={1} />, { wrapper: mock })
    expect(warning).not.toHaveBeenCalled()
    view.rerender(<Virtuoso data={data} topItemCount={1} recycling />)
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning.mock.calls[0]![0]).toContain('recycling')
    view.rerender(<Virtuoso data={data} topItemCount={1} recycling itemContent={(index) => String(index)} />)
    expect(warning).toHaveBeenCalledTimes(1)
  } finally {
    warning.mockRestore()
  }
})

it('returns to the default when the recycling prop is removed', () => {
  const view = render(<Virtuoso data={data} recycling={false} />, { wrapper: mock })
  expect(view.container.querySelector('[data-recycling-slot]')).toBeNull()
  view.rerender(<Virtuoso data={data} />)
  expect(view.container.querySelectorAll('[data-recycling-slot]')).toHaveLength(3)
})

it('hydrates its server-rendered cells without replacing hosts or hydration errors', async () => {
  const tree = <Virtuoso data={data} initialItemCount={3} defaultItemHeight={100} />
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree)
  document.body.append(container)
  const hosts = [...container.querySelectorAll('[data-recycling-slot]')]
  const onRecoverableError = vi.fn()
  let root!: ReturnType<typeof hydrateRoot>
  try {
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError })
      await Promise.resolve()
    })
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(hosts.length).toBeGreaterThan(0)
    expect([...container.querySelectorAll('[data-recycling-slot]')]).toEqual(hosts)
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

it('keeps unmeasured SSR content in natural flow until offsets are available', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToString(<Virtuoso data={data} initialItemCount={3} />)
  expect(container.querySelectorAll('[data-index]')).toHaveLength(3)
  for (const item of container.querySelectorAll<HTMLElement>('[data-index]')) {
    expect(item.style.position).not.toBe('absolute')
  }
})
