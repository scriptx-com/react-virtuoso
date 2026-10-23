import * as u from './urx'

import type { VirtuosoProps } from './component-interfaces/Virtuoso'
import type { SizeRange, ScrollContainerState } from './interfaces'

interface GeometrySystem {
  initialGeometryReady?: u.StatefulStream<boolean>
  sizeRanges?: u.Stream<SizeRange[]>
  viewportHeight?: u.Stream<number>
  scrollContainerState?: u.Stream<ScrollContainerState>
}

export interface InitialGeometry {
  viewportWidth: number
  itemWidth: number
  itemGap: number
  paddingLeft: number
  paddingRight: number
}

export function seedInitialGeometry(system: GeometrySystem, props: Partial<VirtuosoProps<unknown, unknown>> & { groupCounts?: number[] }) {
  const geometry = props.initialGeometry as InitialGeometry | undefined
  if (
    !geometry ||
    !system.initialGeometryReady ||
    u.getValue(system.initialGeometryReady) ||
    props.horizontalDirection !== true ||
    props.useWindowScroll === true ||
    Boolean(props.customScrollParent) ||
    Boolean(props.restoreStateFrom) ||
    Boolean(props.groupCounts) ||
    Boolean(props.topItemCount) ||
    props.alignToBottom === true ||
    Boolean(props.followOutput) ||
    props.fixedItemHeight !== undefined ||
    Boolean(props.heightEstimates) ||
    Boolean(props.components?.Header) ||
    Boolean(props.components?.Footer) ||
    (props.initialTopMostItemIndex !== undefined && props.initialTopMostItemIndex !== 0) ||
    (props.initialScrollTop !== undefined && props.initialScrollTop !== 0)
  ) {
    return
  }
  const count = props.data?.length ?? props.totalCount
  const { viewportWidth, itemWidth, itemGap, paddingLeft, paddingRight } = geometry
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count <= 0 ||
    ![viewportWidth, itemWidth].every((value) => Number.isFinite(value) && value > 0) ||
    ![itemGap, paddingLeft, paddingRight].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    return
  }
  const viewport = Math.round(viewportWidth)
  const first = Math.round(itemWidth)
  const stride = Math.round(itemWidth + itemGap)
  if (viewport <= 0 || first <= 0 || !Number.isFinite(stride)) {
    return
  }
  const ranges = [{ startIndex: 0, endIndex: 0, size: first }]
  if (count > 1) {
    ranges.push({ startIndex: 1, endIndex: Infinity, size: stride })
  }
  u.publish(system.sizeRanges!, ranges)
  u.publish(system.viewportHeight!, viewport)
  u.publish(system.scrollContainerState!, {
    scrollTop: 0,
    scrollHeight: Math.max(viewport, Math.round(first + (count - 1) * stride + paddingLeft + paddingRight)),
    viewportHeight: viewport,
  })
  u.publish(system.initialGeometryReady, true)
}
