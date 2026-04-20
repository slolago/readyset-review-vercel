# Requirements: readyset-review

**Defined:** 2026-04-20 (v1.7 — supersedes v1.6)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v1.7 Requirements

Requirements for milestone v1.7 — Review UX & Access Rewrite. Each maps to roadmap phases via the Traceability table below.

### Version Stack Management

- [ ] **STACK-01**: User can stack any existing asset onto any other asset (not just singletons) — drag-and-drop or context-menu merge works when either source or target is already part of a version group, producing one merged group with stable version numbers
- [ ] **STACK-02**: User can detach (unstack) any version from a stack — any version in the group, not only the topmost, becomes an independent asset without deleting comments/annotations/review-link associations
- [ ] **STACK-03**: User can reorder versions within a stack — drag a version to a different position in the version list and the version numbers renumber atomically
- [ ] **STACK-04**: Stack/unstack operations never produce silent data loss — comments, annotations, review-link references, and review status are preserved or explicitly warned-about before the operation commits

### Project Management

- [ ] **PROJ-01**: User with owner or admin role can rename a project (name field, not just description) — inline edit or modal, with name-conflict detection within the user's projects

### Access & Admin Rewrite

- [ ] **ACCESS-01**: Platform role model is documented and consistently enforced — admin/manager/editor/viewer ranks, with exact matrix of which endpoints each role can call (single source of truth in code)
- [ ] **ACCESS-02**: Project role model is documented and consistently enforced — owner/editor/reviewer on each project, with clear matrix for upload/delete/rename/invite/share permissions
- [ ] **ACCESS-03**: Review-link permission flags (allowComments, allowDownloads, allowApprovals, showAllVersions, password) are each enforced on both the read path (API) and the render path (UI hides controls) — no client-side-only gating
- [ ] **ACCESS-04**: Admin UI surfaces the full permission state of any project and review link — can audit collaborators, review-link holders, and pending invites in one view without touching Firestore manually
- [ ] **ACCESS-05**: Admin can disable/suspend any user and revoke all of their active sessions — suspended users cannot establish a new session or use existing tokens
- [ ] **ACCESS-06**: Admin can audit uninvited / orphaned users (users that exist in Firestore but were never explicitly invited) and delete or suspend them in-app
- [ ] **ACCESS-07**: All access-control tests pass — platform-level, project-level, and review-link-level tests prove each role's matrix; no "cannot access" path silently falls through to allow access

### Comments

- [ ] **CMT-01** (supersedes v1.6 CMT-04): User can set an in-point and out-point on a comment; timeline shows a highlighted range; clicking a range comment seeks to the in-point
- [ ] **CMT-02**: Comment count badge matches the actual number of user-visible comments for that asset — no off-by-N, no phantom drawings-counted-as-comments
- [ ] **CMT-03**: User cannot save an annotation drawing without comment text — either the Save button is disabled, or the drawing is discarded on Cancel; orphan drawings are not persisted

### Export

- [ ] **EXPORT-01**: User can open an Export modal from the video player that lets them choose format (GIF or MP4), set in-point and out-point on a trim bar, name the file, and trigger a server-side export
- [ ] **EXPORT-02**: Exported MP4 preserves the source codec settings where possible (copy) or re-encodes cleanly (H.264 + AAC) for the trim range; exported GIF is looping, reasonable frame rate, palette-optimized
- [ ] **EXPORT-03**: Export progress is observable (queued → encoding → ready) and the user can download the result via signed URL

### UX & Hierarchy

- [ ] **UX-01**: Selection and hover states have a visible hierarchy that communicates nesting — project → folder → asset → version all read clearly when nested selections are active (selected-parent vs selected-child vs hovered-child distinguishable)

### Playback

- [ ] **PLAY-01**: User can toggle a loop button in the player controls — when no in/out is set, the whole video loops; when in/out is marked, loop honors those bounds; state is per-session (reset when asset/version changes)

## Absorbed from v1.6

The following v1.6 IDs are retired and their intent is captured in v1.7 IDs above:

| v1.6 ID | v1.7 replacement | Notes |
|---------|------------------|-------|
| CMT-04 (range comments) | CMT-01 | Same intent, renumbered |
| (implicit) phantom comment count | CMT-02 | New in v1.7 |
| (implicit) orphan drawings | CMT-03 | New in v1.7 |

Other v1.6 items (BUG-01..05, CMT-01..03, PLAY-02..04, VER-01, RVLINK-01..02) were either **already shipped** in ad-hoc commits during the v1.6 planning window (resolved comments badge, compare player rewrite, FPS accuracy in v1.5, viewer download CTA in v1.5, show-all-versions in v1.5 Phase 40) or **deferred** as out-of-scope polish. See v1.6-archive/README.md for the original scope.

## v2 / Future Requirements

- Review-link holder presence indicator (who is currently reviewing)
- Notifications (in-app + email) for new comments on shared assets
- Bulk export (export a whole folder of trims in one job)
- Per-asset watermarking for client-facing review links

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first approach |
| Real-time collaborative cursors | Not needed for async review workflow |
| Video transcoding library / ingest pipeline | ffmpeg trim + convert is enough for v1.7 export |
| Offline mode | Real-time collaboration is core value |
| SSO / SAML / OIDC beyond Google | Google OAuth is the single entry point |
| Role customization / custom permission matrices | Fixed role set is sufficient |
| Audit log of all admin actions (full event sourcing) | Logged errors + Firestore history is enough |

## Traceability

Which phases cover which requirements. Populated by gsd-roadmapper during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STACK-01 | — | Pending |
| STACK-02 | — | Pending |
| STACK-03 | — | Pending |
| STACK-04 | — | Pending |
| PROJ-01 | — | Pending |
| ACCESS-01 | — | Pending |
| ACCESS-02 | — | Pending |
| ACCESS-03 | — | Pending |
| ACCESS-04 | — | Pending |
| ACCESS-05 | — | Pending |
| ACCESS-06 | — | Pending |
| ACCESS-07 | — | Pending |
| CMT-01 | — | Pending |
| CMT-02 | — | Pending |
| CMT-03 | — | Pending |
| EXPORT-01 | — | Pending |
| EXPORT-02 | — | Pending |
| EXPORT-03 | — | Pending |
| UX-01 | — | Pending |
| PLAY-01 | — | Pending |

**Coverage:**
- v1.7 requirements: 20 total
- Mapped to phases: 0 (pending roadmapper)
- Unmapped: 20

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 — awaiting roadmapper to populate traceability*
