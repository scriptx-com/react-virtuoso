import React from 'react'

import useChangedListContentsSizes from './hooks/useChangedChildSizes'
import useIsomorphicLayoutEffect from './hooks/useIsomorphicLayoutEffect'
import useScrollTop from './hooks/useScrollTop'
import useSize from './hooks/useSize'
import useWindowViewportRectRef from './hooks/useWindowViewportRect'
import { listSystem } from './listSystem'
import { systemToComponent } from './react-urx'
import { coversKnownRange } from './recycling/layout'
import { RecycledItems } from './recycling/RecycledItems'
import { useRecyclingSystemBinding } from './recycling/systemBinding'
import * as u from './urx'
import { VirtuosoMockContext } from './utils/context'
import { correctItemSize } from './utils/correctItemSize'
import { positionStickyCssValue } from './utils/positionStickyCssValue'

import type { GroupedVirtuosoHandle, GroupedVirtuosoProps, VirtuosoHandle, VirtuosoProps } from './component-interfaces/Virtuoso'
import type { Components, ComputeItemKey, ContextProp, GroupContent, GroupItemContent, ItemContent, ListRootProps } from './interfaces'

export function identity<T>(value: T) {
  return value
}

const listComponentPropsSystem = /*#__PURE__*/ u.system(() => {
  const itemContent = u.statefulStream<GroupItemContent<any, any> | ItemContent<any, any>>((index: number) => `Item ${index}`)
  const groupContent = u.statefulStream<GroupContent<any>>((index: number) => `Group ${index}`)
  const components = u.statefulStream<Components<any>>({})
  const computeItemKey = u.statefulStream<ComputeItemKey<any, any>>(identity)
  const HeaderFooterTag = u.statefulStream('div')
  const scrollerRef = u.statefulStream<(ref: HTMLElement | null | Window) => void>(u.noop)
  const recycling = u.statefulStream<boolean | undefined>(undefined)
  const getItemType = u.statefulStream<((item: any, index: number) => number | string | undefined) | undefined>(undefined)
  const integrationFocusedKey = u.statefulStream<React.Key | null>(null)
  const domFocusedKey = u.statefulStream<React.Key | null>(null)
  const recyclingActive = u.statefulStream(true)

  const distinctProp = <K extends keyof Components<any>>(propName: K, defaultValue: 'div' | Components<any>[K] | null = null) => {
    return u.statefulStreamFromEmitter(
      u.pipe(
        components,
        u.map((components) => components[propName]),
        u.distinctUntilChanged()
      ),
      defaultValue
    )
  }

  return {
    recycling,
    getItemType,
    integrationFocusedKey,
    domFocusedKey,
    recyclingActive,
    components,
    computeItemKey,
    EmptyPlaceholder: distinctProp('EmptyPlaceholder'),
    FooterComponent: distinctProp('Footer'),
    GroupComponent: distinctProp('Group', 'div'),
    groupContent,
    HeaderComponent: distinctProp('Header'),
    HeaderFooterTag,
    ItemComponent: distinctProp('Item', 'div'),
    itemContent,
    ListComponent: distinctProp('List', 'div'),
    ScrollerComponent: distinctProp('Scroller', 'div'),
    scrollerRef,
    ScrollSeekPlaceholder: distinctProp('ScrollSeekPlaceholder'),
    TopItemListComponent: distinctProp('TopItemList'),
  }
})

const combinedSystem = /*#__PURE__*/ u.system(
  ([listSystem, propsSystem]) => {
    return { ...listSystem, ...propsSystem }
  },
  u.tup(listSystem, listComponentPropsSystem)
)

const DefaultScrollSeekPlaceholder = ({ height }: { height: number }) => <div style={{ height }} />

const GROUP_STYLE = { overflowAnchor: 'none', position: positionStickyCssValue(), zIndex: 1 } as const
const ITEM_STYLE = { overflowAnchor: 'none' } as const
const HORIZONTAL_ITEM_STYLE = { ...ITEM_STYLE, display: 'inline-block', height: '100%' } as const

