# v1.6 Polish & UX Refinement — ARCHIVED (superseded by v1.7)

This milestone was planned but **never executed**. All 5 phases (43-47) were paper-only. Some items were shipped directly via ad-hoc commits (resolved comments badge, compare player rewrite) or absorbed into v1.7 (range comments → CMT-04, annotation bugs → ANNOT-01). Plan files for phases 43, 44 are preserved under ./phases/ for reference.

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
