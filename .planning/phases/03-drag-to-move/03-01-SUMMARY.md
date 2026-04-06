---
phase: 03-drag-to-move
plan: 01
subsystem: ui
tags: [drag-and-drop, html5-dnd, react, datatransfer, selection]

# Dependency graph
requires:
  - phase: 02-video-thumbnails-fix
    provides: stable asset cards with thumbnails and selection state
provides:
  - draggable AssetCard with onDragStart forwarding
  - draggable FolderCard with onDragStart prop
  - handleItemDragStart encoding selectedIds into dataTransfer via application/x-frame-move
  - container drag handlers guarded against internal drags so OS file drop still works
affects:
  - 03-02 (folder drop targets — depends on drag sources this plan provides)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom MIME type application/x-frame-move distinguishes internal item drags from OS file drops"
    - "Drag payload: JSON { ids: string[] } — carries all selected IDs or just the dragged item if unselected"
    - "Container drag guards: check e.dataTransfer.types.includes('application/x-frame-move') before activating OS overlay"

key-files:
  created: []
  modified:
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetGrid.tsx
    - src/components/files/FolderBrowser.tsx

key-decisions:
  - "Use application/x-frame-move MIME type (not text/plain) so container drag handlers can distinguish internal drags from OS drops"
  - "Drag payload carries all selectedIds when dragged item is selected, or just [itemId] when unselected"
  - "handleItemDragStart lives in FolderBrowser where selectedIds is known; AssetCard/AssetGrid just forward the event"

patterns-established:
  - "Drag source pattern: draggable={!isUploading} + onDragStart forwarded up to parent that knows selection state"
  - "Container OS-drop guard: check for application/x-frame-move in all four drag event handlers"

requirements-completed: [REQ-06]

# Metrics
duration: 8min
completed: 2026-04-04
---

# Phase 03 Plan 01: Drag Sources Summary

**HTML5 drag sources wired on AssetCard and FolderCard using application/x-frame-move MIME type, carrying selected IDs in dataTransfer payload while preserving OS file-drop and rubber-band selection**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AssetCard is now draggable (disabled during upload) and forwards onDragStart to parent via prop
- AssetGrid passes onAssetDragStart down to each card, enabling FolderBrowser to own payload logic
- FolderCard is draggable with onDragStart prop wired through
- handleItemDragStart in FolderBrowser encodes selected IDs (or single item) into dataTransfer using application/x-frame-move
- All four container drag event handlers (enter/leave/over/drop) guard against x-frame-move so the OS "Drop files or folders" overlay does not appear during internal drags

## Task Commits

Each task was committed atomically:

1. **Task 1: Add drag source to AssetCard and AssetGrid** - `823ab92` (feat)
2. **Task 2: Add drag sources to FolderCard and wire drag payload** - `993f94b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/components/files/AssetCard.tsx` - Added onDragStart prop and draggable={!isUploading} to outer div
- `src/components/files/AssetGrid.tsx` - Added onAssetDragStart prop, passed as onDragStart to each AssetCard
- `src/components/files/FolderBrowser.tsx` - Added handleItemDragStart callback, wired to FolderCard and AssetGrid, guarded all four container drag handlers

## Decisions Made
- Used `application/x-frame-move` MIME type (not `text/plain`) so container drag handlers can distinguish internal item drags from OS file/folder drops without false-positive overlay
- Drag payload logic lives in FolderBrowser (where selectedIds is in scope), not in the card components
- If dragged item is already selected, all selectedIds are included; otherwise only that item is carried

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Drag sources complete and committed; Plan 03-02 can now add folder card drop targets that read the application/x-frame-move payload and call the move API
- Rubber-band selection is unaffected (existing early-return on [data-selectable] in handleContentMouseDown)
- OS file/folder drop upload still works (container handlers now skip when x-frame-move is present)

---
*Phase: 03-drag-to-move*
*Completed: 2026-04-04*
