import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'
import { allocateSlots, emptyPool } from './allocator'
import { RecyclingContext, useRecyclingActivity } from './RecyclingContext'

import type { GridState } from '../gridSystem'
import type { GridItemContent, GridComputeItemKey } from '../interfaces'
import type { Slot } from './types'

interface Props {
  placement?: { left: number; top: number; reverse: boolean }
  state: GridState
  data: readonly unknown[] | null
  totalCount: number
  columns: number
  rowGap: number
  columnGap: number
  focusedKey: React.Key | null
  computeItemKey: GridComputeItemKey<any, any>
  getItemType?: ((item: any, index: number) => string | number | undefined) | undefined
  itemContent: GridItemContent<any, any>
  ItemComponent: React.ElementType
  className: string
  context: any
}
interface Record {
  index: number
  data: any
}

const Cell = React.memo(function GridCell({
  slot,
  record,
  scope,
  active,
  pinned,
  props,
}: {
  slot: Slot
  record: Record
  scope: object
  active: boolean
  pinned: boolean
  props: Props
}) {
  const assignment = React.useMemo(
    () => ({ scope, logicalKey: slot.key, slotId: slot.slotId, generation: slot.generation, index: record.index, active }),
    [scope, slot.key, slot.slotId, slot.generation, record.index, active]
  )
  const { itemContent, context } = props
  const content = React.useMemo(() => itemContent(record.index, record.data, context), [itemContent, record.index, record.data, context])
  // Visible cells remain in normal CSS grid/flex flow. Only a focused cell
  // outside the window is positioned separately, so it cannot shift the rows.
  const style: React.CSSProperties | undefined = !active
    ? { display: 'none' }
    : pinned
      ? {
          position: 'absolute',
          top: (props.placement?.top ?? 0) + Math.floor(record.index / props.columns) * (props.state.itemHeight + props.rowGap),
          left:
            (props.placement?.left ?? 0) +
            (record.index % props.columns) * (props.state.itemWidth + props.columnGap) * (props.placement?.reverse === true ? -1 : 1),
          width: props.state.itemWidth,
          height: props.state.itemHeight,
          pointerEvents: 'none',
        }
      : undefined
  return (
    <RecyclingContext.Provider value={assignment}>
      {React.createElement(
        props.ItemComponent,
        {
          ...(typeof props.ItemComponent === 'string' ? {} : { context: props.context }),
          className: props.className,
          style,
          'data-index': active ? record.index : undefined,
          'data-recycling-slot': slot.slotId,
          'data-recycling-key': String(slot.key),
          'data-grid-visible': active && !pinned ? '' : undefined,
          'aria-hidden': active ? undefined : true,
        },
        content
      )}
    </RecyclingContext.Provider>
  )
})

export function RecycledGridItems(props: Props) {
  const active = useRecyclingActivity()
  const [scope] = React.useState(() => ({}))
  const [committed] = React.useState(() => ({ pool: emptyPool(), records: new Map<number, Record>(), props }))
  const rendering = active ? props : committed.props
  const recordsByKey = new Map<React.Key, Record>()
  const required = (active ? props.state.items : []).map((item) => {
    const key = props.computeItemKey(item.index, item.data, props.context)
    recordsByKey.set(key, { index: item.index, data: item.data })
    return { key, index: item.index, type: props.getItemType?.(item.data, item.index) ?? 0 }
  })
  let source = committed.pool
  let focusedKey = props.focusedKey
  const visibleFocus = required.find((item) => item.key === focusedKey)
  if (visibleFocus) {
    source = { ...source, slots: source.slots.filter((slot) => slot.key !== focusedKey || slot.type === visibleFocus.type) }
  } else if (active && focusedKey !== null) {
    const old = source.slots.find((slot) => slot.key === focusedKey && slot.active)
    let index = old ? (committed.records.get(old.slotId)?.index ?? old.index) : -1
    const matches = (candidate: number) =>
      candidate >= 0 &&
      candidate < props.totalCount &&
      props.computeItemKey(candidate, props.data?.[candidate], props.context) === focusedKey
    if (!matches(index) && props.data) {
      index = props.data.findIndex((_item, candidate) => matches(candidate))
    }
    if (old && matches(index) && old.type === (props.getItemType?.(props.data?.[index], index) ?? 0)) {
      recordsByKey.set(focusedKey, { index, data: props.data?.[index] })
    } else {
      source = { ...source, slots: source.slots.filter((slot) => slot.key !== focusedKey) }
      focusedKey = null
    }
  }
  const pool = active
    ? allocateSlots(source, { required, focusedKey, idleBudget: required.length })
    : { ...source, slots: source.slots.filter((slot) => slot.active) }
  const records = new Map<number, Record>()
  for (const slot of pool.slots) {
    const record = active && slot.active ? recordsByKey.get(slot.key) : committed.records.get(slot.slotId)
    if (record) {
      records.set(slot.slotId, record)
    }
  }
  useIsomorphicLayoutEffect(() => {
    committed.pool = pool
    committed.records = records
    if (active) {
      committed.props = props
    }
  })
  const visible = new Set(required.map((item) => item.key))
  const ordered = [...pool.slots].sort((a, b) => (records.get(a.slotId)?.index ?? 0) - (records.get(b.slotId)?.index ?? 0))
  return (
    <>
      {ordered.map((slot) => {
        const record = records.get(slot.slotId)
        return record ? (
          <Cell
            key={slot.slotId}
            slot={slot}
            record={record}
            scope={scope}
            active={active && slot.active}
            pinned={!visible.has(slot.key)}
            props={rendering}
          />
        ) : null
      })}
    </>
  )
}
