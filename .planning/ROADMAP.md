# Roadmap: readyset-review

## Archived Milestones

- **[v1.2 — Feature Expansion](milestones/v1.2-ROADMAP.md)** — 22 phases shipped (2026-04-02 → 2026-04-07): breadcrumb nav, drag-to-move, context menus, review link management, bulk download, list view, admin panel, safe zones, VU meter, auth-skip, collaborator autocomplete, asset download button

## Current Milestone: v1.3 — Video Review Polish

**Goal:** Refine the video review experience with player accuracy improvements, richer metadata, asset comparison, and version stacking via drag-and-drop.

---

### Phase 23: timecode-frame-fix
**Goal:** Fix SMPTE timecode frame number not updating when stepping frame-by-frame.
**Depends on:** Nothing (isolated bug fix in VideoPlayer.tsx)
**Requirements:** P23-01, P23-02, P23-03, P23-04
**Plans:** 1/1 plans complete

Plans:
- [x] 23-01-PLAN.md — Fix `stepFrame` and keyboard handler to call `setCurrentTime` directly after advancing, bypassing the 0.25s rAF threshold

**Success Criteria:**
1. Pressing frame-step button or Shift+Arrow immediately updates the SMPTE frame digit ✓
2. Normal playback and scrubbing are unchanged ✓

---

### Phase 24: safe-zones-opacity
**Goal:** Add an opacity slider to the safe zones controls so the overlay transparency is adjustable.
**Depends on:** Phase 23
**Requirements:** P24-01, P24-02, P24-03, P24-04, P24-05, P24-06
**Plans:** 1/1 plans complete

Plans:
- [x] 24-01-PLAN.md — Add `opacity` prop to SafeZonesOverlay + opacity slider in VideoPlayer controls

**Success Criteria:**
1. Opacity slider visible only when a safe zone is active ✓
2. Dragging slider changes overlay transparency immediately ✓
3. Opacity resets to 100% when toggling safe zone off or switching zones ✓

---

### Phase 25: comment-count-badge
**Goal:** Show comment count badge on AssetCard in grid view, matching the existing list view badge.
**Depends on:** Phase 24
**Requirements:** P25-01, P25-02, P25-03, P25-04, P25-05
**Plans:** 1 plan

Plans:
- [ ] 25-01-PLAN.md — Add `_commentCount` badge to AssetCard info section

**Success Criteria:**
1. Grid cards show a comment badge (icon + number) when count > 0 ✓
2. Counts > 99 show "99+" ✓
3. Zero-count cards show no badge ✓
4. No additional API calls ✓

---

### Phase 26: file-info-tab
**Goal:** Add an "Info" tab to the asset viewer sidebar showing technical metadata (resolution, duration, size, MIME type, etc.).
**Depends on:** Phase 25
**Requirements:** P26-01, P26-02, P26-03, P26-04, P26-05, P26-06
**Plans:** 1 plan

Plans:
- [ ] 26-01-PLAN.md — Tab bar in asset viewer sidebar + new FileInfoPanel component

**Success Criteria:**
1. Asset viewer sidebar has Comments / Info tab bar ✓
2. Info tab shows: filename, MIME type, file size, duration, resolution, aspect ratio, uploaded by, date, version ✓
3. FPS field shows "—" when not stored ✓
4. Works for both video and image assets ✓

---

### Phase 27: asset-comparison
**Goal:** Allow selecting 2 assets in the grid and opening a synchronized side-by-side comparison modal.
**Depends on:** Phase 26
**Requirements:** P27-01, P27-02, P27-03, P27-04, P27-05, P27-06, P27-07, P27-08, P27-09, P27-10
**Plans:** 1 plan

Plans:
- [ ] 27-01-PLAN.md — AssetCompareModal + Compare button in FolderBrowser multi-select toolbar

**Success Criteria:**
1. "Compare" button appears in action toolbar when exactly 2 assets are selected ✓
2. Full-screen modal opens with two players side by side ✓
3. Play/pause and seek are synchronized across both players ✓
4. Audio toggle switches which side has audio ✓
5. Exit button closes modal and returns to grid ✓

---

### Phase 28: version-stack-dnd
**Goal:** Implement drag-and-drop version stacking — dragging asset A onto asset B merges A into B's version stack.
**Depends on:** Phase 27
**Requirements:** P28-01 → P28-15
**Plans:** 2 plans

Plans:
- [ ] 28-01-PLAN.md — `POST /api/assets/merge-version` — atomic Firestore batch merge with version renumbering
- [ ] 28-02-PLAN.md — UI wiring: AssetCard drop target, AssetGrid prop threading, FolderBrowser orchestration

**Success Criteria:**
1. Dragging one asset card onto another triggers a version merge ✓
2. Drop target card highlights with accent border during hover ✓
3. Version numbers are renumbered without collisions after merge ✓
4. All of the dragged asset's version group members join the target's group ✓
5. Source card disappears from grid; target's version count increments ✓
6. Self-drop and same-stack drop are no-ops ✓
7. Existing folder-move drag behavior is unchanged ✓

---

## Milestone Summary (in progress)

**Phases:** 23–28 (6 phases)
**New components:** `FileInfoPanel.tsx`, `AssetCompareModal.tsx`
**New API routes:** `POST /api/assets/merge-version`
**Modified files:** `VideoPlayer.tsx`, `SafeZonesOverlay.tsx`, `AssetCard.tsx`, `AssetGrid.tsx`, `FolderBrowser.tsx`, `AssetViewerPage`, `types/index.ts`
**New npm packages:** None
