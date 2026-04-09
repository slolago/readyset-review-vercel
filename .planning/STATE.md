---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: — Review & Version Workflow
status: verifying
stopped_at: Completed 30-01-PLAN.md (asset-review-status)
last_updated: "2026-04-09T03:10:02.616Z"
last_activity: 2026-04-09
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 3
  completed_plans: 2
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management
**Current focus:** Phase 29 — move-to-folder

## Current Position

Phase: 29 (move-to-folder) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-04-09

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

| Phase 29-move-to-folder P01 | 20min | 2 tasks | 2 files |
| Phase 30-asset-review-status P01 | 15min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- Push to both origin (readyset-review) and vercel (readyset-review-vercel) after each phase
- reviewStatus (not status) is the QC field — status is the upload lifecycle field (uploading | ready)
- Status enum: approved / needs_revision / in_review — absent means pending (no badge shown)
- Smart copy = reference copy + GCS delete guard (not full GCS object copy)
- Selection review link asset cap = 50 max for v1.4
- Atomic Firestore batch for version group merge (v1.3 pattern)
- Dual MIME type on drag start (x-frame-move + x-frame-version-stack) for version stacking
- [Phase 29-move-to-folder]: Move state lives in FolderBrowser only — AssetCard/FolderCard fire onRequestMove and own no move state
- [Phase 29-move-to-folder]: FolderCard hover Dropdown fixed beyond plan scope to give consistent move-to-folder surface across all card types
- [Phase 30-asset-review-status]: FieldValue.delete() guard in else branch only — folderId batch path untouched
- [Phase 30-asset-review-status]: STATUS_META lookup table for badge metadata — easy to extend new statuses

### Pending Todos

None.

### Blockers/Concerns

- Phase 31 (VSTK): Use Firestore transaction (not batch) for reorder — batches do not guard stale reads
- Phase 31 (VSTK): versionGroupId must be set to asset.id (never null) on unstack
- Phase 31 (VSTK): Re-compact version numbers 1..N after every unstack or reorder
- Phase 33 (REVIEW-03): Firestore in query capped at 30 — use Promise.all(getDoc) instead
- Phase 34 (COMPARE-01): Video.js does not reset audio track state on src() change — use player.muted() toggling

## Session Continuity

Last session: 2026-04-09T03:10:02.611Z
Stopped at: Completed 30-01-PLAN.md (asset-review-status)
Resume file: None
