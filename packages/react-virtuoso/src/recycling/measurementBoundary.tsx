import React from 'react'

import useIsomorphicLayoutEffect from '../hooks/useIsomorphicLayoutEffect'

const PENDING = 'data-virtuoso-measurement-pending'
const READY = 'virtuoso-measurement-ready'

interface Boundary {
  register: () => () => void
}
export const MeasurementBoundaryContext = React.createContext<Boundary | null>(null)

export function useMeasurementBoundary(host: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const parent = React.useContext(MeasurementBoundaryContext)
  const boundary = React.useMemo(() => {
    let count = 0
    let attached = false
    let releaseParent: (() => void) | undefined
    let revision = 0
    const update = () => {
      const currentRevision = ++revision
      if (count > 0) {
        releaseParent ??= parent?.register()
        if (attached) {
          host.current?.setAttribute(PENDING, '')
        }
        return
      }
      // Effect cleanup and the replacement registration can share a commit.
      void Promise.resolve().then(() => {
        if (revision !== currentRevision || count > 0) {
          return
        }
        releaseParent?.()
        releaseParent = undefined
        const element = attached ? host.current : null
        if (element?.hasAttribute(PENDING) === true) {
          element.removeAttribute(PENDING)
          element.dispatchEvent(new Event(READY, { bubbles: true }))
        }
      })
    }
    return {
      register() {
        let released = false
        count++
        update()
        return () => {
          if (released) {
            return
          }
          released = true
          count--
          update()
        }
      },
      attach() {
        attached = true
        update()
        return () => {
          attached = false
          revision++
          releaseParent?.()
          releaseParent = undefined
        }
      },
    }
  }, [host, parent])
  useIsomorphicLayoutEffect(() => {
    return enabled ? boundary.attach() : undefined
  }, [boundary, enabled])
  return enabled ? boundary : parent
}

export function usePendingMeasurement(pending: boolean) {
  const boundary = React.useContext(MeasurementBoundaryContext)
  useIsomorphicLayoutEffect(() => {
    return pending ? boundary?.register() : undefined
  }, [boundary, pending])
}

/** Adds readiness coordination to a custom item host without another DOM element. */
export function MeasurementItem({
  component: Component,
  enabled,
  ...props
}: {
  component: React.ElementType
  enabled: boolean
  [key: string]: any
}) {
  const host = React.useRef<HTMLElement | null>(null)
  const boundary = useMeasurementBoundary(host, enabled)
  return (
    <MeasurementBoundaryContext.Provider value={boundary}>
      <Component {...props} ref={host} />
    </MeasurementBoundaryContext.Provider>
  )
}
