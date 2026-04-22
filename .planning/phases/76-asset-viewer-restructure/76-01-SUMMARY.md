---
phase: 76-asset-viewer-restructure
plan: 01
subsystem: ui
tags: [next/dynamic, code-splitting, optimistic-ui, react-keys, fabric-cleanup, performance]

# Dependency graph
requires:
  - phase: 75-dashboard-performance
    provides: Skeleton primitive reused by ModalSkeleton loading fallback
provides:
  - 5 heavy modals split out of initial route bundles via next/dynamic
  - Optimistic addComment with temp-id reconciliation and rollback
  - Tightened read-only AnnotationCanvas guard in ImageViewer (empty-array check)
  - Stable per-side keys on VersionComparison dual player/image mounts
affects: [asset-viewer, comment-flow, version-compare, admin-users, review-links]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "next/dynamic with ssr:false + ModalSkeleton loader for on-demand modals"
    - "Optimistic UI: temp-${uuid} id, .map reconciliation preserves order + parentId"
    - "Stable React keys on sibling media elements to drive explicit remount"

key-files:
  created:
    - src/components/ui/ModalSkeleton.tsx
  modified:
    - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx
    - src/components/files/FolderBrowser.tsx
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetListView.tsx
    - src/app/(app)/admin/page.tsx
    - src/hooks/useComments.ts
    - src/components/viewer/ImageViewer.tsx
    - src/components/viewer/VersionComparison.tsx

key-decisions:
  - "Preserved addComment Promise<boolean> contract (rollback + return false) instead of rethrowing — avoids touching CommentSidebar toast path and the separate review-page handler"
  - "ExportModal preview src needs no change — internal 'if (!open) return null' already gates the <video> element render; parent's displayAsset guard only governs whether the component tree exists at all"
  - "Extended PERF-21 stable keys to the <img> pair for consistency (zero-risk, uniform per-side remount semantics)"
  - "AnnotationCanvas.tsx left untouched — existing useLayoutEffect dispose satisfies PERF-20 cleanup requirement"

patterns-established:
  - "ModalSkeleton: shared fixed-inset skeleton for next/dynamic modal loading prop"
  - "Named-export dynamic import: dynamic(() => import('...').then(m => m.X), { ssr: false, loading: () => <ModalSkeleton /> })"
  - "Optimistic-insert with unwrap of { comment: ... } response shape from /api/comments POST"

requirements-completed: [PERF-18, PERF-19, PERF-20, PERF-21]

# Metrics
duration: 23min
completed: 2026-04-22
---

# Phase 76 Plan 01: asset-viewer-restructure Summary

**5 heavy modals lazy-loaded via next/dynamic, optimistic comment submission with temp-id reconciliation, tightened AnnotationCanvas render guard, and stable per-side keys on the version-compare media pair.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-04-22T11:26:56Z
- **Completed:** 2026-04-22T11:50:05Z
- **Tasks:** 4
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- 7 modal import sites converted to `next/dynamic` — ExportModal, CreateReviewLinkModal, AssetCompareModal, VersionStackModal (x2), UserDrawer split off the routes that host their triggers. Build route table confirms the modals are no longer in the initial JS of the parent routes.
- `useComments.addComment` now inserts a temp-prefixed optimistic entry before the POST resolves and reconciles in place on 2xx; non-2xx or thrown errors rollback the temp and return `false` so `CommentSidebar.handleSubmit`'s existing `toast.error('Failed to post comment')` fires.
- `ImageViewer` read-only AnnotationCanvas mount now guarded by `displayShapes && displayShapes !== '[]'` (matching the pre-existing VideoPlayer guards + annotation indicator guard), so an empty-but-non-null `displayShapes` no longer mounts Fabric.
- `VersionComparison` dual `<video>`/`<img>` pair has `key={\`compare-A-${assetA.id}\`}` / `key={\`compare-B-${assetB.id}\`}` — toggling compare↔single or per-side version switch now drives clean unmount/remount, running the existing cleanup paths (Fabric dispose, VUMeter analyser close).

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert 5 heavy modals to next/dynamic (PERF-18)** — `9358e142` (feat)
2. **Task 2: Optimistic addComment with rollback (PERF-19)** — `41ee0771` (feat)
3. **Task 3: AnnotationCanvas read-only guard + ExportModal deferred src (PERF-20)** — `6f9c393e` (fix)
4. **Task 4: VersionComparison stable dual-player keys (PERF-21)** — `35e2f5e1` (feat)

