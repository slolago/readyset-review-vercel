# Roadmap: readyset-review

## Milestones

- ✅ **v1.2 — Feature Expansion** - Phases 1–22 (shipped 2026-04-07)
- ✅ **v1.3 — Video Review Polish** - Phases 23–28 (shipped 2026-04-08)
- ✅ **v1.4 — Review & Version Workflow** - Phases 29–33 (shipped 2026-04-14)
- ✅ **v1.5 — Polish & Production Accuracy** - Phases 35–42 (shipped 2026-04-14)
- 📦 **v1.6 — Polish & UX Refinement** - archived, never executed — superseded by v1.7. See [milestones/v1.6-archive/README.md](milestones/v1.6-archive/README.md)
- ✅ **v1.7 — Review UX & Access Rewrite** - Phases 43–48 (shipped 2026-04-20)
- ✅ **v1.8 — Asset Pipeline & Visual Polish** - Phases 49–53 (shipped 2026-04-20)
- ✅ **v1.9 — Hardening & Consistency Audit** - Phases 54–59 (shipped 2026-04-20)
- ✅ **v2.0 — Architecture Hardening** - Phases 60–66 (shipped 2026-04-20)
- ✅ **v2.1 — Dashboard Performance** - Phases 67–69 (shipped 2026-04-21)
- ✅ **v2.2 — Dashboard & Annotation UX Fixes** - Phases 70–73 (shipped 2026-04-21)
- ✅ **v2.3 — App-Wide Performance Polish** - Phases 74–78 (shipped 2026-04-22)
- 🚧 **v2.4 — Meta XMP Stamping on Delivery** - Phases 79–82 (in progress)

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

<details>
<summary>✅ v1.7 — Review UX & Access Rewrite (Phases 43–48) - SHIPPED 2026-04-20</summary>

See [milestones/v1.7-ROADMAP.md](milestones/v1.7-ROADMAP.md) for full phase details.

6 phases: version-stack-rewrite, access-model-enforcement, admin-ui-and-project-rename, comments-integrity-and-range, video-export-pipeline, playback-loop-and-selection-hierarchy.

</details>

<details>
<summary>✅ v1.8 — Asset Pipeline & Visual Polish (Phases 49–53) - SHIPPED 2026-04-20</summary>

See [milestones/v1.8-ROADMAP.md](milestones/v1.8-ROADMAP.md) for full phase details.

5 phases: metadata-accuracy, review-links-repair, file-type-expansion, trash-and-recovery, visual-polish.

</details>

<details>
<summary>✅ v1.9 — Hardening & Consistency Audit (Phases 54–59) - SHIPPED 2026-04-20</summary>

See [milestones/v1.9-ROADMAP.md](milestones/v1.9-ROADMAP.md) for full phase details.

6 phases: security-hardening, bulk-mutations-and-soft-delete, viewer-alignment, ux-and-dashboard, data-consistency, a11y-and-keyboard-coordination. Synthesized from a 4-stream full-app audit.

</details>

<details>
<summary>✅ v2.0 — Architecture Hardening (Phases 60–66) - SHIPPED 2026-04-20</summary>

See [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md) for full phase details.

7 phases: pipeline-observability, transactional-mutations, signed-url-caching, firestore-indexes-and-denorm, format-edge-cases, security-and-upload-validation, dead-data-and-contracts. Synthesized from a deep lifecycle + unhappy-path audit.

</details>

<details>
<summary>✅ v2.1 — Dashboard Performance (Phases 67–69) - SHIPPED 2026-04-21</summary>

See [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md) for full phase details.

3 phases: dashboard-query-optimizations, client-init-waterfall, ssr-and-micro-optimizations. Synthesized from a focused dashboard perf audit.

</details>

<details>
<summary>✅ v2.2 — Dashboard & Annotation UX Fixes (Phases 70–73) - SHIPPED 2026-04-21</summary>

See [milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md) for full phase details.

4 phases: context-menu-behavior, grid-view-affordances, inline-edit-and-folder-duplicate, drawing-mode-transforms. 9 UI/UX bug fixes from hands-on use reports.

</details>

<details>
<summary>✅ v2.3 — App-Wide Performance Polish (Phases 74–78) - SHIPPED 2026-04-22</summary>

See [milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md) for full phase details.

5 phases: viewer-critical-path, page-loading-and-server-components, asset-viewer-restructure, folder-browser-decomposition, data-layer-bundle-and-network. 18 PERF REQs synthesized from a 4-stream app-wide perf audit.

</details>

### 🚧 v2.4 — Meta XMP Stamping on Delivery (In Progress)

**Milestone Goal:** Every asset delivered through a review link is automatically stamped with Meta-required XMP attribution (`http://ns.attribution.com/ads/1.0/`) using server-side `exiftool-vendored`, matching the `scf-metadata` desktop app 1:1. Stamps are cached per asset, invalidated on rename / new version, and served exclusively to review-link guests. Internal viewers always receive the original.

