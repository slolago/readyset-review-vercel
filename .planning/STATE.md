---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Asset Pipeline & Visual Polish
status: shipped
stopped_at: All 5 phases shipped — awaiting human verification walkthroughs
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** v1.8 shipped; awaiting human verification + next milestone definition

## Current Position

Phase: All v1.8 phases shipped
Plan: —
Status: Milestone v1.8 complete (5/5 phases)
Last activity: 2026-04-20 — Phase 53 executed; commits a60291f0..47e23d43 pushed

Progress: [██████████] 100% (5/5 phases)

## Performance Metrics

**Velocity:**

- v1.3: 9 plans across 6 phases
- v1.4: 7 plans across 5 phases
- v1.5: 9 plans across 8 phases
- v1.6: archived, never executed
- v1.7: 6 plans across 6 phases (shipped 2026-04-20)
- v1.8: 5 plans across 5 phases (shipped 2026-04-20)
- Trend: Stable

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
- ffmpeg export pipeline — MP4 (copy + re-encode fallback), GIF (two-pass palette, 480p/12fps); ffmpegPath resolver in src/lib/ffmpeg-resolve.ts
- Confirm dialogs go through ConfirmProvider/useConfirm (no window.confirm)
- Player bg color + VU-meter toggle persist in localStorage
- v1.8: `src/lib/file-types.ts` is the single source of truth for MIME/extension classification across client and server allow-lists
- v1.8: Image dimension extraction is client-first (createImageBitmap on original File), server-fallback (image-size on first 64KB of GCS object)
- v1.8: Soft-delete via `deletedAt` + `deletedBy` fields; list endpoints filter in-memory (avoids composite index)
- v1.8: Firestore list queries avoid `.where().orderBy()` combinations — sort in memory to skip composite index requirement
- v1.8: Modal accent line requires parent `overflow-hidden` to clip against rounded corners

### Recently Shipped (v1.8)

- Phase 49 metadata-accuracy (6 tasks, 13 new tests) — 0f9490b5..71732074
- Phase 50 review-links-repair (3 tasks, 9 new tests) — 8998bd50..59393691
- Phase 51 file-type-expansion (5 tasks) — 88a5a4d7..c4c1566b
- Phase 52 trash-and-recovery (10 tasks) — af987a48..91eb2031
- Phase 53 visual-polish (9 tasks + human checkpoint) — a60291f0..47e23d43

### Pending Todos

- Human verification walkthroughs for phases 49, 51, 52, 53
- Wire `?action=upload` / `?action=invite` query handling on `/projects` page (follow-up flagged in dashboard TODO)

### Blockers/Concerns

- Vercel plan detection — maxDuration=300 only applies on Pro; Hobby clamps to 60s
- Phase 52 soft-delete creates orphan-folder edge cases — restore flow auto-reparents, permanent-delete cascades, but worth monitoring in live QA

## Session Continuity

Last session: 2026-04-20
Stopped at: v1.8 milestone shipped end-to-end; awaiting human walkthroughs + next milestone definition
Resume file: None