const itemListKeys = [
  'listState',
  'useWindowScroll',
  'customScrollParent',
  'itemContent',
  'context',
  'groupContent',
  'trackItemSizes',
  'itemSize',
  'log',
  'horizontalDirection',
  'skipAnimationFrameInResizeObserver',
  'EmptyPlaceholder',
  'ScrollSeekPlaceholder',
  'ListComponent',
  'ItemComponent',
  'GroupComponent',
  'computeItemKey',
  'isSeeking',
  'groupIndices',
  'alignToBottom',
  'initialItemFinalLocationReached',
  'knownLayout',
  'recycling',
  'getItemType',
  'integrationFocusedKey',
  'domFocusedKey',
  'recyclingActive',
  'followOutput',
  'scrollSeekConfiguration',
  'topItemCount',
  'data',
  'sizes',
  'gap',
  'fixedItemHeight',
  'contentInsets',
] as const

const Items = /*#__PURE__*/ React.memo(function VirtuosoItems({ showTopList = false }: { showTopList?: boolean }) {
  const [
    listState,
    useWindowScroll,
    customScrollParent,
    itemContent,
    context,
    groupContent,
    trackItemSizes,
    itemSize,
    log,
    horizontalDirection,
    skipAnimationFrame,
    EmptyPlaceholder,
    placeholder,
    OptionalListComponent,
    OptionalItemComponent,
    OptionalGroupComponent,
    computeItemKey,
    isSeeking,
    groupIndices,
    alignToBottom,
    initialItemFinalLocationReached,
    knownLayout,
    recycling,
    getItemType,
    integrationFocusedKey,
    domFocusedKey,
    recyclingActive,
    followOutput,
    scrollSeekConfiguration,
    topItemCount,
    data,
    sizes,
    gap,
    fixedItemHeight,
    contentInsets,
  ] = useEmitterValues(itemListKeys)
  const setDomFocusedKey = usePublisher('domFocusedKey')
  const supportsRecycling =
    !showTopList &&
    groupIndices.length === 0 &&
    topItemCount === 0 &&
    (followOutput === false || followOutput === undefined) &&
    !alignToBottom &&
    (scrollSeekConfiguration === false || scrollSeekConfiguration === undefined) &&
    listState.firstItemIndex === 0 &&
    !useWindowScroll &&
    !customScrollParent
  const warnedUnsupported = React.useRef(false)
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && recycling === true && !supportsRecycling && !showTopList && !warnedUnsupported.current) {
      warnedUnsupported.current = true
      console.warn('Virtuoso recycling is unavailable for this list configuration; using ordinary virtualization.')
    }
  }, [recycling, supportsRecycling, showTopList])
  const recycle = recycling !== false && supportsRecycling && sizes.offsetTree.length > 0
  const [rtl, setRtl] = React.useState(false)
  const sizeRanges = usePublisher('sizeRanges')
  const windowScrollContainerStateCallback = usePublisher('windowScrollContainerState')
  const _scrollContainerStateCallback = usePublisher('scrollContainerState')
  const scrollContainerStateCallback =
    customScrollParent || useWindowScroll ? windowScrollContainerStateCallback : _scrollContainerStateCallback
  const listGap = usePublisher('gap')

  const { callbackRef } = useChangedListContentsSizes(
    sizeRanges,
    itemSize,
    recyclingActive && (trackItemSizes || recycle),
    showTopList ? u.noop : scrollContainerStateCallback,
    log,
    listGap,
    customScrollParent,
    horizontalDirection,
    skipAnimationFrame,
    knownLayout,
    recycle ||
      (!showTopList &&
        listState.items.length > 0 &&
        coversKnownRange(knownLayout, listState.items[0]!.originalIndex!, listState.items[listState.items.length - 1]!.originalIndex!))
  )
  const listRef = React.useCallback(
    (element: HTMLElement | null) => {
      callbackRef(element)
      if (element && horizontalDirection) {
        setRtl(getComputedStyle(element).direction === 'rtl')
      }
    },
    [callbackRef, horizontalDirection]
  )

  const [deviation, setDeviation] = React.useState(0)
  useEmitter('deviation', (value) => {
    if (deviation !== value) {
      // ref.current!.style.marginTop = `${value}px`
      setDeviation(value)
    }
  })

  const ListComponent = OptionalListComponent!
  const ItemComponent = OptionalItemComponent!
  const GroupComponent = OptionalGroupComponent!
  const ScrollSeekPlaceholder = placeholder ?? DefaultScrollSeekPlaceholder
  const hasGroups = groupIndices.length > 0

  const containerStyle: React.CSSProperties = showTopList
    ? {}
    : {
        boxSizing: 'border-box',
        ...(horizontalDirection
          ? {
              display: 'inline-block',
              verticalAlign: 'top',
              height: '100%',
              // Use physical properties (marginLeft / paddingLeft / paddingRight)
              // instead of CSS logical properties (marginInlineStart /
              // paddingInlineStart / paddingInlineEnd). The logical-property
              // family for inline-axis ships in Chromium 87+; Tizen 5.x runs on
              // Chromium 63 and silently drops these declarations, leaving the
              // horizontal scroller without the phantom padding that represents
              // unrendered items beyond the viewport. scrollWidth then stays at
              // the natural width of the currently-rendered cells, so
              // scrollToIndex / scrollTo clamp and the list cannot advance past
              // the initially measured range. Physical properties produce the
              // same layout in LTR (which is the only writing mode this fork
              // targets) and work on every Chromium version.
              marginLeft: deviation !== 0 ? deviation : alignToBottom ? 'auto' : 0,
              paddingRight: rtl ? listState.offsetTop + contentInsets.start : listState.offsetBottom + contentInsets.end,
              paddingLeft: rtl ? listState.offsetBottom + contentInsets.end : listState.offsetTop + contentInsets.start,
              whiteSpace: 'nowrap',
            }
          : {
              marginTop: deviation !== 0 ? deviation : alignToBottom ? 'auto' : 0,
              paddingBottom: listState.offsetBottom + contentInsets.end,
              paddingTop: listState.offsetTop + contentInsets.start,
            }),
        ...(initialItemFinalLocationReached ? {} : { visibility: 'hidden' }),
      }

  if (!showTopList && listState.totalCount === 0 && EmptyPlaceholder !== null && EmptyPlaceholder !== undefined) {
    return <EmptyPlaceholder {...contextPropIfNotDomElement(EmptyPlaceholder, context)} />
  }

  if (recycle) {
    return (
      <RecycledItems
        contentInsets={contentInsets}
        items={listState.items}
        data={data}
        totalCount={listState.totalCount}
        firstItemIndex={listState.firstItemIndex}
        totalSize={listState.bottom + listState.offsetBottom}
        horizontal={horizontalDirection}
        rtl={rtl}
        sizes={sizes}
        gap={gap}
        knownLayout={knownLayout}
        fixedItemSize={fixedItemHeight}
        computeItemKey={computeItemKey}
        getItemType={getItemType}
        itemContent={itemContent as ItemContent<any, any>}
        ItemComponent={ItemComponent as React.ElementType}
        ListComponent={ListComponent as React.ElementType}
        context={context}
        itemSize={itemSize}
        sizeRanges={sizeRanges}
        listRef={listRef}
        listStyle={containerStyle}
        focusedKey={integrationFocusedKey ?? domFocusedKey}
        onFocusedItem={setDomFocusedKey}
      />
    )
  }

  return (
    <ListComponent
      {...contextPropIfNotDomElement(ListComponent, context)}
      data-testid={showTopList ? 'virtuoso-top-item-list' : 'virtuoso-item-list'}
      ref={listRef}
      style={containerStyle}
    >
      {(showTopList ? listState.topItems : listState.items).map((item) => {
        const index = item.originalIndex!
        const key = computeItemKey(index + listState.firstItemIndex, item.data, context)

        if (isSeeking) {
          return (
            <ScrollSeekPlaceholder
              {...contextPropIfNotDomElement(ScrollSeekPlaceholder, context)}
              height={item.size}
              index={item.index}
              key={key}
              type={item.type || 'item'}
              {...(item.type === 'group' ? {} : { groupIndex: item.groupIndex })}
            />
          )
        }

        if (item.type === 'group') {
          return (
            <GroupComponent
              {...contextPropIfNotDomElement(GroupComponent, context)}
              data-index={index}
              data-item-index={item.index}
              data-known-size={item.size}
              key={key}
              style={GROUP_STYLE}
            >
              {groupContent(item.index, context)}
            </GroupComponent>
          )
        }

        return React.createElement(
          ItemComponent as React.ElementType,
          Object.assign(typeof ItemComponent === 'string' ? {} : { context }, itemPropIfNotDomElement(ItemComponent, item.data), {
            'data-index': index,
            'data-item-group-index': item.groupIndex,
            'data-item-index': item.index,
            'data-known-size': item.size,
            key,
            style: horizontalDirection ? HORIZONTAL_ITEM_STYLE : ITEM_STYLE,
          }),
          hasGroups
            ? (itemContent as GroupItemContent<any, any>)(item.index, item.groupIndex!, item.data, context)
            : (itemContent as ItemContent<any, any>)(item.index, item.data, context)
        )
      })}
    </ListComponent>
  )
})