## Phase Details

### Phase 79: platform-spike
**Goal**: All three runtime unknowns verified before a single line of stamp production code is written
**Depends on**: Phase 78
**Requirements**: STAMP-13
**Success Criteria** (what must be TRUE):
  1. A real Vercel Pro deploy of a one-route spike (`et.version()` call) returns successfully — the perl binary resolves and exiftool is usable in the Lambda runtime
  2. A code read of `PUT /api/assets/[assetId]` (rename) and `/api/upload/complete` confirms `updatedAt: FieldValue.serverTimestamp()` is written on both paths — or those writes have been added and verified
  3. A sample file stamped by the `scf-metadata` desktop app is inspected with `exiftool -Attrib:all` and the exact `Data` field literal value (pipe-wrapped or plain JSON) is documented for use in the production implementation
**Plans**: TBD

Plans:
- [x] 79-01: Deploy perl/exiftool spike to Vercel + verify updatedAt coverage + confirm Data field format

### Phase 80: stamp-pipeline-standalone
**Goal**: `POST /api/assets/[id]/stamp-metadata` works end-to-end and can be called in isolation — no review-link touching yet
**Depends on**: Phase 79
**Requirements**: STAMP-01, STAMP-02, STAMP-03, STAMP-10, STAMP-11
**Success Criteria** (what must be TRUE):
  1. Calling the stamp route on a video asset produces a new GCS object at `stampedGcsPath` that contains all four `Attrib` XMP fields (`FbId`, `ExtId`, `Created`, `Data`) readable by `exiftool -Attrib:all`
  2. Calling the stamp route twice on the same asset produces an `Attrib` array of length 2 — prior attribution history is preserved, not clobbered
  3. Calling the stamp route on a JPEG or PNG asset stamps it identically to a video — no format errors, no format-specific branching required
  4. After renaming an asset, `stampedGcsPath` and `stampedAt` are cleared on the Firestore doc; calling the stamp route again writes the new filename as `ExtId`
  5. After uploading a new version into a stack, the new version's `stampedGcsPath` and `stampedAt` are cleared; other versions in the stack are unaffected
**Plans**: TBD

Plans:
- [x] 80-01: exiftool-vendored + .config vendored + types + stamp route (download → stamp → upload → Firestore update) + job infra wiring
- [x] 80-02: Invalidation writes on rename and new-version-upload paths + streaming GCS upload helper

### Phase 81: review-link-integration
**Goal**: Creating a review link triggers stamp jobs fully async; guests receive stamped URLs; the internal viewer is unaffected
**Depends on**: Phase 80
**Requirements**: STAMP-04, STAMP-05, STAMP-09
**Success Criteria** (what must be TRUE):
  1. A user creates a review link containing one video — the POST response returns immediately (under 3 seconds) with the link token; a guest who opens the link after stamps complete downloads an MP4 containing the four `Attrib` XMP fields
  2. Multiple review links created for the same asset share a single stamped GCS copy — only one exiftool run occurs regardless of how many links reference that asset
  3. An authenticated user opening the same asset in the internal viewer (`/api/assets`) receives the original file URL, not the stamped copy — comments, annotations, and version comparison continue working normally
  4. If stamp jobs are still running when a guest opens the review link, they receive the original file with no error — the link is always usable
**Plans**: TBD

Plans:
- [x] 81-01: POST /api/review-links fires stamp jobs fully async + decorate() stamp-aware URL selection with original fallback

### Phase 82: invalidation-and-ux
**Goal**: Stale stamps auto-invalidate on rename and new version; stamp failure never blocks the link; the user sees feedback while stamps run
**Depends on**: Phase 81
**Requirements**: STAMP-06, STAMP-07, STAMP-08, STAMP-12
**Success Criteria** (what must be TRUE):
  1. A user renames an asset that already has a stamp, then creates a new review link — the guest downloads a freshly-stamped file with the updated filename as `ExtId`; the old stamped GCS object is deleted
  2. A user uploads a new version into a stack that has a stamp — the next review link creation for that version triggers a fresh stamp; other versions in the stack are not re-stamped
  3. When stamp jobs fail for one or more assets, the review link is created and shared successfully — the guest receives the original file for any unstamped asset rather than an error
  4. The `CreateReviewLinkModal` shows an "Applying metadata…" status while stamp jobs are pending and transitions to the copy-link view as soon as the link token is ready — the user is not blocked waiting for stamps to complete
**Plans**: TBD

