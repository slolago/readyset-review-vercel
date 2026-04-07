---
phase: 12-download-and-polish
plan: 01
subsystem: ui
tags: [react, contextmenu, checkbox, tailwind, lucide-react]

# Dependency graph
requires:
  - phase: 11-nice-to-have
    provides: context menu wired into AssetListView rows
provides:
  - ContextMenu dismiss fixed with setTimeout(0) deferred listener registration
  - Custom styled checkboxes in list view matching AssetCard grid pattern
  - Header checkbox with full/partial/none visual states via frame-accent purple
affects: [12-download-and-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setTimeout(0) deferred addEventListener to prevent opening event from firing dismiss handler"
    - "div+Check (lucide-react) custom checkbox replacing native <input type=checkbox> for dark-theme consistency"

key-files:
  created: []
  modified:
    - src/components/ui/ContextMenu.tsx
    - src/components/files/AssetListView.tsx

key-decisions:
  - "setTimeout(0) wraps all addEventListener calls in ContextMenu to defer past the opening mousedown tick"
  - "window blur listener added to ContextMenu to close on tab/window switch"
  - "Header checkbox shows semi-transparent accent (bg-frame-accent/50) for indeterminate/some-selected state"
  - "Row checkbox uses pointer-events-none div so clicks pass through to parent <td> onClick"

patterns-established:
  - "ContextMenu dismiss: defer addEventListener with setTimeout(0), clearTimeout in cleanup"
  - "Custom checkbox: div with border-2 + Check icon, pointer-events-none on row variant"

requirements-completed: [REQ-12D, REQ-12E, REQ-12B]

# Metrics
duration: 8min
completed: 2026-04-06
---

# Phase 12 Plan 01: Download and Polish — UI Fixes Summary

**ContextMenu dismiss race fixed with setTimeout(0) deferred listener; native checkboxes replaced with frame-accent div+Check pattern in list view**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:08:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- ContextMenu no longer immediately closes after opening — setTimeout(0) defers mousedown listener registration past the triggering event tick
- Window blur listener added so menu closes when user switches tabs/windows
- List view checkboxes (header + row) now use custom div+Check pattern matching the AssetCard grid design
- Header checkbox shows full accent when all selected, semi-transparent accent when some selected, transparent when none
- No native browser checkbox styling (`accent-frame-accent`) remains in AssetListView

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ContextMenu dismiss + checkbox styling** - `c9afbc7d` (feat)

## Files Created/Modified
- `src/components/ui/ContextMenu.tsx` - Added setTimeout(0) deferred addEventListener + clearTimeout cleanup + window blur handler
- `src/components/files/AssetListView.tsx` - Added Check import, replaced header and row native checkboxes with custom div+Check divs

## Decisions Made
- setTimeout(0) wraps all addEventListener calls in ContextMenu so the opening right-click mousedown event does not immediately trigger onClose
- window 'blur' listener added alongside the existing mousedown/keydown/scroll handlers for robustness
- Header checkbox uses bg-frame-accent/50 for indeterminate state (some but not all selected) — shows checkmark in both allSelected and someSelected states
- Row checkbox div uses pointer-events-none so click events pass through to the parent <td> onClick handler which calls onToggleSelect

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ContextMenu dismiss is reliable — no outside-click race condition
- List view checkboxes match the grid view visual style
- Select-all toggle logic was already correct (verified — no changes needed)
- Ready for remaining 12-download-and-polish plans

---
*Phase: 12-download-and-polish*
*Completed: 2026-04-06*

## Self-Check: PASSED
- FOUND: src/components/ui/ContextMenu.tsx
- FOUND: src/components/files/AssetListView.tsx
- FOUND: .planning/phases/12-download-and-polish/12-01-SUMMARY.md
- FOUND commit: c9afbc7d
