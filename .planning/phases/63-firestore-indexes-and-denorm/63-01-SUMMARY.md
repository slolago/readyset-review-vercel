---
phase: 63
plan: 01
subsystem: firestore-indexes-and-denorm
requirements: [IDX-01, IDX-02, IDX-03, IDX-04]
completed: 2026-04-20
tasks: 5
---

# Phase 63 Plan 01: Firestore Indexes & Denormalization — Summary

One-liner: moved the hot-path list endpoints (assets, folders, trash) from full-project scans to composite-indexed queries, and replaced the per-request comments scan with a denormalized `commentCount` on the asset doc.

## Commits

- `d9088f02` feat(63-01): add Firestore composite indexes
- `52624d00` feat(63-02): denormalize commentCount onto asset doc
- `e3d77e87` feat(63-03): wire indexed query in /api/assets
- `7b9847d0` feat(63-04): wire indexed query in /api/folders
- `987b7d34` feat(63-05): wire indexed query on trash endpoint

## Files

Created:
- `firestore.indexes.json`
- `.planning/phases/63-firestore-indexes-and-denorm/63-01-PLAN.md`
- `.planning/phases/63-firestore-indexes-and-denorm/63-01-SUMMARY.md`
- `.planning/phases/63-firestore-indexes-and-denorm/63-01-VERIFICATION.md`

Modified:
- `src/types/index.ts` — `commentCount?: number` on Asset; `deletedAt?: Timestamp | null`
- `src/app/api/upload/signed-url/route.ts` — init `commentCount: 0` + `deletedAt: null` on create
- `src/app/api/assets/copy/route.ts` — same init on copy
- `src/app/api/folders/route.ts` — init `deletedAt: null` on create; indexed GET query
- `src/app/api/trash/restore/route.ts` — restore writes `deletedAt: null` (not `FieldValue.delete()`)
- `src/app/api/comments/route.ts` — POST uses `runTransaction` + `FieldValue.increment(+1)`
- `src/app/api/comments/[commentId]/route.ts` — DELETE (auth + guest) uses tx + `FieldValue.increment(-1)`
- `src/app/api/assets/route.ts` — indexed list query + lazy commentCount backfill
- `src/app/api/projects/[projectId]/trash/route.ts` — indexed trash query

## Indexes Added (firestore.indexes.json)

| Collection | Fields                                   | Used by                      |
| ---------- | ---------------------------------------- | ---------------------------- |
| assets     | projectId, folderId, deletedAt           | GET /api/assets              |
| assets     | projectId, deletedAt                     | trash, future project-scoped |
| folders    | projectId, parentId, deletedAt           | GET /api/folders (per-level) |
| folders    | projectId, deletedAt                     | GET /api/folders?all=true, trash |
| comments   | assetId, parentId, createdAt             | threaded comment loads       |

Deploy with `firebase deploy --only firestore:indexes`. Until then, every route falls back to its legacy in-memory filter on `FAILED_PRECONDITION` and logs a `console.warn`.

## Requirements Satisfied

- IDX-01: `/api/assets` queries `(projectId, folderId, deletedAt == null)` directly
- IDX-02: `commentCount` on asset doc; tx-wrapped +/-1 on comment create/delete; lazy backfill on first list read
- IDX-03: `/api/folders` queries `(projectId, parentId, deletedAt == null)` per level
- IDX-04: `/api/projects/[id]/trash` queries `(projectId, deletedAt != null)` for both collections

## Key Decisions

1. **`deletedAt: null` instead of absent** on create + restore. Firestore `where('deletedAt','==',null)` only matches docs with the field explicitly set to `null` — absent fields are excluded. Writing `null` keeps post-Phase-63 docs discoverable by the composite query. Pre-Phase-63 assets/folders won't match the new query until they're touched; the `FAILED_PRECONDITION` fallback also handles the case where the index isn't deployed yet. (Deviation Rule 2 — missing critical init.)
2. **`commentCount` optional in the type**, even though the spec called for non-optional default 0. Pre-Phase-63 assets lack the field on disk; typing it required would be a lie. Runtime paths lazy-backfill and always surface a number via `_commentCount`.
3. **Lazy backfill over migration script**. First list-read per asset with missing `commentCount` does one scoped comments scan, writes the count, and caches for future reads. Matches the anti-scope note in 63-CONTEXT.md.
4. **Restore writes `null`** instead of `FieldValue.delete()` so restored docs remain indexable.
5. **Comment counting rule** (top-level + non-empty text) is preserved across both the transactional increment/decrement and the lazy backfill — matches the existing visibility rule the UI relies on.

## Deviations from Plan

### Rule 2 — missing critical init
- Added `deletedAt: null` to new asset creates (signed-url, copy) and new folder creates. Without it, the composite-indexed queries would silently return zero results for freshly-created docs on collections where no doc has ever been soft-deleted (so the field never appears in the schema).
- Updated `trash/restore` to write `deletedAt: null` instead of deleting the field, for the same reason.

### Rule 2 — missing critical init
- Added `commentCount: 0` to `assets/copy` alongside `signed-url`, so copied assets don't fall back to the lazy-backfill path immediately.

### Type widening
- `deletedAt` widened from `Timestamp` to `Timestamp | null` to accommodate the new init pattern. No runtime behaviour change — every existing `!a.deletedAt` / `if (a.deletedAt)` check was already null-safe.

No architectural changes. No new infrastructure. No auth gates.

## Verification

- `npx tsc --noEmit` — clean after every task
- `npx vitest run` — 156/156 tests pass after every task
- No push (per phase instruction)

## Self-Check: PASSED
