import { describe, expect, it, vi } from 'vitest'

import { createCellSizeObserver } from '../src/recycling/useCellSizes'

import type { CellMeasurement } from '../src/recycling/useCellSizes'

function setup() {
  let resize!: ResizeObserverCallback
  let pending: (() => void) | undefined
  const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
  const callback = vi.fn()
  const itemSize = vi.fn((element: HTMLElement) => Number(element.textContent))
  const manager = createCellSizeObserver({
    horizontal: false,
    itemSize,
    callback,
    createObserver: (cb) => {
      resize = cb
      return observer as unknown as ResizeObserver
    },
    schedule: (cb) => {
      pending = cb
      return 1
    },
    cancel: () => {
      pending = undefined
    },
  })
  return {
    manager,
    observer,
    callback,
    itemSize,
    flush: () => {
      const cb = pending
      pending = undefined
      cb?.()
    },
    resize: (element: HTMLElement) =>
      resize([{ target: element } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver),
  }
}

function cell(index: number, size: number, overrides: Partial<CellMeasurement> = {}): CellMeasurement {
  const element = document.createElement('div')
  element.textContent = String(size)
  return {
    element,
    index,
    logicalKey: index,
    assignmentGeneration: 1,
    layoutRevision: 1,
    active: true,
    exact: false,
    knownSize: 100,
    ...overrides,
  }
}

describe('shared active cell measurement', () => {
  it('never observes or reads exact/parked cells; coalesces changed unknown sizes', () => {
    const h = setup()
    h.manager.setCells([cell(0, 100, { exact: true }), cell(1, 120), cell(2, 120), cell(3, 100, { active: false })])
    h.flush()
    expect(h.observer.observe).toHaveBeenCalledTimes(2)
    expect(h.itemSize).toHaveBeenCalledTimes(2)
    expect(h.callback).toHaveBeenCalledExactlyOnceWith([{ startIndex: 1, endIndex: 2, size: 120 }])
    h.manager.destroy()
    expect(h.observer.disconnect).toHaveBeenCalledOnce()
  })

  it('measures a child resize without any container resize and omits unchanged batches', () => {
    const h = setup()
    const target = cell(3, 100)
    h.manager.setCells([target])
    h.flush()
    expect(h.callback).not.toHaveBeenCalled()
    target.element.textContent = '180'
    h.resize(target.element)
    expect(h.callback).toHaveBeenLastCalledWith([{ startIndex: 3, endIndex: 3, size: 180 }])
    h.flush()
    expect(h.callback).toHaveBeenCalledTimes(1)
    h.resize(target.element)
    h.flush()
    expect(h.callback).toHaveBeenCalledTimes(1)
  })

  it.each(['assignmentGeneration', 'layoutRevision'] as const)('fences queued work after %s changes', (field) => {
    const h = setup()
    const previous = cell(0, 120)
    h.manager.setCells([previous])
    const next = { ...previous, [field]: 2, logicalKey: 'replacement', index: 5 }
    next.element.textContent = '150'
    h.manager.setCells([next])
    h.flush()
    expect(h.callback).toHaveBeenCalledExactlyOnceWith([{ startIndex: 5, endIndex: 5, size: 150 }])
  })

  it('invalidates queued work when parked and measures again on activation', () => {
    const h = setup()
    const target = cell(0, 120)
    h.manager.setCells([target])
    h.manager.setCells([{ ...target, active: false }])
    h.flush()
    expect(h.callback).not.toHaveBeenCalled()
    expect(h.observer.unobserve).toHaveBeenCalledWith(target.element)
    h.manager.setCells([target])
    h.flush()
    expect(h.callback).toHaveBeenCalledExactlyOnceWith([{ startIndex: 0, endIndex: 0, size: 120 }])
  })

  it('reattaches when exact geometry becomes unknown without reusing an old size', () => {
    const h = setup()
    const target = cell(0, 120)
    h.manager.setCells([target])
    h.flush()
    h.manager.setCells([{ ...target, exact: true, layoutRevision: 2 }])
    h.flush()
    target.element.textContent = '140'
    h.manager.setCells([{ ...target, layoutRevision: 3 }])
    h.flush()
    expect(h.callback).toHaveBeenLastCalledWith([{ startIndex: 0, endIndex: 0, size: 140 }])
    expect(h.observer.observe).toHaveBeenCalledTimes(2)
  })

  it('drops removed targets and disconnects all scheduled work on teardown', () => {
    const h = setup()
    const target = cell(0, 120)
    h.manager.setCells([target])
    h.manager.setCells([])
    h.resize(target.element)
    h.flush()
    expect(h.callback).not.toHaveBeenCalled()
    h.manager.setCells([target])
    h.manager.destroy()
    h.flush()
    expect(h.callback).not.toHaveBeenCalled()
  })
})

it('republishes unchanged DOM size when dataset invalidation resets engine geometry', () => {
  const h = setup()
  const target = cell(1, 200)
  h.manager.setCells([target])
  h.flush()
  h.manager.setCells([{ ...target, knownSize: 200 }])
  h.flush()
  h.callback.mockClear()
  h.itemSize.mockClear()
  h.manager.setCells([{ ...target, knownSize: 100 }])
  h.flush()
  expect(h.callback).toHaveBeenCalledExactlyOnceWith([{ startIndex: 1, endIndex: 1, size: 200 }])
  h.manager.setCells([{ ...target, knownSize: 200 }])
  h.flush()
  expect(h.itemSize).toHaveBeenCalledTimes(1)
  h.manager.destroy()
})

it('waits for nested measurement readiness and retries without a resize', () => {
  const h = setup()
  const target = cell(0, 88, { knownSize: 0 })
  target.element.setAttribute('data-virtuoso-measurement-pending', '')
  h.manager.setCells([target])
  h.flush()
  expect(h.callback).not.toHaveBeenCalled()
  expect(h.itemSize).not.toHaveBeenCalled()
  target.element.textContent = '490'
  target.element.removeAttribute('data-virtuoso-measurement-pending')
  target.element.dispatchEvent(new Event('virtuoso-measurement-ready', { bubbles: true }))
  h.flush()
  expect(h.callback).toHaveBeenCalledExactlyOnceWith([{ startIndex: 0, endIndex: 0, size: 490 }])
  h.manager.destroy()
  target.element.dispatchEvent(new Event('virtuoso-measurement-ready', { bubbles: true }))
  h.flush()
  expect(h.callback).toHaveBeenCalledTimes(1)
})
