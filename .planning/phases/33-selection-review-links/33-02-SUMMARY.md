---
phase: 33-selection-review-links
plan: 02
subsystem: files/review
tags: [review-links, multi-select, toolbar, deleted-assets]
dependency_graph:
  requires: [33-01]
  provides: [selection-review-link-ui, deleted-asset-placeholder]
  affects: [FolderBrowser, review-page]
tech_stack:
  added: []
  patterns: [IIFE-button-pattern, conditional-placeholder-render]
key_files:
  created: []
  modified:
    - src/components/files/FolderBrowser.tsx
    - src/app/review/[token]/page.tsx
decisions:
  - selectionReviewIds resets to null in modal onClose to prevent stale IDs across selection changes
  - folderId passed as null when selectionReviewIds is set so POST sends folderId null
  - Deleted asset placeholder uses opacity-40 + dashed border to visually indicate unavailability
metrics:
  duration: 2min
  completed: "2026-04-09"
  tasks: 2
  files_modified: 2
requirements:
  - REVIEW-03
---

# Phase 33 Plan 02: Selection Review Links UI Summary

Wire multi-select toolbar in FolderBrowser to create selection-scoped review links and render a deleted-asset placeholder on the review page.

## What Was Built

**Task 1 — Review link button in multi-select toolbar (FolderBrowser.tsx)**

Added `selectionReviewIds` state and a Review link button inside the existing multi-select action bar (fixed bottom bar that appears when `selectedIds.size > 0`). The button:
- Appears after the Compare IIFE button, before the Move button
- Shows in accent purple styling (same as Compare active state) when <= 50 assets selected
- Shows in disabled grey styling (cursor-not-allowed) when > 50 assets selected
- Fires a `toast.error` when clicked with > 50 assets instead of opening the modal
- Calls `setSelectionReviewIds(Array.from(selectedIds))` then `setShowReviewModal(true)` on valid click

The existing `CreateReviewLinkModal` render was updated to pass:
- `folderId={selectionReviewIds ? null : folderId}` — clears folder scope when selection-driven
- `assetIds={selectionReviewIds ?? undefined}` — wires Plan 01's new prop
- `onClose` resets both `showReviewModal` and `selectionReviewIds` to null

**Task 2 — Deleted-asset placeholder (review/[token]/page.tsx)**

Replaced the flat `.map((asset) =>` with `.map((asset: any) => asset._deleted ? <placeholder> : <AssetCard>)`. The placeholder renders:
- `aspect-video` dashed-border card matching the grid cell aspect ratio
- Film icon + "Asset removed" text with `opacity-40` to signal unavailability
- No crash, no broken image — graceful degradation for stale selection review links

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 369711d3 | feat(33-02): add Review link button to multi-select toolbar |
| 2 | dab454fe | feat(33-02): add deleted-asset placeholder to review page |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- src/components/files/FolderBrowser.tsx — verified edits at lines 68, 1001-1025, 1093-1099
- src/app/review/[token]/page.tsx — verified edits at lines 351-381
- Commit 369711d3 — confirmed via git log
- Commit dab454fe — confirmed via git log
- npm run build — passed cleanly
