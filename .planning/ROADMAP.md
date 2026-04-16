# Roadmap: readyset-review

## Milestones

- ✅ **v1.2 — Feature Expansion** - Phases 1–22 (shipped 2026-04-07)
- ✅ **v1.3 — Video Review Polish** - Phases 23–28 (shipped 2026-04-08)
- ✅ **v1.4 — Review & Version Workflow** - Phases 29–33 (shipped 2026-04-14)
- ✅ **v1.5 — Polish & Production Accuracy** - Phases 35–42 (shipped 2026-04-14)
- 🚧 **v1.6 — Polish & UX Refinement** - Phases 43–47 (in progress)

## Phases

<details>
<summary>✅ v1.2 — Feature Expansion (Phases 1–22) - SHIPPED 2026-04-07</summary>

See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full phase details.

22 phases: breadcrumb nav, drag-to-move, context menus, review link management, bulk download, list view, admin panel, safe zones, VU meter, auth-skip, collaborator autocomplete, asset download button.

</details>

<details>
<summary>✅ v1.3 — Video Review Polish (Phases 23–28) - SHIPPED 2026-04-08</summary>

### Phase 23: timecode-frame-fix
**Goal**: Frame-step timecode accuracy restored
**Plans**: 1 plan

Plans:
- [x] 23-01: Bypass rAF threshold for discrete seeks

### Phase 24: safe-zones-opacity
**Goal**: Safe zones overlay opacity is user-controllable
**Plans**: 1 plan

Plans:
- [x] 24-01: Opacity slider for active safe zone

### Phase 25: comment-count-badge
**Goal**: Comment count visible on grid cards without opening viewer
**Plans**: 1 plan

Plans:
- [x] 25-01: Comment badge on AssetCard

### Phase 26: file-info-tab
**Goal**: Full asset metadata accessible in viewer sidebar
**Plans**: 2 plans

Plans:
- [x] 26-01: Info tab structure + metadata fields
- [x] 26-02: FPS measurement via requestVideoFrameCallback

### Phase 27: asset-comparison
**Goal**: Two assets can be compared side-by-side with synchronized playback
**Plans**: 1 plan

Plans:
- [x] 27-01: AssetCompareModal + merge-version API

### Phase 28: version-stack-dnd
**Goal**: Assets can be merged into version stacks via drag-and-drop
**Plans**: 2 plans

Plans:
- [x] 28-01: Drag-and-drop version stacking UI
- [x] 28-02: Atomic Firestore batch merge API

</details>

<details>
<summary>✅ v1.4 — Review & Version Workflow (Phases 29–34) - SHIPPED 2026-04-14</summary>

### Phase 29: move-to-folder
**Goal**: Users can relocate assets between folders using a context menu
**Depends on**: Phase 28
**Requirements**: MOVE-01
**Success Criteria** (what must be TRUE):
  1. Right-clicking an asset shows a "Move to..." option in the context menu
  2. Clicking "Move to..." opens the folder picker modal
  3. After confirming, the asset disappears from the source folder and appears in the destination folder
  4. If the asset belongs to a version group, all group members move together
**Plans**: 1 plan

Plans:
- [x] 29-01: Verify + wire move-to context menu option

### Phase 30: asset-review-status
**Goal**: Users can label assets with a QC review status and see those labels in the grid and viewer
**Depends on**: Phase 29
**Requirements**: STATUS-01, STATUS-02
**Success Criteria** (what must be TRUE):
  1. Right-clicking an asset (or using the viewer) presents status options: Approved, Needs Revision, In Review
  2. Setting a status persists after page refresh
  3. A colored badge showing the current status appears on the asset's grid card
  4. The same badge is visible in the asset viewer
  5. Assets with no status set show no badge
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 30-01: ReviewStatus type + badge component + API null guard + AssetCard wiring
- [x] 30-02: Viewer header badge display + status setter dropdown

### Phase 31: version-stack-management
**Goal**: Users have full control over version stacks — unstacking individual versions and reordering within a stack
**Depends on**: Phase 30
**Requirements**: VSTK-01, VSTK-02
**Success Criteria** (what must be TRUE):
  1. Opening the version stack modal shows an "Unstack" option per version entry
  2. Unstacking a version removes it from the stack and it reappears as a standalone asset in the grid
  3. Version numbers in the remaining stack are gapless after an unstack (e.g., 1, 2 — not 1, 3)
  4. Versions inside the modal can be dragged to reorder, and version numbers update to reflect the new order
  5. Version numbering is gapless after any reorder
**Plans**: 2 plans

Plans:
- [x] 31-01: POST /api/assets/unstack-version + POST /api/assets/reorder-versions
- [x] 31-02: VersionStackModal unstack button + drag-to-reorder UI

