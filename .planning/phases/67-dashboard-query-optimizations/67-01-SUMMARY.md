---
phase: 67-dashboard-query-optimizations
plan: 01
subsystem: dashboard / api
tags: [perf, firestore, denormalization, caching]
requires:
  - Project.collaborators[].userId populated on existing docs (true for all v2.0 docs)
provides:
  - Project.collaboratorIds denormalized field
  - fetchAccessibleProjects shared helper
  - /api/projects GET + /api/stats GET backed by indexed array-contains queries
  - /api/stats parallel fan-out + stale-while-revalidate cache header
  - Atomic collaborator add/remove
  - Idempotent backfill script
affects:
  - src/app/api/projects/route.ts
  - src/app/api/stats/route.ts
  - src/app/api/projects/[projectId]/collaborators/route.ts
tech-stack:
  added:
    - firebase-admin FieldValue.arrayUnion / arrayRemove (already in deps)
  patterns:
    - denormalize-uids-for-array-contains
    - Promise.all fan-out for per-project aggregation
    - stale-while-revalidate on shared dashboard endpoint
key-files:
  created:
    - src/lib/projects-access.ts
    - scripts/backfill-collaborator-ids.mjs
    - .planning/phases/67-dashboard-query-optimizations/67-01-VERIFICATION.md
  modified:
    - src/types/index.ts
    - src/app/api/projects/route.ts
    - src/app/api/stats/route.ts
    - src/app/api/projects/[projectId]/collaborators/route.ts
    - firestore.indexes.json
    - tests/helpers/firestore-mock.ts
decisions:
  - Added composite index projects(collaboratorIds ARRAY, updatedAt DESC) as forward-compat for Phase 68 sort (not needed by the unordered queries in this plan).
  - Backfill uses collaborators.map(c => c.userId) verbatim — owner is already in collaborators[] per the project POST shape, so no separate owner union.
  - Admin branch of the helper stays a full collection scan (admin is low-traffic; keeping it simple).
metrics:
  duration-seconds: 1312
  completed: 2026-04-21
requirements-completed: [PERF-01, PERF-02, PERF-03, PERF-04]
---

# Phase 67 Plan 01: dashboard-query-optimizations Summary

Denormalized `Project.collaboratorIds: string[]` + a shared `fetchAccessibleProjects` helper replace the two full `projects` collection scans on `/dashboard`'s critical path. `/api/stats` now fans out per-project asset queries and chunked review-link `in` queries with `Promise.all`, and carries `Cache-Control: private, max-age=0, s-maxage=60, stale-while-revalidate=300`. Collaborator add/remove writes both fields atomically inside a Firestore transaction via `FieldValue.arrayUnion` / `arrayRemove`.

## Commits

| Task   | SHA        | Subject                                                                      |
| ------ | ---------- | ---------------------------------------------------------------------------- |
| 1      | `d91b3089` | feat(67-01): add Project.collaboratorIds optional field                      |
| 2      | `cf2e3e53` | feat(67-01): add fetchAccessibleProjects shared helper                       |
| 3      | `0a3fa253` | refactor(67-01): /api/projects GET uses helper; POST writes collaboratorIds  |
| 4      | `b48d41dc` | refactor(67-01): /api/stats uses helper + Promise.all + cache header         |
| 5      | `05882101` | feat(67-01): atomic collaborator add/remove with arrayUnion/arrayRemove      |
| 6      | `7f089c1f` | chore(67-01): backfill collaboratorIds script + composite index delta        |
| (dev.) | `6f170504` | fix(67-01): extend firestore mock for array-contains + arrayUnion/arrayRemove |

## Files Changed

