import { alignToBottomSystem } from './alignToBottomSystem'
import { followOutputSystem } from './followOutputSystem'
import { scrollSeekSystem } from './scrollSeekSystem'
import { stateFlagsSystem } from './stateFlagsSystem'
import * as u from './urx'
import { windowScrollerSystem } from './windowScrollerSystem'

import type { AnySystemSpec } from './urx/system'

const replacements = new Map<AnySystemSpec, AnySystemSpec>([
  [alignToBottomSystem, u.system(() => ({ alignToBottom: u.statefulStream(false), paddingTopAddition: u.statefulStream(0) }))],
  [
    scrollSeekSystem,
    u.system(
      ([{ scrollVelocity }]) => ({
        isSeeking: u.statefulStream(false),
        scrollSeekConfiguration: u.statefulStream(false),
        scrollSeekRangeChanged: u.stream(),
        scrollVelocity,
      }),
      u.tup(stateFlagsSystem)
    ),
  ],
  [
    followOutputSystem,
    u.system(() => ({
      followOutput: u.statefulStream(false),
      autoscrollToBottom: u.stream(),
      scrollIntoViewOnChange: u.statefulStream(null),
    })),
  ],
  [
    windowScrollerSystem,
    u.system(() => ({
      useWindowScroll: u.statefulStream(false),
      customScrollParent: u.statefulStream(undefined),
      windowScrollContainerState: u.stream(),
      windowViewportRect: u.stream(),
      windowScrollTo: u.stream(),
    })),
  ],
])
const clones = new Map<AnySystemSpec, AnySystemSpec>()
function clone(spec: AnySystemSpec): AnySystemSpec {
  const cached = clones.get(spec)
  if (cached) {
    return cached
  }
  const source = replacements.get(spec) ?? spec
  const result = { ...source, dependencies: source.dependencies.map(clone) }
  clones.set(spec, result)
  return result
}
export function minimalRailSystem<SS extends AnySystemSpec>(spec: SS): SS {
  return clone(spec) as SS
}
