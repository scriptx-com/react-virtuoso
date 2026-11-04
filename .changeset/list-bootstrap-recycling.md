---
'@scriptx-com/react-virtuoso': patch
---

Recycle `Virtuoso` list cells from the initial measurement pass. Cells mounted before the first offsets stay in natural flow and keep their hosts when measurement arrives, instead of mounting a second time in the recycled list.
