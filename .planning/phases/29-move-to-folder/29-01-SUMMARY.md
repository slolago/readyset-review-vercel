---
phase: 29-move-to-folder
plan: 01
subsystem: ui
tags: [react, next.js, firebase, dropdown, context-menu, move-to-folder]

# Dependency graph
requires:
  - phase: 28-version-stack-dnd
    provides: Atomic Firestore batch pattern used by handleMoveSelected for version group batch moves
provides:
  - "Move to" in AssetCard hover Dropdown menu (was missing; context menu already existed)
  - "Move to" in FolderCard hover Dropdown menu (extra fix beyond plan scope)
  - Full move-to-folder surface complete: right-click context menu + hover "..." menu on both assets and folders
affects:
  - 30-asset-review-status
  - 31-version-stack-management

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onRequestMove prop pattern: AssetCard delegates move intent up to FolderBrowser; all move state lives in FolderBrowser"
    - "Dropdown items array pattern: icon + label + onClick for hover '...' menus on cards"

key-files:
  created: []
  modified:
    - src/components/files/AssetCard.tsx
    - src/components/files/FolderCard.tsx

key-decisions:
  - "Move state lives in FolderBrowser only — AssetCard and FolderCard fire onRequestMove and own no move state"
  - "FolderCard hover Dropdown fixed beyond plan scope to give a consistent UI surface across all card types"

patterns-established:
  - "Move delegation: cards delegate via onRequestMove; modal and API call owned by FolderBrowser"

requirements-completed:
  - MOVE-01

# Metrics
duration: ~20min
completed: 2026-04-08
---

# Phase 29: move-to-folder Summary

**"Move to" added to AssetCard and FolderCard hover Dropdown menus, completing the move-to-folder UI surface across all entry points (both context menus and hover "..." menus)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-08
- **Completed:** 2026-04-08
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Added "Move to" item to AssetCard hover Dropdown menu (the sole gap — context menu already had it)
- Added "Move to" item to FolderCard hover Dropdown menu (discovered inconsistency, fixed beyond plan scope)
- Verified end-to-end move pipeline: Dropdown "Move to" -> folder picker modal -> confirm -> asset relocates to destination
- Verified version group batch move: all group members move atomically to destination

## Task Commits

Each task was committed atomically:

1. **Task 1: Add "Move to" item to AssetCard Dropdown hover menu** - `dd31b537` (feat)
2. **Extra fix: Add "Move to" item to FolderCard Dropdown hover menu** - `bdf928da` (fix)
3. **Task 2: Human verify checkpoint** - APPROVED (no code commit)

## Files Created/Modified

- `src/components/files/AssetCard.tsx` - Added "Move to" item (MoveIcon + onRequestMove callback) to Dropdown items array between "Copy to" and "Duplicate"
- `src/components/files/FolderCard.tsx` - Added "Move to" item to FolderCard hover Dropdown menu for consistency

## Decisions Made

- Move state lives in FolderBrowser only — AssetCard and FolderCard fire `onRequestMove` and own no local move state. This matches the existing pattern established before this phase.
- FolderCard hover Dropdown was fixed beyond the original plan scope to keep the UI surface consistent. All card types (asset and folder) now expose "Move to" from both right-click and hover "..." menus.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added "Move to" to FolderCard hover Dropdown**
- **Found during:** Task 1 (while verifying AssetCard Dropdown)
- **Issue:** FolderCard hover Dropdown menu was also missing "Move to", creating an inconsistent UI surface — folders could be moved via right-click context menu but not via the hover "..." menu
- **Fix:** Added "Move to" item to FolderCard Dropdown items array using the same MoveIcon + onRequestMove pattern as AssetCard
- **Files modified:** src/components/files/FolderCard.tsx
- **Verification:** User confirmed during checkpoint that hover "..." menu on folders shows "Move to" and opens the folder picker modal
- **Committed in:** bdf928da

---

**Total deviations:** 1 auto-fixed (missing critical UI surface)
**Impact on plan:** Necessary for UI consistency. No scope creep — uses identical pattern as planned AssetCard fix.

## Issues Encountered

None — the entire move pipeline (onRequestMove -> FolderBrowser.handleRequestMoveItem -> MoveModal -> handleMoveSelected -> PUT /api/assets/:id batch) was already wired end-to-end from prior phases. This plan only closed the surface gap.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 29 complete. Move-to-folder works for both assets and folders from both right-click context menus and hover "..." Dropdowns.
- Version group batch moves confirmed working.
- Ready for Phase 30: asset-review-status.

---
*Phase: 29-move-to-folder*
*Completed: 2026-04-08*
