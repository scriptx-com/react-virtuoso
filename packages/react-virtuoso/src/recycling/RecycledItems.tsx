import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'
import { offsetOf } from '../sizeSystem'
import { allocateSlots, emptyPool } from './allocator'
import { knownSizeAt } from './layout'
import { RecyclingContext, useRecyclingActivity } from './RecyclingContext'
import { createCellSizeObserver } from './useCellSizes'

import type { ComputeItemKey, ItemContent, ListItem, SizeFunction, SizeRange } from '../interfaces'
import type { SizeState } from '../sizeSystem'
import type { ContentInsets } from './integration'
import type { KnownLayout } from './layout'
import type { PoolState, Slot } from './types'
import type { CellMeasurement } from './useCellSizes'

interface CellRecord {
  data: any
  index: number
  offset: number
  size: number
}

interface Props {
  contentInsets?: ContentInsets
  items: readonly ListItem<any>[]
  data: readonly unknown[] | undefined
  totalCount: number
  firstItemIndex: number
  totalSize: number
  horizontal: boolean
  rtl: boolean
  sizes: SizeState
  gap: number
  knownLayout?: KnownLayout | undefined
  fixedItemSize?: number | undefined
  computeItemKey: ComputeItemKey<any, any>
  getItemType?: ((item: any, index: number) => number | string | undefined) | undefined
  itemContent: ItemContent<any, any>
  ItemComponent: React.ElementType
  ListComponent: React.ElementType
  context: any
  itemSize: SizeFunction
  sizeRanges: (ranges: SizeRange[]) => void
  listRef: (element: HTMLElement | null) => void
  listStyle?: React.CSSProperties
  focusedKey: React.Key | null
  onFocusedItem: (key: React.Key | null) => void
}

interface CellProps extends CellRecord {
  slot: Slot
  scope: object
  active: boolean
  horizontal: boolean
  rtl: boolean
  exact: boolean
  firstItemIndex: number
  itemContent: Props['itemContent']
  ItemComponent: Props['ItemComponent']
  context: any
  register: (slotId: number, element: HTMLElement | null) => void
}

const Cell = React.memo(function RecycledCell({
  slot,
  scope,
  active,
  horizontal,
  rtl,
  exact,
  firstItemIndex,
  itemContent,
  ItemComponent,
  context,
  register,
  data,
  index,
  offset,
  size,
}: CellProps) {
  const assignment = React.useMemo(
    () => ({ index, logicalKey: slot.key, slotId: slot.slotId, generation: slot.generation, active, scope }),
    [slot.key, slot.slotId, slot.generation, active, scope, index]
  )
  const ref = React.useCallback((element: HTMLElement | null) => register(slot.slotId, element), [register, slot.slotId])
  const content = React.useMemo(
    () => itemContent(index + firstItemIndex, data, context),
    [itemContent, index, firstItemIndex, data, context]
  )
  const style: React.CSSProperties = {
    position: 'absolute',
    boxSizing: 'border-box',
    overflowAnchor: 'none',
    ...(horizontal
      ? { top: 0, height: '100%', display: 'inline-block', [rtl ? 'right' : 'left']: offset, ...(exact ? { width: size } : {}) }
      : { top: offset, left: 0, width: '100%', ...(exact ? { height: size } : {}) }),
    ...(!active ? { display: 'none' } : {}),
  }
  return (
    <RecyclingContext.Provider value={assignment}>
      {React.createElement(
        ItemComponent,
        {
          ...(typeof ItemComponent === 'string' ? {} : { context, item: data }),
          ref,
          style,
          'data-recycling-slot': slot.slotId,
          'data-index': active ? index : undefined,
          'data-item-index': active ? index + firstItemIndex : undefined,
          'data-known-size': active ? size : undefined,
          'aria-hidden': active ? undefined : true,
        },
        content
      )}
    </RecyclingContext.Provider>
  )
})