### Phase 32: smart-copy-options
**Goal**: Copying to a review folder gives users control over which version is copied and whether comments travel with it
**Depends on**: Phase 31
**Requirements**: REVIEW-01, REVIEW-02
**Success Criteria** (what must be TRUE):
  1. The copy-to-folder flow presents a "Latest version only" toggle when the source asset belongs to a version stack
  2. When "Latest version only" is enabled, only the head version is copied — older versions are not
  3. The copy modal includes a visible note that comments are not copied to the destination folder
  4. After copying, the destination folder contains the expected version(s) with no comments
**Plans**: 1 plan

Plans:
- [x] 32-01: SmartCopyModal + latestVersionOnly param on copy API

### Phase 33: selection-review-links
**Goal**: Users can generate a review link scoped to a specific set of manually selected assets rather than an entire folder
**Depends on**: Phase 32
**Requirements**: REVIEW-03
**Success Criteria** (what must be TRUE):
  1. Selecting multiple assets in the grid reveals a toolbar action to create a review link from the selection
  2. The generated review link only exposes the selected assets (not the full folder)
  3. The review link page does not show the folder browser sidebar
  4. Selecting more than 50 assets disables or warns before the review link action
  5. If a linked asset is later deleted, the review link page shows a placeholder rather than breaking
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 33-01: assetIds schema on ReviewLink + API branch + CreateReviewLinkModal prop
- [x] 33-02: Selection toolbar action + review link page guard (no folder browser, delete placeholder)

### Phase 34: compare-view-audio-comments
**Goal**: The compare view lets users control audio per side and shows the active version's comments
**Depends on**: Phase 33
**Requirements**: COMPARE-01, COMPARE-02
**Success Criteria** (what must be TRUE):
  1. Clicking a version label in the compare view makes that side the active audio source
  2. Only one side plays audio at a time — activating one side mutes the other
  3. A comments panel below (or beside) the active video shows comments for that version
  4. Switching the active side by clicking the other label updates the comment panel to that version's comments
  5. The comment panel does not flicker when switching sides rapidly
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 34-01: Per-side audio state refactor (mutedA/mutedB + activeSide) in VersionComparison
- [x] 34-02: CompareCommentPanel component wired to activeSide

</details>

<details>
<summary>✅ v1.5 — Polish & Production Accuracy (Phases 35–42) - SHIPPED 2026-04-14</summary>

### Phase 35: grid-asset-timestamps
**Goal**: Upload date and time is visible on grid cards — critical for distinguishing versions after unstacking when all siblings show V1
**Requirements**: GRID-01
**Success Criteria** (what must be TRUE):
  1. Each grid card shows the upload date/time (e.g. "Apr 14, 3:42 PM") in the info row below the filename
  2. The timestamp is visible without hovering and without opening the asset
  3. After unstacking two versions, the date/time on each card is different and correct, letting the user identify the latest
  4. The info row layout does not shift or overflow with the added timestamp
**Plans**: 1 plan

Plans:
- [x] 35-01: Add upload date/time to AssetCard info row

### Phase 36: list-filename-fullname
**Goal**: Full filename is readable in list view — currently truncated with no hover tooltip
**Requirements**: LIST-01
**Success Criteria** (what must be TRUE):
  1. Hovering over a truncated filename in list view shows the full name in a native tooltip (title attribute)
  2. Long filenames do not cause horizontal overflow in the table
**Plans**: 1 plan

Plans:
- [x] 36-01: Add title tooltip to filename cell in AssetListView

### Phase 37: fps-accuracy
**Goal**: Frame rate in the info tab reflects the file's true frame rate, not a rounded measurement artifact
**Requirements**: FPS-01
**Success Criteria** (what must be TRUE):
  1. A 30fps file shows 30fps (not 31fps)
  2. A 29.97fps file shows 29.97fps
  3. A 24fps file shows 24fps
  4. FPS for any standard rate (23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60) is snapped to the exact value if the measured raw value is within ±0.6fps
**Plans**: 1 plan

Plans:
- [x] 37-01: Snap raw rVFC measurement to nearest standard frame rate

### Phase 38: vu-meter-pregain
**Goal**: VU meter measures the source audio signal, not the post-volume signal — adjusting the volume slider must not change what the meter shows
**Requirements**: VU-01
**Success Criteria** (what must be TRUE):
  1. With the volume slider at 100%, the VU meter shows the same level as with the slider at 50%
  2. The VU meter still responds to actual audio content in the file
  3. Muting the player does not zero out the VU meter (meter measures file signal, not speaker output)
**Plans**: 1 plan

