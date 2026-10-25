import React from 'react'

import * as u from '../urx'
import { RecyclingIntegrationContext } from './integration'

interface GridSystem {
  recycling: u.StatefulStream<boolean | undefined>
  getItemType: u.StatefulStream<((item: any, index: number) => string | number | undefined) | undefined>
  integrationFocusedKey: u.StatefulStream<React.Key | null>
}

/** Grid geometry stays in gridSystem; this binds adapter focus and prop defaults. */
export function useGridRecyclingBinding() {
  const controller = React.useContext(RecyclingIntegrationContext)
  return React.useMemo(
    () => ({
      apply(system: GridSystem, props?: Record<string, unknown>) {
        if (props && !('recycling' in props)) {
          u.publish(system.recycling, undefined)
        }
        if (props && !('getItemType' in props)) {
          u.publish(system.getItemType, undefined)
        }
        u.publish(system.integrationFocusedKey, controller?.getSnapshot().focusedKey ?? null)
      },
      subscribe(system: GridSystem) {
        return controller?.subscribe(() => u.publish(system.integrationFocusedKey, controller.getSnapshot().focusedKey)) ?? u.noop
      },
    }),
    [controller]
  )
}