const scrollerStyle: React.CSSProperties = {
  height: '100%',
  outline: 'none',
  overflowY: 'auto',
  position: 'relative',
  WebkitOverflowScrolling: 'touch',
}

const horizontalScrollerStyle: React.CSSProperties = {
  outline: 'none',
  overflowX: 'auto',
  position: 'relative',
}

export const viewportStyle: (alignToBottom: boolean) => React.CSSProperties = (alignToBottom) => ({
  height: '100%',
  position: 'absolute',
  top: 0,
  width: '100%',
  ...(alignToBottom ? { display: 'flex', flexDirection: 'column' } : undefined),
})

export const windowViewportStyle = (alignToBottom: boolean, useWindowScroll: boolean, topOffset = 0): React.CSSProperties => ({
  ...viewportStyle(alignToBottom),
  position: useWindowScroll ? 'relative' : 'absolute',
  top: useWindowScroll ? -topOffset : 0,
})

const topItemListStyle: React.CSSProperties = {
  position: positionStickyCssValue(),
  top: 0,
  width: '100%',
  zIndex: 1,
}

export function contextPropIfNotDomElement<C>(element: unknown, context: C): ContextProp<C> {
  if (typeof element === 'string') {
    // @ts-expect-error DOM components omit the context prop at runtime.
    return undefined
  }
  return { context }
}

