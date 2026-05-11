import { empty, findMaxKeyValue, rangesWithin } from './AATree'
import { rangeComparator, tupleComparator } from './comparators'
import { groupedListSystem } from './groupedListSystem'
import { getInitialTopMostItemIndexNumber, initialTopMostItemIndexSystem } from './initialTopMostItemIndexSystem'
import { propsReadySystem } from './propsReadySystem'
import { recalcSystem } from './recalcSystem'
import { scrollToIndexSystem } from './scrollToIndexSystem'
import { BOTTOM, TOP, sizeRangeSystem } from './sizeRangeSystem'
import { hasGroups, originalIndexFromItemIndex, rangesWithinOffsets, sizeSystem } from './sizeSystem'
import { stateFlagsSystem } from './stateFlagsSystem'
import * as u from './urx'

import type { Range } from './AATree'
import type { FlatIndexLocationWithAlign, Item, ListItem, ListRange } from './interfaces'
import type { Data, SizeState } from './sizeSystem'

export type ListItems = ListItem<unknown>[]
export interface ListState {
  bottom: number
  firstItemIndex: number
  items: ListItems
  offsetBottom: number
  offsetTop: number
  top: number
  topItems: ListItems
  topListHeight: number
  totalCount: number
}

export type MinOverscanItemCount = number | { bottom: number; top: number }

function probeItemSet(index: number, sizes: SizeState, data: Data) {
  if (hasGroups(sizes)) {
    const itemIndex = originalIndexFromItemIndex(index, sizes)
    const groupIndex = findMaxKeyValue(sizes.groupOffsetTree, itemIndex)[0]

    return [
      { index: groupIndex, offset: 0, size: 0 },
      { data: data?.[0], index: itemIndex, offset: 0, size: 0 },
    ]
  }
  return [{ data: data?.[0], index, offset: 0, size: 0 }]
}

const EMPTY_LIST_STATE: ListState = {
  bottom: 0,
  firstItemIndex: 0,
  items: [] as ListItems,
  offsetBottom: 0,
  offsetTop: 0,
  top: 0,
  topItems: [] as ListItems,
  topListHeight: 0,
  totalCount: 0,
}

function buildListState(
  items: Item<any>[],
  topItems: Item<any>[],
  totalCount: number,
  gap: number,
  sizes: SizeState,
  firstItemIndex: number
): ListState {
  const { lastIndex, lastOffset, lastSize } = sizes
  let offsetTop = 0
  let bottom = 0

  if (items.length > 0) {
    offsetTop = items[0]!.offset
    const lastItem = items[items.length - 1]!
    bottom = lastItem.offset + lastItem.size
  }

  const itemCount = totalCount - lastIndex
  const total = lastOffset + itemCount * lastSize + (itemCount - 1) * gap
  const top = offsetTop
  const offsetBottom = total - bottom

  return {
    bottom,
    firstItemIndex,
    items: transposeItems(items, sizes, firstItemIndex),
    offsetBottom,
    offsetTop,
    top,
    topItems: transposeItems(topItems, sizes, firstItemIndex),
    topListHeight: topItems.reduce((height, item) => item.size + height, 0),
    totalCount,
  }
}

export function buildListStateFromItemCount(
  itemCount: number,
  initialTopMostItemIndex: FlatIndexLocationWithAlign | number,
  sizes: SizeState,
  firstItemIndex: number,
  gap: number,
  data: readonly unknown[]
) {
  let includedGroupsCount = 0
  if (sizes.groupIndices.length > 0) {
    for (const index of sizes.groupIndices) {
      if (index - includedGroupsCount >= itemCount) {
        break
      }
      includedGroupsCount++
    }
  }

  const adjustedCount = itemCount + includedGroupsCount
  const initialTopMostItemIndexNumber = getInitialTopMostItemIndexNumber(initialTopMostItemIndex, adjustedCount)

  const items = Array.from({ length: adjustedCount }).map((_, index) => ({
    data: data[index + initialTopMostItemIndexNumber],
    index: index + initialTopMostItemIndexNumber,
    offset: 0,
    size: 0,
  }))
  return buildListState(items, [], adjustedCount, gap, sizes, firstItemIndex)
}

