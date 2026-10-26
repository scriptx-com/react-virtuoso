import React from 'react'

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import useScrollTop from '../src/hooks/useScrollTop'

const noop = () => {}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('retries a target clamped by an extent that has not committed yet', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let serial = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++serial, callback)
    return serial
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  let navigate!: (location: ScrollToOptions) => void
  function Scroller() {
    const { scrollerRef, scrollToCallback } = useScrollTop(noop, noop, 'div')
    navigate = scrollToCallback
    return <div ref={scrollerRef as React.Ref<HTMLDivElement>} />
  }
  const view = render(<Scroller />)
  const scroller = view.container.firstElementChild! as HTMLElement
  let extent = 600
  Object.defineProperties(scroller, { offsetHeight: { value: 200 }, scrollHeight: { get: () => extent } })
  scroller.getBoundingClientRect = () => ({ height: 200 }) as DOMRect
  const scrollTo = vi.fn((location: ScrollToOptions) => {
    scroller.scrollTop = location.top ?? 0
  })
  Object.defineProperty(scroller, 'scrollTo', { value: scrollTo })
  act(() => navigate({ top: 500 }))
  expect(scroller.scrollTop).toBe(400)
  extent = 700
  act(() => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback(16)
    }
  })
  expect(scroller.scrollTop).toBe(500)
  expect(frames.size).toBe(0)
  act(() => navigate({ top: 9999 }))
  act(() => navigate({ top: 10 }))
  expect(frames.size).toBe(0)
  expect(scroller.scrollTop).toBe(10)
  act(() => navigate({ top: 9999 }))
  view.unmount()
  expect(frames.size).toBe(0)
})