export function itemPropIfNotDomElement(element: unknown, item: unknown) {
  return { item: typeof element === 'string' ? undefined : item }
}

const HORIZONTAL_HEADER_FOOTER_STYLE: React.CSSProperties = { display: 'inline-block', height: '100%', verticalAlign: 'top' }

const Header: React.FC = /*#__PURE__*/ React.memo(function VirtuosoHeader() {
  const Header = useEmitterValue('HeaderComponent')
  const headerHeight = usePublisher('headerHeight')
  const HeaderFooterTag = useEmitterValue('HeaderFooterTag') as any
  const horizontalDirection = useEmitterValue('horizontalDirection')
  const ref = useSize(
    React.useMemo(
      () => (el) => {
        headerHeight(correctItemSize(el, horizontalDirection ? 'width' : 'height'))
      },
      [headerHeight, horizontalDirection]
    ),
    true,
    useEmitterValue('skipAnimationFrameInResizeObserver')
  )
  const context = useEmitterValue('context')
  return Header !== null && Header !== undefined ? (
    <HeaderFooterTag ref={ref} style={horizontalDirection ? HORIZONTAL_HEADER_FOOTER_STYLE : undefined}>
      <Header {...contextPropIfNotDomElement(Header, context)} />
    </HeaderFooterTag>
  ) : null
})

const Footer: React.FC = /*#__PURE__*/ React.memo(function VirtuosoFooter() {
  const Footer = useEmitterValue('FooterComponent')
  const footerHeight = usePublisher('footerHeight')
  const HeaderFooterTag = useEmitterValue('HeaderFooterTag') as any
  const horizontalDirection = useEmitterValue('horizontalDirection')
  const ref = useSize(
    React.useMemo(
      () => (el) => {
        footerHeight(correctItemSize(el, horizontalDirection ? 'width' : 'height'))
      },
      [footerHeight, horizontalDirection]
    ),
    true,
    useEmitterValue('skipAnimationFrameInResizeObserver')
  )
  const context = useEmitterValue('context')
  return Footer !== null && Footer !== undefined ? (
    <HeaderFooterTag ref={ref} style={horizontalDirection ? HORIZONTAL_HEADER_FOOTER_STYLE : undefined}>
      <Footer {...contextPropIfNotDomElement(Footer, context)} />
    </HeaderFooterTag>
  ) : null
})

