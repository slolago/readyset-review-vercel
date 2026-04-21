---
phase: 56-viewer-alignment
plan: 01
subsystem: viewer
tags: [viewer, export, review-link, vumeter, compare, range-comments]
requirements: [VWR-01, VWR-02, VWR-03, VWR-04, VWR-05, VWR-06]
completed: 2026-04-20
---

# Phase 56 Plan 01: Viewer Alignment Summary

Closed the six VWR audit gaps with six atomic, targeted edits — no refactors, no cross-concern touch-ups. Unified the three "range" concepts (loop / range-comment / export trim) through the parent's lifted `rangeIn`/`rangeOut` state, fixed the review-page routing cascade to match the internal viewer, added a ref-counted teardown for the VUMeter `sharedCtx` AudioContext, gave ExportModal a real "duration not available yet" state, and corrected the VersionComparison duration-effect lifecycle so it re-subscribes when the user swaps versions.

## Tasks

### VWR-01 — Pass rangeIn/rangeOut to ExportModal

**Commit:** `f5d4c5a4`
**File:** `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx`

Added `initialIn={rangeIn}` / `initialOut={rangeOut}` to the `<ExportModal>` render at the bottom of the internal viewer page. `ExportModal`'s existing reset-on-open effect already reads those props, so no modal change was needed. Review page intentionally untouched — guests don't export.

### VWR-02 — ExportModal 0-duration waiting state

**Commit:** `f2a61f63`
**File:** `src/components/viewer/ExportModal.tsx`

Derived `rawDuration` and `isWaitingForDuration` from `asset.duration ?? 0`. When waiting, the trim / format / filename blocks are replaced by a clear "Duration not available yet" notice explaining the asset is still processing, and the footer collapses to a single Close button. The existing `Math.max(0.1, …)` fallback for `duration` is preserved for the normal path.

### VWR-03 — Review page routing cascade

**Commit:** `0bdbae72`
**File:** `src/app/review/[token]/page.tsx`

Imported `DocumentViewer`, `HtmlViewer`, `FileTypeCard`. Replaced the video / else-ImageViewer fork with the same cascade used by the internal viewer: `video → image → pdf (subtype) → html (subtype) → FileTypeCard`. No other review-page behavior changed; `CommentSidebar` still renders beside every branch.

### VWR-04 — Range-comment click unifies rangeIn/rangeOut

**Commit:** `bb0b1f1f`
**Files:** internal viewer + review page `handleCommentClickFromTimeline`

Extended both handlers so that when the clicked comment has `inPoint` + `outPoint` defined, the parent writes those into `setRangeIn` / `setRangeOut`. Loop (VideoPlayer), Export trim (VWR-01), and composer range (CommentSidebar) all read the same state, so one click now lights up the full chain. Non-range comments leave the existing range untouched.

Comment type already carries `inPoint?` / `outPoint?` (src/types/index.ts:118–119), so no type changes required.

### VWR-05 — VUMeter sharedCtx ref-counted teardown

**Commit:** `8e06967a`
**File:** `src/components/viewer/VUMeter.tsx`

Added a module-level `consumerCount` alongside `sharedCtx`. The graph-lifecycle `useEffect` (deps `[]`) bumps the counter on mount; the cleanup decrements on unmount and closes + nulls `sharedCtx` when the count hits zero. Because the deps are `[]`, this pairs correctly across every mount/unmount and does NOT fire on re-renders. `getOrCreateAudioContext()` already handles the closed/null case, so the next mount lazily rebuilds a fresh context.

### VWR-06 — VersionComparison duration effects re-subscribe on version swap

**Commit:** `0a347969`
**File:** `src/components/viewer/VersionComparison.tsx`

Changed both `useEffect`s that track `durationA`/`durationB` from `[]` deps to `[selectedIdA]` / `[selectedIdB]`. Inside each effect: reset `setDurationX(0)` immediately (so the scrubber max doesn't show stale duration while the new src loads), attach `loadedmetadata`, and if `readyState >= 1` read duration now. Cleanup detaches the old listener before the new effect body runs. Matches the existing `dimsA`/`dimsB` reset pattern at lines 281–282.

## Verification

- `npx tsc --noEmit` clean after every task.
- `npx vitest run` → 138/138 tests pass on the final tree (`tests/format-date`, `tests/permissions`, `tests/permissions-api`).
- Manual smoke deferred to a follow-up pass — see `56-01-VERIFICATION.md` for the items flagged `human_needed` (review-page route-through for docs/html/other, and the VUMeter leak check under real navigation).

## Deviations from Plan

None — plan executed exactly as written. Every task's file list, action, and done criteria were followed literally.

## Self-Check: PASSED

- `f5d4c5a4` FOUND (VWR-01)
- `f2a61f63` FOUND (VWR-02)
- `0bdbae72` FOUND (VWR-03)
- `bb0b1f1f` FOUND (VWR-04)
- `8e06967a` FOUND (VWR-05)
- `0a347969` FOUND (VWR-06)
