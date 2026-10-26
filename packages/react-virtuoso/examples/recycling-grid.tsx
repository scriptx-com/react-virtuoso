import React from 'react'

import { VirtuosoGrid, useRecyclingState } from '../src'

const data = Array.from({ length: 300 }, (_, id) => ({ id }))
const metrics = { mounts: 0 }
const List = React.forwardRef<HTMLDivElement, any>(function List({ context, style, ...props }, ref) {
  return (
    <div
      {...props}
      ref={ref}
      style={{
        ...style,
        display: context.cssGrid === true ? 'grid' : 'flex',
        gridTemplateColumns: 'repeat(auto-fill, 100px)',
        direction: context.cssGrid === true && context.reverse === true ? 'rtl' : 'ltr',
        flexWrap: 'wrap',
        flexDirection: context.reverse === true && context.cssGrid !== true ? 'row-reverse' : 'row',
        columnGap: 10,
        rowGap: 10,
      }}
    />
  )
})
const Item = React.forwardRef<HTMLDivElement, any>(function Item({ context: _context, style, ...props }, ref) {
  return <div {...props} ref={ref} style={{ width: 100, height: 100, ...style }} />
})
const components = {
  List,
  Item,
  Header: () => <div style={{ height: 40 }}>Header</div>,
  Footer: () => <div style={{ height: 40 }}>Footer</div>,
}
function Tile({ id }: { id: number }) {
  const [value, setValue] = useRecyclingState(() => 0, [])
  React.useEffect(() => {
    metrics.mounts++
  }, [])
  return (
    <button data-tile={id} style={{ width: '100%', height: '100%' }} onClick={() => setValue(value + 1)}>
      {id}:{value}
    </button>
  )
}
const content = (_index: number, item: { id: number }) => <Tile id={item.id} />
const key = (_index: number, item: { id: number }) => item.id
export function Example() {
  const params = new URLSearchParams(location.search)
  const [width, setWidth] = React.useState(320)
  const [recycling, setRecycling] = React.useState(true)
  const [items, setItems] = React.useState(data)
  const reverse = params.get('reverse') === '1'
  React.useEffect(() => {
    metrics.mounts = 0
    Object.assign(window, { gridMetrics: metrics })
  }, [])
  return (
    <>
      <button onClick={() => setWidth(width === 320 ? 210 : 320)}>Resize</button>
      <button onClick={() => setRecycling(!recycling)}>Toggle</button>
      <button onClick={() => setItems(items.slice().reverse())}>Reverse data</button>
      <VirtuosoGrid
        data={items}
        computeItemKey={key}
        recycling={recycling}
        itemContent={content}
        components={components}
        context={{ reverse, cssGrid: params.get('cssGrid') === '1' }}
        style={{ width, height: 260 }}
      />
    </>
  )
}