interface Hooks {
  useEmitter: typeof useEmitter
  useEmitterValue: typeof useEmitterValue
  usePublisher: typeof usePublisher
}

export function buildScroller({ useEmitter, useEmitterValue, usePublisher }: Hooks, supportsInitialGeometry = false) {
  const useInitialGeometryReady = supportsInitialGeometry ? () => useEmitterValue('initialGeometryReady') : () => false
  const Scroller: Components['Scroller'] = React.memo(function VirtuosoScroller({ children, style, context, ...props }) {
    const scrollContainerStateCallback = usePublisher('scrollContainerState')
    const ScrollerComponent = useEmitterValue('ScrollerComponent')!
    const smoothScrollTargetReached = usePublisher('smoothScrollTargetReached')
    const scrollerRefCallback = useEmitterValue('scrollerRef')
    const horizontalDirection = useEmitterValue('horizontalDirection') || false

    const { scrollByCallback, scrollerRef, scrollToCallback } = useScrollTop(
      scrollContainerStateCallback,
      smoothScrollTargetReached,
      ScrollerComponent,
      scrollerRefCallback,
      undefined,
      horizontalDirection,
      useInitialGeometryReady()
    )

    useEmitter('scrollTo', scrollToCallback)
    useEmitter('scrollBy', scrollByCallback)
    const defaultStyle = horizontalDirection ? horizontalScrollerStyle : scrollerStyle
    return (
      <ScrollerComponent
        data-testid="virtuoso-scroller"
        data-virtuoso-scroller={true}
        ref={scrollerRef as React.MutableRefObject<HTMLDivElement | null>}
        style={{ ...defaultStyle, ...style }}
        tabIndex={0}
        {...props}
        {...contextPropIfNotDomElement(ScrollerComponent, context)}
      >
        {children}
      </ScrollerComponent>
    )
  })
  return Scroller
}

export function buildWindowScroller({ useEmitter, useEmitterValue, usePublisher }: Hooks) {
  const Scroller: Components['Scroller'] = React.memo(function VirtuosoWindowScroller({ children, style, context, ...props }) {
    const scrollContainerStateCallback = usePublisher('windowScrollContainerState')
    const ScrollerComponent = useEmitterValue('ScrollerComponent')!
    const smoothScrollTargetReached = usePublisher('smoothScrollTargetReached')
    const totalListHeight = useEmitterValue('totalListHeight')
    const deviation = useEmitterValue('deviation')
    const customScrollParent = useEmitterValue('customScrollParent')
    const scrollerElRef = React.useRef<HTMLDivElement | null>(null)
    const scrollerRefCallback = useEmitterValue('scrollerRef')
    const { scrollByCallback, scrollerRef, scrollToCallback } = useScrollTop(
      scrollContainerStateCallback,
      smoothScrollTargetReached,
      ScrollerComponent,
      scrollerRefCallback,
      customScrollParent
    )

    useIsomorphicLayoutEffect(() => {
      scrollerRef.current = customScrollParent ? customScrollParent : (scrollerElRef.current?.ownerDocument.defaultView as Window)
      return () => {
        scrollerRef.current = null
      }
    }, [scrollerRef, customScrollParent])

    useEmitter('windowScrollTo', scrollToCallback)
    useEmitter('scrollBy', scrollByCallback)
    return (
      <ScrollerComponent
        ref={scrollerElRef}
        data-virtuoso-scroller={true}
        style={{ position: 'relative', ...style, ...(totalListHeight !== 0 ? { height: totalListHeight + deviation } : undefined) }}
        {...props}
        {...contextPropIfNotDomElement(ScrollerComponent, context)}
      >
        {children}
      </ScrollerComponent>
    )
  })
  return Scroller
}