function transposeItems(items: Item<any>[], sizes: SizeState, firstItemIndex: number): ListItems {
  if (items.length === 0) {
    return []
  }

  if (!hasGroups(sizes)) {
    return items.map((item) => ({ ...item, index: item.index + firstItemIndex, originalIndex: item.index }))
  }

  const startIndex = items[0]!.index
  const endIndex = items[items.length - 1]!.index

  const transposedItems = [] as ListItems
  const groupRanges = rangesWithin(sizes.groupOffsetTree, startIndex, endIndex)
  let currentRange: Range<number> | undefined = undefined
  let currentGroupIndex = 0

  for (const item of items) {
    if (!currentRange || currentRange.end < item.index) {
      currentRange = groupRanges.shift()!
      currentGroupIndex = sizes.groupIndices.indexOf(currentRange.start)
    }

    let transposedItem: { groupIndex: number; index: number } | { index: number; type: 'group' }

    if (item.index === currentRange.start) {
      transposedItem = {
        index: currentGroupIndex,
        type: 'group' as const,
      }
    } else {
      transposedItem = {
        groupIndex: currentGroupIndex,
        index: item.index - (currentGroupIndex + 1) + firstItemIndex,
      }
    }

    transposedItems.push({
      ...transposedItem,
      data: item.data,
      offset: item.offset,
      originalIndex: item.index,
      size: item.size,
    })
  }

  return transposedItems
}

function getMinOverscanItemCount(value: MinOverscanItemCount | undefined, end: typeof TOP | typeof BOTTOM) {
  if (value === undefined) {
    return 0
  }
  return typeof value === 'number' ? value : (value[end] ?? 0)
}

