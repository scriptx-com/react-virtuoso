import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { Virtuoso, VirtuosoMockContext } from '../src'
import { usePendingMeasurement } from '../src/recycling/measurementBoundary'
import { RecyclingContext } from '../src/recycling/RecyclingContext'
import { useRecyclingController } from '../src/recycling/useRecyclingController'
import { useRecyclingLifetime } from '../src/recycling/useRecyclingLifetime'

afterEach(cleanup)

it('preserves committed focus across dataset transactions and updates distance in place', () => {
  let controller!: ReturnType<typeof useRecyclingController>
  function Probe({ data, distance }: { data: readonly number[]; distance?: number }) {
    controller = useRecyclingController({ data, horizontal: true, drawDistance: distance })
    return null
  }
  const data = [1, 2]
  const view = render(<Probe data={data} distance={200} />)
  const first = controller
  act(() => first.setFocusedItem('focused'))
  view.rerender(<Probe data={data} distance={0} />)
  expect(controller).toBe(first)
  expect(controller.getSnapshot().drawDistance).toBe(0)
  view.rerender(<Probe data={[1, 2]} />)
  expect(controller).not.toBe(first)
  expect(controller.getSnapshot().focusedKey).toBe('focused')
  expect(controller.getSnapshot().drawDistance).toBeUndefined()
})

it('retires callback ownership on reassignment, parking and unmount', () => {
  let owner!: ReturnType<typeof useRecyclingLifetime>
  function Probe() {
    owner = useRecyclingLifetime()
    return null
  }
  const scope = {}
  const tree = (key: string, active = true) => (
    <RecyclingContext.Provider value={{ scope, slotId: 0, generation: 1, logicalKey: key, active }}>
      <Probe />
    </RecyclingContext.Provider>
  )
  const view = render(tree('a'))
  const first = owner
  expect(first.isCurrent()).toBe(true)
  view.rerender(tree('b'))
  expect(first.isCurrent()).toBe(false)
  expect(owner.isCurrent()).toBe(true)
  view.rerender(tree('b', false))
  expect(owner.isCurrent()).toBe(false)
  view.rerender(tree('b'))
  const resumed = owner
  expect(resumed.isCurrent()).toBe(true)
  view.unmount()
  expect(resumed.isCurrent()).toBe(false)
})

it.each([false, true])('owns readiness boundaries on real item hosts recycling=%s', async (recycling) => {
  function Probe({ pending }: { pending: boolean }) {
    usePendingMeasurement(pending)
    return <span>content</span>
  }
  const data = [1, 2, 3]
  const tree = (pending: boolean) => (
    <VirtuosoMockContext.Provider value={{ itemHeight: 100, viewportHeight: 300 }}>
      <Virtuoso data={data} recycling={recycling} itemContent={() => <Probe pending={pending} />} />
    </VirtuosoMockContext.Provider>
  )
  const view = render(tree(true))
  const item = view.container.querySelector('[data-item-index="0"]')!
  expect(item.hasAttribute('data-virtuoso-measurement-pending')).toBe(true)
  expect(item.firstElementChild?.tagName).toBe('SPAN')
  view.rerender(tree(false))
  await act(async () => {
    await Promise.resolve()
  })
  expect(item.hasAttribute('data-virtuoso-measurement-pending')).toBe(false)
})
