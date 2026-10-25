import React from 'react'

import { gridSystem, itemsPerRow } from './gridSystem'
import useIsomorphicLayoutEffect from './hooks/useIsomorphicLayoutEffect'
import useSize from './hooks/useSize'
import useWindowViewportRectRef from './hooks/useWindowViewportRect'
import { LogLevel } from './loggerSystem'
import { systemToComponent } from './react-urx'
import { useGridRecyclingBinding } from './recycling/gridBinding'
import { RecycledGridItems } from './recycling/RecycledGridItems'
import * as u from './urx'
import { VirtuosoGridMockContext } from './utils/context'
import { correctItemSize } from './utils/correctItemSize'
import { buildScroller, buildWindowScroller, contextPropIfNotDomElement, identity, viewportStyle, windowViewportStyle } from './Virtuoso'

import type { VirtuosoGridHandle, VirtuosoGridProps } from './component-interfaces/VirtuosoGrid'
import type { GridComponents, GridComputeItemKey, GridItemContent, GridRootProps } from './interfaces'
import type { Log } from './loggerSystem'

const gridComponentPropsSystem = /*#__PURE__*/ u.system(() => {
  const recycling = u.statefulStream<boolean | undefined>(undefined)
  const getItemType = u.statefulStream<((item: any, index: number) => string | number | undefined) | undefined>(undefined)
  const integrationFocusedKey = u.statefulStream<React.Key | null>(null)
  const itemContent = u.statefulStream<GridItemContent<any, any>>((index) => `Item ${index}`)
  const components = u.statefulStream<GridComponents>({})
  const context = u.statefulStream<unknown>(null)
  const itemClassName = u.statefulStream('virtuoso-grid-item')
  const listClassName = u.statefulStream('virtuoso-grid-list')
  const computeItemKey = u.statefulStream<GridComputeItemKey<any, any>>(identity)
  const headerFooterTag = u.statefulStream('div')
  const scrollerRef = u.statefulStream<(ref: HTMLElement | null) => void>(u.noop)

  const distinctProp = <K extends keyof GridComponents>(propName: K, defaultValue: 'div' | GridComponents[K] | null = null) => {
    return u.statefulStreamFromEmitter(
      u.pipe(
        components,
        u.map((components) => components[propName]),
        u.distinctUntilChanged()
      ),
      defaultValue
    )
  }

  const readyStateChanged = u.statefulStream(false)

  const reportReadyState = u.statefulStream(false)
  u.connect(u.duc(reportReadyState), readyStateChanged)

  return {
    components,
    recycling,
    getItemType,
    integrationFocusedKey,
    computeItemKey,
    context,
    FooterComponent: distinctProp('Footer'),
    HeaderComponent: distinctProp('Header'),
    headerFooterTag,
    itemClassName,
    ItemComponent: distinctProp('Item', 'div'),
    itemContent,
    listClassName,
    ListComponent: distinctProp('List', 'div'),
    readyStateChanged,
    reportReadyState,
    ScrollerComponent: distinctProp('Scroller', 'div'),
    scrollerRef,
    ScrollSeekPlaceholder: distinctProp('ScrollSeekPlaceholder', 'div'),
  }
})

const combinedSystem = /*#__PURE__*/ u.system(
  ([gridSystem, gridComponentPropsSystem]) => {
    return { ...gridSystem, ...gridComponentPropsSystem }
  },
  u.tup(gridSystem, gridComponentPropsSystem)
)

