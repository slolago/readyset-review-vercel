# Roadmap: readyset-review

## Overview

v1.2 milestone — bug fixes + feature expansion based on Notion spec "In house Frame".

## Phases

- [x] **Phase 1: breadcrumb-nav** - Breadcrumb navigation bar
- [x] **Phase 2: video-thumbnails-fix** - Fix thumbnail frame + CORS in production
- [x] **Phase 3: drag-to-move** - Drag assets into folders
- [x] **Phase 4: folder-drop-import** - OS folder drag-and-drop import
- [x] **Phase 5: bug-fixes** - Fix review link broken + upload stuck (completed 2026-04-06)
- [x] **Phase 6: asset-context-menu** - Rename, Copy to, Duplicate in context menu (completed 2026-04-06)
- [x] **Phase 7: version-management** - Version badges, manage version stack UI (completed 2026-04-06)
- [x] **Phase 8: project-sidebar** - Collapsible project tree sidebar (completed 2026-04-06)
- [x] **Phase 9: review-link-enhancements** - Allow downloads, advanced settings, folder share links, links manager tab (completed 2026-04-06)
- [x] **Phase 10: list-view** - List/grid toggle with date uploaded + uploaded by columns (completed 2026-04-06)
- [x] **Phase 11: nice-to-have** - Guest name prompt + short review link tokens + right-click context menus on assets/folders and empty canvas (completed 2026-04-07)
- [x] **Phase 12: download-and-polish** - Bulk download, select-all toggle, right-click dismiss fix, checkbox styling, perf optimisations (completed 2026-04-07)

## Phase Details

### Phase 1: breadcrumb-nav
**Goal**: Extract inline breadcrumb into reusable Breadcrumb component.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-03
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Extract Breadcrumb component and wire into FolderBrowser

**Success Criteria** (what must be TRUE):
  1. Breadcrumb bar visible and clickable ✓

### Phase 2: video-thumbnails-fix
**Goal**: Fix thumbnail frame selection + route upload through backend to fix CORS.
**Depends on**: Phase 1
**Requirements**: REQ-04, REQ-05
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — Fix thumbnail frame selection (seek to 25% / max 5s)
- [x] 02-02-PLAN.md — Route thumbnail upload through backend API to avoid CORS

**Success Criteria** (what must be TRUE):
  1. Thumbnail captured at 25%/5s ✓
  2. Thumbnails work in production ✓

### Phase 3: drag-to-move
**Goal**: Implement drag-and-drop of assets/folders into target folders.
**Depends on**: Phase 2
**Requirements**: REQ-06, REQ-07
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Add drag sources to AssetCard and FolderCard
- [x] 03-02-PLAN.md — Add folder drop zones with visual feedback

**Success Criteria** (what must be TRUE):
  1. Drag items into folders ✓

### Phase 4: folder-drop-import
**Goal**: Drag OS folder into app preserving subfolder structure.
**Depends on**: Phase 3
**Requirements**: REQ-08, REQ-09, REQ-10
**Plans:** Already working — confirmed by user testing. ✓

### Phase 5: bug-fixes
**Goal**: Fix two production bugs: (1) review links show "Link not found or expired" immediately after creation; (2) video upload gets stuck at "Uploading..." and never completes for subsequent uploads.
**Depends on**: Phase 4
**Requirements**: REQ-B01, REQ-B02
**Plans:** 2/2 plans complete

Plans:
- [ ] 05-01-PLAN.md — Fix review link "Link not found or expired" on fresh links
- [x] 05-02-PLAN.md — Fix upload stuck at "Uploading..." for subsequent uploads

**Success Criteria** (what must be TRUE):
  1. A newly created review link is accessible immediately at its URL
  2. Uploading a second video to the same folder completes successfully
  3. No "Link not found or expired" error on fresh links

### Phase 6: asset-context-menu
**Goal**: Add Rename, Copy to, and Duplicate actions to the asset context menu (MoreHorizontal dropdown on asset cards and folder cards).
**Depends on**: Phase 5
**Requirements**: REQ-06A, REQ-06B, REQ-06C
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — Rename action for asset and folder cards (inline editing, Enter/blur saves, Escape cancels)
- [x] 06-02-PLAN.md — Copy to and Duplicate actions

**Success Criteria** (what must be TRUE):
  1. Context menu has "Rename" — clicking it makes the filename inline-editable and saves on Enter/blur
  2. "Copy to" opens a folder picker and duplicates the asset to the selected folder
  3. "Duplicate" creates a copy in the same folder with "Copy of " prefix
  4. All three options work on both asset cards and folder cards

