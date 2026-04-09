# Requirements: v1.4 Review & Version Workflow

## Version Stack Management

- [x] **VSTK-01**: User can unstack a version from a group (removes it from the stack; it becomes a standalone asset)
- [x] **VSTK-02**: User can reorder versions within a stack (drag to reassign version numbers)

## Asset Status

- [x] **STATUS-01**: User can set a review status on an asset (approved / needs_revision / in_review)
- [x] **STATUS-02**: Review status badge is displayed on asset grid cards and in the asset viewer

## Review Link — Smart Copy

- [ ] **REVIEW-01**: User can copy an asset to a review folder with a "latest version only" option (skips older versions in the stack)
- [ ] **REVIEW-02**: User can copy an asset to a review folder with a "without comments" option (comments are not copied; UI communicates this clearly)

## Review Link — Selection

- [ ] **REVIEW-03**: User can generate a review link scoped to a manually selected set of assets (not the full folder)

## Compare View

- [ ] **COMPARE-01**: User can click a version label in the compare view to make that version the active audio source
- [ ] **COMPARE-02**: Compare view displays the focused (active) version's comments in the sidebar

## Asset Organization

- [ ] **MOVE-01**: User can use a "Move to…" context menu option to relocate an asset to another folder

---

## Future Requirements

- Custom status labels (beyond the 4 fixed values) — deferred; fixed enum sufficient for v1.4 QC pipeline
- Bulk status update (select multiple assets, set status at once) — deferred; per-asset sufficient for v1.4
- Review link expiry / password protection — deferred to dedicated sharing milestone
- Comment threads / replies — deferred

## Out of Scope

- Mobile app — web-first approach
- Offline mode — real-time collaboration is core value
- Custom QC status labels — fixed enum (approved / needs_revision / in_review / none) avoids scope explosion

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOVE-01 | Phase 29 — move-to-folder | Pending |
| STATUS-01 | Phase 30 — asset-review-status | Complete |
| STATUS-02 | Phase 30 — asset-review-status | Complete |
| VSTK-01 | Phase 31 — version-stack-management | Complete |
| VSTK-02 | Phase 31 — version-stack-management | Complete |
| REVIEW-01 | Phase 32 — smart-copy-options | Pending |
| REVIEW-02 | Phase 32 — smart-copy-options | Pending |
| REVIEW-03 | Phase 33 — selection-review-links | Pending |
| COMPARE-01 | Phase 34 — compare-view-audio-comments | Pending |
| COMPARE-02 | Phase 34 — compare-view-audio-comments | Pending |