Plans:
- [x] 38-01: Rewire AnalyserNode to tap audio chain before GainNode

### Phase 39: copy-naming
**Goal**: Copying an asset preserves its original name — no "copy of" prefix added
**Requirements**: COPY-01
**Success Criteria** (what must be TRUE):
  1. After "Copy to" an asset to any folder, the copy has the exact same name as the source
  2. Duplicating an asset (same folder) also uses the original name
  3. If a name collision exists in the destination, the copy still uses the original name (Firestore IDs are unique regardless)
**Plans**: 1 plan

Plans:
- [x] 39-01: Remove "copy of" prefix from copy API

### Phase 40: review-link-show-all-versions
**Goal**: The "Show all versions" toggle on review link creation actually shows all versions on the review page
**Requirements**: RVLINK-01
**Success Criteria** (what must be TRUE):
  1. Creating a review link with "Show all versions" ON and opening that link shows all versions of a versioned asset (e.g., a stack of 2 shows 2 cards)
  2. Creating a review link with "Show all versions" OFF shows only the latest version (default)
  3. The review page correctly reflects the toggle for both folder-scoped and selection-scoped links
**Plans**: 1 plan

Plans:
- [x] 40-01: Debug and fix showAllVersions propagation through review link GET and render

### Phase 41: viewer-download-cta
**Goal**: A prominent download button is visible in the full video player without requiring hover on the thumbnail
**Requirements**: RVLINK-02
**Success Criteria** (what must be TRUE):
  1. An always-visible "Download" button (or icon+label) appears in the player controls or above the video
  2. The button is visible for both internal viewers and review link guests (when allowDownloads is true)
  3. Clicking it triggers the same download behavior as the existing hover download
**Plans**: 1 plan

Plans:
- [x] 41-01: Add persistent download button to asset viewer player controls

### Phase 42: compare-audio-comments
**Goal**: Compare view lets users choose which side's audio they hear and shows that version's comments
**Requirements**: COMPARE-01, COMPARE-02
**Success Criteria** (what must be TRUE):
  1. Clicking a version label in the compare view makes that side the active audio source and mutes the other
  2. Only one side plays audio at a time
  3. A comment panel shows comments for the currently active version
  4. Clicking the other version label switches audio and updates the comment panel
  5. The comment panel does not flicker when switching sides rapidly
**Plans**: 2 plans

Plans:
- [x] 42-01: Per-side audio state refactor + active-side click handler in AssetCompareModal
- [x] 42-02: CompareCommentPanel component wired to activeSide

</details>

### 🚧 v1.6 — Polish & UX Refinement (In Progress)

**Milestone Goal:** Address user-reported bugs and UX gaps — fix broken interactions, restore accurate measurements, and add missing capabilities (comment editing, range comments, hover preview, video review links).

- [ ] **Phase 43: quick-fixes** - FPS upload bug, version dropdown dates, VU meter width
- [ ] **Phase 44: comment-system** - Resolved state, author editing, link rendering, range comments
- [ ] **Phase 45: annotation-bugs** - Version switch clears drawings, arrow tool conflict
- [ ] **Phase 46: compare-player** - Compare slider reliability, audio indicator + switching
- [ ] **Phase 47: review-links-hover** - Context menu bug, show-all-versions, video review links, hover preview

## Phase Details

### Phase 43: quick-fixes
**Goal**: Three small independent bugs are fixed — FPS is correct on new uploads, version selector shows dates, and VU meter numbers are legible
**Depends on**: Phase 42
**Requirements**: BUG-01, VER-01, PLAY-03
**Success Criteria** (what must be TRUE):
  1. Uploading a 30fps video shows 30fps in the info tab immediately after processing (not 31fps)
  2. The version selector dropdown shows an upload date/time alongside each version label (e.g., "V3 — Apr 14, 3:42 PM")
  3. The VU meter is wide enough that dB numbers (e.g., "-18") are fully readable without truncation
**Plans**: 1 plan

Plans:
- [ ] 43-01-PLAN.md — Fix FPS off-by-one, version dropdown dates, VU meter width

### Phase 44: comment-system
**Goal**: The comment panel behaves correctly — resolved comments stay visible, authors can edit their own, links are clickable, and users can mark a time range
**Depends on**: Phase 43
**Requirements**: CMT-01, CMT-02, CMT-03, CMT-04
**Success Criteria** (what must be TRUE):
  1. Resolving a comment shows a checkmark on that comment rather than removing it from the list
  2. A user can click "Edit" on their own comment, change the text, and save — the option is not present on others' comments
  3. A URL typed in a comment renders as a clickable link and does not overflow the comment box
  4. A user can set an in-point and out-point on a comment, and the timeline shows a highlighted range instead of a single marker
  5. Clicking a range comment on the timeline seeks to the in-point
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 44-01-PLAN.md — Resolved checkmark, author edit mode, clickable links (CMT-01, CMT-02, CMT-03)
- [ ] 44-02-PLAN.md — Range comments with in/out points and timeline bar (CMT-04)

