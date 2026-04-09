# Roadmap: readyset-review

## Milestones

- ✅ **v1.2 — Feature Expansion** - Phases 1–22 (shipped 2026-04-07)
- ✅ **v1.3 — Video Review Polish** - Phases 23–28 (shipped 2026-04-08)
- 🚧 **v1.4 — Review & Version Workflow** - Phases 29–34 (in progress)

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

### 🚧 v1.4 — Review & Version Workflow (In Progress)

**Milestone Goal:** Sharper version control, asset approval statuses, and smarter review link creation for production QC pipelines.

#### Phase 29: move-to-folder
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

#### Phase 30: asset-review-status
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
- [ ] 30-02: Viewer header badge display + status setter dropdown

#### Phase 31: version-stack-management
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
- [ ] 31-01: POST /api/assets/unstack-version + POST /api/assets/reorder-versions
- [ ] 31-02: VersionStackModal unstack button + drag-to-reorder UI

#### Phase 32: smart-copy-options
**Goal**: Copying to a review folder gives users control over which version is copied and whether comments travel with it
**Depends on**: Phase 31
**Requirements**: REVIEW-01, REVIEW-02
**Success Criteria** (what must be TRUE):
  1. The copy-to-folder flow presents a "Latest version only" toggle when the source asset belongs to a version stack
  2. When "Latest version only" is enabled, only the head version is copied — older versions are not
  3. The copy modal includes a visible note that comments are not copied to the destination folder
  4. After copying, the destination folder contains the expected version(s) with no comments
**Plans**: 2 plans

Plans:
- [ ] 32-01: SmartCopyModal + latestVersionOnly param on copy API

#### Phase 33: selection-review-links
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
- [ ] 33-01: assetIds schema on ReviewLink + API branch + CreateReviewLinkModal prop
- [ ] 33-02: Selection toolbar action + review link page guard (no folder browser, delete placeholder)

#### Phase 34: compare-view-audio-comments
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
- [ ] 34-01: Per-side audio state refactor (mutedA/mutedB + activeSide) in VersionComparison
- [ ] 34-02: CompareCommentPanel component wired to activeSide

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
| 30. asset-review-status | v1.4 | 1/2 | In Progress|  |
| 31. version-stack-management | v1.4 | 0/2 | Not started | - |
| 32. smart-copy-options | v1.4 | 0/1 | Not started | - |
| 33. selection-review-links | v1.4 | 0/2 | Not started | - |
| 34. compare-view-audio-comments | v1.4 | 0/2 | Not started | - |