### Phase 7: version-management
**Goal**: Show version count badges (V2, V3, etc.) on asset cards and add "Manage version stack" to the context menu to view and delete individual versions.
**Depends on**: Phase 6
**Requirements**: REQ-07A, REQ-07B
**Success Criteria** (what must be TRUE):
  1. Asset cards show a version badge (e.g. "V3") when the asset has more than 1 version
  2. Context menu has "Manage version stack" option
  3. Clicking it opens a modal listing all versions with date, uploader, and delete option
  4. User can delete individual versions from the stack

### Phase 8: project-sidebar
**Goal**: Add a collapsible left sidebar showing a tree of all projects and their top-level folders. Clicking a project or folder navigates to it.
**Depends on**: Phase 7
**Requirements**: REQ-08A, REQ-08B
**Plans:** 2/2 plans complete

Plans:
- [x] 08-01-PLAN.md — useProjectTree hook + ProjectTreeNav collapsible tree component (2026-04-06)

**Success Criteria** (what must be TRUE):
  1. A sidebar panel is visible on the left side of the app layout
  2. Projects are listed with a collapse/expand toggle showing their folders
  3. Clicking any project or folder navigates to that view
  4. Current location is highlighted in the sidebar
  5. Sidebar can be collapsed to icon-only mode

### Phase 9: review-link-enhancements
**Goal**: Expand review link functionality: (a) add Allow downloads toggle to Create Review Link modal; (b) add advanced settings (Allow approvals, Show all versions, Save settings); (c) allow creating review links from folder context menus; (d) add Review Links tab to view and rename existing links.
**Depends on**: Phase 8
**Requirements**: REQ-09A, REQ-09B, REQ-09C, REQ-09D
**Success Criteria** (what must be TRUE):
  1. Create Review Link modal has "Allow downloads" toggle (default off)
  2. Modal has additional toggles: Allow approvals, Show all versions
  3. Folder card context menu has "Create review link" option
  4. Project view has a "Review Links" tab listing all links with name, URL, copy button, and rename option

### Phase 10: list-view
**Goal**: Add a list/grid view toggle to the file browser. List view shows columns: Name, Status, Comments, Size, Date uploaded, Uploaded by.
**Depends on**: Phase 9
**Requirements**: REQ-10A, REQ-10B
**Plans:** 0/1 plans complete

Plans:
- [ ] 10-01-PLAN.md — AssetListView component + FolderBrowser toggle with localStorage persistence

**Success Criteria** (what must be TRUE):
  1. A toggle button switches between grid view and list view
  2. List view shows rows with: thumbnail, name, status, comment count, file size, upload date, uploader name
  3. List is sortable by name and date
  4. Toggle state persists per folder (localStorage)

### Phase 11: nice-to-have
**Goal**: (a) Prompt external guest reviewers for a display name the first time they open a review link — stored in localStorage so only asked once. (b) Shorten review link URLs to 6-8 char alphanumeric tokens. (c) Right-click context menu on asset/folder cards with actions: Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete. (d) Right-click context menu on empty canvas space with actions: New Folder, Upload files, Upload folder.
**Depends on**: Phase 10
**Requirements**: REQ-11A, REQ-11B, REQ-11C, REQ-11D
**Plans:** 2/2 plans complete

Plans:
- [x] 11-01-PLAN.md — Short review link tokens (nanoid) + guest name localStorage prompt
- [x] 11-02-PLAN.md — ContextMenu component + right-click on cards, list rows, and empty canvas

**Success Criteria** (what must be TRUE):
  1. First-time visitor to a review link sees a name prompt before accessing content
  2. Name stored in localStorage — not prompted again on same browser
  3. Guest comments show the entered name instead of "Guest"
  4. Review link URLs use a short alphanumeric token (6-8 chars) instead of UUID
  5. Right-clicking an asset or folder card shows a context menu with: Open, Rename, Duplicate, Copy to, Move to, Download, Get link, Delete
  6. Right-clicking empty space in the file browser shows: New Folder, Upload files, Upload folder
  7. Context menus dismiss on outside click or Escape key

### Phase 12: download-and-polish

**Goal:** (a) Bulk download selected assets; (b) toggle select-all / deselect-all on the header checkbox; (c) "Download all" option in canvas right-click menu; (d) fix right-click menu dismiss on outside click; (e) better checkbox styling matching app design; (f) download from three-dot menu and review links; (g) performance optimisations.
**Requirements**: REQ-12A, REQ-12B, REQ-12C, REQ-12D, REQ-12E, REQ-12F, REQ-12G
**Depends on:** Phase 11
**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md — ContextMenu dismiss fix, custom checkbox styling, select-all toggle verification
- [ ] 12-02-PLAN.md — Download from action bar, canvas menu, three-dot menu, review page + React.memo performance

