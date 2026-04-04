# Roadmap: readyset-review

## Overview

Add 4 UX features to the readyset-review (Frame.io clone) app: breadcrumb navigation, video thumbnail generation, rubber-band multi-select, and folder drag-and-drop import.

## Phases

- [x] **Phase 1: breadcrumb-nav** - Add breadcrumb navigation bar showing folder path with clickable crumbs
- [ ] **Phase 2: video-thumbnails** - Generate and display video thumbnails on upload
- [ ] **Phase 3: multi-select-drag** - Rubber-band multi-selection of assets and folders
- [ ] **Phase 4: folder-drop-import** - Drag and drop OS folders preserving subfolder hierarchy

## Phase Details

### Phase 1: breadcrumb-nav
**Goal**: Extract the existing inline breadcrumb from FolderBrowser.tsx into a reusable Breadcrumb component, ensuring it remains visible, clickable, and styled to the dark theme.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-03
**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Extract Breadcrumb component and wire into FolderBrowser

**Success Criteria** (what must be TRUE):
  1. A breadcrumb bar is visible above the file browser showing the current folder path
  2. Each crumb is a clickable link that navigates to that folder
  3. The root (project) level shows the project name as the first crumb
  4. Matches the existing dark theme (#0d0d0d bg, #6c5ce7 accent)

### Phase 2: video-thumbnails
**Goal**: When a video is uploaded/loaded, generate a thumbnail from the video and display it as the asset's preview image.
**Depends on**: Phase 1
**Requirements**: REQ-04, REQ-05
**Success Criteria** (what must be TRUE):
  1. Uploading a video generates a thumbnail captured client-side from the video
  2. Thumbnail is uploaded to GCS alongside the video
  3. Thumbnail is displayed in the asset grid/list view for all video assets
**Plans**: 2

Plans:
- [x] 02-01-PLAN.md — Fix captureThumbnail seek time (25% of duration, max 5s)
- [ ] 02-02-PLAN.md — TBD

### Phase 3: multi-select-drag
**Goal**: Allow rubber-band (click-and-drag) multi-selection of assets and folders in the file browser.
**Depends on**: Phase 2
**Requirements**: REQ-06, REQ-07
**Success Criteria** (what must be TRUE):
  1. Clicking and dragging on empty space draws a visible selection rectangle
  2. All items whose bounding boxes intersect the rectangle become selected (highlighted)
  3. Selected items can be dragged into a folder to move them
  4. Shift+click and Ctrl+click also extend the selection
**Plans**: TBD

### Phase 4: folder-drop-import
**Goal**: Drag and drop an entire folder from the OS into the app, preserving the folder hierarchy (subfolders and files).
**Depends on**: Phase 3
**Requirements**: REQ-08, REQ-09, REQ-10
**Success Criteria** (what must be TRUE):
  1. User can drag a local OS folder onto the app drop zone
  2. The full subfolder tree is created in Firestore mirroring the local structure
  3. All files are uploaded to GCS at their correct paths within the hierarchy
  4. Upload progress is shown per-file
**Plans**: TBD