Plans:
- [x] 82-01: Rename + new-version invalidation (clear stampedGcsPath/stampedAt) + old stamped GCS cleanup on re-stamp
- [x] 82-02: Graceful stamp-failure fallback in review link creation + "Applying metadata..." spinner in CreateReviewLinkModal
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
| 43. version-stack-rewrite | v1.7 | 1/1 | Human-verify | 2026-04-20 |
| 44. access-model-enforcement | v1.7 | 1/1 | Complete | 2026-04-20 |
| 45. admin-ui-and-project-rename | v1.7 | 1/1 | Human-verify | 2026-04-20 |
| 46. comments-integrity-and-range | v1.7 | 1/1 | Human-verify | 2026-04-20 |
| 47. video-export-pipeline | v1.7 | 1/1 | Human-verify | 2026-04-20 |
| 48. playback-loop-and-selection-hierarchy | v1.7 | 1/1 | Human-verify | 2026-04-20 |
| 49. metadata-accuracy | v1.8 | 1/1 | Human-verify | 2026-04-20 |
| 50. review-links-repair | v1.8 | 1/1 | Complete | 2026-04-20 |
| 51. file-type-expansion | v1.8 | 1/1 | Human-verify | 2026-04-20 |
| 52. trash-and-recovery | v1.8 | 1/1 | Human-verify | 2026-04-20 |
| 53. visual-polish | v1.8 | 1/1 | Human-verify | 2026-04-20 |
| 54. security-hardening | v1.9 | 1/1 | Complete | 2026-04-20 |
| 55. bulk-mutations-and-soft-delete | v1.9 | 1/1 | Complete | 2026-04-20 |
| 56. viewer-alignment | v1.9 | 1/1 | Human-verify | 2026-04-20 |
| 57. ux-and-dashboard | v1.9 | 1/1 | Complete | 2026-04-20 |
| 58. data-consistency | v1.9 | 1/1 | Complete | 2026-04-20 |
| 59. a11y-and-keyboard-coordination | v1.9 | 1/1 | Complete | 2026-04-20 |
| 60. pipeline-observability | v2.0 | 1/1 | Complete | 2026-04-20 |
| 61. transactional-mutations | v2.0 | 1/1 | Complete | 2026-04-20 |
| 62. signed-url-caching | v2.0 | 1/1 | Complete | 2026-04-20 |
| 63. firestore-indexes-and-denorm | v2.0 | 1/1 | Complete | 2026-04-20 |
| 64. format-edge-cases | v2.0 | 1/1 | Complete | 2026-04-20 |
| 65. security-and-upload-validation | v2.0 | 1/1 | Complete   | 2026-04-21 |
| 66. dead-data-and-contracts | v2.0 | 1/1 | Complete   | 2026-04-21 |
| 67. dashboard-query-optimizations | v2.1 | 1/1 | Complete   | 2026-04-21 |
| 68. client-init-waterfall | v2.1 | 1/1 | Human-verify | 2026-04-21 |
| 69. ssr-and-micro-optimizations | v2.1 | 1/1 | Human-verify | 2026-04-21 |
| 70. context-menu-behavior | v2.2 | 2/2 | Human-verify | 2026-04-21 |
| 71. grid-view-affordances | v2.2 | 1/1 | Human-verify | 2026-04-21 |
| 72. inline-edit-and-folder-duplicate | v2.2 | 2/2 | Human-verify | 2026-04-21 |
| 73. drawing-mode-transforms | v2.2 | 1/1 | Human-verify | 2026-04-21 |
| 74. viewer-critical-path | v2.3 | 1/1 | Complete | 2026-04-22 |
| 75. page-loading-and-server-components | v2.3 | 1/1 | Human-verify | 2026-04-22 |
| 76. asset-viewer-restructure | v2.3 | 1/1 | Human-verify | 2026-04-22 |
| 77. folder-browser-decomposition | v2.3 | 1/1 | Complete | 2026-04-22 |
| 78. data-layer-bundle-and-network | v2.3 | 1/1 | Complete | 2026-04-22 |
| 79. platform-spike | v2.4 | 1/1 | Human-verify | 2026-04-23 |
| 80. stamp-pipeline-standalone | v2.4 | 2/2 | Human-verify | 2026-04-23 |
| 81. review-link-integration | v2.4 | 1/1 | Human-verify | 2026-04-23 |
| 82. invalidation-and-ux | v2.4 | 2/2 | Human-verify | 2026-04-23 |

## Backlog

### Phase 999.1: export-modal-format-switch-bug — ✅ SHIPPED 2026-04-22

**Goal:** In the asset viewer, opening Export modal → exporting as GIF → switching format toggle to MP4 without closing → clicking Export again produces a new MP4 (not the stale GIF).

**Actual root cause** (differed from backlog guess): not a stale closure — `format` was in `handleSubmit`'s `useCallback` deps. The footer kept showing the Download button (`ui === 'ready' && signedUrl`) after a successful export. Clicking Download with the new format toggled downloaded the STALE GCS signedUrl (the GIF) with the new format's filename extension (`.mp4`). User got a GIF saved as `filename.mp4`.

**Fix:** `useEffect` in `ExportModal.tsx` invalidates the cached export when `format`/`inPt`/`outPt`/`filename` change — drops `ui` back to `idle` + clears `signedUrl`/`errorMsg`, so the footer swaps Download → Export and the next click does a fresh encode. See `.planning/phases/999.1-export-modal-format-switch-bug/999.1-SUMMARY.md`.
