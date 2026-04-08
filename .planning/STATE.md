---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Review & Version Workflow
status: Ready to plan
stopped_at: roadmap created — ready to plan Phase 29
last_updated: "2026-04-08"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** v1.4 — Review & Version Workflow (Phase 29: move-to-folder)

## Current Position

Phase: 29 of 34 (move-to-folder)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-04-08 — v1.4 roadmap created (phases 29–34)

Progress: [░░░░░░░░░░] 0% (0/6 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 9 (v1.3)
- Average duration: unknown
- Total execution time: unknown

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.3 phases (23–28) | 9 | - | - |

**Recent Trend:**
- v1.3: 9 plans across 6 phases
- Trend: Stable

## Accumulated Context

### Decisions

- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- reviewStatus (not status) is the QC field — status is the upload lifecycle field (uploading | ready)
- Status enum: approved / needs_revision / in_review — absent means pending (no badge shown)
- Smart copy = reference copy + GCS delete guard (not full GCS object copy)
- Selection review link asset cap = 50 max for v1.4
- Atomic Firestore batch for version group merge (v1.3 pattern)
- Dual MIME type on drag start (x-frame-move + x-frame-version-stack) for version stacking

### Pending Todos

None.

### Blockers/Concerns

- Phase 31 (VSTK): Use Firestore transaction (not batch) for reorder — batches do not guard stale reads
- Phase 31 (VSTK): versionGroupId must be set to asset.id (never null) on unstack
- Phase 31 (VSTK): Re-compact version numbers 1..N after every unstack or reorder
- Phase 33 (REVIEW-03): Firestore in query capped at 30 — use Promise.all(getDoc) instead
- Phase 34 (COMPARE-01): Video.js does not reset audio track state on src() change — use player.muted() toggling

## Session Continuity

Last session: 2026-04-08
Stopped at: Roadmap created. Next step: /gsd:plan-phase 29
Resume file: None
