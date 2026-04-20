---
phase: 46
plan: 01
subsystem: comments
tags: [comments, range, integrity, composer]
requires: []
provides:
  - Polished range-comment UI (timeline tooltip + sidebar badge)
  - Consistent comment count between grid badge and sidebar tab
  - Composer state isolation across asset switches
affects:
  - src/components/viewer/CommentSidebar.tsx
  - src/components/viewer/CommentItem.tsx
  - src/components/viewer/VideoPlayer.tsx
  - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx
  - src/app/review/[token]/page.tsx
  - src/app/api/assets/route.ts
tech-stack:
  added: []
  patterns:
    - "useEffect keyed on asset.id for cross-asset state reset"
    - "Firestore in-memory filter for parentId + non-empty text aggregation"
key-files:
  created: []
  modified:
    - src/components/viewer/VideoPlayer.tsx
    - src/components/viewer/CommentItem.tsx
    - src/components/viewer/CommentSidebar.tsx
    - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx
    - src/app/review/[token]/page.tsx
    - src/app/api/assets/route.ts
decisions:
  - "Range-comment timeline tooltip mirrors the timedComments tooltip pattern for visual consistency"
  - "Comment-count rule: top-level (parentId == null) AND text.trim() != '' — replies and empties excluded"
  - "Composer state reset on asset.id change is belt-and-suspenders (review page already cleared imperatively in handleSelectAsset)"
  - "Merged Task 5 one-liner into CommentSidebar edits; kept its own commit for traceability"
metrics:
  tasks_completed: 6
  human_checkpoint: 1 (Task 7 — pending user verification)
  duration_minutes: ~12
  completed: 2026-04-20
---

# Phase 46 Plan 01: comments-integrity-and-range Summary

Polished the in/out range comment flow (CMT-01), fixed the grid badge so it counts only user-visible top-level comments (CMT-02), and guaranteed the composer cannot leak a drawing across assets (CMT-03). Six auto tasks shipped; one human-verify checkpoint deferred to the user per the plan.

## What shipped

### CMT-01 — Range comment polish
- **Task 1 (VideoPlayer.tsx)**: Range-marker hitbox wrapped in a hover container that renders a styled tooltip ("IN mm:ss - OUT mm:ss" + author + first 120 chars of text). Tooltip uses the same edge-shift pattern as the timedComments tooltip so it never clips off the timeline edges. Click-to-seek wiring is unchanged — still goes through `onCommentClick(c)` and the parent seeks to the comment's `timestamp` (which equals `inPoint` for range comments, set in `CommentSidebar.handleSubmit`).
- **Task 2 (CommentItem.tsx)**: Timecode pill now renders `"0:03 - 0:08"` when `comment.inPoint && comment.outPoint` are both set. Body-click seeks to `inPoint` (not `timestamp`) for semantic clarity. Non-range comments render unchanged.

### CMT-02 — Count integrity
- **Task 4 (api/assets/route.ts)**: The `_commentCount` aggregation now skips docs where `parentId` is truthy (replies) and docs where `text` is empty/whitespace. In-memory filter after a single `where('projectId', '==', projectId)` query — no composite index required.
- **Task 5 (CommentSidebar.tsx)**: Sidebar tab header count changed from `comments.length` (which included replies) to `topLevel.length` (parent-less only). Now matches the grid badge for the same asset.

### CMT-03 — Composer hygiene
- **Task 3a (viewer page.tsx)**: Added a `useEffect` keyed on `displayAsset?.id` that clears `isAnnotationMode`, `pendingAnnotation`, `activeAnnotationCommentId`, `displayShapes`, `selectedCommentId`. Prevents a pending drawing captured for Asset A from surviving a version switch or navigation to Asset B.
- **Task 3b (review page.tsx)**: Same cleanup effect keyed on `selectedAsset?.id` for the review-link viewer. (The imperative clear already present in `handleSelectAsset` still runs; this is a second line of defence for any future path that mutates `selectedAsset` without going through that handler.)
- **Task 3c (CommentSidebar.tsx)**: Added a cleanup `useEffect` keyed on `asset.id` that resets `text`, `inPoint`, `outPoint`, `replyTo`. `includeTimestamp` (user preference) and `activeTab` are intentionally preserved.

