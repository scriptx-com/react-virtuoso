import React from 'react'

export type CallbackRefParam = HTMLElement | null

export default function useSize(callback: (e: HTMLElement) => void, enabled: boolean, skipAnimationFrame: boolean) {
  return useSizeWithElRef(callback, enabled, skipAnimationFrame).callbackRef
}

export function useSizeWithElRef(callback: (e: HTMLElement) => void, enabled: boolean, skipAnimationFrame: boolean) {
  const ref = React.useRef<CallbackRefParam>(null)
  const owner = React.useRef<ResizeObserver | null>(null)

  const observer = React.useMemo(() => {
    if (typeof ResizeObserver !== 'undefined') {
      const instance = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const code = () => {
          const element = entries[0]!.target as HTMLElement
          if (owner.current === instance && ref.current === element && element.offsetParent !== null) {
            callback(element)
          }
        }
        skipAnimationFrame ? code() : requestAnimationFrame(code)
      })
      return instance
    }
    return null
  }, [callback, skipAnimationFrame])

  const callbackRef = React.useCallback(
    (el: CallbackRefParam) => {
      const next = el && enabled ? el : null
      if (ref.current === next) {
        return
      }
      if (ref.current) {
        observer?.unobserve(ref.current)
      }
      ref.current = next
      owner.current = next ? observer : null
      if (next) {
        observer?.observe(next)
      }
    },
    [observer, enabled]
  )

  return { callbackRef, ref }
}
