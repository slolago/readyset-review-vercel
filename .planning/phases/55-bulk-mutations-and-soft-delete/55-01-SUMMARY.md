---
phase: 55-bulk-mutations-and-soft-delete
plan: 01
subsystem: bulk-mutations-and-soft-delete
tags: [soft-delete, bulk-mutations, review-links, version-stacks, folder-copy]
requires: [fetchGroupMembers, resolveGroupId]
provides:
  - "deepCopyFolder helper (src/lib/folders.ts)"
  - "DELETE ?allVersions=true atomic group soft-delete"
  - "Soft-delete filter in /api/stats, /api/assets/size, /api/assets/copy, /api/review-links/[token] (root+drill+contents)"
  - "Bulk move/status allSettled with partial-failure toasts"
affects:
  - "Guest review-link views (no longer see trashed items)"
  - "Project stats (accurate live counts)"
  - "Folder duplicate (now deep-copies)"
tech_stack:
  patterns: ["Promise.allSettled for bulk mutations", "In-memory deletedAt filter (index-free)", "BFS with per-level Promise.all"]
key_files:
  created:
    - src/lib/folders.ts
  modified:
    - src/app/api/stats/route.ts
    - src/app/api/review-links/[token]/route.ts
    - src/app/api/review-links/[token]/contents/route.ts
    - src/app/api/assets/copy/route.ts
    - src/app/api/assets/size/route.ts
    - src/app/api/assets/[assetId]/route.ts
    - src/app/api/folders/copy/route.ts
    - src/components/files/FolderBrowser.tsx
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetListView.tsx
decisions:
  - "deepCopyFolder uses per-level Promise.all (not sequential) so wide trees don't pay N serial roundtrips; sequential across levels because children need parent ids"
  - "Client DELETE wires allVersions=true when _versionCount > 1 (AssetCard + AssetListView) so the 'Delete X and all N versions' UX stays correct. VersionStackModal per-row delete intentionally omits the flag."
  - "Copy endpoint returns 400 when source asset itself is soft-deleted (can't resurrect via copy)"
metrics:
  duration_seconds: 350
  tasks: 10
  files_modified: 10
  commits: 10
  completed: 2026-04-21
---

# Phase 55 Plan 01: Bulk Mutations & Soft-Delete Summary

Closed 9 REQs (SDC-01..04, BLK-01..05) as 10 atomic commits — soft-deleted items no longer leak into stats, review-link guest views, size totals, or copy operations; bulk move/status now surface partial failures; version-stack DELETE is atomic; folder copy is now a true deep copy.

## One-liner

Soft-delete filter sweep + bulk-mutation correctness fixes + deep folder copy, all server-side, index-free.

## REQ → Commit Mapping

| REQ     | Commit     | Summary                                                    |
| ------- | ---------- | ---------------------------------------------------------- |
| SDC-01  | `cee28e81` | /api/stats excludes deletedAt from count/storage           |
| SDC-02  | `a1712136` | Review-link root + drill-down + hasArrays filter soft-del  |
| SDC-02  | `1d12ec0d` | Review-link contents editor tombstones soft-deleted items  |
| SDC-03  | `ba8bc3b8` | assets/copy 400 on deleted source, skip deleted versions, strip flags |
| SDC-04  | `5ff34d07` | /api/assets/size skips deletedAt                           |
| BLK-01  | `f6db051c` | DELETE ?allVersions=true atomic group soft-delete + clients wired |
| BLK-02  | `98326464` | Bulk move allSettled + per-failure console.error           |
| BLK-03  | `edbb5fd7` | Bulk status allSettled + per-failure console.error         |
| BLK-04  | `0de204e2` | Drag-to-stack merge removes sourceId from selectedIds      |
| BLK-05  | `cdaf54dd` | deepCopyFolder helper + POST /api/folders/copy rewrite     |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MapIterator iteration error**
- Found during: Task 10 typecheck
- Issue: `for (const members of groups.values())` failed `tsc` with TS2802 under the project's target
- Fix: wrapped in `Array.from(groups.values())`
- Files modified: `src/lib/folders.ts`
- Commit: rolled into `cdaf54dd`

### Scope additions per user instructions (not deviations)

- **BLK-01 client wiring:** AssetCard.tsx + AssetListView.tsx pass `allVersions=true` when `_versionCount > 1` so the existing "Delete X and all N versions" confirm UX still does the right thing after the server flag was introduced. VersionStackModal per-row delete intentionally keeps old single-doc behavior.
- **BLK-02/03 logging:** per-failure `console.error` includes the item's name in addition to the id for easier debugging.
- **BLK-04 safety:** selection update uses functional setter with early-return no-op when `selectedIds` didn't contain `sourceId` — avoids wasted render and matches the case where the user dropped an unselected asset onto a stack.
- **BLK-05 perf:** deepCopyFolder uses `Promise.all` per BFS level (not sequential awaits) so wide trees don't pay N serial round-trips.

## Verification

- `npx tsc --noEmit` — clean (ran after every task)
- `npx vitest run` — 138/138 passed (no regressions vs master baseline)
- 10 commits on master, one per task, in REQ order

## Self-Check: PASSED

- [x] `src/lib/folders.ts` exists (verified)
- [x] All 10 commits present in `git log` (verified)
- [x] `deepCopyFolder` exported and imported by `/api/folders/copy`
- [x] Client DELETE callers updated in AssetCard + AssetListView
- [x] vitest + typecheck green after final commit
