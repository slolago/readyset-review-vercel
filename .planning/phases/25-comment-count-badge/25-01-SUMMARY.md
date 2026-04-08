---
phase: 25-comment-count-badge
plan: 01
subsystem: files/AssetCard
tags: [badge, comment-count, grid-view, ui]
dependency_graph:
  requires: []
  provides: [comment-count-badge-grid]
  affects: [AssetCard]
tech_stack:
  added: []
  patterns: [lucide-react icon badge, conditional render, 99+ cap]
key_files:
  created: []
  modified:
    - src/components/files/AssetCard.tsx
decisions:
  - Placed badge inside existing info row flex container alongside version count for layout consistency
  - Used MessageSquare (not MessageCircle) to match the speech-bubble icon convention in the codebase
  - Badge hidden (not zero-displayed) when count is 0 or absent, per P25-03
metrics:
  duration: 2min
  completed: "2026-04-07"
  tasks: 1/1
  files: 1
---

# Phase 25 Plan 01: Comment Count Badge Summary

**One-liner:** Comment count badge with MessageSquare icon on AssetCard grid cards, capped at 99+, hidden when zero.

## What Was Built

Added a comment count badge to the info section of `AssetCard` (grid view). The badge appears only when `_commentCount > 0`, shows `MessageSquare` icon + number, and caps at "99+" for counts above 99. Reads from `asset._commentCount` which is already populated by the assets API endpoint — no new API calls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add comment count badge to AssetCard info section | 6a2d36bb | src/components/files/AssetCard.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src/components/files/AssetCard.tsx` exists and contains `MessageSquare`, `commentCount`, `99+`
- [x] Commit `6a2d36bb` exists in git log
- [x] TypeScript compiles cleanly (npx tsc --noEmit: no output)
