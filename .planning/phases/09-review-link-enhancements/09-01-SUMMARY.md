---
phase: 09-review-link-enhancements
plan: "01"
subsystem: review-links
tags: [review-links, modal, folder-context-menu, permissions]
dependency_graph:
  requires: []
  provides: [review-link-toggles, folder-create-review-link]
  affects: [CreateReviewLinkModal, review-links-api, FolderBrowser, ReviewLink-type]
tech_stack:
  added: []
  patterns: [optional-prop-wiring, second-modal-instance-for-scoped-target]
key_files:
  created: []
  modified:
    - src/types/index.ts
    - src/app/api/review-links/route.ts
    - src/components/review/CreateReviewLinkModal.tsx
    - src/components/files/FolderBrowser.tsx
decisions:
  - "Second CreateReviewLinkModal instance (folderReviewTarget state) for folder-targeted creation — avoids mutating the project-level showReviewModal flow"
  - "onCreateReviewLink optional prop on FolderCard to keep FolderCard independent of parent state"
  - "allowDownloads/allowApprovals/showAllVersions default to false in API via strict === true check"
  - "Divider placed before Create review link item (between Duplicate and Delete section) so Delete stays visually separated"
metrics:
  duration: "10 min"
  completed_date: "2026-04-06T19:49:41Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 9 Plan 1: Review Link Modal Toggles + Folder Context Menu Entry Summary

Added three permission toggles to CreateReviewLinkModal (Allow downloads, Allow approvals, Show all versions), wired them through the API, and surfaced a "Create review link" action in the FolderCard context menu for per-folder modal invocation.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Extend ReviewLink type and API route | 748d46a0 | src/types/index.ts, src/app/api/review-links/route.ts |
| 2 | Add three toggles to CreateReviewLinkModal | 1eeb823f | src/components/review/CreateReviewLinkModal.tsx |
| 3 | Add Create review link to FolderCard context menu | 7e9984cf | src/components/files/FolderBrowser.tsx |

## Key Changes

### ReviewLink type fields added (src/types/index.ts)
- `allowDownloads?: boolean` — default false, viewers can download assets
- `allowApprovals?: boolean` — default false, viewers can approve/reject
- `showAllVersions?: boolean` — default false, show all asset versions

### API route (src/app/api/review-links/route.ts)
- POST handler now destructures `allowDownloads`, `allowApprovals`, `showAllVersions` from request body
- Persists each with `=== true` safe boolean default (false when absent/undefined)

### CreateReviewLinkModal (src/components/review/CreateReviewLinkModal.tsx)
- Three new `useState(false)` state variables
- All three fields included in POST body
- Four toggle rows wrapped in `<div className="space-y-1 divide-y divide-frame-border/40">` with `py-2` padding per row

### FolderBrowser (src/components/files/FolderBrowser.tsx)
- New state: `folderReviewTarget: string | null` — tracks which folder's "Create review link" was clicked
- Second `<CreateReviewLinkModal>` rendered when `folderReviewTarget !== null`, with that folder's id as `folderId`
- `FolderCard` gains optional `onCreateReviewLink?: () => void` prop + matching type entry
- Dropdown items: "Create review link" with `LinkIcon` inserted before Delete with `divider: true`
- Wired in FolderBrowser render: `onCreateReviewLink={() => setFolderReviewTarget(folder.id)}`

## Decisions Made

- Used a second modal instance (separate `folderReviewTarget` state) rather than overriding the existing `showReviewModal` / `folderId` state — keeps the project-level Share button flow untouched
- `onCreateReviewLink` is an optional prop on `FolderCard` so it degrades gracefully if not wired
- Divider placed before the "Create review link" item (not just before Delete) so the Delete action remains isolated in its own danger zone below the divider

## Deviations from Plan

None — plan executed exactly as written. The plan noted `LinkIcon` was already imported at line 23; confirmed correct.

## Self-Check

- [x] src/types/index.ts modified with three new optional boolean fields
- [x] src/app/api/review-links/route.ts persists new fields with false defaults
- [x] src/components/review/CreateReviewLinkModal.tsx renders four toggle rows
- [x] src/components/files/FolderBrowser.tsx has folderReviewTarget state, second modal, FolderCard prop wired
- [x] `npx tsc --noEmit` exits 0 after each task
- [x] All three tasks committed individually with --no-verify
