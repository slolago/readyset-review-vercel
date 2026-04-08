---
phase: 28-version-stack-dnd
plan: 01
subsystem: api
tags: [version-stack, drag-and-drop, firestore, batch-write]
dependency_graph:
  requires: [assets collection, auth-helpers, firebase-admin]
  provides: [POST /api/assets/merge-version]
  affects: [FolderBrowser, AssetCard, AssetGrid]
tech_stack:
  added: []
  patterns: [firestore-batch-write, version-group-merge]
key_files:
  created: [src/app/api/assets/merge-version/route.ts]
  modified: []
decisions:
  - Root assets without versionGroupId field are included by falling back to asset.id (consistent with existing version group patterns in [assetId]/route.ts)
  - canAccessProject check on source.projectId only — both assets assumed in same project (simpler, consistent with copy API)
  - Math.max over target members to calculate ceiling — safe even for single-member groups
metrics:
  duration: 1 min
  completed: 2026-04-08
  tasks: 1/1
  files: 1
---

# Phase 28 Plan 01: Merge-Version API Summary

Atomic Firestore batch endpoint that merges a source asset's entire version group into a target asset's version group, with collision-free version renumbering.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create merge-version API route | af676340 | src/app/api/assets/merge-version/route.ts |

## What Was Built

`POST /api/assets/merge-version` accepts `{ sourceId, targetId }`:

1. Validates both fields present (400 if missing)
2. Self-merge guard: `sourceId === targetId` → 400
3. Fetches both asset docs (404 if either missing)
4. Auth: `canAccessProject(user.id, source.projectId)` → 403 if no access
5. Resolves group IDs: `asset.versionGroupId || asset.id` (handles legacy root assets)
6. Same-group guard: `sourceGroupId === targetGroupId` → 400
7. Fetches all members of source and target groups via `versionGroupId` queries; falls back to including root asset if missing from query results
8. Calculates `maxTargetVersion = Math.max(...targetMembers.map(m => m.version))`
9. Sorts source members ascending, assigns `version = maxTargetVersion + 1 + i`
10. Single `batch.commit()` — atomic write for all source members
11. Returns `{ merged: N }`

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- [x] Route exists at POST /api/assets/merge-version (P28-01)
- [x] All source group docs reassigned to target versionGroupId (P28-02)
- [x] Version numbers renumbered without collisions (P28-03)
- [x] Single Firestore batch write (atomic) (P28-04)
- [x] Self-merge returns 400 (P28-05)
- [x] Same-group merge returns 400 (P28-06)
- [x] Route requires authentication (P28-07)

## Self-Check: PASSED

- src/app/api/assets/merge-version/route.ts: FOUND
- Commit af676340: FOUND
- TypeScript build: PASSED (npx tsc --noEmit exited 0)
