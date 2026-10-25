# Recycling compatible cells

Ordinary ungrouped lists recycle compatible cells by default, in either axis.
Set `recycling={false}` to retain logical React keys and ordinary unmounting.
Optional `getItemType(item, index)` separates incompatible cell implementations.
Use stable `computeItemKey` values when data can move or be replaced.

Grouped/top-item, inverse, bottom-aligned, follow-output, scroll-seek, window and
custom-scroll-parent modes retain ordinary virtualization. Explicitly requesting
recycling in these modes produces one development warning. Unknown initial
geometry and SSR use natural flow until the first offsets are available.

## Item lifecycle

Physical cells can survive a change of logical item. `useRecyclingContext()`
exposes the current logical key, slot ID, assignment generation and activity.
`useRecyclingState(() => initialValue, dependencies)` resets local state before a
replacement commits and rejects setters belonging to an obsolete assignment.
It behaves as ordinary state outside a recycled cell.

The state hook does not manage arbitrary refs, effects or subscriptions. Include
logical identity and `useRecyclingActivity()` in those lifecycles: release timers,
subscriptions and async ownership when inactive or reassigned, and refresh data
when active again. Use descendant React keys for content that must remount.
Keys retain their ordinary React semantics.

Custom Item and List hosts must forward the supplied ref, attributes, handlers
and sizing/positioning styles. Merge custom styles without replacing positioning.
Active cells remain in logical DOM order. Idle cells are hidden, excluded from
measurement and accessibility, and bounded by the current required item count.
Only the currently focused out-of-window cell can be retained as an exception.
Nested lists discard idle reserves and suspend measurement and scroll listeners
while their ancestor is inactive; consumer subscriptions require the activity
handling described above.

## Integration geometry

`RecyclingIntegrationProvider` and `createRecyclingController()` let adapters
supply draw distance, exact layout ranges and the current logical focus key.
The ordinary standalone overscan APIs still work without a controller.
Publish dependent changes in `controller.batch()`. Exact layout belongs to one
dataset/layout revision; replace it together with dependent data. Estimates are
never exact geometry. Active unknown-size cells retain direct resize observation.

The controller is an adapter boundary, not additional application list props.
Recycling reduces mounts; its effect on frame time must be measured with the
application's real content and device.

`controller.setDrawDistance(pixels)` enables the fork-owned adaptive window.
Virtuoso uses its existing normalized scroll offset, viewport and total-size
streams, plus render-to-commit duration, to project the window in the direction
of travel. No adapter scroll listener or viewport observer is needed. Explicit
zero is retained; `undefined` returns to ordinary overscan. Parked lists freeze
their window and reset velocity when reactivated. Dataset and orientation changes
also reset prediction. This applies to ordinary virtualization as well as recycling.

`setWindow()` remains an explicit override for custom integrations. Clearing it
resumes the configured draw-distance policy. Adapters should only translate their
public options and publish geometry/focus ownership, not calculate scroll windows.

`useRecyclingController()` owns adapter controller transactions when the dataset,
axis, exact layout or content insets change. It carries the committed focus key
forward; draw-distance-only updates keep the controller stable. Adapters choose
their default pixel distance before calling it.

`useRecyclingLifetime(logicalKey?)` provides committed callback ownership for
consumer effects and event handlers. `isCurrent()` rejects retired or parked
owners. `RecyclingContext` is available for custom integration scopes.

Nested evaluators call `usePendingMeasurement(pending)` while their geometry is
incomplete. Virtuoso owns the readiness boundary on vertical item hosts in both
ordinary and recycled rendering, without adding DOM wrappers. Registrations
propagate through nested rows; the last release requests a fresh measurement.
This signals geometry readiness, not arbitrary network loading.
