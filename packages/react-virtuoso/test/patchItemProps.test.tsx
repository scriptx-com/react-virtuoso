import React, { act } from 'react'

import { createRoot } from 'react-dom/client'
/* eslint-disable require-await -- Async act drains React work after synchronous publication. */
import { beforeEach, afterEach, it, expect } from 'vitest'

import { Virtuoso, GroupedVirtuoso, VirtuosoMockContext } from '../src'

import type { ItemProps } from '../src'
import type { Root } from 'react-dom/client'
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const dimensions = { viewportHeight: 300, itemHeight: 30 }
const data = Array.from({ length: 4 }, (_, index) => Object.freeze({ id: `item-${index}` }))
type Item = (typeof data)[number]
const received: (ItemProps<Item> & { context?: string | undefined })[] = []
const ItemComponent = React.forwardRef<HTMLDivElement, ItemProps<Item> & { context?: string | undefined }>(
  ({ item, context, ...props }, ref) => {
    received.push({ ...props, item, context })
    return <div {...props} ref={ref} data-item-id={item.id} data-context={context} />
  }
)
ItemComponent.displayName = 'MeasuredItem'
const components = { Item: ItemComponent }
const computeItemKey = (_: number, item: Item) => item.id
const itemContent = (index: number, item: Item, context: string) => `${context}:${index}:${item.id}`
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  received.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it('preserves custom item data, context, key identity and shifted indices', async () => {
  const render = async (context: string) => {
    await act(async () =>
      root.render(
        <VirtuosoMockContext.Provider value={dimensions}>
          <Virtuoso
            data={data}
            firstItemIndex={100}
            context={context}
            components={components}
            computeItemKey={computeItemKey}
            itemContent={itemContent}
          />
        </VirtuosoMockContext.Provider>
      )
    )
  }
  await render('home')
  const first = container.querySelector('[data-item-id="item-0"]')
  expect(first?.getAttribute('data-index')).toBe('0')
  expect(first?.getAttribute('data-item-index')).toBe('100')
  expect(first?.textContent).toBe('home:100:item-0')
  expect(received.find((props) => props.item.id === 'item-0')?.item).toBe(data[0])
  await render('updated')
  expect(container.querySelector('[data-item-id="item-0"]')).toBe(first)
  expect(first?.getAttribute('data-context')).toBe('updated')
  expect(first?.textContent).toBe('updated:100:item-0')
})

it('keeps grouped item and group indices distinct', async () => {
  await act(async () =>
    root.render(
      <VirtuosoMockContext.Provider value={dimensions}>
        <GroupedVirtuoso
          groupCounts={[2, 2]}
          context="grouped"
          groupContent={(index) => `group ${index}`}
          itemContent={(index, group) => `${group}:${index}`}
        />
      </VirtuosoMockContext.Provider>
    )
  )
  const item = container.querySelector('[data-item-group-index="1"]')
  expect(item?.getAttribute('data-index')).toBe('4')
  expect(item?.getAttribute('data-item-index')).toBe('2')
  expect(item?.getAttribute('data-item-group-index')).toBe('1')
  expect(item?.textContent).toBe('1:2')
  expect(data[2]).toEqual({ id: 'item-2' })
})
