---
phase: 07-version-management
plan: 01
subsystem: ui
tags: [react, modal, versions, firestore, asset-card]

# Dependency graph
requires:
  - phase: 06-asset-context-menu
    provides: AssetCard context menu with Dropdown items pattern
provides:
  - VersionStackModal inline component in AssetCard.tsx
  - "Manage version stack" context menu item on every asset card
affects: [08-review-links, any phase touching AssetCard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Co-located modal pattern (VersionStackModal next to AssetFolderPickerModal in AssetCard.tsx)
    - useEffect for fetch-on-mount with getIdToken pattern
    - Firebase Timestamp guard for serialized API responses

key-files:
  created: []
  modified:
    - src/components/files/AssetCard.tsx

key-decisions:
  - "VersionStackModal co-located in AssetCard.tsx following AssetFolderPickerModal pattern"
  - "useEffect added to React imports (was missing) to support clean fetch-on-mount"
  - "Delete button hidden via versions.length > 1 check, not disabled — prevents accidental last-version delete"

patterns-established:
  - "Co-located modal: define inline function component below the parent export in same file"
  - "Timestamp guard: typeof createdAt.toDate === 'function' check handles both Firebase Timestamp and serialized _seconds object"

requirements-completed: [REQ-07A, REQ-07B]

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 7 Plan 1: Version badge + Manage version stack modal Summary

**VersionStackModal added to AssetCard context menu — lists all versions with V{N} badge, date, uploader, and per-version delete guarded against deleting the last version**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-06T17:36:47Z
- **Completed:** 2026-04-06T17:37:41Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments
- Added "Manage version stack" Dropdown item between "Upload new version" and "Delete" in AssetCard
- Implemented `VersionStackModal` component co-located in AssetCard.tsx (same pattern as `AssetFolderPickerModal`)
- Modal fetches GET /api/assets/{id} on open, shows loading spinner, then version list
- Per-row: V{N} badge in `bg-frame-accent/20 text-frame-accent font-mono`, filename, formatted date, uploaderBy
- Delete button absent when only 1 version remains; on delete calls onDeleted + closes modal when needed
- TypeScript zero errors throughout

## Task Commits

1. **Task 1: Add "Manage version stack" menu item** - `7b279cab` (feat)
2. **Task 2: Implement VersionStackModal component** - `c9b17a29` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/components/files/AssetCard.tsx` - Added showVersionModal state, Dropdown item, VersionStackModal render, and VersionStackModal function component

## Decisions Made
- Co-located `VersionStackModal` in `AssetCard.tsx` following the established `AssetFolderPickerModal` pattern — keeps related modal logic in one file
- Added `useEffect` to React imports (was not previously imported) to enable clean fetch-on-mount pattern instead of ref hacks
- Delete button uses `versions.length > 1` guard (hide, not disable) so the UI is unambiguous — you cannot delete the last version

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added useEffect to React imports**
- **Found during:** Task 2 (VersionStackModal implementation)
- **Issue:** Plan referenced a fetch-on-mount pattern; `useEffect` was not in the existing React import line, causing implementation to require an ugly workaround
- **Fix:** Added `useEffect` to the import — `import { useRef, useCallback, useState, useEffect } from 'react'`
- **Files modified:** src/components/files/AssetCard.tsx
- **Verification:** TSC clean; no other hooks affected
- **Committed in:** c9b17a29 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking import fix)
**Impact on plan:** Minimal — one import addition needed for clean implementation. No scope creep.

## Issues Encountered
None beyond the missing `useEffect` import (fixed inline).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Version stack modal fully functional — users can inspect and delete individual versions from the context menu
- REQ-07A (version badge) was already implemented; REQ-07B (manage stack modal) now complete
- Ready for Phase 8

---
*Phase: 07-version-management*
*Completed: 2026-04-06*
