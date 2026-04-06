---
phase: 09-review-link-enhancements
plan: 02
subsystem: ui
tags: [react, nextjs, firebase, review-links, tabs]

requires:
  - phase: 05-bug-fixes
    provides: "Review link token used as Firestore doc ID for direct lookups"

provides:
  - "PATCH /api/review-links/[token] endpoint for renaming review links"
  - "ReviewLinksTab component listing all project review links with copy/rename/delete"
  - "Project root page tabbed layout with Files and Review Links tabs"

affects: [review-link-enhancements, project-view]

tech-stack:
  added: []
  patterns:
    - "Inline rename pattern: renamingId + renameValue state, autoFocus input, Enter/blur commits, Escape cancels"
    - "Tab state management via useState<'files' | 'review-links'> in page component"

key-files:
  created:
    - src/components/review/ReviewLinksTab.tsx
  modified:
    - src/app/api/review-links/[token]/route.ts
    - src/app/(app)/projects/[projectId]/page.tsx

key-decisions:
  - "PATCH handler added to existing [token]/route.ts file alongside GET and DELETE — no new route files needed"
  - "Inline rename uses renamingId === link.id pattern for per-row edit state — avoids separate modal"
  - "Tab bar uses -mb-px on active tab to overlap border-b of container for connected underline effect"
  - "Review Links tab uses window.location.origin for URL construction (client component, window always available)"
  - "commitRename re-fetches full list rather than patching local state — ensures consistency with server"

patterns-established:
  - "Named export (not default) for ReviewLinksTab following Button/Spinner/Breadcrumb convention"

requirements-completed: [REQ-09D]

duration: 15min
completed: 2026-04-06
---

# Phase 9 Plan 2: Review Links Tab Summary

**Tabbed project root page with ReviewLinksTab providing copy, inline rename, and delete for all project review links, backed by a new PATCH /api/review-links/[token] endpoint**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-06T19:51:54Z
- **Completed:** 2026-04-06T20:06:54Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added PATCH endpoint to `/api/review-links/[token]/route.ts` for renaming review links with auth ownership check
- Created `ReviewLinksTab` component that lists all review links with copy-to-clipboard, inline rename, open-in-tab, and delete actions
- Replaced thin project root page with a tabbed layout (Files | Review Links) while preserving all existing FolderBrowser behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PATCH handler to /api/review-links/[token]/route.ts** - `22b7a0d6` (feat)
2. **Task 2: Create ReviewLinksTab component** - `8884b3bf` (feat)
3. **Task 3: Add tab bar to project root page and wire ReviewLinksTab** - `058ef42a` (feat)

## Files Created/Modified

- `src/app/api/review-links/[token]/route.ts` - Added PATCH handler: validates auth, verifies ownership, validates name, updates Firestore
- `src/components/review/ReviewLinksTab.tsx` - New component: fetches links, renders list with copy/rename/delete or empty state
- `src/app/(app)/projects/[projectId]/page.tsx` - Replaced single FolderBrowser render with two-tab layout

## Decisions Made

- PATCH handler validates name is a non-empty string and returns 400 with `{ error: 'name required' }` if blank — consistent with server-side validation pattern
- Inline rename stores `renamingId: string | null` + `renameValue: string` separately so editing one row doesn't affect others
- `commitRename` re-fetches the full list on success rather than patching local state — consistent with fetch-on-mount pattern used by delete flow
- Tab bar uses `-mb-px` on active tab border to overlap the `border-b` of the container, creating the connected underline visual common in frame design
- Folder sub-pages (`/projects/[projectId]/folders/[folderId]`) render FolderBrowser directly and are completely unaffected

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Review Links tab is fully functional end-to-end
- Phase 09-02 (REQ-09D) satisfied: managers can view, copy, rename, and delete all project review links from a single view
- No blockers for subsequent phases

---
*Phase: 09-review-link-enhancements*
*Completed: 2026-04-06*