**Success Criteria** (what must be TRUE):
  1. Selecting one or more assets shows a "Download" action bar button; clicking it downloads all selected files
  2. Header checkbox toggles between select-all and deselect-all (second click clears selection)
  3. Right-click on empty canvas includes "Download all" option that downloads every asset in the current folder
  4. Right-click menu closes immediately on any click outside the menu or on Escape
  5. Checkboxes use a styled design consistent with the app's dark theme (frame-accent border, filled on check)
  6. Download is available via the three-dot (MoreHorizontal) menu on every asset card and in review links
  7. Page load, folder navigation, and asset list render are noticeably faster (lazy loading, memoization, no redundant fetches)

### Phase 13: review-polish-and-fixes

**Goal:** (a) Fix file downloads to force-download to disk instead of opening in browser — add responseDisposition to GCS signed URLs; (b) Fix three-dot menu appearance on the review link page; (c) Enforce guest read-only — guests on review links can only leave comments and download assets, no editing actions.
**Requirements**: REQ-13A, REQ-13B, REQ-13C
**Depends on:** Phase 12
**Plans:** 3/3 plans complete

Plans:
- [x] 13-01-PLAN.md — Download fix: generateDownloadSignedUrl with responseDisposition, update review-link API + download consumers
- [x] 13-02-PLAN.md — Dropdown portal fix: rewrite Dropdown.tsx to use createPortal with fixed positioning
- [x] 13-03-PLAN.md — Guest read-only: add hideActions prop to AssetCard, pass from review page

**Success Criteria** (what must be TRUE):
  1. Clicking Download on any asset triggers a browser file download to disk (not opens in new tab)
  2. Three-dot menu on review page renders correctly with proper styling
  3. Guest users on review links cannot trigger any editing actions (rename, delete, move, duplicate, copy)

### Phase 14: review-link-folders

**Goal:** Add a "Review Links" virtual folder section in each project. Each review link appears as a navigable folder containing the linked assets with their comments. In list view, show creation date. Accessible from the sidebar/project navigation.
**Requirements**: REQ-14A, REQ-14B, REQ-14C
**Depends on:** Phase 13
**Plans:** 2/2 plans complete

Plans:
- [x] 14-01-PLAN.md — ReviewLinkFolderBrowser component + /review-links list page + /review-links/[token] asset page
- [x] 14-02-PLAN.md — Sidebar: add "Review Links" entry to ProjectTreeNav

**Success Criteria** (what must be TRUE):
  1. Each project has a "Review Links" section/folder in the navigation
  2. Clicking it shows all review links for that project as folders
  3. Clicking a review link folder shows its assets with their comments
  4. List view shows creation date for review link folders

### Phase 15: dashboard-and-storage

**Goal:** (a) Fix dashboard stats to show real data: project count, total assets, collaborator count, total storage used; (b) Show cumulative storage size at each folder route — sum of all file sizes in current folder including all subfolders.
**Requirements**: REQ-15A, REQ-15B
**Depends on:** Phase 14
**Plans:** 2/2 plans complete

Plans:
- [x] 15-01-PLAN.md — Dashboard real stats (GET /api/stats + dashboard page update)
- [x] 15-02-PLAN.md — Folder size badge in FolderBrowser (GET /api/assets/size + header badge)

**Success Criteria** (what must be TRUE):
  1. Dashboard shows real counts: projects, total assets across all projects, collaborators, total storage in human-readable format
  2. FolderBrowser shows total storage size for current location (sum of all assets in folder + subfolders)
  3. Storage size updates when navigating to different folders

### Phase 16: critical-bug-fixes

**Goal:** Fix 4 bugs: (a) flash of upload/empty screen when navigating — initialize useAssets loading=true; (b) dashboard stats broken — fix /api/stats; (c) folder size to bottom-right corner overlay; (d) Comments column shows real counts.
**Requirements**: REQ-16A, REQ-16B, REQ-16C, REQ-16D
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:
- [ ] TBD

**Success Criteria:**
  1. No flash of upload screen when navigating routes
  2. Dashboard loads with real stats
  3. Folder size in bottom-right corner overlay
  4. Comments column shows actual counts

### Phase 17: version-copy-and-realtime

**Goal:** Fix 3 bugs: (a) review links show only latest version per asset; (b) Copy to copies entire version stack; (c) sidebar names update in real-time on rename.
**Requirements**: REQ-17A, REQ-17B, REQ-17C
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD

