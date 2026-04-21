---
gsd_state_version: 1.0
milestone: v1.9
milestone_name: Hardening & Consistency Audit
status: active
stopped_at: Roadmap created — Phase 54 (security-hardening) ready for /gsd:plan-phase 54
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** v1.9 Hardening & Consistency Audit — Phase 54 (security-hardening) up next

## Current Position

Phase: Phase 54 (security-hardening) — Not started
Plan: —
Status: Roadmap created from 4-stream audit, awaiting /gsd:plan-phase 54
Last activity: 2026-04-20 — v1.9 roadmap written (6 phases, 54–59; 37 requirements)

Progress: [░░░░░░░░░░] 0% (0/6 phases)

## Performance Metrics

**Velocity:**

- v1.3: 9 plans / 6 phases
- v1.4: 7 plans / 5 phases
- v1.5: 9 plans / 8 phases
- v1.6: archived, never executed
- v1.7: 6 plans / 6 phases (shipped 2026-04-20)
- v1.8: 5 plans / 5 phases (shipped 2026-04-20)

## Accumulated Context

### Decisions

- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- reviewStatus (not status) is the QC field — status is the upload lifecycle field (uploading | ready)
- Atomic Firestore batch for version group merge
- FPS stored as frameRate on Asset, measured via requestVideoFrameCallback
- Video.js does not reset audio track on src() change — use player.muted() for per-side audio toggle
- Platform admin (user.role === 'admin') is the single gate for safe-zones CRUD
- requireAdmin is strict equality, not role-rank — managers can't admin
- Session endpoint rejects uninvited Google signins; first-admin bootstrap preserved via _system/first-admin guard doc
- Permissions module (src/lib/permissions.ts) is the single source of truth for role matrices
- version-groups helper (src/lib/version-groups.ts) handles legacy-root resolution for all stack mutations
- ffmpeg export pipeline — MP4 (copy + re-encode fallback), GIF (two-pass palette, 480p/12fps); Hobby plan caps at maxDuration 60s / 2048 MB; clip cap 45s
- Confirm dialogs go through ConfirmProvider/useConfirm (no window.confirm)
- Player bg color + VU-meter toggle persist in localStorage
- file-types.ts is the single source of truth for MIME/extension classification
- Soft-delete via `deletedAt` + `deletedBy` fields; list endpoints filter in-memory to avoid composite index
- Firestore list queries avoid `.where().orderBy()` combinations — sort in memory
- Modal accent line requires parent `overflow-hidden` to clip against rounded corners
- v1.9: audit surfaced systemic soft-delete filter gaps (stats, copy, review-link contents, review-link drill-down, assets/size) — Phase 55 sweeps them all
- v1.9: audit surfaced `disabled` user bypass on all routes except /auth/session — fix in Phase 54 moves the check to `getAuthenticatedUser`
- v1.9: audit surfaced two permission helper patterns (old async canAccessProject wrapper vs new pure function) — Phase 58 consolidates to pure only

### Recently Shipped

- v1.8 Asset Pipeline & Visual Polish (Phases 49–53, shipped 2026-04-20)
- Post-v1.8 ad-hoc: image compare enabled + audit fixes + 6 nice-to-have shortcuts

### v1.9 source (audit artifacts)

Four parallel audit streams run 2026-04-20, reports folded into REQUIREMENTS.md:
- Frontend UX / component consistency — 5 CRITICAL / 10 MEDIUM / 7 LOW
- Backend API + security + data model — 7 CRITICAL / 9 MEDIUM / 4 LOW
- File management end-to-end flows — 5 CRITICAL / 8 MEDIUM / 5 LOW
- Viewer / player / compare / export — 4 CRITICAL / 6 MEDIUM / 5 LOW

### Pending Todos

None — ready for /gsd:plan-phase 54.

### Blockers/Concerns

- Suspended-user bypass (SEC-03) is the single highest-impact finding — ID tokens stay valid ~1h after Firebase revoke; moving the `disabled` check to `getAuthenticatedUser` closes the window
- Soft-delete filter gaps affect review-link guest views — trashed assets currently visible through guest resolution; Phase 55 prioritizes this
- Export modal's missing initialIn/Out wiring means users never see their loop range pre-filled, so most exports start at 0→duration; easy win for Phase 56

## Session Continuity

Last session: 2026-04-20
Stopped at: v1.9 scaffolded (6 phases, 37 requirements); awaiting /gsd:plan-phase 54 or /gsd:autonomous
Resume file: None