### Phase 45: annotation-bugs
**Goal**: Annotation drawings behave predictably — they clear on version switch and the arrow tool does not steal freehand drawing interactions
**Depends on**: Phase 44
**Requirements**: BUG-03, BUG-04
**Success Criteria** (what must be TRUE):
  1. Switching from version V2 to V1 in the viewer clears all drawings from V2 — no annotations persist across versions
  2. Selecting the arrow tool and clicking on the canvas moves/selects existing objects without triggering freehand strokes
  3. Selecting the freehand pen tool draws normally with no interference from arrow tool behavior
**Plans**: TBD

### Phase 46: compare-player
**Goal**: The compare view plays both videos reliably and clearly communicates which side's audio is active
**Depends on**: Phase 45
**Requirements**: BUG-05, PLAY-01, PLAY-02
**Success Criteria** (what must be TRUE):
  1. Pressing play in the compare view plays both videos simultaneously without either freezing or falling out of sync
  2. A visible indicator (badge, icon, or highlight) shows which side's audio is currently active
  3. Clicking the audio toggle switches the active audio source and the indicator updates immediately
  4. The compare slider (overlay mode) can be dragged while both videos are playing without either video pausing
**Plans**: TBD
**UI hint**: yes

### Phase 47: review-links-hover
**Goal**: Review link creation and browsing work correctly for individual videos, the context menu appears on right-click, show-all-versions is reliable, and hovering over thumbnails scrubs frames
**Depends on**: Phase 46
**Requirements**: BUG-02, RVLINK-01, RVLINK-02, PLAY-04
**Success Criteria** (what must be TRUE):
  1. Right-clicking a folder asset labeled "review link" shows the context menu instead of navigating into the folder
  2. A user can create a review link on a single video asset (not just a folder), and the link opens that video in the review player
  3. Opening a review link with "Show all versions" enabled displays every version in the stack as a separate card
  4. Hovering the cursor over a video thumbnail in the grid scrubs through the video frames at the cursor's horizontal position
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 23. timecode-frame-fix | v1.3 | 1/1 | Complete | 2026-04-07 |
| 24. safe-zones-opacity | v1.3 | 1/1 | Complete | 2026-04-07 |
| 25. comment-count-badge | v1.3 | 1/1 | Complete | 2026-04-07 |
| 26. file-info-tab | v1.3 | 2/2 | Complete | 2026-04-08 |
| 27. asset-comparison | v1.3 | 1/1 | Complete | 2026-04-08 |
| 28. version-stack-dnd | v1.3 | 2/2 | Complete | 2026-04-08 |
| 29. move-to-folder | v1.4 | 1/1 | Complete   | 2026-04-09 |
| 30. asset-review-status | v1.4 | 2/2 | Complete | 2026-04-14 |
| 31. version-stack-management | v1.4 | 2/2 | Complete | 2026-04-14 |
| 32. smart-copy-options | v1.4 | 1/1 | Complete | 2026-04-14 |
| 33. selection-review-links | v1.4 | 2/2 | Complete | 2026-04-14 |
| 34. compare-view-audio-comments | v1.4 | 0/2 | Deferred → Phase 42 | - |
| 35. grid-asset-timestamps | v1.5 | 1/1 | Complete | 2026-04-14 |
| 36. list-filename-fullname | v1.5 | 1/1 | Complete | 2026-04-14 |
| 37. fps-accuracy | v1.5 | 1/1 | Complete | 2026-04-14 |
| 38. vu-meter-pregain | v1.5 | 1/1 | Complete | 2026-04-14 |
| 39. copy-naming | v1.5 | 1/1 | Complete | 2026-04-14 |
| 40. review-link-show-all-versions | v1.5 | 1/1 | Complete | 2026-04-14 |
| 41. viewer-download-cta | v1.5 | 1/1 | Complete | 2026-04-14 |
| 42. compare-audio-comments | v1.5 | 2/2 | Complete | 2026-04-14 |
| 43. quick-fixes | v1.6 | 0/1 | Not started | - |
| 44. comment-system | v1.6 | 0/? | Not started | - |
| 45. annotation-bugs | v1.6 | 0/? | Not started | - |
| 46. compare-player | v1.6 | 0/? | Not started | - |
| 47. review-links-hover | v1.6 | 0/? | Not started | - |
