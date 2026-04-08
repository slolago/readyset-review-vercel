---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: milestone
status: Milestone complete
stopped_at: Completed 23-01-PLAN.md
last_updated: "2026-04-08T00:08:14.669Z"
progress:
  total_phases: 18
  completed_phases: 13
  total_plans: 26
  completed_plans: 25
---

# State

## Current Phase

14

## Current Plan

Plan 01 complete — Phase 14 plan 01 done

## Status

in_progress

## Last Session

Stopped at: Completed 23-01-PLAN.md

## Decisions

- Using Playwright MCP for visual verification before pushing
- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- Keep Home icon import in FolderBrowser.tsx because it is also used for Project root button in move dialog
- Named export (not default) for Breadcrumb to match Button.tsx / Spinner.tsx convention
- Upload thumbnail via server-side route to avoid GCS CORS issues
- Thumbnail route updates Firestore directly; complete endpoint no longer needs thumbnailGcsPath
- Use application/x-frame-move MIME type (not text/plain) so container drag handlers can distinguish internal item drags from OS file/folder drops
- Drag payload logic lives in FolderBrowser where selectedIds is in scope; card components just forward the event
- Self-drop prevention checks if targetFolderId is in dragged IDs before calling move API
- [Phase 05-bug-fixes]: Use token as Firestore document ID for review links so GET/DELETE use strongly-consistent direct doc lookup instead of query
- [Phase 06-01]: Reuse onDeleted in AssetCard as post-rename refresh trigger; divider on Delete item, not Rename
- [Phase 06-01]: FolderCard onRename threads fetchFolders from FolderBrowser for consistent refresh pattern
- [Phase 06-02]: Shallow copy only (same gcsPath/url) — new Firestore doc, new independent versionGroupId
- [Phase 06-02]: MoveModal reused for FolderCard copy picker via optional title prop
- [Phase 06-02]: ensureAllFolders lazy-loads folder tree for copy modal; skips if already populated
- [Phase 07-01]: VersionStackModal co-located in AssetCard.tsx following AssetFolderPickerModal pattern
- [Phase 07-01]: Delete button hidden (not disabled) when versions.length === 1 — unambiguous UX, no accidental last-version delete
- [Phase 08-01]: Lazy folder loading on first expand to avoid N+1 fetches; error marks foldersLoaded=true to prevent infinite retries
- [Phase 08-01]: treeNodes synced from useProjects() via Map lookup preserving expanded/foldersLoaded state across project list refreshes
- [Phase 08-02]: AppShell localStorage: SSR-safe lazy initializer with typeof window guard + useEffect write; sidebar-open key
- [Phase 08-02]: ProjectTreeNav mounted inside Sidebar nav below admin link, separated by h-px divider
- [Phase 09-01]: Second CreateReviewLinkModal instance (folderReviewTarget state) for folder-targeted creation — avoids mutating project-level showReviewModal flow
- [Phase 09-01]: allowDownloads/allowApprovals/showAllVersions default to false via strict === true check in API
- [Phase 09-review-link-enhancements]: PATCH handler added to existing [token]/route.ts file alongside GET and DELETE — no new route files needed
- [Phase 09-review-link-enhancements]: [Phase 09-02]: Inline rename uses renamingId === link.id pattern for per-row edit state — avoids separate modal
- [Phase 09-review-link-enhancements]: [Phase 09-02]: Tab bar uses -mb-px on active tab border to overlap container border-b for connected underline effect
- [Phase 11-nice-to-have]: MenuItem type import used as documentation even though items inlined as object literals
- [Phase 11-nice-to-have]: Copy to excluded from AssetListView rows: AssetListRow does not own CopyModal state
- [Phase 12-download-and-polish]: setTimeout(0) wraps addEventListener in ContextMenu to prevent opening mousedown from firing onClose
- [Phase 12-download-and-polish]: List view checkboxes use div+Check pattern (not native input) to match AssetCard grid style; row variant uses pointer-events-none
- [Phase 13-01]: Dual signed URL strategy — signedUrl (no disposition) for inline playback, downloadUrl (attachment disposition) for forced download; downloadUrl only generated when allowDownloads is true
- [Phase 13-02]: createPortal to document.body with position:fixed from getBoundingClientRect() — canonical escape from overflow-hidden ancestors; dual-ref outside-click checks triggerRef AND panelRef
- [Phase 13]: hideActions prop on AssetCard to suppress Dropdown and ContextMenu for guests; review page always passes hideActions
- [Phase 14-01]: Custom inline breadcrumb nav used in ReviewLinkFolderBrowser instead of Breadcrumb component — Breadcrumb auto-generates folder hrefs, cannot produce /review-links paths
- [Phase 14-01]: List page defaults viewMode to 'list' (date column visible by default); token page defaults to 'grid'
- [Phase 14-review-link-folders]: Gate Review Links sidebar entry on foldersLoaded to prevent layout jump
- [Phase 15]: collectionGroup with 30-id chunks used for cross-project asset aggregation in /api/stats
- [Phase 15]: StatCard value typed as string|null — null triggers animate-pulse skeleton instead of a loading prop
- [Phase 15]: Root-level assets excluded from folder-scoped size query; BFS used for recursive descendant traversal
- [Phase 23-timecode-frame-fix]: Add setCurrentTime + onTimeUpdate directly after v.currentTime assignment in stepFrame and arrow key handlers — bypasses 0.25s rAF threshold without altering it

## Roadmap Evolution

- Phase 12 added: download-and-polish — bulk download, select-all toggle, right-click dismiss fix, checkbox styling, perf optimisations
- Phase 13 added: review-polish-and-fixes — force-download to disk, three-dot menu fix on review page, guest read-only enforcement
- Phase 14 added: review-link-folders — virtual folder structure per review link inside projects, navigable from sidebar
- Phase 15 added: dashboard-and-storage — real dashboard stats (projects/assets/collaborators/storage) + folder size at each route

## Blockers

(none)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 01-breadcrumb-nav | 01 | 5 min | 2/2 | 2 |
| 02-video-thumbnails-fix | 02 | 8 min | 3/3 | 4 |
| 03-drag-to-move | 01 | 8 min | 2/2 | 3 |
| 03-drag-to-move | 02 | 8 min | 2/2 | 1 |
| 05-bug-fixes | 01 | 2 min | 2/2 | 2 |
| 06-asset-context-menu | 01 | 10 min | 2/2 | 2 |
| 06-asset-context-menu | 02 | 18 min | 2/2 | 5 |
| 07-version-management | 01 | 2 min | 2/2 | 1 |
| 08-project-sidebar | 01 | 8 min | 2/2 | 2 |
| Phase 08-project-sidebar P02 | 2min | 2 tasks | 2 files |
| 09-review-link-enhancements | 01 | 10 min | 3/3 | 4 |
| Phase 09-review-link-enhancements P02 | 15min | 3 tasks | 3 files |
| Phase 11-nice-to-have P02 | 15min | 4 tasks | 5 files |
| Phase 12-download-and-polish P01 | 8min | 1 tasks | 2 files |
| 13-review-polish-and-fixes | 01 | 10 min | 2/2 | 5 |
| 13-review-polish-and-fixes | 02 | 10 min | 1/1 | 2 |
| 14-review-link-folders | 01 | 15 min | 3/3 | 3 |
| Phase 14-review-link-folders P02 | 5 | 1 tasks | 1 files |
| Phase 15 P01 | 8 | 2 tasks | 2 files |
| Phase 15 P02 | 8 | 2 tasks | 2 files |
| Phase 23-timecode-frame-fix P01 | 1 | 1 tasks | 1 files |
