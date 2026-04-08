---
phase: 26-file-info-tab
plan: 01
subsystem: viewer/CommentSidebar
tags: [file-info, metadata, tab-bar, sidebar, video, image]
dependency_graph:
  requires: [25-comment-count-badge]
  provides: [file-info-tab]
  affects: [CommentSidebar, AssetViewerPage]
tech_stack:
  added: []
  patterns: [tabbed sidebar panel, metadata display, lucide-react Info icon, dl/dt/dd metadata grid]
key_files:
  created:
    - src/components/viewer/FileInfoPanel.tsx
  modified:
    - src/components/viewer/CommentSidebar.tsx
decisions:
  - Tab state (activeTab) lives inside CommentSidebar — no prop drilling needed, sidebar owns its own view mode
  - FileInfoPanel uses dl/dt/dd semantic HTML for accessible metadata display
  - FPS reads from (asset as any).fps — field not in Asset type, shows '—' when absent
  - Comments badge only shown when on Comments tab to avoid layout crowding
  - Filter/resolve toggle button only visible on Comments tab (irrelevant for Info tab)
metrics:
  duration: 2min
  completed: "2026-04-08"
  tasks: 2/2
  files: 2
---

# Phase 26 Plan 01: File Info Tab Summary

**One-liner:** Comments/Info tab bar added to asset viewer sidebar with FileInfoPanel showing filename, type, size, duration, resolution, aspect ratio, FPS, uploader, date, and version.

## What Was Built

Added a two-tab bar (Comments / Info) to the `CommentSidebar` component. The new "Info" tab renders a `FileInfoPanel` component that displays technical metadata about the current asset. All metadata is sourced from the existing `asset` object — no new API calls. Missing fields (e.g. FPS when not stored, width/height for assets without video metadata) gracefully show "—".

**FileInfoPanel** (`src/components/viewer/FileInfoPanel.tsx`):
- Helper functions: `formatBytes`, `formatDuration`, `formatResolution`, `formatAspectRatio`, `formatDate`
- Renders 10 metadata rows: Filename, Type, Size, Duration, Resolution, Aspect Ratio, FPS, Uploaded by, Date, Version
- Styled with dark theme colors matching the sidebar (`text-frame-textSecondary` labels, `text-white` values)

**CommentSidebar** (`src/components/viewer/CommentSidebar.tsx`):
- Two-tab bar with `MessageSquare` (Comments) and `Info` (Info) icons
- `activeTab` state defaults to `'comments'`
- Comments list, resolve toggle, and input area hidden when Info tab is active
- Comment count badge in tab only shown when on Comments tab

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create FileInfoPanel component | 3bb00267 | src/components/viewer/FileInfoPanel.tsx |
| 2 | Add tab bar to CommentSidebar and wire FileInfoPanel | dd1741b4 | src/components/viewer/CommentSidebar.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src/components/viewer/FileInfoPanel.tsx` exists
- [x] `src/components/viewer/CommentSidebar.tsx` imports and uses `FileInfoPanel`
- [x] Commit `3bb00267` exists in git log
- [x] Commit `dd1741b4` exists in git log
- [x] TypeScript compiles cleanly (npx tsc --noEmit: no errors)
