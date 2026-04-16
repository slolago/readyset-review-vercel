# Requirements: readyset-review

**Defined:** 2026-04-16
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v1.6 Requirements

Requirements for milestone v1.6 — Polish & UX Refinement. Each maps to roadmap phases.

### Bugs

- [ ] **BUG-01**: FPS detection produces correct frame rate on new uploads (not 31fps)
- [ ] **BUG-02**: Right-click "review link" shows context menu instead of opening folder
- [ ] **BUG-03**: Annotation drawings clear when switching between versions
- [ ] **BUG-04**: Arrow drawing tool does not select/move existing freehand drawings
- [ ] **BUG-05**: Compare slider plays both videos reliably without freezing

### Comments

- [ ] **CMT-01**: Resolved comments show checkmark instead of disappearing
- [ ] **CMT-02**: User can edit their own comments (only original author)
- [ ] **CMT-03**: Links in comments are clickable and contained within comment box
- [ ] **CMT-04**: User can mark a comment as a range (in-out timecodes) on the timeline

### Compare & Player

- [ ] **PLAY-01**: Compare view shows clear indicator of which version's audio is playing
- [ ] **PLAY-02**: User can easily switch audio between versions in compare (slider + side-by-side)
- [ ] **PLAY-03**: VU meter is wider for better number legibility
- [ ] **PLAY-04**: Video hover preview — scrubbing cursor over thumbnails shows frames

### Version Management

- [ ] **VER-01**: Version selector dropdown shows upload date/time for each version

### Review Links

- [ ] **RVLINK-01**: Show-all-versions works correctly (single-video shows all; folder preserves structure)
- [ ] **RVLINK-02**: Review links can be created on individual videos, not just folders

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

(None deferred — all items included in v1.6)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first approach |
| ffprobe server-side codec extraction | Browser requestVideoFrameCallback sufficient |
| Offline mode | Real-time collaboration is core value |
| Video transcoding | Out of scope for review platform |
| Waveform display in VU meter | Polish only — widen existing meter |
| Real-time collaborative cursors | Not needed for async review workflow |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 43 | Pending |
| VER-01 | Phase 43 | Pending |
| PLAY-03 | Phase 43 | Pending |
| CMT-01 | Phase 44 | Pending |
| CMT-02 | Phase 44 | Pending |
| CMT-03 | Phase 44 | Pending |
| CMT-04 | Phase 44 | Pending |
| BUG-03 | Phase 45 | Pending |
| BUG-04 | Phase 45 | Pending |
| BUG-05 | Phase 46 | Pending |
| PLAY-01 | Phase 46 | Pending |
| PLAY-02 | Phase 46 | Pending |
| BUG-02 | Phase 47 | Pending |
| RVLINK-01 | Phase 47 | Pending |
| RVLINK-02 | Phase 47 | Pending |
| PLAY-04 | Phase 47 | Pending |

**Coverage:**
- v1.6 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 — traceability populated by roadmapper (phases 43–47)*
