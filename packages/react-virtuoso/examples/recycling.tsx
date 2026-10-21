import React from 'react'

import { createRecyclingController, RecyclingIntegrationProvider, useRecyclingState, Virtuoso } from '../src'

const data = Array.from({ length: 1000 }, (_, id) => ({ id }))
const metrics = { mounts: 0, updates: 0, unmounts: 0 }
const key = (_index: number, item: { id: number }) => item.id

function Cell({ index, horizontal }: { index: number; horizontal: boolean }) {
  const [size, setSize] = useRecyclingState(() => 100, [])
  React.useEffect(() => {
    metrics.mounts++
    return () => {
      metrics.unmounts++
    }
  }, [])
  React.useEffect(() => {
    metrics.updates++
  })
  return (
    <div
      data-cell={index}
      style={{
        boxSizing: 'border-box',
        width: horizontal ? size : '100%',
        height: horizontal ? '100%' : size,
        border: '1px solid #aeb7c6',
        background: '#e8edf5',
      }}
    >
      Item {index} <button onClick={() => setSize(200)}>Grow</button>
    </div>
  )
}

export function Example() {
  const query = new URLSearchParams(window.location.search)
  const horizontal = query.get('horizontal') === '1'
  const rtl = query.get('rtl') === '1'
  const unknown = query.get('unknown') === '1'
  const recycling = query.get('recycling') !== '0'
  const [controller] = React.useState(() => {
    Object.assign(window, { recyclingMetrics: metrics })
    Object.assign(metrics, { mounts: 0, updates: 0, unmounts: 0 })
    const value = createRecyclingController()
    if (query.get('insets') === '1') {
      value.setContentInsets({ start: 40, end: 60 })
    }
    if (!unknown) {
      value.setKnownLayout({ revision: 1, ranges: [{ startIndex: 0, endIndex: 999, size: 100 }] })
    }
    return value
  })
  const itemContent = React.useCallback((index: number) => <Cell index={index} horizontal={horizontal} />, [horizontal])
  const components = React.useMemo(
    () => ({
      Header: () => (
        <div data-testid="header" style={{ width: horizontal ? 50 : '100%', height: horizontal ? '100%' : 50 }}>
          Header
        </div>
      ),
      Footer: () => (
        <div data-testid="footer" style={{ width: horizontal ? 50 : '100%', height: horizontal ? '100%' : 50 }}>
          Footer
        </div>
      ),
    }),
    [horizontal]
  )
  return (
    <RecyclingIntegrationProvider controller={controller}>
      <Virtuoso
        data={data}
        computeItemKey={key}
        defaultItemHeight={100}
        horizontalDirection={horizontal}
        recycling={recycling}
        components={components}
        itemContent={itemContent}
        style={{ width: 400, height: 300, direction: rtl ? 'rtl' : 'ltr' }}
      />
    </RecyclingIntegrationProvider>
  )
}