const GridItems: React.FC = /*#__PURE__*/ React.memo(function GridItems() {
  const gridState = useEmitterValue('gridState')
  const recycling = useEmitterValue('recycling')
  const getItemType = useEmitterValue('getItemType')
  const data = useEmitterValue('data')
  const totalCount = useEmitterValue('totalCount')
  const viewport = useEmitterValue('viewportDimensions')
  const gap = useEmitterValue('gap')
  const integrationFocusedKey = useEmitterValue('integrationFocusedKey')
  const [placement, setPlacement] = React.useState({ left: 0, top: 0, reverse: false })
  const [domFocusedKey, setDomFocusedKey] = React.useState<React.Key | null>(null)
  const recycle = recycling !== false && gridState.itemWidth > 0 && gridState.itemHeight > 0

  const listClassName = useEmitterValue('listClassName')
  const itemClassName = useEmitterValue('itemClassName')
  const itemContent = useEmitterValue('itemContent')
  const computeItemKey = useEmitterValue('computeItemKey')
  const isSeeking = useEmitterValue('isSeeking')
  const scrollHeightCallback = usePublisher('scrollHeight')
  const ItemComponent = useEmitterValue('ItemComponent')!
  const ListComponent = useEmitterValue('ListComponent')!
  const ScrollSeekPlaceholder = useEmitterValue('ScrollSeekPlaceholder')!
  const context = useEmitterValue('context')
  const itemDimensions = usePublisher('itemDimensions')
  const gridGap = usePublisher('gap')
  const log = useEmitterValue('log')
  const stateRestoreInProgress = useEmitterValue('stateRestoreInProgress')
  const reportReadyState = usePublisher('reportReadyState')

  const listRef = useSize(
    React.useMemo(
      () => (el) => {
        const scrollHeight = el.parentElement!.parentElement!.scrollHeight
        scrollHeightCallback(scrollHeight)
        // Only direct visible hosts count: a parked cell may contain another grid.
        const firstItem = el.hasAttribute('data-recycling-grid')
          ? (Array.from(el.children).find((child) => child.hasAttribute('data-grid-visible')) as HTMLElement | undefined)
          : (el.firstElementChild as HTMLElement | null)
        const css = getComputedStyle(el)
        const columnGap = resolveGapValue('column-gap', css.columnGap, log)
        const rowGap = resolveGapValue('row-gap', css.rowGap, log)
        if (firstItem) {
          const { height, width } = firstItem.getBoundingClientRect()
          itemDimensions({ height, width })
          const columns = itemsPerRow(el.clientWidth, width, columnGap)
          const index = Number(firstItem.dataset.index ?? 0)
          const reverse = (css.direction === 'rtl') !== (css.flexDirection === 'row-reverse')
          const next = {
            left: firstItem.offsetLeft - (index % columns) * (width + columnGap) * (reverse ? -1 : 1),
            top: firstItem.offsetTop - Math.floor(index / columns) * (height + rowGap),
            reverse,
          }
          setPlacement((previous) =>
            previous.left === next.left && previous.top === next.top && previous.reverse === next.reverse ? previous : next
          )
        }
        gridGap({
          column: columnGap,
          row: rowGap,
        })
      },
      [scrollHeightCallback, itemDimensions, gridGap, log]
    ),
    true,
    false
  )

  useIsomorphicLayoutEffect(() => {
    if (gridState.itemHeight > 0 && gridState.itemWidth > 0) {
      reportReadyState(true)
    }
  }, [gridState])

  if (stateRestoreInProgress) {
    return null
  }

  return (
    <ListComponent
      className={listClassName}
      ref={listRef}
      {...contextPropIfNotDomElement(ListComponent, context)}
      data-testid="virtuoso-item-list"
      data-recycling-grid={recycle && !isSeeking ? '' : undefined}
      onFocusCapture={(event: React.FocusEvent<HTMLElement>) => {
        let node = event.target as HTMLElement | null
        let index: number | undefined
        while (node && node !== event.currentTarget) {
          if (node.parentElement === event.currentTarget && node.hasAttribute('data-recycling-slot') && node.hasAttribute('data-index')) {
            index = Number(node.dataset.index)
          }
          node = node.parentElement
        }
        if (index !== undefined) {
          setDomFocusedKey(computeItemKey(index, data?.[index], context))
        }
      }}
      onBlurCapture={(event: React.FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDomFocusedKey(null)
        }
      }}
      style={{ position: 'relative', paddingBottom: gridState.offsetBottom, paddingTop: gridState.offsetTop }}
    >
      {recycle && !isSeeking ? (
        <RecycledGridItems
          placement={placement}
          state={gridState}
          data={data}
          totalCount={totalCount}
          columns={itemsPerRow(viewport.width, gridState.itemWidth, gap.column)}
          rowGap={gap.row}
          columnGap={gap.column}
          focusedKey={integrationFocusedKey ?? domFocusedKey}
          computeItemKey={computeItemKey}
          getItemType={getItemType}
          itemContent={itemContent}
          ItemComponent={ItemComponent}
          className={itemClassName}
          context={context}
        />
      ) : (
        gridState.items.map((item) => {
          const key = computeItemKey(item.index, item.data, context)
          return isSeeking ? (
            <ScrollSeekPlaceholder
              key={key}
              {...contextPropIfNotDomElement(ScrollSeekPlaceholder, context)}
              height={gridState.itemHeight}
              index={item.index}
              width={gridState.itemWidth}
            />
          ) : (
            <ItemComponent
              {...contextPropIfNotDomElement(ItemComponent, context)}
              className={itemClassName}
              data-index={item.index}
              key={key}
            >
              {itemContent(item.index, item.data, context)}
            </ItemComponent>
          )
        })
      )}
    </ListComponent>
  )
})

