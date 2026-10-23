import React from 'react'

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { ExperimentalRailVirtuoso, Virtuoso, VirtuosoMockContext } from '../src'

import type { VirtuosoHandle } from '../src'
afterEach(cleanup)
it.each([false, true])('matches full rail DOM with recycling=%s and keeps getState', (recycling) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <VirtuosoMockContext.Provider value={{ itemHeight: 100, viewportHeight: 600 }}>{children}</VirtuosoMockContext.Provider>
  )
  const props = {
    horizontalDirection: true,
    recycling,
    data: Array.from({ length: 100 }, (_, i) => i),
    itemContent: (i: number) => <span>{i}</span>,
  }
  const a = render(<Virtuoso {...props} />, { wrapper })
  const expected = a.container.innerHTML
  a.unmount()
  const ref = React.createRef<VirtuosoHandle>()
  const b = render(<ExperimentalRailVirtuoso {...props} ref={ref} />, { wrapper })
  expect(b.container.innerHTML).toEqual(expected)
  let called = false
  ref.current!.getState((state) => {
    called = true
    expect(state).toHaveProperty('ranges')
  })
  expect(called).toBe(true)
})
it('rejects unsupported features instead of silently disabling them', () => {
  expect(() => render(<ExperimentalRailVirtuoso horizontalDirection followOutput totalCount={10} />)).toThrow('ordinary horizontal rail')
})
