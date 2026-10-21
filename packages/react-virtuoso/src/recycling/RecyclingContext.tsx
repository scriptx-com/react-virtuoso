import React from 'react'

/** One committed assignment of a physical cell to a logical item. */
export interface RecyclingAssignment {
  logicalKey: React.Key
  slotId: number
  generation: number
  active: boolean
  /** List-local identity also fences nested lists with overlapping keys. */
  scope: object
}

export const RecyclingContext = React.createContext<RecyclingAssignment | null>(null)

export function useRecyclingContext() {
  return React.useContext(RecyclingContext)
}

export function useRecyclingActivity() {
  return useRecyclingContext()?.active ?? true
}
