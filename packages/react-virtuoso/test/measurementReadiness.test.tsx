import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import useChangedListContentsSizes from '../src/hooks/useChangedChildSizes'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('remeasures a ready row even when its dimensions did not trigger ResizeObserver', () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  let notify: ResizeObserverCallback
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        notify = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const changed = vi.fn()
  const itemSize = vi.fn(() => 490)
  const noop = vi.fn()
  function List() {
    const { callbackRef } = useChangedListContentsSizes(changed, itemSize, true, noop, noop, undefined, undefined, false, true)
    return (
      <div data-virtuoso-scroller="true">
        <div data-viewport-type="element">
          <div ref={callbackRef} data-testid="list">
            <div data-index="0" data-known-size="0" data-virtuoso-measurement-pending="" />
          </div>
        </div>
      </div>
    )
  }
  const view = render(<List />)
  const list = view.getByTestId('list')
  Object.defineProperty(list, 'offsetParent', { get: () => document.body })
  act(() => notify([{ target: list } as unknown as ResizeObserverEntry], {} as ResizeObserver))
  expect(changed).not.toHaveBeenCalled()
  const row = list.firstElementChild!
  row.removeAttribute('data-virtuoso-measurement-pending')
  act(() => {
    row.dispatchEvent(new Event('virtuoso-measurement-ready', { bubbles: true }))
    vi.runAllTimers()
  })
  expect(changed).toHaveBeenCalledExactlyOnceWith([{ startIndex: 0, endIndex: 0, size: 490 }])
  view.unmount()
})
