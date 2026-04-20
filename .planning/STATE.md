---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Review UX & Access Rewrite
status: active
stopped_at: Defining requirements
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** v1.7 Review UX & Access Rewrite — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-20 — Milestone v1.7 started (supersedes v1.6)

Progress: [░░░░░░░░░░] 0% (0/0 phases)

## Performance Metrics

**Velocity:**

- v1.3: 9 plans across 6 phases
- v1.4: 7 plans across 5 phases
- v1.5: 9 plans across 8 phases
- v1.6: archived, never executed
- Trend: Stable

## Accumulated Context

### Decisions

- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- reviewStatus (not status) is the QC field — status is the upload lifecycle field (uploading | ready)
- SmartCopyModal and VersionStackModal extracted to shared files in v1.4 audit
- Atomic Firestore batch for version group merge (established v1.3)
- Dual MIME type on drag start for version stacking (established v1.3)
- FPS stored as frameRate on Asset, measured via requestVideoFrameCallback — v1.5 snaps to standard rates
- VU meter AnalyserNode must tap BEFORE GainNode to measure source signal
- showAllVersions stored on ReviewLink doc — bug is in the GET /review-links/[token] render path
- Video.js does not reset audio track on src() change — use player.muted() for per-side audio toggle
- Platform admin (user.role === 'admin') is the single gate for safe-zones CRUD; project roles do not apply to global resources
- requireAdmin is strict equality, not role-rank — managers can't admin (confirmed 2026-04-20)
- Session endpoint now rejects uninvited Google signins (2026-04-20 security fix); first-admin bootstrap preserved via _system/first-admin guard doc
- Player bg color picker + VU-meter toggle persist in localStorage (keys: player-bg, player-vumeter)

### Recently Shipped (ad-hoc, outside GSD phases)

- 2026-04-20: Security fix — reject uninvited Google sign-ins
- 2026-04-20: Player background color picker (black + grays), shared between player + compare
- 2026-04-20: Collaborators panel — scrollable list + multi-select invite with chips
- Prior to session: ffprobe metadata pipeline, resolved-comments "Completed" badge, compare player rewrite unified with single-asset player

### Pending Todos

None (queued for v1.7 planning).

### Blockers/Concerns

- BUG-05: Compare slider freezes — superseded by v1.5 Phase 42 compare rewrite; verify no regressions in v1.7 PLAY-01
- Uninvited users from pre-fix window may still be in Firestore with role='viewer' — manual audit needed; see ACCESS-0x requirements

## Session Continuity

Last session: 2026-04-20
Stopped at: v1.7 milestone scaffolded; about to write REQUIREMENTS.md and spawn roadmapper
Resume file: None
