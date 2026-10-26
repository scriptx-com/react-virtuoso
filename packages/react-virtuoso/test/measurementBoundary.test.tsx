import React, { act } from 'react'

import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

import { MeasurementBoundaryContext, useMeasurementBoundary, usePendingMeasurement } from '../src/recycling/measurementBoundary'

import type { Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const PENDING = 'data-virtuoso-measurement-pending'
function Row({ children, id = 'row' }: React.PropsWithChildren<{ id?: string }>) {
  const host = React.useRef<HTMLDivElement>(null)
  const boundary = useMeasurementBoundary(host, true)
  return (
    <div id={id} ref={host}>
      <MeasurementBoundaryContext.Provider value={boundary}>{children}</MeasurementBoundaryContext.Provider>
    </div>
  )
}
function Probe({ pending }: { pending: boolean }) {
  usePendingMeasurement(pending)
  return <span>tile</span>
}
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => {
    root.unmount()
    await Promise.resolve()
  })
  container.remove()
})
const render = async (node: React.ReactNode) => {
  await act(async () => {
    root.render(node)
    await Promise.resolve()
  })
}
it('waits for every nested evaluator, then requests measurement without a resize', async () => {
  const ready = vi.fn()
  container.addEventListener('virtuoso-measurement-ready', ready)
  const tree = (a: boolean, b: boolean) => (
    <Row>
      <Probe pending={a} />
      <Probe pending={b} />
    </Row>
  )
  await render(tree(true, true))
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(true)
  await render(tree(false, true))
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(true)
  expect(ready).not.toHaveBeenCalled()
  await render(tree(false, false))
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(false)
  expect(ready).toHaveBeenCalledTimes(1)
})
it('propagates pending nested vertical lists to the outer row', async () => {
  const tree = (pending: boolean) => (
    <Row>
      <Row id="nested">
        <Probe pending={pending} />
      </Row>
    </Row>
  )
  await render(tree(true))
  expect(container.querySelectorAll(`[${PENDING}]`)).toHaveLength(2)
  await render(tree(false))
  expect(container.querySelectorAll(`[${PENDING}]`)).toHaveLength(0)
})
it('releases a removed probe and permits a resolved empty row', async () => {
  await render(
    <Row>
      <Probe pending />
    </Row>
  )
  await render(<Row />)
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(false)
})
it('does not briefly publish readiness when pending probes are replaced', async () => {
  const ready = vi.fn()
  container.addEventListener('virtuoso-measurement-ready', ready)
  await render(
    <Row>
      <Probe key="a" pending />
    </Row>
  )
  await render(
    <Row>
      <Probe key="b" pending />
    </Row>
  )
  expect(ready).not.toHaveBeenCalled()
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(true)
})
it('handles strict effect replay without losing the pending registration', async () => {
  await render(
    <React.StrictMode>
      <Row>
        <Probe pending />
      </Row>
    </React.StrictMode>
  )
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(true)
  await render(
    <React.StrictMode>
      <Row>
        <Probe pending={false} />
      </Row>
    </React.StrictMode>
  )
  expect(container.firstElementChild?.hasAttribute(PENDING)).toBe(false)
})