export const listStateSystem = u.system(
  ([
    { data, firstItemIndex, gap, sizes, totalCount },
    groupedListSystem,
    { listBoundary, topListHeight: rangeTopListHeight, visibleRange },
    { initialItemFinalLocationReached, initialTopMostItemIndex, scrolledToInitialItem },
    { topListHeight },
    stateFlags,
    { didMount },
    { recalcInProgress },
  ]) => {
    const topItemsIndexes = u.statefulStream<number[]>([])
    const initialItemCount = u.statefulStream(0)
    const itemsRendered = u.stream<ListItems>()
    const minOverscanItemCount = u.statefulStream<MinOverscanItemCount>(0)

    u.connect(groupedListSystem.topItemsIndexes, topItemsIndexes)

    const listState = u.statefulStreamFromEmitter(
      u.pipe(
        u.combineLatest(
          didMount,
          recalcInProgress,
          u.duc(visibleRange, tupleComparator),
          u.duc(totalCount),
          u.duc(sizes),
          u.duc(initialTopMostItemIndex),
          scrolledToInitialItem,
          u.duc(topItemsIndexes),
          u.duc(firstItemIndex),
          u.duc(gap),
          u.duc(minOverscanItemCount),
          data,
          initialItemFinalLocationReached
        ),
        u.filter(([mount, recalcInProgress, , totalCount, , , , , , , , data]) => {
          // When data length changes, it is synced to totalCount, both of which trigger a recalc separately.
          // Recalc should be skipped then, as the calculation expects both data and totalCount to be in sync.
          const dataChangeInProgress = data !== undefined && data.length !== totalCount
          return mount && !recalcInProgress && !dataChangeInProgress
        }),
        u.map(
          ([
            ,
            ,
            [startOffset, endOffset],
            totalCount,
            sizes,
            initialTopMostItemIndex,
            scrolledToInitialItem,
            topItemsIndexes,
            firstItemIndex,
            gap,
            minOverscanItemCountValue,
            data,
            initialItemFinalLocationReached,
          ]) => {
            const sizesValue = sizes
            const { offsetTree, sizeTree } = sizesValue
            const initialItemCountValue = u.getValue(initialItemCount)

            if (totalCount === 0) {
              return { ...EMPTY_LIST_STATE, totalCount }
            }

            // no container measruements yet
            if (startOffset === 0 && endOffset === 0) {
              if (initialItemCountValue === 0) {
                // Same rationale as the `!scrolledToInitialItem` branch below:
                // emit the target probe item rather than an empty list, so any
                // cell rendered in the prior emission (e.g. via the
                // sizeTree-empty probe branch) stays mounted across this
                // transitional state and React preserves focus/refs/animations
                // on it. The container is visibility:hidden until
                // `initialItemFinalLocationReached` flips, so the user doesn't
                // see the probe item.
                return buildListState(
                  probeItemSet(getInitialTopMostItemIndexNumber(initialTopMostItemIndex, totalCount), sizesValue, data),
                  [],
                  totalCount,
                  gap,
                  sizesValue,
                  firstItemIndex
                )
              }
              return buildListStateFromItemCount(initialItemCountValue, initialTopMostItemIndex, sizes, firstItemIndex, gap, data || [])
            }

            if (empty(sizeTree)) {
              if (initialItemCountValue > 0) {
                return null
              }
              const state = buildListState(
                probeItemSet(getInitialTopMostItemIndexNumber(initialTopMostItemIndex, totalCount), sizesValue, data),
                [],
                totalCount,
                gap,
                sizesValue,
                firstItemIndex
              )
              return state
            }

            const topItems = [] as Item<any>[]

            if (topItemsIndexes.length > 0) {
              const startIndex = topItemsIndexes[0]!
              const endIndex = topItemsIndexes[topItemsIndexes.length - 1]!
              let offset = 0
              for (const range of rangesWithin(sizeTree, startIndex, endIndex)) {
                const size = range.value
                const rangeStartIndex = Math.max(range.start, startIndex)
                const rangeEndIndex = Math.min(range.end, endIndex)
                for (let i = rangeStartIndex; i <= rangeEndIndex; i++) {
                  topItems.push({ data: data?.[i], index: i, offset: offset, size })
                  offset += size
                }
              }
            }

            // If the list hasn't scrolled to the initial item yet (no measurements
            // available to compute a sensible window), render the target probe item
            // rather than an empty list. Without this, React would unmount any
            // previously-mounted cell — including the focused one — across this
            // transitional state.
            //
            // Note we gate on `scrolledToInitialItem` (which flips on the first
            // scrollTop write) and NOT `initialItemFinalLocationReached`. Holding
            // only the probe across the whole scroll prevents measurements from
            // propagating to surrounding items, which would leave virtuoso's
            // scroll-to-index target computed against `defaultItemSize` — the
            // scroll never converges, `scrollTargetReached` never fires, and the
            // container (visibility:hidden until `initialItemFinalLocationReached`
            // flips) stays hidden forever.
            //
            // Target-cell preservation across the rest of the transition (i.e.
            // transient windowed emissions that drop the target between scroll
            // retries) is handled at the end of this map function — see the
            // "ensure target stays in window" block before the final
            // `buildListState` return.
            if (!scrolledToInitialItem) {
              return buildListState(
                probeItemSet(getInitialTopMostItemIndexNumber(initialTopMostItemIndex, totalCount), sizesValue, data),
                topItems,
                totalCount,
                gap,
                sizesValue,
                firstItemIndex
              )
            }

            const minStartIndex = topItemsIndexes.length > 0 ? topItemsIndexes[topItemsIndexes.length - 1]! + 1 : 0

            const offsetPointRanges = rangesWithinOffsets(offsetTree, startOffset, endOffset, minStartIndex)
            if (offsetPointRanges.length === 0) {
              return null
            }

            const maxIndex = totalCount - 1

            const items = u.tap([] as Item<any>[], (result) => {
              for (const range of offsetPointRanges) {
                const point = range.value
                let offset = point.offset
                let rangeStartIndex = range.start
                const size = point.size

                if (point.offset < startOffset) {
                  rangeStartIndex += Math.floor((startOffset - point.offset + gap) / (size + gap))
                  const itemCount = rangeStartIndex - range.start
                  offset += itemCount * size + itemCount * gap
                }

                if (rangeStartIndex < minStartIndex) {
                  offset += (minStartIndex - rangeStartIndex) * size
                  rangeStartIndex = minStartIndex
                }

                const endIndex = Math.min(range.end, maxIndex)

                for (let i = rangeStartIndex; i <= endIndex; i++) {
                  if (offset >= endOffset) {
                    break
                  }

                  result.push({ data: data?.[i], index: i, offset: offset, size })
                  offset += size + gap
                }
              }
            })

            // Extend items by minOverscanItemCount at the top and bottom
            const topOverscanCount = getMinOverscanItemCount(minOverscanItemCountValue, TOP)
            const bottomOverscanCount = getMinOverscanItemCount(minOverscanItemCountValue, BOTTOM)

            if (items.length > 0 && (topOverscanCount > 0 || bottomOverscanCount > 0)) {
              const firstItem = items[0]!
              const lastItem = items[items.length - 1]!

              // Prepend items before the first rendered item
              if (topOverscanCount > 0 && firstItem.index > minStartIndex) {
                const prependCount = Math.min(topOverscanCount, firstItem.index - minStartIndex)
                const prependItems: Item<any>[] = []
                let offset = firstItem.offset
                for (let i = firstItem.index - 1; i >= firstItem.index - prependCount; i--) {
                  const ranges = rangesWithin(sizeTree, i, i)
                  const size = ranges[0]?.value ?? firstItem.size
                  offset -= size + gap
                  prependItems.unshift({ data: data?.[i], index: i, offset, size })
                }
                items.unshift(...prependItems)
              }

              // Append items after the last rendered item
              if (bottomOverscanCount > 0 && lastItem.index < maxIndex) {
                const appendCount = Math.min(bottomOverscanCount, maxIndex - lastItem.index)
                let offset = lastItem.offset + lastItem.size + gap
                for (let i = lastItem.index + 1; i <= lastItem.index + appendCount; i++) {
                  const ranges = rangesWithin(sizeTree, i, i)
                  const size = ranges[0]?.value ?? lastItem.size
                  items.push({ data: data?.[i], index: i, offset, size })
                  offset += size + gap
                }
              }
            }

            // Ensure target stays in window during the scroll-to-initial transition.
            //
            // Between scroll retries (see scrollToIndexSystem's listRefresh →
            // watchChangesFor(150) → retry loop), virtuoso emits windowed listStates
            // computed from intermediate `[startOffset, endOffset]` values that can
            // exclude the target item entirely — e.g. scroll retry recomputes against
            // a stale visibleRange [0, viewportHeight] and the window collapses to
            // items 0..N where N < targetIndex. React then unmounts the target cell
            // on that transient emission and re-mounts a fresh one on the next,
            // destroying focus / refs / animation state.
            //
            // Until `initialItemFinalLocationReached` flips true (the scroll truly
            // settles), inject the target index into the items array whenever the
            // windowed math drops it. The container is visibility:hidden during this
            // window, so the placeholder offset is never visible to the user. The
            // next emission carries the correct offset and React reconciles via the
            // stable computeItemKey.
            if (!initialItemFinalLocationReached) {
              const totalCountNum = totalCount as number
              const targetIndex = getInitialTopMostItemIndexNumber(initialTopMostItemIndex, totalCountNum)
              if (targetIndex >= 0 && targetIndex < totalCountNum && !items.some((it) => it.index === targetIndex)) {
                const targetSizeRange = rangesWithin(sizeTree, targetIndex, targetIndex)
                items.push({
                  data: (data as readonly unknown[] | undefined)?.[targetIndex],
                  index: targetIndex,
                  offset: 0,
                  size: (targetSizeRange[0]?.value as number | undefined) ?? 0,
                })
              }
            }

            return buildListState(items, topItems, totalCount, gap, sizesValue, firstItemIndex)
          }
        ),
        //@ts-expect-error filter needs to be fixed
        u.filter((value) => value !== null),
        u.distinctUntilChanged()
      ),
      EMPTY_LIST_STATE
    )

    u.connect(
      u.pipe(
        data,
        u.filter(u.isDefined),
        u.map((data) => data?.length)
      ),
      totalCount
    )

    u.connect(
      u.pipe(
        listState,
        u.map((value) => value.topListHeight)
      ),
      topListHeight
    )
    u.connect(topListHeight, rangeTopListHeight)

    u.connect(
      u.pipe(
        listState,
        u.map((state) => [state.top, state.bottom])
      ),
      listBoundary
    )

    u.connect(
      u.pipe(
        listState,
        u.map((state) => state.items)
      ),
      itemsRendered
    )

    const endReached = u.streamFromEmitter(
      u.pipe(
        listState,
        u.filter(({ items }) => items.length > 0),
        u.withLatestFrom(totalCount, data),
        u.filter(([{ items }, totalCount]) => items[items.length - 1]!.originalIndex === totalCount - 1),
        u.map(([, totalCount, data]) => [totalCount - 1, data] as [number, unknown[]]),
        u.distinctUntilChanged(tupleComparator),
        u.map(([count]) => count)
      )
    )

    const startReached = u.streamFromEmitter(
      u.pipe(
        listState,
        u.throttleTime(200),
        u.filter(({ items, topItems }) => {
          return items.length > 0 && items[0]!.originalIndex === topItems.length
        }),
        u.map(({ items }) => items[0]!.index),
        u.distinctUntilChanged()
      )
    )

    const rangeChanged = u.streamFromEmitter(
      u.pipe(
        listState,
        u.filter(({ items }) => items.length > 0),
        u.map(({ items }) => {
          let startIndex = 0
          let endIndex = items.length - 1

          while (items[startIndex]!.type === 'group' && startIndex < endIndex) {
            startIndex++
          }

          while (items[endIndex]!.type === 'group' && endIndex > startIndex) {
            endIndex--
          }

          return {
            endIndex: items[endIndex]!.index,
            startIndex: items[startIndex]!.index,
          } as ListRange
        }),
        u.distinctUntilChanged(rangeComparator)
      )
    )

    return {
      endReached,
      initialItemCount,
      itemsRendered,
      listState,
      minOverscanItemCount,
      rangeChanged,
      startReached,
      topItemsIndexes,
      ...stateFlags,
    }
  },
  u.tup(
    sizeSystem,
    groupedListSystem,
    sizeRangeSystem,
    initialTopMostItemIndexSystem,
    scrollToIndexSystem,
    stateFlagsSystem,
    propsReadySystem,
    recalcSystem
  ),
  { singleton: true }
)
