import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'
import { useRecyclingContext } from './RecyclingContext'

/** Fences callbacks against the committed logical owner of a reusable host. */
export function useRecyclingLifetime(logicalKey?: string) {
  const assignment = useRecyclingContext()
  const committed = React.useRef<object | null>(null)
  const active = assignment?.active ?? true
  const recycled = assignment !== null
  const lifetime = React.useMemo(() => {
    const owner = {
      active,
      recycled,
      isCurrent: () => active && committed.current === owner,
    }
    return owner
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Logical identity changes deliberately retire callback ownership.
  }, [logicalKey, assignment?.logicalKey, assignment?.generation, assignment?.scope, active, recycled])
  useIsomorphicLayoutEffect(() => {
    committed.current = lifetime
    return () => {
      committed.current = null
    }
  }, [lifetime])
  return lifetime
}