## 7 Dynamic-Import Sites Converted

| # | File | Line (pre) | Modal |
| - | ---- | ---------- | ----- |
| 1 | `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx` | 19 | CreateReviewLinkModal |
| 2 | `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx` | 20 | ExportModal |
| 3 | `src/components/files/FolderBrowser.tsx` | 53 | CreateReviewLinkModal |
| 4 | `src/components/files/FolderBrowser.tsx` | 55 | AssetCompareModal |
| 5 | `src/components/files/AssetCard.tsx` | 26 | VersionStackModal |
| 6 | `src/components/files/AssetListView.tsx` | 33 | VersionStackModal |
| 7 | `src/app/(app)/admin/page.tsx` | 9 | UserDrawer |

All use the pattern:
```ts
const X = dynamic(
  () => import('…').then((m) => m.X),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
```

Grep verification: `grep -rE "const (ExportModal|AssetCompareModal|VersionStackModal|CreateReviewLinkModal|UserDrawer) = dynamic" src/` → 7 matches. Static named-import check → 0 matches.

## Files Created/Modified
- `src/components/ui/ModalSkeleton.tsx` — Created. Shared `next/dynamic` loading fallback built on Phase 75's `Skeleton` primitive.
- `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx` — `ExportModal` + `CreateReviewLinkModal` to dynamic imports.
- `src/components/files/FolderBrowser.tsx` — `AssetCompareModal` + `CreateReviewLinkModal` to dynamic imports.
- `src/components/files/AssetCard.tsx` — `VersionStackModal` to dynamic import.
- `src/components/files/AssetListView.tsx` — `VersionStackModal` to dynamic import.
- `src/app/(app)/admin/page.tsx` — `UserDrawer` to dynamic import.
- `src/hooks/useComments.ts` — `addComment` rewritten to optimistic-insert + reconcile (on `{ comment }` response) + rollback; `Promise<boolean>` contract preserved; `fetchComments`/`resolveComment`/`deleteComment`/`editComment` untouched.
- `src/components/viewer/ImageViewer.tsx` — Read-only AnnotationCanvas mount gained `&& displayShapes !== '[]'` on the guard (line 163).
- `src/components/viewer/VersionComparison.tsx` — 4 stable keys added (video A/B, image A/B).

## Decisions Made

- **`addComment` keeps `Promise<boolean>` signature (deviation from CONTEXT snippet).** The CONTEXT snippet showed `throw err` on failure. `CommentSidebar.handleSubmit` (line 156-167) already toasts via the `!success` branch, and the review page has its own `handleAddComment` that doesn't go through the hook. Rethrowing would require a `try/catch` in CommentSidebar and silent regression of the review path. Per CLAUDE.md §3 (surgical changes): rollback + `return false` is the minimal correct fix.
- **ExportModal preview `src` untouched.** The modal's body includes `if (!open) return null;` at line 223, so the `<video ref={videoRef} src={previewUrl} .../>` is never rendered when `open=false`. Parent at `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx:383` does conditionally mount on `displayAsset.type === 'video'`, but the internal early-return gates the preview tree regardless. Adding `src={open ? previewUrl : undefined}` would be dead code. Task 3 acceptance criteria explicitly allows this case: "Otherwise: no change (modal mount gates the src naturally)."
- **Image-pair keys included in PERF-21.** Plan called the `<img>` keys optional. Added them for uniformity — zero-risk symmetry with the video case, same per-side remount semantics on version switch. Final count: 4 compare keys (2 video + 2 image).
- **AnnotationCanvas.tsx not modified.** The existing `useLayoutEffect` cleanup (line 93–101) already calls `fabric.Canvas.dispose()` synchronously before DOM removal. The ImageViewer/VideoPlayer guards drive mount/unmount; no change to the canvas itself is warranted.
- **POST response shape unwrap.** `/api/comments` POST returns `{ comment: { id, ...data } }` (verified at `src/app/api/comments/route.ts:283`). Reconciliation extracts `body.comment` before swapping the temp entry. Added a defensive fallback that drops the temp and refetches if the server didn't include `comment` in the body.

## Deviations from Plan

### Notes on Plan Guidance Followed As Written

**1. [Plan-deferred branch — documented] ExportModal preview `src` unchanged**
- **Found during:** Task 3
- **Situation:** Plan Task 3 Step 4 gave two branches — mutate `src={open ? previewUrl : undefined}` if the parent mounts unconditionally, or skip the change if mount-gating already defers the src.
- **Outcome:** Skip branch applies. `ExportModal` has `if (!open) return null;` at line 223, so the `<video>` element isn't in the DOM when closed. No source change. Documented in Task 3 commit message and here per Task 3 acceptance criterion ("Task Summary must state which case applied").
- **Files modified:** None for this sub-step.