**Success Criteria:**
  1. Review links show only latest version of each asset
  2. Copy to copies all versions under new versionGroupId
  3. Sidebar names update immediately on rename without page refresh

### Phase 18: safe-zones-and-vumeter

**Goal:** Add two features to the VideoPlayer: (a) Safe Zones overlay — a dropdown selector showing 14 platform-specific safe zone PNGs (TikTok, Reels, Stories, etc.) as semi-transparent overlays on the video, correctly letterbox/pillarbox aware; (b) VU Meter — real-time audio level meter using Web Audio API showing current levels and peaks.
**Requirements**: REQ-18A, REQ-18B
**Depends on:** Phase 17
**Plans:** 2 plans

Plans:
- [ ] 18-01-PLAN.md — Safe zones overlay: selector UI + PNG overlay at videoRect coordinates
- [ ] 18-02-PLAN.md — VU meter: Web Audio API analyser + real-time bar display

**Success Criteria:**
  1. A safe zones button in the video player controls opens a dropdown listing all 14 platforms
  2. Selecting a platform overlays its PNG transparently on the video, aligned to the actual video frame
  3. The overlay respects letterboxing/pillarboxing (uses videoRect)
  4. The VU meter shows real-time audio levels with peak hold indicators
  5. Both features work on review links and main asset viewer

### Phase 19: review-link-auth-skip — If viewer is already logged in, skip the guest name prompt on review links and use their existing session identity

**Goal:** Detect Firebase auth session on the review page and auto-populate guest identity from the logged-in user, skipping the guest name prompt entirely.
**Requirements**: P19-01, P19-02, P19-03, P19-04, P19-05
**Depends on:** Phase 18
**Plans:** 1/1 plans complete

Plans:
- [x] 19-01-PLAN.md — Wire useAuth into ReviewPage, auto-populate guestInfo, guard guest form gate

**Success Criteria** (what must be TRUE):
  1. Logged-in user visiting a review link with comments enabled goes directly to the review UI
  2. Comments posted by logged-in users show their account name
  3. Non-logged-in users still see the guest form
  4. No guest-form flicker on page load for logged-in users

### Phase 20: collaborator-invite-autocomplete — Search users by name when inviting to a project instead of requiring full email

**Goal:** Replace the free-text email input in the collaborator invite flow with a name/email prefix search combobox that queries registered users and lets the inviter select from matching results.
**Requirements**: P20-01, P20-02, P20-03, P20-04, P20-05
**Depends on:** Phase 19
**Plans:** 1/1 plans complete

Plans:
- [x] 20-01-PLAN.md — User search API route + UserSearchCombobox + CollaboratorsPanel wiring

**Success Criteria** (what must be TRUE):
  1. Typing 2+ characters in the invite field shows matching users in a dropdown
  2. Selecting a user populates the invite; Add button only enabled after selection
  3. Owner and existing collaborators excluded from results
  4. API route requires authentication
  5. Rapid typing does not cause stale results to overwrite newer ones

### Phase 21: admin-panel-polish — Admin sees all projects with owner info; clean up roles display

**Goal:** Add a "Projects" tab to the admin panel showing all projects system-wide with owner name/email and collaborator count. Clean up roles display by removing dead `UserRoleSelect.tsx` component.
**Requirements**: P21-01, P21-02, P21-03, P21-04, P21-05
**Depends on:** Phase 20
**Plans:** 1/1 plans complete

Plans:
- [x] 21-01-PLAN.md — Admin projects API + ProjectsTable + tab navigation + delete dead UserRoleSelect

**Success Criteria** (what must be TRUE):
  1. Admin page has "Users" and "All Projects" tabs
  2. All Projects tab shows every project with owner name/email and collaborator count
  3. Projects ordered by creation date descending
  4. Non-admin users get 403 from /api/admin/projects
  5. UserRoleSelect.tsx dead code is removed

### Phase 22: asset-download-button — Download button inside the asset viewer page

**Goal:** Add a Download button to the asset viewer header that triggers a forced-to-disk download of the currently displayed asset (or active version). Wire downloadUrl generation into the single-asset API endpoint.
**Requirements**: P22-01, P22-02, P22-03, P22-04
**Depends on:** Phase 21
**Plans:** 1/1 plans complete

Plans:
- [x] 22-01-PLAN.md — Add downloadUrl to single-asset API + Download button in viewer header

**Success Criteria** (what must be TRUE):
  1. Download button visible in asset viewer header for ready assets
  2. Clicking Download triggers file save to disk (not opens in browser tab)
  3. Download works after switching versions
  4. No download button for uploading/pending assets