- **src/types/index.ts** — add `Project.collaboratorIds?: string[]` (Phase 67 comment).
- **src/lib/projects-access.ts** (new) — `fetchAccessibleProjects(userId, isPlatformAdmin)`: parallel owner + array-contains queries deduped by id; admin branch does full scan.
- **src/app/api/projects/route.ts** — GET delegates to the helper; POST seeds `collaboratorIds: [user.id]`. Dropped `canAccessProject` import (no longer used).
- **src/app/api/stats/route.ts** — helper + `Promise.all` on asset loop + `Promise.all` on review-link chunks + `Cache-Control` header. Response shape unchanged.
- **src/app/api/projects/[projectId]/collaborators/route.ts** — POST/DELETE wrapped in `db.runTransaction`; use `FieldValue.arrayUnion` / `arrayRemove` so both collaborator fields stay in sync.
- **scripts/backfill-collaborator-ids.mjs** (new) — follows `backfill-comment-count.mjs` pattern; idempotent (order-insensitive equality check).
- **firestore.indexes.json** — new `projects(collaboratorIds ARRAY, updatedAt DESC)` composite for forward-compat.
- **tests/helpers/firestore-mock.ts** — Rule 3 (blocking) deviation: added `array-contains` + `in` operators and `FieldValue.arrayUnion` / `arrayRemove` sentinel resolution so the helper and transactional writes work under the in-memory Firestore shim. `seedProject` now populates `collaboratorIds` from `collaborators[]`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extend firestore mock for array-contains + FieldValue sentinels**
- **Found during:** post-Task-6 vitest run
- **Issue:** `tests/permissions-api.test.ts` → "GET /api/projects lists only accessible projects" failed with 500 because the mock's `where()` only supported `==`/`!=`, and it had no sentinel resolver for `arrayUnion`/`arrayRemove`.
- **Fix:** Added `array-contains` + `in` ops to `where()`, a `resolveSentinels` helper that inspects `_methodName` + `_elements` on admin SDK sentinels, and made `seedProject` populate `collaboratorIds`.
- **Files modified:** `tests/helpers/firestore-mock.ts`
- **Commit:** `6f170504`
- **Result:** 171/171 tests pass.

### Flagged — out of scope for this plan

Task 5 required grepping for other writers of the `collaborators` field. Found **three admin-path routes** that also write `collaborators` but do NOT currently update `collaboratorIds`:

| File | Route | Writer |
| ---- | ----- | ------ |
| `src/app/api/admin/projects/[projectId]/route.ts` | admin project update | writes `collaborators: filtered` (line 104) |
| `src/app/api/admin/users/[userId]/project-access/route.ts` | admin bulk grant/revoke | `tx.update(ref, { collaborators })` (lines 47 & 84) |
| `src/app/api/admin/projects/[projectId]/permissions/route.ts` | admin permissions editor | writes `collaborators: hydratedCollaborators` (line 105) |

These admin paths will drift `collaboratorIds` out of sync on every write. **Not fixed in this plan** (anti-scope strict: "no auth context changes, no new endpoints" and plan explicitly limits Task 5 to the two non-admin collaborator endpoints). **Recommended follow-up:** a Phase 67 plan 02 (or Phase 68 hardening) that mirrors the Task 5 pattern into all three admin routes. Until then, admin-driven collaborator changes should be followed by a `scripts/backfill-collaborator-ids.mjs` run.

## Index Deploy (deferred to Task 7)

The composite index `projects(collaboratorIds ARRAY, updatedAt DESC)` is committed to `firestore.indexes.json`. Deployment is the operator's step in `67-01-VERIFICATION.md` (`firebase deploy --only firestore:indexes`).

## Backfill Results (deferred to Task 7)

Not run by the executor. Expected first-run output: one update per existing project doc (N = total project docs in prod). Expected second-run output: `Updated 0 projects; N already had the correct collaboratorIds.` — documented in VERIFICATION.md step 2.

## Rationale — composite index

Queries in this plan (`collaboratorIds array-contains X` without `orderBy`) do not require a composite index — Firestore auto-creates the single-field index for array-contains. The composite `(collaboratorIds ARRAY, updatedAt DESC)` is committed proactively because Phase 68 (ProjectsContext) is expected to need a most-recent-first sort on the same query, and Firestore index builds take minutes; pre-committing avoids a second indexes deploy gate in Phase 68.

## Verification Status

- `npx tsc --noEmit` → pass (every task)
- `npx next lint --file <route>` → pass (tasks 3/4/5)
- `node --check scripts/backfill-collaborator-ids.mjs` → pass
- `JSON.parse(firestore.indexes.json)` → pass
- `npx vitest run` → **171 passed / 171** after mock extension
- Task 7 (operational parity + cache header + atomic write on live data) → **human_needed**, instructions in `67-01-VERIFICATION.md`

## Known Stubs

None. No UI touched; no placeholder data paths introduced. Admin-path drift of `collaboratorIds` (see "Flagged" above) is a real functional gap but it is not a stub — it is scoped-out follow-up work.

## Self-Check: PASSED

All claimed files exist on disk. All 7 task commits resolve in `git log`.