### No Rule 1/2/3 Auto-fixes

No bugs, missing-critical-functionality, or blocking issues were discovered during execution. Plan executed as written except for the documented deviations above, which were sanctioned by the plan itself.

---

**Total deviations:** 0 auto-fixed. 2 plan-sanctioned decisions (Promise<boolean> contract per Task 2 deviation note, ExportModal skip branch per Task 3 acceptance criterion).
**Impact on plan:** None — all choices match the plan's allowed branches or the plan's own deviation note.

## Issues Encountered

- **POST response shape.** Plan's reference snippet assumed a flat `Comment` response; actual endpoint returns `{ comment: {...} }`. Plan explicitly called this out as a check-and-adjust case: "If the shape returned differs (e.g., nested under `{ comment: ... }`), adjust the reconciliation line to extract correctly." Handled with `body.comment` unwrap and a defensive fallback.
- No other issues.

## Verification Gates

- `npx tsc --noEmit` — 0 errors (run after each task + final).
- `npm test` — 171/171 passing (run after each of Tasks 2, 3, 4 + final; baseline before Task 1 was also 171/171).
- `npm run build` — clean production build; full route table printed; no compile errors. Remaining ESLint warnings (`<img>` vs `<Image>`, a few `react-hooks/exhaustive-deps`) are all pre-existing in files untouched by this plan (scope boundary: not fixed).

Grep spot-checks:
- Dynamic modals: `grep -rE "const (ExportModal|AssetCompareModal|VersionStackModal|CreateReviewLinkModal|UserDrawer) = dynamic" src/` → 7 matches.
- No static named imports: `grep -rE "^import \{ (ExportModal|AssetCompareModal|VersionStackModal|CreateReviewLinkModal|UserDrawer) \}" src/` → 0 matches.
- Optimistic pattern: `grep -n "tempId\|temp-" src/hooks/useComments.ts` → matches at lines 64–118.
- Compare keys: `grep -nE "key=\{.compare-(A|B)-" src/components/viewer/VersionComparison.tsx` → 4 matches (803, 816, 833, 852).
- ImageViewer guards: `grep -n "displayShapes && displayShapes !== '\[\]'" src/components/viewer/ImageViewer.tsx` → 2 matches (163, 208).
- VideoPlayer guards: `grep -n "displayShapes && displayShapes !== '\[\]'" src/components/viewer/VideoPlayer.tsx` → 2 matches (509, 550, unchanged).

## Known Stubs

None. No placeholder data, no unwired components, no "coming soon" text introduced. All four task paths ship live behavior.

## User Setup Required

None — no environment variables, dashboard configuration, or external service wiring changed.

## Next Phase Readiness

- ExportModal, AssetCompareModal, VersionStackModal, CreateReviewLinkModal, UserDrawer are all independent chunks now. Future tree-shaking wins come "for free" when these modals add imports — they land in their own chunks, not the parent route.
- Deferred from v2.3 scope (per CONTEXT): `/review/[token]` RSC split and FPS detection optimization on upload. Both remain untouched; no blocking concerns.
- Milestone v2.3 Goal 3 (asset-viewer-restructure) success criteria satisfied:
  1. Five heavy modals shipped as separate chunks — PERF-18 ✓
  2. Comment submit feels instant; rollback on failure — PERF-19 ✓
  3. Read-only AnnotationCanvas mount gated by non-empty shapes; dispose runs on unmount via existing useLayoutEffect — PERF-20 ✓
  4. Compare-mode toggle remounts media via stable keys → existing cleanup runs — PERF-21 ✓

## Self-Check: PASSED

Files verified on disk:
- `src/components/ui/ModalSkeleton.tsx` ✓
- `src/hooks/useComments.ts` ✓
- `src/components/viewer/VersionComparison.tsx` ✓
- `src/components/viewer/ImageViewer.tsx` ✓
- `.planning/phases/76-asset-viewer-restructure/76-01-SUMMARY.md` ✓

Task commit hashes verified in git log:
- `9358e142` (Task 1) ✓
- `41ee0771` (Task 2) ✓
- `6f9c393e` (Task 3) ✓
- `35e2f5e1` (Task 4) ✓

---
*Phase: 76-asset-viewer-restructure*
*Completed: 2026-04-22*