const Header: React.FC = React.memo(function VirtuosoHeader() {
  const Header = useEmitterValue('HeaderComponent')
  const headerHeight = usePublisher('headerHeight')
  const HeaderFooterTag = useEmitterValue('headerFooterTag') as any
  const ref = useSize(
    React.useMemo(
      () => (el) => {
        headerHeight(correctItemSize(el, 'height'))
      },
      [headerHeight]
    ),
    true,
    false
  )
  const context = useEmitterValue('context')
  return Header !== null && Header !== undefined ? (
    <HeaderFooterTag ref={ref}>
      <Header {...contextPropIfNotDomElement(Header, context)} />
    </HeaderFooterTag>
  ) : null
})

const Footer: React.FC = React.memo(function VirtuosoGridFooter() {
  const Footer = useEmitterValue('FooterComponent')
  const footerHeight = usePublisher('footerHeight')
  const HeaderFooterTag = useEmitterValue('headerFooterTag') as any
  const ref = useSize(
    React.useMemo(
      () => (el) => {
        footerHeight(correctItemSize(el, 'height'))
      },
      [footerHeight]
    ),
    true,
    false
  )
  const context = useEmitterValue('context')
  return Footer !== null && Footer !== undefined ? (
    <HeaderFooterTag ref={ref}>
      <Footer {...contextPropIfNotDomElement(Footer, context)} />
    </HeaderFooterTag>
  ) : null
})

const Viewport: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ctx = React.useContext(VirtuosoGridMockContext)
  const itemDimensions = usePublisher('itemDimensions')
  const viewportDimensions = usePublisher('viewportDimensions')

  const viewportRef = useSize(
    React.useMemo(
      () => (el: HTMLElement) => {
        viewportDimensions(el.getBoundingClientRect())
      },
      [viewportDimensions]
    ),
    true,
    false
  )

  React.useEffect(() => {
    if (ctx) {
      viewportDimensions({ height: ctx.viewportHeight, width: ctx.viewportWidth })
      itemDimensions({ height: ctx.itemHeight, width: ctx.itemWidth })
    }
  }, [ctx, viewportDimensions, itemDimensions])

  return (
    <div ref={viewportRef} style={viewportStyle(false)}>
      {children}
    </div>
  )
}

const WindowViewport: React.FC<React.PropsWithChildren> = ({ children }) => {
  const ctx = React.useContext(VirtuosoGridMockContext)
  const windowViewportRect = usePublisher('windowViewportRect')
  const itemDimensions = usePublisher('itemDimensions')
  const customScrollParent = useEmitterValue('customScrollParent')
  const useWindowScroll = useEmitterValue('useWindowScroll')
  const viewportRef = useWindowViewportRectRef(windowViewportRect, customScrollParent, false)

  React.useEffect(() => {
    if (ctx) {
      itemDimensions({ height: ctx.itemHeight, width: ctx.itemWidth })
      windowViewportRect({ listHeight: 0, offsetTop: 0, visibleHeight: ctx.viewportHeight, visibleWidth: ctx.viewportWidth })
    }
  }, [ctx, windowViewportRect, itemDimensions])

  return (
    <div ref={viewportRef} style={windowViewportStyle(false, useWindowScroll)}>
      {children}
    </div>
  )
}

