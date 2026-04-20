---
phase: 50
plan: 01
subsystem: review-links
tags: [api, firestore, index, regression]
requirements: [RVL-01, RVL-02]
dependency-graph:
  requires: [phase-44-access-model]
  provides: [project-scoped-review-link-list-working]
  affects: [AddToReviewLinkModal, ReviewLinksTab, projects/[projectId]/review-links]
tech-stack:
  added: []
  patterns: ["sort-in-memory to avoid Firestore composite index"]
key-files:
  created: []
  modified:
    - src/app/api/review-links/route.ts
    - src/components/review/ReviewLinksTab.tsx
    - src/app/(app)/projects/[projectId]/review-links/page.tsx
    - tests/permissions-api.test.ts
decisions:
  - "Mirror /api/review-links/all pattern: drop orderBy, sort in memory — no new Firestore composite index required"
  - "Client empty-state must be distinct from server error: throw on !res.ok before json parse"
metrics:
  duration: "~10 min"
  completed: 2026-04-20
  commits: 3
  test-delta: "+9 (129 → 138)"
---

# Phase 50 Plan 01: review-links-repair Summary

Restored project-scoped review-link listing by removing the composite-index requirement from `GET /api/review-links?projectId=X` — mirrors the in-memory sort pattern already used by `/api/review-links/all`. No client contract changes needed (audit confirmed all three callers already sent the correct shape); added defensive `!res.ok` guards so zero-link empty states can no longer masquerade as silent server errors.

## Root Cause

`GET /api/review-links?projectId=X` ran `.where('projectId','==',X).orderBy('createdAt','desc')` — that combination requires a composite index on `reviewLinks(projectId ASC, createdAt DESC)` which was never deployed. Firestore threw `FAILED_PRECONDITION`; the bare `catch {}` swallowed it and returned 500. All three project-scoped clients (AddToReviewLinkModal, ReviewLinksTab, projects/[projectId]/review-links page) treated this as "Failed to load review links" and rendered either an error toast or an empty state.

Evidence the sibling endpoint had already worked around the same trap: `/api/review-links/all` carries the comment `// no orderBy — avoids composite index requirement; sorted in-memory below`.

## Fix

**Server (Task 1):**
- Removed `.orderBy('createdAt','desc')` from the Firestore query in `src/app/api/review-links/route.ts`
- Sort the mapped `links` array in memory by `createdAt` desc using the `_seconds`/`seconds`-aware comparator already used by `/all`
- Replaced bare `catch {}` with `catch (error) { console.error('review-links GET error:', error); ... }` so production surfaces real errors

**Client (Task 2):** audit confirmed all three callers already send `?projectId=${projectId}` + `Authorization: Bearer <token>`. Two correctness tweaks:
- `ReviewLinksTab.tsx`: `if (!res.ok) throw new Error('Failed to load review links')` before `res.json()` → real failures hit the toast path, 200 + empty array renders the existing empty state cleanly
- `projects/[projectId]/review-links/page.tsx`: same guard + changed silent `catch {}` to `console.error(...)` for observability
- `AddToReviewLinkModal.tsx`: already correct (`if (res.ok) { ... } else { toast.error(...) }`) — untouched

**Tests (Task 3):** 9 new integration cases in `tests/permissions-api.test.ts` covering role matrix (owner/editor/reviewer/admin/stranger), error shapes (400/401/403/404), and filter correctness (seeding two projects, asserting only the requested project's links return). Sort-order case overrides `createdAt` with `{_seconds: 1000}` and `{_seconds: 2000}` on seeded docs and asserts newest-first.

## Files Modified

| File | Change |
| ---- | ------ |
| `src/app/api/review-links/route.ts` | Drop orderBy, sort in memory, log errors |
| `src/components/review/ReviewLinksTab.tsx` | Throw on `!res.ok` before json parse |
| `src/app/(app)/projects/[projectId]/review-links/page.tsx` | Throw on `!res.ok` + console.error on catch |
| `tests/permissions-api.test.ts` | +9 cases for GET `/api/review-links?projectId` |

## Audit Finding: Client Contracts Were Already Correct

No client-side query/header changes were needed. All three callers (AddToReviewLinkModal L57-77, ReviewLinksTab L24-38, project review-links page L56-74) already matched the server contract (`?projectId=X` + `Authorization: Bearer <idToken>`). The bug was purely server-side.

## Commits

- `8998bd50` — fix(50-01): drop orderBy to avoid missing composite index
- `c3cb077e` — fix(50-01): distinguish server error from empty list on project-scoped fetches
- `a99b0ac6` — test(50-01): integration tests for GET /api/review-links?projectId

## Verification

- `npx vitest run tests/permissions-api.test.ts` → 36 passed (was 27; +9)
- `npx vitest run` (full suite) → 138 passed (was 129; +9)
- `npx tsc --noEmit` → clean

## Deviations from Plan

None beyond:
- Plan text referenced `seedReviewLink(db, { projectId, token, name })`; actual helper signature requires `createdBy`. Adjusted call sites in Task 3 to pass `createdBy: F.owner` — semantically equivalent.
- Plan mentioned "previous 116 + 9 = 125"; actual pre-existing total was 129 (permissions-api 27 + permissions 89 + format-date 13). New total 138. Delta is still +9 as specified.

## Self-Check: PASSED

- src/app/api/review-links/route.ts — no orderBy, in-memory sort present, error logged
- ReviewLinksTab.tsx + projects/[projectId]/review-links/page.tsx — both `!res.ok` guards present
- tests/permissions-api.test.ts — 9 new `it(...)` cases under describe block `GET /api/review-links?projectId=...`
- 3 commits present in git log (8998bd50, c3cb077e, a99b0ac6)
- Full vitest suite: 138/138 passed
