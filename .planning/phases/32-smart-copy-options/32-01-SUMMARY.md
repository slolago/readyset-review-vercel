---
phase: 32-smart-copy-options
plan: 01
subsystem: ui
tags: [react, tailwind, lucide-react, firestore, nextjs, copy-modal]

# Dependency graph
requires:
  - phase: 29-move-to-folder
    provides: AssetCard context menu and folder picker modal pattern (AssetFolderPickerModal)
provides:
  - SmartCopyModal component with version toggle and comments-not-copied info note
  - latestVersionOnly flag support in POST /api/assets/copy
  - Single-version copy resets destination version number to 1
affects: [33-selection-review-links, any phase touching AssetCard copy flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SmartCopyModal co-located at bottom of AssetCard.tsx (matches VersionStackModal and AssetFolderPickerModal convention)
    - Toggle as styled button (not checkbox) using Tailwind translate for thumb animation
    - latestVersionOnly passed from modal onPick callback through handleCopyTo into POST body

key-files:
  created: []
  modified:
    - src/app/api/assets/copy/route.ts
    - src/components/files/AssetCard.tsx

key-decisions:
  - "SmartCopyModal toggle defaults to true when versionCount > 1 (review folders typically want latest cut)"
  - "Toggle hidden entirely for standalone assets (versionCount <= 1) per REVIEW-01"
  - "Comments note always visible regardless of versionCount per REVIEW-02"
  - "version: 1 reset applied only when latestVersionOnly && versionsToCopy.length === 1"
  - "Duplicate (same-folder copy) unchanged — smart options scoped to Copy To flow only"

patterns-established:
  - "Modal onPick callbacks include all user-selected options as args (folderId, latestVersionOnly)"
  - "API flag filtering: sort first, then slice to [last] for single-version mode"

requirements-completed: [REVIEW-01, REVIEW-02]

# Metrics
duration: 12min
completed: 2026-04-08
---

# Phase 32 Plan 01: Smart Copy Options Summary

**SmartCopyModal with "Latest version only" toggle (stack-only, defaults ON) and always-visible "Comments are not copied" info note, backed by latestVersionOnly flag in POST /api/assets/copy that resets copied version to V1**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-08T00:00:00Z
- **Completed:** 2026-04-08T00:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended POST /api/assets/copy to filter allVersions to head-only when latestVersionOnly is true, resetting destination version number to 1
- Replaced AssetFolderPickerModal with SmartCopyModal featuring a styled toggle (visible only for version stacks) and a static "Comments are not copied" info note
- Updated handleCopyTo signature to accept and forward latestVersionOnly boolean to the copy API

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend POST /api/assets/copy to accept latestVersionOnly flag** - `0f0ae67d` (feat)
2. **Task 2: Replace AssetFolderPickerModal with SmartCopyModal in AssetCard** - `6afcb5b5` (feat)

## Files Created/Modified
- `src/app/api/assets/copy/route.ts` - Added latestVersionOnly destructuring, versionsToCopy filter, version:1 reset for single-version copy
- `src/components/files/AssetCard.tsx` - Added Info import, updated handleCopyTo signature, replaced AssetFolderPickerModal with SmartCopyModal at render site and implementation

## Decisions Made
- Toggle defaults to true when versionCount > 1 — review folders typically want the latest cut; user can disable to copy full stack
- Comments note is always visible (static disclosure) regardless of versionCount — fulfills REVIEW-02 purely as UI transparency
- Duplicate flow (handleDuplicate) left unchanged — REVIEW-01/02 are scoped to "Copy to" flow only
- version reset uses `versionsToCopy.length === 1 && latestVersionOnly` condition to avoid touching full-stack copy behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REVIEW-01 and REVIEW-02 complete — copy flow now supports smart version and comment-transparency options
- Phase 33 (selection-based review links / REVIEW-03) can proceed independently
- Manual browser verification recommended: test versioned asset copy (toggle ON/OFF) and standalone asset copy (no toggle shown)

---
*Phase: 32-smart-copy-options*
*Completed: 2026-04-08*
