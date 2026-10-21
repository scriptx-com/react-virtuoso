import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'
import { useRecyclingContext } from './RecyclingContext'

import type { RecyclingAssignment } from './RecyclingContext'

function sameAssignment(a: RecyclingAssignment | null, b: RecyclingAssignment | null) {
  return a?.scope === b?.scope && a?.slotId === b?.slotId && a?.logicalKey === b?.logicalKey && a?.generation === b?.generation
}

/**
 * Reset item-local state in the replacement render, before it can commit.
 * Refs and arbitrary consumer effects still need logical identity dependencies.
 */
export function useRecyclingState<T>(
  initializer: () => T,
  resetDependencies: readonly unknown[]
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const assignment = useRecyclingContext()
  const active = assignment?.active ?? true
  const fresh = () => ({ assignment, dependencies: [...resetDependencies], identity: {}, value: initializer() })
  const [stored, setStored] = React.useState(fresh)
  let current = stored
  if (
    !sameAssignment(stored.assignment, assignment) ||
    stored.dependencies.length !== resetDependencies.length ||
    stored.dependencies.some((value, index) => !Object.is(value, resetDependencies[index]))
  ) {
    current = fresh()
    // React discards this render-phase update if the candidate render is abandoned.
    setStored(current)
  }
  const identity = current.identity
  const committed = React.useRef<{ identity: object; active: boolean } | null>(null)
  useIsomorphicLayoutEffect(() => {
    committed.current = { identity, active }
    return () => {
      committed.current = null
    }
  }, [identity, active])
  const update = React.useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (value) => {
      if (committed.current?.identity !== identity || !committed.current.active) {
        return
      }
      setStored((previous) => {
        if (previous.identity !== identity) {
          return previous
        }
        const next = typeof value === 'function' ? (value as (previous: T) => T)(previous.value) : value
        return Object.is(next, previous.value) ? previous : { ...previous, value: next }
      })
    },
    [identity]
  )
  return [current.value, update]
}