const Viewport: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ctx = React.useContext(VirtuosoMockContext)
  const viewportHeight = usePublisher('viewportHeight')
  const fixedItemHeight = usePublisher('fixedItemHeight')
  const alignToBottom = useEmitterValue('alignToBottom')

  const horizontalDirection = useEmitterValue('horizontalDirection')
  const viewportSizeCallbackMemo = React.useMemo(
    () => u.compose(viewportHeight, (el: HTMLElement) => correctItemSize(el, horizontalDirection ? 'width' : 'height')),
    [viewportHeight, horizontalDirection]
  )
  const viewportRef = useSize(viewportSizeCallbackMemo, true, useEmitterValue('skipAnimationFrameInResizeObserver'))

  React.useEffect(() => {
    if (ctx) {
      viewportHeight(ctx.viewportHeight)
      fixedItemHeight(ctx.itemHeight)
    }
  }, [ctx, viewportHeight, fixedItemHeight])

  return (
    <div
      data-viewport-type="element"
      ref={viewportRef}
      style={{ ...viewportStyle(alignToBottom), ...(horizontalDirection ? { whiteSpace: 'nowrap' } : {}) }}
    >
      {children}
    </div>
  )
}

const WindowViewport: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ctx = React.useContext(VirtuosoMockContext)
  const windowViewportRect = usePublisher('windowViewportRect')
  const fixedItemHeight = usePublisher('fixedItemHeight')
  const customScrollParent = useEmitterValue('customScrollParent')
  const useWindowScroll = useEmitterValue('useWindowScroll')
  const topListHeight = useEmitterValue('topListHeight')
  const viewportRef = useWindowViewportRectRef(
    windowViewportRect,
    customScrollParent,
    useEmitterValue('skipAnimationFrameInResizeObserver')
  )
  const alignToBottom = useEmitterValue('alignToBottom')

  React.useEffect(() => {
    if (ctx) {
      fixedItemHeight(ctx.itemHeight)
      windowViewportRect({ listHeight: 0, offsetTop: 0, visibleHeight: ctx.viewportHeight, visibleWidth: 100 })
    }
  }, [ctx, windowViewportRect, fixedItemHeight])

  return (
    <div data-viewport-type="window" ref={viewportRef} style={windowViewportStyle(alignToBottom, useWindowScroll, topListHeight)}>
      {children}
    </div>
  )
}

const TopItemListContainer: React.FC<React.PropsWithChildren> = ({ children }) => {
  const TopItemList = useEmitterValue('TopItemListComponent') ?? 'div'
  const headerHeight = useEmitterValue('headerHeight')
  const style = { ...topItemListStyle, marginTop: `${headerHeight}px` }
  const context = useEmitterValue('context')
  return (
    <TopItemList style={style} {...contextPropIfNotDomElement(TopItemList, context)}>
      {children}
    </TopItemList>
  )
}

const ListRoot: React.FC<ListRootProps> = /*#__PURE__*/ React.memo(function VirtuosoRoot(props) {
  const useWindowScroll = useEmitterValue('useWindowScroll')
  const showTopList = useEmitterValue('topItemsIndexes').length > 0
  const customScrollParent = useEmitterValue('customScrollParent')
  const context = useEmitterValue('context')
  const TheScroller = customScrollParent || useWindowScroll ? WindowScroller : Scroller
  const TheViewport = customScrollParent || useWindowScroll ? WindowViewport : Viewport
  return (
    <TheScroller {...props} context={context}>
      {showTopList && (
        <TopItemListContainer>
          <Items showTopList={true} />
        </TopItemListContainer>
      )}
      <TheViewport>
        <Header />
        <Items />
        <Footer />
      </TheViewport>
    </TheScroller>
  )
})

