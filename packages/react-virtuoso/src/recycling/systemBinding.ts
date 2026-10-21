import React from 'react'

import * as u from '../urx'
import { RecyclingIntegrationContext } from './integration'
import { useRecyclingActivity } from './RecyclingContext'

import type { ContentInsets, PixelWindow } from './integration'
import type { KnownLayout } from './layout'

interface RecyclingSystem {
  contentInsets: u.StatefulStream<ContentInsets>
  propsReady: u.StatefulStream<boolean>
  recycling: u.StatefulStream<boolean | undefined>
  getItemType: u.StatefulStream<((item: any, index: number) => number | string | undefined) | undefined>
  applyKnownLayout: u.Stream<KnownLayout | undefined>
  recyclingWindow: u.StatefulStream<PixelWindow | undefined>
  integrationFocusedKey: u.StatefulStream<React.Key | null>
  recyclingActive: u.StatefulStream<boolean>
}

const EMPTY_INSETS = { start: 0, end: 0 }
const appliedLayouts = new WeakMap<RecyclingSystem, KnownLayout | undefined>()

export function useRecyclingSystemBinding() {
  const controller = React.useContext(RecyclingIntegrationContext)
  const active = useRecyclingActivity()
  return React.useMemo(() => {
    const apply = (system: RecyclingSystem, props?: Record<string, unknown>) => {
      // These newly introduced props return to their defaults when removed.
      // Leave existing urx prop-retention semantics unchanged for older APIs.
      if (props) {
        if (!('recycling' in props)) {
          u.publish(system.recycling, undefined)
        }
        if (!('getItemType' in props)) {
          u.publish(system.getItemType, undefined)
        }
      }
      const snapshot = controller?.getSnapshot()
      const layout = active ? snapshot?.knownLayout : appliedLayouts.get(system)
      if (appliedLayouts.get(system) !== layout) {
        appliedLayouts.set(system, layout)
        u.publish(system.applyKnownLayout, layout)
      }
      if (active) {
        u.publish(system.contentInsets, snapshot?.contentInsets ?? EMPTY_INSETS)
        u.publish(system.recyclingWindow, snapshot?.window)
        u.publish(system.integrationFocusedKey, snapshot?.focusedKey ?? null)
      }
      u.publish(system.recyclingActive, active)
    }
    return {
      apply,
      subscribe(system: RecyclingSystem) {
        if (!controller || !active) {
          return u.noop
        }
        return controller.subscribe(() => {
          const ready = u.getValue(system.propsReady)
          u.publish(system.propsReady, false)
          apply(system)
          u.publish(system.propsReady, ready)
        })
      },
    }
  }, [controller, active])
}