export function RecycledItems(props: Props) {
  const {
    items,
    data,
    totalCount,
    firstItemIndex,
    totalSize,
    horizontal,
    rtl,
    sizes,
    gap,
    knownLayout,
    fixedItemSize,
    computeItemKey,
    getItemType,
    itemContent,
    ItemComponent,
    ListComponent,
    context,
    itemSize,
    sizeRanges,
    listRef,
    listStyle,
    onFocusedItem,
  } = props
  const active = useRecyclingActivity()
  const [scope] = React.useState(() => ({}))
  const [committed] = React.useState(() => ({
    pool: emptyPool(),
    records: new Map<number, CellRecord>(),
    rendering: { itemContent, ItemComponent, context, firstItemIndex },
  }))
  const rendering = active ? { itemContent, ItemComponent, context, firstItemIndex } : committed.rendering
  const [nodes] = React.useState(() => new Map<number, HTMLElement>())
  const observer = React.useRef<ReturnType<typeof createCellSizeObserver> | null>(null)
  const byKey = new Map<React.Key, CellRecord>()
  const required = (active ? items : []).map((item) => {
    const index = item.originalIndex ?? item.index - firstItemIndex
    const key = computeItemKey(index + firstItemIndex, item.data, context)
    byKey.set(key, { index, offset: item.offset + (props.contentInsets?.start ?? 0), size: item.size, data: item.data })
    return { index, key, type: getItemType?.(item.data, index + firstItemIndex) ?? 0 }
  })

  let focusedKey = props.focusedKey
  if (active && focusedKey !== null && !byKey.has(focusedKey)) {
    const old = committed.pool.slots.find((slot) => slot.key === focusedKey && slot.active)
    let index = old ? (committed.records.get(old.slotId)?.index ?? old.index) : -1
    const matches = (index: number) =>
      index >= 0 && index < totalCount && computeItemKey(index + firstItemIndex, data?.[index], context) === focusedKey
    if (!matches(index) && data) {
      index = data.findIndex((_item, index) => matches(index))
    }
    if (old && matches(index) && old.type === (getItemType?.(data?.[index], index + firstItemIndex) ?? 0)) {
      const offset = offsetOf(index, sizes.offsetTree, gap)
      byKey.set(focusedKey, {
        index,
        data: data?.[index],
        offset: offset + (props.contentInsets?.start ?? 0),
        size: offsetOf(index + 1, sizes.offsetTree, gap) - offset - gap,
      })
    } else {
      focusedKey = null
    }
  }

  const pool: PoolState = active
    ? allocateSlots(committed.pool, {
        required,
        focusedKey: active ? focusedKey : null,
        idleBudget: active ? required.length : 0,
      })
    : { ...committed.pool, slots: committed.pool.slots.filter((slot) => slot.active) }
  const records = new Map<number, CellRecord>()
  for (const slot of pool.slots) {
    const record = active && slot.active ? byKey.get(slot.key) : committed.records.get(slot.slotId)
    if (record) {
      records.set(slot.slotId, record)
    }
  }
  useIsomorphicLayoutEffect(() => {
    committed.pool = pool
    committed.records = records
    if (active) {
      committed.rendering = rendering
    }
  })
  const register = React.useCallback(
    (slotId: number, element: HTMLElement | null) => {
      if (element) {
        nodes.set(slotId, element)
      } else {
        nodes.delete(slotId)
      }
    },
    [nodes]
  )
  useIsomorphicLayoutEffect(() => {
    if (!active || typeof ResizeObserver === 'undefined') {
      return
    }
    const manager = createCellSizeObserver({ horizontal, itemSize, callback: sizeRanges })
    observer.current = manager
    return () => {
      manager.destroy()
      observer.current = null
    }
  }, [active, horizontal, itemSize, sizeRanges])
  useIsomorphicLayoutEffect(() => {
    const cells: CellMeasurement[] = []
    for (const slot of pool.slots) {
      const element = nodes.get(slot.slotId)
      const record = records.get(slot.slotId)
      if (!element || !record) {
        continue
      }
      cells.push({
        element,
        index: record.index,
        logicalKey: slot.key,
        assignmentGeneration: slot.generation,
        layoutRevision: knownLayout?.revision ?? 0,
        active: active && slot.active,
        exact: fixedItemSize !== undefined || knownSizeAt(knownLayout, record.index) !== undefined,
        knownSize: record.size,
      })
    }
    observer.current?.setCells(cells)
  })

  const onFocusCapture = (event: React.FocusEvent<HTMLElement>) => {
    if (!active) {
      return
    }
    let target = event.target as HTMLElement | null
    let slotId: number | undefined
    while (target && target !== event.currentTarget) {
      if (target.dataset.recyclingSlot !== undefined) {
        slotId = Number(target.dataset.recyclingSlot)
      }
      target = target.parentElement
    }
    const slot = pool.slots.find((slot) => slot.slotId === slotId && slot.active)
    if (slot) {
      onFocusedItem(slot.key)
    }
  }
  const onBlurCapture = (event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onFocusedItem(null)
    }
  }
  const style: React.CSSProperties = {
    ...listStyle,
    position: 'relative',
    boxSizing: 'border-box',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    ...(horizontal
      ? {
          display: 'inline-block',
          width: totalSize + (props.contentInsets?.start ?? 0) + (props.contentInsets?.end ?? 0),
          height: '100%',
          whiteSpace: 'nowrap',
        }
      : { height: totalSize + (props.contentInsets?.start ?? 0) + (props.contentInsets?.end ?? 0) }),
  }
  // Physical hosts move in DOM order as needed; accessible reading order stays logical.
  const ordered = [...pool.slots].sort(
    (a, b) => Number(b.active) - Number(a.active) || (records.get(a.slotId)?.index ?? 0) - (records.get(b.slotId)?.index ?? 0)
  )
  return (
    <ListComponent
      {...(typeof ListComponent === 'string' ? {} : { context })}
      data-testid="virtuoso-item-list"
      data-recycling-list=""
      ref={listRef}
      style={style}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {ordered.map((slot) => {
        const record = records.get(slot.slotId)
        return record ? (
          <Cell
            key={slot.slotId}
            slot={slot}
            scope={scope}
            active={active && slot.active}
            horizontal={horizontal}
            rtl={rtl}
            exact={fixedItemSize !== undefined || knownSizeAt(knownLayout, record.index) !== undefined}
            firstItemIndex={rendering.firstItemIndex}
            itemContent={rendering.itemContent}
            ItemComponent={rendering.ItemComponent}
            context={rendering.context}
            register={register}
            {...record}
          />
        ) : null
      })}
    </ListComponent>
  )
}
