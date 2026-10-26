import { alignToBottomSystem } from './alignToBottomSystem'
import { contextSystem } from './contextSystem'
import { domIOSystem } from './domIOSystem'
import { followOutputSystem } from './followOutputSystem'
import { groupedListSystem } from './groupedListSystem'
import { initialItemCountSystem } from './initialItemCountSystem'
import { initialScrollTopSystem } from './initialScrollTopSystem'
import { initialTopMostItemIndexSystem } from './initialTopMostItemIndexSystem'
import { listStateSystem } from './listStateSystem'
import { loggerSystem } from './loggerSystem'
import { propsReadySystem } from './propsReadySystem'
import { scrollIntoViewSystem } from './scrollIntoViewSystem'
import { scrollSeekSystem } from './scrollSeekSystem'
import { scrollToIndexSystem } from './scrollToIndexSystem'
import { sizeRangeSystem } from './sizeRangeSystem'
import { offsetOf, rangesWithinOffsets, sizeSystem } from './sizeSystem'
import { stateLoadSystem } from './stateLoadSystem'
import { topItemCountSystem } from './topItemCountSystem'
import { totalListHeightSystem } from './totalListHeightSystem'
import { upwardScrollFixSystem } from './upwardScrollFixSystem'
import * as u from './urx'
import { windowScrollerSystem } from './windowScrollerSystem'

const featureGroup1System = u.system(
  ([
    sizeRange,
    initialItemCount,
    propsReady,
    scrollSeek,
    totalListHeight,
    initialScrollTopSystem,
    alignToBottom,
    windowScroller,
    scrollIntoView,
    logger,
    context,
  ]) => {
    return {
      ...sizeRange,
      ...initialItemCount,
      ...propsReady,
      ...scrollSeek,
      ...totalListHeight,
      ...initialScrollTopSystem,
      ...alignToBottom,
      ...windowScroller,
      ...scrollIntoView,
      ...logger,
      ...context,
    }
  },
  u.tup(
    sizeRangeSystem,
    initialItemCountSystem,
    propsReadySystem,
    scrollSeekSystem,
    totalListHeightSystem,
    initialScrollTopSystem,
    alignToBottomSystem,
    windowScrollerSystem,
    scrollIntoViewSystem,
    loggerSystem,
    contextSystem
  )
)

export const listSystem = u.system(
  ([
    {
      data,
      applyKnownLayout,
      knownLayout,
      beforeKnownLayoutChange,
      afterKnownLayoutChange,
      defaultItemSize,
      firstItemIndex,
      fixedItemSize,
      fixedGroupSize,
      gap,
      groupIndices,
      heightEstimates,
      itemSize,
      sizeRanges,
      sizes,
      statefulTotalCount,
      totalCount,
      trackItemSizes,
    },
    { initialItemFinalLocationReached, initialTopMostItemIndex, scrolledToInitialItem },
    domIO,
    stateLoad,
    followOutput,
    listStateSystemOutput,
    { scrollToIndex },
    _,
    { topItemCount },
    { groupCounts },
    featureGroup1,
  ]) => {
    const { listState, minOverscanItemCount, topItemsIndexes, rangeChanged, ...flags } = listStateSystemOutput
    u.connect(rangeChanged, featureGroup1.scrollSeekRangeChanged)
    u.connect(
      u.pipe(
        featureGroup1.windowViewportRect,
        u.map((value) => value.visibleHeight)
      ),
      domIO.viewportHeight
    )

    // Preserve the visible item's pixel anchor when a layout revision replaces sizes.
    // Use Virtuoso's existing scroll correction channel in either direction.
    let geometryAnchor: { index: number; within: number; scrollTop: number } | undefined
    u.subscribe(beforeKnownLayoutChange, () => {
      if (geometryAnchor) {
        return
      }
      const scrollTop = u.getValue(domIO.statefulScrollTop)
      const tree = u.getValue(sizes).offsetTree
      const position =
        scrollTop - u.getValue(domIO.headerHeight) - u.getValue(domIO.fixedHeaderHeight) - u.getValue(domIO.contentInsets).start
      if (position <= 0 || !tree.length || !u.getValue(scrolledToInitialItem)) {
        return
      }
      const point = rangesWithinOffsets(tree, position, position)[0]?.value
      if (!point) {
        return
      }
      const itemGap = u.getValue(gap)
      const index = Math.min(
        u.getValue(statefulTotalCount) - 1,
        point.index + Math.floor((position - point.offset) / (point.size + itemGap))
      )
      if (index < 0) {
        return
      }
      geometryAnchor = { index, within: position - offsetOf(index, tree, itemGap), scrollTop }
    })
    const restoreGeometryAnchor = () => {
      if (!u.getValue(featureGroup1.propsReady)) {
        return
      }
      const anchor = geometryAnchor
      geometryAnchor = undefined
      const tree = u.getValue(sizes).offsetTree
      if (!anchor || !tree.length || !u.getValue(statefulTotalCount)) {
        return
      }
      const index = Math.min(anchor.index, u.getValue(statefulTotalCount) - 1)
      const itemGap = u.getValue(gap)
      const offset = offsetOf(index, tree, itemGap)
      const size = offsetOf(index + 1, tree, itemGap) - offset - itemGap
      const target =
        offset +
        Math.min(anchor.within, Math.max(0, size - 1)) +
        u.getValue(domIO.headerHeight) +
        u.getValue(domIO.fixedHeaderHeight) +
        u.getValue(domIO.contentInsets).start
      const delta = target - anchor.scrollTop
      if (delta !== 0) {
        u.publish(domIO.scrollBy, { top: delta, behavior: 'auto' })
      }
    }
    u.subscribe(afterKnownLayoutChange, restoreGeometryAnchor)
    u.subscribe(featureGroup1.propsReady, (ready) => {
      if (ready) {
        restoreGeometryAnchor()
      }
    })

    return {
      data,
      applyKnownLayout,
      knownLayout,
      defaultItemHeight: defaultItemSize,
      firstItemIndex,
      fixedItemHeight: fixedItemSize,
      fixedGroupHeight: fixedGroupSize,
      gap,
      groupCounts,
      heightEstimates,
      initialItemFinalLocationReached,
      initialTopMostItemIndex,
      scrolledToInitialItem,
      sizeRanges,
      topItemCount,
      topItemsIndexes,
      // input
      totalCount,
      ...followOutput,

      groupIndices,
      itemSize,
      listState,
      minOverscanItemCount,
      scrollToIndex,
      // output
      statefulTotalCount,
      trackItemSizes,

      // exported from stateFlagsSystem
      rangeChanged,
      ...flags,
      // the bag of IO from featureGroup1System
      ...featureGroup1,
      ...domIO,
      sizes,
      ...stateLoad,
    }
  },
  u.tup(
    sizeSystem,
    initialTopMostItemIndexSystem,
    domIOSystem,
    stateLoadSystem,
    followOutputSystem,
    listStateSystem,
    scrollToIndexSystem,
    upwardScrollFixSystem,
    topItemCountSystem,
    groupedListSystem,
    featureGroup1System
  )
)
