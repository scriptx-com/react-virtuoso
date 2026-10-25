import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'
import { createRecyclingController } from './integration'

import type { RecyclingController } from './integration'
import type { KnownLayout } from './layout'

export function useRecyclingController({
  data,
  horizontal,
  drawDistance,
  knownLayout,
  contentStart = 0,
  contentEnd = 0,
}: {
  data: readonly unknown[] | undefined
  horizontal: boolean
  drawDistance?: number | undefined
  knownLayout?: KnownLayout
  contentStart?: number
  contentEnd?: number
}) {
  const committedController = React.useRef<RecyclingController | null>(null)
  const bridge = React.useMemo(() => {
    const controller = createRecyclingController()
    controller.batch(() => {
      controller.setKnownLayout(knownLayout)
      controller.setContentInsets({ start: contentStart, end: contentEnd })
      controller.setFocusedItem(committedController.current?.getSnapshot().focusedKey ?? null)
    })
    return { controller }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Dataset and axis changes start a fresh integration transaction.
  }, [data, horizontal, knownLayout, contentStart, contentEnd])

  useIsomorphicLayoutEffect(() => {
    committedController.current = bridge.controller
  }, [bridge])

  useIsomorphicLayoutEffect(() => {
    bridge.controller.setDrawDistance(drawDistance)
  }, [bridge, drawDistance])

  return bridge.controller
}
