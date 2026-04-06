# Roadmap: readyset-review

## Overview

v1.2 milestone — bug fixes + feature expansion based on Notion spec "In house Frame".

## Phases

- [x] **Phase 1: breadcrumb-nav** - Breadcrumb navigation bar
- [x] **Phase 2: video-thumbnails-fix** - Fix thumbnail frame + CORS in production
- [x] **Phase 3: drag-to-move** - Drag assets into folders
- [x] **Phase 4: folder-drop-import** - OS folder drag-and-drop import
- [ ] **Phase 5: bug-fixes** - Fix review link broken + upload stuck
- [ ] **Phase 6: asset-context-menu** - Rename, Copy to, Duplicate in context menu
- [ ] **Phase 7: version-management** - Version badges, manage version stack UI
- [ ] **Phase 8: project-sidebar** - Collapsible project tree sidebar
- [ ] **Phase 9: review-link-enhancements** - Allow downloads, advanced settings, folder share links, links manager tab
- [ ] **Phase 10: list-view** - List/grid toggle with date uploaded + uploaded by columns
- [ ] **Phase 11: nice-to-have** - Guest name prompt for external commenters + shorter review link URLs

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
**Success Criteria** (what must be TRUE):
  1. A newly created review link is accessible immediately at its URL
  2. Uploading a second video to the same folder completes successfully
  3. No "Link not found or expired" error on fresh links

### Phase 6: asset-context-menu
**Goal**: Add Rename, Copy to, and Duplicate actions to the asset context menu (MoreHorizontal dropdown on asset cards and folder cards).
**Depends on**: Phase 5
**Requirements**: REQ-06A, REQ-06B, REQ-06C
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
**Success Criteria** (what must be TRUE):
  1. A toggle button switches between grid view and list view
  2. List view shows rows with: thumbnail, name, status, comment count, file size, upload date, uploader name
  3. List is sortable by name and date
  4. Toggle state persists per folder (localStorage)

### Phase 11: nice-to-have
**Goal**: (a) Prompt external guest reviewers for a display name the first time they open a review link — stored in localStorage so only asked once. (b) Shorten review link URLs to 6-8 char alphanumeric tokens.
**Depends on**: Phase 10
**Requirements**: REQ-11A, REQ-11B
**Success Criteria** (what must be TRUE):
  1. First-time visitor to a review link sees a name prompt before accessing content
  2. Name stored in localStorage — not prompted again on same browser
  3. Guest comments show the entered name instead of "Guest"
  4. Review link URLs use a short alphanumeric token (6-8 chars) instead of UUID