### CMT-03 — Range composer UX polish
- **Task 6 (CommentSidebar.tsx)**:
  - OUT-before-IN guard: clicking OUT when `currentTime <= inPoint` shows a `react-hot-toast` error ("Out-point must come after in-point") and does not mutate `outPoint`.
  - Visual hint: OUT button gets `animate-pulse` while IN is set but OUT is not, drawing the eye to the missing second mark.
  - Timestamp toggle: disabled + faded (`opacity-40`) once a full range is set — the toggle is redundant in that state because `handleSubmit` already writes `timestamp = inPoint` when both IN and OUT are present.

## Commits

| Task | Type | Hash | Message |
| ---- | ---- | ---- | ------- |
| 1 | feat | 751589df | styled tooltip on range-comment timeline markers |
| 2 | feat | af681f16 | range badge + in-point seek in CommentItem |
| 3 | fix  | e5fbd043 | clear composer + annotation state on asset switch |
| 4 | fix  | 87c2c124 | _commentCount excludes replies and empty-text docs |
| 5 | fix  | 60d0924d | sidebar tab count uses topLevel.length to match grid badge |
| 6 | feat | debb4997 | OUT<IN guard, pulsing OUT hint, disable timestamp toggle when range set |

## Deviations from Plan

None — plan executed exactly as written. Each task's surgical scope held; no auto-fixes triggered.

The one minor judgement call: for Task 3b (review page) the plan said "find the equivalent pendingAnnotation state and add an identical cleanup effect" — the review page already clears all composer state imperatively inside `handleSelectAsset`. I added the effect anyway (as the plan directed) since it guards against any future path that mutates `selectedAsset` without going through that handler.

## Task 7 — Human verification checklist (deferred)

Run `npm run dev`, open a project with at least one video asset, then walk each scenario below and report pass/fail.

### Scenario A — Range comment (CMT-01)
1. Enter the video viewer.
2. Seek to ~3s, click IN. Seek to ~8s, click OUT. Type "test range" and press Enter.
3. A highlighted range bar appears on the timeline between 3s and 8s.
4. Hover the range bar: tooltip shows `IN 0:03 - OUT 0:08`, author name, and "test range".
5. Seek to ~15s. Click the range bar.
6. Video seeks to 0:03 (the in-point), not 0:15.
7. In the sidebar, the comment's timecode pill reads `0:03 - 0:08`.

### Scenario B — Count integrity (CMT-02)
1. Reply to the range comment twice.
2. Go back to the project grid.
3. The asset's comment badge shows `1`, not `3`.
4. Reopen the viewer: tab header shows `Comments 1`.

### Scenario C — Orphan drawing (CMT-03)
1. Open Asset A, click Annotate, draw a rectangle, click "Attach to comment".
2. Do NOT type any text. Navigate to Asset B.
3. Asset B's composer has no attached drawing, no text, no range, no reply target.
4. Check Firestore `comments`: no new doc was created with `text === ''`.

### Scenario D — OUT-before-IN guard
1. Seek to 10s, click IN. Seek to 5s, click OUT.
2. Toast appears: "Out-point must come after in-point". OUT is not set.

### Scenario E — Timestamp toggle disabled when range set
1. Seek to 3s, click IN. Seek to 8s, click OUT.
2. The "0:08" timestamp chip (Clock icon) is now faded and disabled.

## Verification status

- `npx tsc --noEmit`: clean (0 errors across the project)
- Per-task typecheck filter: clean for each file touched
- Static success criteria (1, 2, 3): implemented end-to-end — gated only on the human checkpoint for live verification

## Known Stubs

None. All changes are fully wired to real state/data.

## Self-Check: PASSED

- All 6 task commits present in `git log` (751589df, af681f16, e5fbd043, 87c2c124, 60d0924d, debb4997)
- All modified files exist and compile
- No new untracked files
