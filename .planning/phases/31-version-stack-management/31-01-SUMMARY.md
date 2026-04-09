---
phase: 31-version-stack-management
plan: "01"
subsystem: api
tags: [firestore, batch, transaction, version-stack, nextjs-route]

# Dependency graph
requires:
  - phase: 28-version-stacking
    provides: merge-version route pattern (auth, group query, root inclusion guard, batch write)
provides:
  - POST /api/assets/unstack-version — detach asset from version group, re-compact remaining
  - POST /api/assets/reorder-versions — atomically reassign version numbers 1..N in caller order
affects:
  - 31-02 (UI for unstack + reorder calls these endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Firestore runTransaction for reorder — guards stale reads during concurrent version ops"
    - "versionGroupId set to asset.id (never null) on unstack — standalone asset is its own group root"
    - "Root inclusion guard: fetch group root explicitly if not returned by versionGroupId query"

key-files:
  created:
    - src/app/api/assets/unstack-version/route.ts
    - src/app/api/assets/reorder-versions/route.ts
  modified: []

key-decisions:
  - "Unstack uses db.batch() — reads are complete before batch, no stale-read risk for this op"
  - "Reorder uses db.runTransaction() — reads and writes must be atomic to guard against concurrent reorders"
  - "Auth check done outside transaction in reorder route to avoid complicating Firestore retry logic"

patterns-established:
  - "Standalone asset after unstack: versionGroupId === asset.id (not null)"
  - "Version numbers always 1-based, gapless after any mutating operation"
  - "Root inclusion guard pattern: if (!members.some(m => m.id === groupId)) fetch root explicitly"

requirements-completed:
  - VSTK-01
  - VSTK-02

# Metrics
duration: 10min
completed: 2026-04-09
---

# Phase 31 Plan 01: Version Stack Management — API Routes Summary

**Two Next.js API routes for version stack mutations: unstack-version (batch) detaches an asset from its group and re-compacts version numbers; reorder-versions (Firestore runTransaction) atomically assigns 1..N version numbers in caller-specified order with cross-group rejection**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-09T03:20:00Z
- **Completed:** 2026-04-09T03:30:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- POST /api/assets/unstack-version — detaches a version from its group by setting versionGroupId to its own id (never null), then re-compacts remaining members 1..N
- POST /api/assets/reorder-versions — uses Firestore runTransaction (per STATE.md mandate) to atomically assign new version numbers and reject cross-group reorder attempts
- Both routes follow the merge-version auth pattern (getAuthenticatedUser + canAccessProject + root inclusion guard)

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/assets/unstack-version route** - `f6fd7a64` (feat)
2. **Task 2: POST /api/assets/reorder-versions route** - `29037cb4` (feat)

**Plan metadata:** _(final docs commit — see below)_

## Files Created/Modified

- `src/app/api/assets/unstack-version/route.ts` — Unstack API: detaches asset from version group, re-compacts remaining 1..N via batch
- `src/app/api/assets/reorder-versions/route.ts` — Reorder API: reassigns version numbers 1..N via Firestore transaction, rejects cross-group ops

## Decisions Made

- **Unstack uses batch, not transaction:** Reads complete before the batch write, so no stale-read risk for this operation. Transaction not required.
- **Reorder uses runTransaction:** Reads and writes must be atomic to prevent concurrent reorders from producing duplicate version numbers — matches STATE.md mandate.
- **Auth outside transaction in reorder:** canAccessProject called before entering the transaction to avoid adding extra reads that complicate Firestore's automatic retry behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both routes compiled and the full build passed on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both endpoints ready for Plan 02 (UI integration — unstack trigger and drag-to-reorder handler)
- Routes follow identical auth and error-response patterns as merge-version; Plan 02 can call them with the same fetch wrapper

---
*Phase: 31-version-stack-management*
*Completed: 2026-04-09*
