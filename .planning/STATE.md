---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: — Review & Version Workflow
status: verifying
stopped_at: Completed 33-02-PLAN.md (selection-review-links UI)
last_updated: "2026-04-09T04:19:37.113Z"
last_activity: 2026-04-09
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 8
  completed_plans: 7
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
| Phase 30-asset-review-status P02 | 15 | 1 tasks | 5 files |
| Phase 31-version-stack-management P02 | 4 | 2 tasks | 3 files |
| Phase 33-selection-review-links P02 | 2 | 2 tasks | 2 files |

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
- [Phase 30-asset-review-status]: Optimistic reviewStatus update via setActiveVersion spread avoids re-fetching signed URLs
- [Phase 30-asset-review-status]: Tag icon used as viewer header status-setter trigger to keep header uncluttered
- [Phase 31-version-stack-management]: API routes for Plan 01 created inline as Rule 3 deviation — Plan 01 was not executed; unstack uses db.batch(), reorder uses db.runTransaction() per STATE.md mandate
- [Phase 31-version-stack-management]: Version badge in VersionStackModal shows V{idx+1} to reflect current visual order after drag-reorder, not stored version number
- [Phase 33-selection-review-links]: selectionReviewIds resets to null in modal onClose to prevent stale IDs across selection changes
- [Phase 33-selection-review-links]: folderId passed as null when selectionReviewIds is set so modal POST sends folderId null

### Pending Todos

None.

### Blockers/Concerns

- Phase 31 (VSTK): Use Firestore transaction (not batch) for reorder — batches do not guard stale reads
- Phase 31 (VSTK): versionGroupId must be set to asset.id (never null) on unstack
- Phase 31 (VSTK): Re-compact version numbers 1..N after every unstack or reorder
- Phase 33 (REVIEW-03): Firestore in query capped at 30 — use Promise.all(getDoc) instead
- Phase 34 (COMPARE-01): Video.js does not reset audio track state on src() change — use player.muted() toggling

## Session Continuity

Last session: 2026-04-09T04:19:37.107Z
Stopped at: Completed 33-02-PLAN.md (selection-review-links UI)
Resume file: None
