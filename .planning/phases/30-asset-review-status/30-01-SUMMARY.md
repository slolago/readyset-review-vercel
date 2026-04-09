---
phase: 30-asset-review-status
plan: "01"
subsystem: asset-review-status
tags: [review-status, asset-card, firestore, badge, context-menu, dropdown]
dependency_graph:
  requires: []
  provides: [ReviewStatus type, ReviewStatusBadge component, API null-to-delete guard, AssetCard status setter]
  affects: [src/types/index.ts, src/components/ui/ReviewStatusBadge.tsx, src/app/api/assets/[assetId]/route.ts, src/components/files/AssetCard.tsx]
tech_stack:
  added: []
  patterns: [FieldValue.delete() for Firestore field removal, STATUS_META lookup table for badge metadata]
key_files:
  created:
    - src/components/ui/ReviewStatusBadge.tsx
  modified:
    - src/types/index.ts
    - src/app/api/assets/[assetId]/route.ts
    - src/components/files/AssetCard.tsx
decisions:
  - FieldValue.delete() guard added in else branch only — folderId batch path untouched
  - STATUS_META lookup (not switch) for badge — easy to extend new statuses
  - onDeleted?() reused as refresh trigger in handleSetStatus (same pattern as rename)
metrics:
  duration: "~15 min"
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 4
---

# Phase 30 Plan 01: Asset Review Status — Core Types, Badge, and AssetCard Wiring Summary

**One-liner:** ReviewStatus type + colored badge component + Firestore null-to-delete guard wired into AssetCard Dropdown, ContextMenu, and info row for STATUS-01 and STATUS-02.

## What Was Built

### Task 1: ReviewStatus type, ReviewStatusBadge, API null guard

- Added `ReviewStatus = 'approved' | 'needs_revision' | 'in_review'` type alias to `src/types/index.ts`
- Added `reviewStatus?: ReviewStatus` field to the `Asset` interface
- Created `src/components/ui/ReviewStatusBadge.tsx` with `STATUS_META` color mappings:
  - `approved` → emerald-400 / emerald-500/15
  - `needs_revision` → yellow-400 / yellow-500/15
  - `in_review` → blue-400 / blue-500/15
  - Returns `null` when status is undefined or not in STATUS_META
- Added `FieldValue.delete()` guard in API PUT handler else branch — null values in update payload are replaced with `FieldValue.delete()` so clearing a status removes the Firestore field entirely

**Commit:** 40146603

### Task 2: AssetCard status setter and badge display

- Added `CheckCircle2`, `AlertCircle` to lucide-react import in AssetCard
- Added `ReviewStatusBadge` import from `@/components/ui/ReviewStatusBadge`
- Added `import type { ReviewStatus } from '@/types'`
- Added `handleSetStatus(reviewStatus: ReviewStatus | null)` function — PUTs reviewStatus to `/api/assets/{id}`, toasts success/error, calls `onDeleted?.()` to refresh grid
- Added 4 status items to Dropdown (Approved, Needs Revision, In Review, Clear status) with `divider: true` on first
- Added same 4 items to ContextMenu with `dividerBefore: true` on first
- Added `<ReviewStatusBadge status={asset.reviewStatus} />` in info row wrapped in `{asset.reviewStatus && ...}` conditional

**Commit:** fc4b7969

## Verification

- `npx tsc --noEmit` exits 0 (clean)
- All grep checks pass — ReviewStatus type, reviewStatus field, STATUS_META, FieldValue.delete(), handleSetStatus, ReviewStatusBadge render all confirmed present

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired. ReviewStatusBadge reads from `asset.reviewStatus` which is set/cleared via the API. No placeholder data.

## Self-Check: PASSED

Files verified:
- FOUND: src/types/index.ts (contains ReviewStatus type and reviewStatus field)
- FOUND: src/components/ui/ReviewStatusBadge.tsx (exports ReviewStatusBadge, contains STATUS_META)
- FOUND: src/app/api/assets/[assetId]/route.ts (contains FieldValue.delete(), safeUpdates)
- FOUND: src/components/files/AssetCard.tsx (contains handleSetStatus, ReviewStatusBadge render)

Commits verified:
- FOUND: 40146603 (feat(30-01): add ReviewStatus type, ReviewStatusBadge component, and API null guard)
- FOUND: fc4b7969 (feat(30-01): wire review status setter and badge into AssetCard)
