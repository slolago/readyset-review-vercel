---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Architecture Hardening
status: active
stopped_at: Roadmap created — Phase 60 (pipeline-observability) ready
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Fast, accurate video review
**Current focus:** v2.0 Architecture Hardening — Phase 60 next

## Current Position

Phase: Phase 60 (pipeline-observability) — Not started
Status: Roadmap created from deep lifecycle + unhappy-path audit
Last activity: 2026-04-20 — v2.0 scaffolded (7 phases, 31 reqs)

Progress: [░░░░░░░░░░] 0% (0/7 phases)

## Accumulated Context

### v2.0 audit source

Single deep audit (2026-04-20), max thoroughness, found 5 critical + 8 medium + 4 low issues. Systemic patterns:

1. Fire-and-forget jobs with no observability/retry
2. Signed URLs regenerated per-request (no cache)
3. Full-collection scans where composite indexes would suffice
4. `batch()` where `runTransaction()` is required (corruption race)
5. Client metadata → Firestore → probe corrects later (stale window visible to others)

### Decisions

- Push to both origin + vercel after each phase
- Permissions: src/lib/permissions.ts is single source of truth
- Soft-delete via deletedAt + deletedBy, filtered in-memory
- ffmpeg Hobby caps: 60s / 2048 MB; clip cap 45s
- v2.0: jobs get a Firestore `jobs` collection with status tracking
- v2.0: signed URLs cached on asset doc with expiresAt; regen within 30 min of expiry
- v2.0: merge/unstack/reorder + auto-versioning all under runTransaction
- v2.0: composite index on `assets(projectId, folderId, deletedAt)` replaces fetch-then-filter

### Pending Todos

None — ready for /gsd:plan-phase 60.

### Blockers/Concerns

- IDX-02 commentCount denormalization: existing assets will have no commentCount until a migration backfills. Plan includes a backfill script.
- SEC-20 bcrypt migration: existing plaintext passwords need migration on first-read (hash-then-replace). Plan handles this transparently.
- Firestore composite indexes require deployment; the GSD plan will generate the `firestore.indexes.json` deltas.

## Session Continuity

Last session: 2026-04-20
Stopped at: v2.0 scaffolded, ready for /gsd:plan-phase 60
Resume file: None
