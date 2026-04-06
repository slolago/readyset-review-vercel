---
phase: "03-drag-to-move"
plan: "02"
subsystem: "files/FolderBrowser"
tags: [drag-and-drop, move, folder, ui]
dependency_graph:
  requires: []
  provides: [folder-drop-targets, drag-to-move]
  affects: [FolderBrowser, FolderCard]
tech_stack:
  added: []
  patterns: [HTML5 Drag and Drop API, custom dataTransfer MIME type]
key_files:
  created: []
  modified:
    - src/components/files/FolderBrowser.tsx
decisions:
  - Used application/x-frame-move MIME type for dataTransfer payload to distinguish move drags from OS file drops
  - Self-drop prevention checks if targetFolderId is included in the dragged IDs array
  - Drop handler calls move API directly rather than routing through handleMoveSelected to avoid coupling to selection state
  - ring-2 highlight used for drop target to visually distinguish from ring-1 selection highlight
metrics:
  duration: "8 min"
  completed: "2026-04-06"
  tasks: 2
  files: 1
---

# Phase 03 Plan 02: Folder Drop Targets (Drag-to-Move) Summary

Added HTML5 drag-and-drop drop-target behavior to FolderCard components so selected items can be dragged directly onto a folder to move them, using `application/x-frame-move` dataTransfer payload for disambiguation.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add dragOverFolderId state + handlers to FolderBrowser | 32d6fcf | FolderBrowser.tsx |
| 2 | Add drop target props to FolderCard with ring highlight | 32d6fcf | FolderBrowser.tsx |

## What Was Built

- `dragOverFolderId: string | null` state tracks which folder card is being hovered during a drag
- `handleFolderDragOver(folderId, e)` — accepts only `application/x-frame-move` MIME type, calls `e.preventDefault()`, sets `dropEffect = 'move'`, updates `dragOverFolderId`
- `handleFolderDragLeave` — clears `dragOverFolderId`
- `handleFolderDrop(targetFolderId, e)` — decodes JSON payload from `application/x-frame-move`, enforces self-drop prevention, calls move API for assets and folders in payload
- FolderCard: new optional props `isDropTarget`, `onDragOver`, `onDragLeave`, `onDrop`
- Drop target renders with `ring-2 ring-frame-accent bg-frame-accent/10` highlight while hovered

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The drop handler calls the real `/api/assets/:id` PUT and `/api/folders/:id` PUT endpoints (the same APIs used by the existing Move modal).

Note: The drag source side (`draggable` attribute + `onDragStart` that encodes `application/x-frame-move`) is not present in this codebase. This plan implements only the drop-target receiver. A future plan (03-01 or its equivalent) would add the drag source to make the full feature functional end-to-end.

## Self-Check: PASSED

- [x] `src/components/files/FolderBrowser.tsx` modified — FOUND
- [x] Commit `32d6fcf` — FOUND (`git log --oneline -1` confirms)
- [x] TypeScript compiles clean (`npx tsc --noEmit` — no output = no errors)
- [x] All success criteria met:
  - `dragOverFolderId` state: line 73
  - Folder cards have onDragOver (ring highlight): lines 636-641, 797
  - onDragLeave clears state: line 489
  - onDrop decodes application/x-frame-move: lines 497-499
  - Self-drop prevention: lines 509-511
  - TypeScript clean: confirmed