const GridRoot: React.FC<GridRootProps> = /*#__PURE__*/ React.memo(function GridRoot({ ...props }) {
  const useWindowScroll = useEmitterValue('useWindowScroll')
  const customScrollParent = useEmitterValue('customScrollParent')
  const TheScroller = customScrollParent || useWindowScroll ? WindowScroller : Scroller
  const TheViewport = customScrollParent || useWindowScroll ? WindowViewport : Viewport
  const context = useEmitterValue('context')

  return (
    <TheScroller {...props} {...contextPropIfNotDomElement(TheScroller, context)}>
      <TheViewport>
        <Header />
        <GridItems />
        <Footer />
      </TheViewport>
    </TheScroller>
  )
})

const {
  Component: Grid,
  useEmitter,
  useEmitterValue,
  usePublisher,
} = /*#__PURE__*/ systemToComponent(
  combinedSystem,
  {
    optional: {
      recycling: 'recycling',
      getItemType: 'getItemType',
      context: 'context',
      totalCount: 'totalCount',
      overscan: 'overscan',
      itemContent: 'itemContent',
      components: 'components',
      computeItemKey: 'computeItemKey',
      data: 'data',
      initialItemCount: 'initialItemCount',
      scrollSeekConfiguration: 'scrollSeekConfiguration',
      headerFooterTag: 'headerFooterTag',
      listClassName: 'listClassName',
      itemClassName: 'itemClassName',
      useWindowScroll: 'useWindowScroll',
      customScrollParent: 'customScrollParent',
      scrollerRef: 'scrollerRef',
      logLevel: 'logLevel',
      restoreStateFrom: 'restoreStateFrom',
      initialTopMostItemIndex: 'initialTopMostItemIndex',
      increaseViewportBy: 'increaseViewportBy',
    },
    methods: {
      scrollTo: 'scrollTo',
      scrollBy: 'scrollBy',
      scrollToIndex: 'scrollToIndex',
    },
    events: {
      isScrolling: 'isScrolling',
      endReached: 'endReached',
      startReached: 'startReached',
      rangeChanged: 'rangeChanged',
      atBottomStateChange: 'atBottomStateChange',
      atTopStateChange: 'atTopStateChange',
      stateChanged: 'stateChanged',
      readyStateChanged: 'readyStateChanged',
    },
  },
  GridRoot,
  useGridRecyclingBinding
)

const Scroller = /*#__PURE__*/ buildScroller({ useEmitter, useEmitterValue, usePublisher })
const WindowScroller = /*#__PURE__*/ buildWindowScroller({ useEmitter, useEmitterValue, usePublisher })

function resolveGapValue(property: string, value: string | undefined, log: Log) {
  if (value !== 'normal' && value?.endsWith('px') !== true) {
    log(`${property} was not resolved to pixel value correctly`, value, LogLevel.WARN)
  }
  if (value === 'normal') {
    return 0
  }
  return parseInt(value ?? '0', 10)
}

/**
 * A virtualized grid component for efficiently rendering large datasets in a grid/masonry layout.
 * Automatically calculates visible items based on container and item dimensions.
 *
 * @typeParam ItemData - The type of data items in the grid
 * @typeParam Context - The type of additional context passed to callbacks
 *
 * @param props - {@link VirtuosoGridProps}
 *
 * @function
 * @group VirtuosoGrid
 *
 * @example
 * ```tsx
 * <VirtuosoGrid
 *   totalCount={1000}
 *   itemContent={(index) => <div className="grid-item">Item {index}</div>}
 *   listClassName="grid-container"
 * />
 * ```
 *
 * @see {@link VirtuosoGridProps} for available props
 * @see {@link VirtuosoGridHandle} for imperative methods
 * @see {@link GridComponents} for customizing grid elements
 */
export const VirtuosoGrid = Grid as unknown as <ItemData = any, Context = any>(
  props: VirtuosoGridProps<ItemData, Context> & { ref?: React.Ref<VirtuosoGridHandle> }
) => React.ReactElement