export const {
  Component: List,
  useEmitter,
  useEmitterValue,
  useEmitterValues,
  usePublisher,
} = /*#__PURE__*/ systemToComponent(
  combinedSystem,
  {
    optional: {
      restoreStateFrom: 'restoreStateFrom',
      recycling: 'recycling',
      getItemType: 'getItemType',
      context: 'context',
      followOutput: 'followOutput',
      scrollIntoViewOnChange: 'scrollIntoViewOnChange',
      itemContent: 'itemContent',
      groupContent: 'groupContent',
      overscan: 'overscan',
      increaseViewportBy: 'increaseViewportBy',
      minOverscanItemCount: 'minOverscanItemCount',
      totalCount: 'totalCount',
      groupCounts: 'groupCounts',
      topItemCount: 'topItemCount',
      firstItemIndex: 'firstItemIndex',
      initialTopMostItemIndex: 'initialTopMostItemIndex',
      components: 'components',
      atBottomThreshold: 'atBottomThreshold',
      atTopThreshold: 'atTopThreshold',
      computeItemKey: 'computeItemKey',
      defaultItemHeight: 'defaultItemHeight',
      fixedGroupHeight: 'fixedGroupHeight', // Must be set above 'fixedItemHeight'
      fixedItemHeight: 'fixedItemHeight',
      heightEstimates: 'heightEstimates',
      itemSize: 'itemSize',
      scrollSeekConfiguration: 'scrollSeekConfiguration',
      headerFooterTag: 'HeaderFooterTag',
      data: 'data',
      initialItemCount: 'initialItemCount',
      initialScrollTop: 'initialScrollTop',
      alignToBottom: 'alignToBottom',
      useWindowScroll: 'useWindowScroll',
      customScrollParent: 'customScrollParent',
      scrollerRef: 'scrollerRef',
      logLevel: 'logLevel',
      horizontalDirection: 'horizontalDirection',
      initialGeometry: 'initialGeometry',
      skipAnimationFrameInResizeObserver: 'skipAnimationFrameInResizeObserver',
    },
    methods: {
      scrollToIndex: 'scrollToIndex',
      scrollIntoView: 'scrollIntoView',
      scrollTo: 'scrollTo',
      scrollBy: 'scrollBy',
      autoscrollToBottom: 'autoscrollToBottom',
      getState: 'getState',
    },
    events: {
      isScrolling: 'isScrolling',
      endReached: 'endReached',
      startReached: 'startReached',
      rangeChanged: 'rangeChanged',
      atBottomStateChange: 'atBottomStateChange',
      atTopStateChange: 'atTopStateChange',
      totalListHeightChanged: 'totalListHeightChanged',
      itemsRendered: 'itemsRendered',
      groupIndices: 'groupIndices',
    },
  },
  ListRoot,
  useRecyclingSystemBinding
)

const Scroller = /*#__PURE__*/ buildScroller({ useEmitter, useEmitterValue, usePublisher }, true)
const WindowScroller = /*#__PURE__*/ buildWindowScroller({ useEmitter, useEmitterValue, usePublisher })

/**
 * A virtualized list component for efficiently rendering large datasets.
 * Automatically measures and handles variable-sized items without configuration.
 *
 * @typeParam ItemData - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link VirtuosoProps}
 *
 * @function
 * @group Virtuoso
 *
 * @example
 * ```tsx
 * <Virtuoso
 *   totalCount={1000}
 *   itemContent={(index) => <div>Item {index}</div>}
 * />
 * ```
 *
 * @see {@link VirtuosoProps} for available props
 * @see {@link VirtuosoHandle} for imperative methods
 */
export const Virtuoso = List as <ItemData = any, Context = any>(
  props: VirtuosoProps<ItemData, Context> & { ref?: React.Ref<VirtuosoHandle> }
) => React.ReactElement

/**
 * A virtualized list component for rendering grouped data with sticky group headers.
 * Extends Virtuoso with support for collapsible groups and group-level navigation.
 *
 * @typeParam ItemData - The type of data items in the list
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link GroupedVirtuosoProps}
 *
 * @function
 * @group GroupedVirtuoso
 *
 * @example
 * ```tsx
 * <GroupedVirtuoso
 *   groupCounts={[10, 20, 15]}
 *   groupContent={(index) => <div>Group {index}</div>}
 *   itemContent={(index, groupIndex) => <div>Item {index} in group {groupIndex}</div>}
 * />
 * ```
 *
 * @see {@link GroupedVirtuosoProps} for available props
 * @see {@link GroupedVirtuosoHandle} for imperative methods
 */
export const GroupedVirtuoso = List as <ItemData = any, Context = any>(
  props: GroupedVirtuosoProps<ItemData, Context> & { ref?: React.Ref<GroupedVirtuosoHandle> }
) => React.ReactElement
