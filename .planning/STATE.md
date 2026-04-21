---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: — Dashboard Performance
status: Roadmap created from focused dashboard perf audit
stopped_at: Completed 67-01-PLAN.md
last_updated: "2026-04-21T18:13:41.343Z"
last_activity: 2026-04-21 — v2.1 scaffolded (3 phases, 9 reqs)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Fast, accurate video review
**Current focus:** v2.1 Dashboard Performance — Phase 67 next

## Current Position

Phase: Phase 67 (dashboard-query-optimizations) — Not started
Status: Roadmap created from focused dashboard perf audit
Last activity: 2026-04-21 — v2.1 scaffolded (3 phases, 9 reqs)

Progress: [░░░░░░░░░░] 0% (0/3 phases)

## Accumulated Context

### v2.1 audit source

Single focused perf audit (2026-04-21), dashboard load path only. 3 critical + 3 medium + 3 low findings, cleanly split into 3 phases per auditor's recommendation.

**Top 3 criticals:**

1. `/api/stats` and `/api/projects` both do full `projects` collection scans to find collaborator access (Firestore read cost proportional to total project count in the system, not user's own)
2. `/api/stats` asset-count loop is sequential `await` inside `for` — 15 projects = 15 serial Firestore RPCs = 750ms-2.5s
3. `AuthContext` blocks all rendering with `/api/auth/session` POST on every page load — 700ms-1s blank spinner gate

### Decisions

- Phase 67 needs a `Project.collaboratorIds: string[]` denormalized field (maintained alongside `collaborators: Collaborator[]`) to enable `array-contains` queries
- Phase 67 ships a one-off backfill script (pattern established in v2.0 for `deletedAt:null` and `commentCount`)
- Phase 68 uses `sessionStorage` for cached user object (not localStorage — tab-scoped, auto-clears on close)
- Phase 69 Server Component wrapper shares the stats-fetch helper with `/api/stats` (no logic duplication)
- Firebase Admin SDK composite index on `projects(collaboratorIds ARRAY, name ASC)` or similar — define during Phase 67 planning
- [Phase 67]: Denormalized Project.collaboratorIds for indexed array-contains queries; shared helper + Promise.all fan-out + SWR cache header on /api/stats.

### Recently shipped

- v2.0 Architecture Hardening (shipped 2026-04-21)
- Sprite generation architectural rewrite (single-pass fps+tile filter, commit b6366552)
- Deletedat backfill post-v2.0 (commit e84aaaa9)

### Pending Todos

None — ready for /gsd:plan-phase 67.

### Blockers/Concerns

- PERF-01 requires backfill + Firestore composite index deploy; without the index deploy the `array-contains` query fails with FAILED_PRECONDITION. Script needs `firebase deploy --only firestore:indexes` as a follow-up (same pattern as v2.0).
- PERF-07 Server Component migration may require refactoring how the client dashboard component receives data (prop-drill vs context vs SWR seed) — needs thought in planning.

## Session Continuity

Last session: 2026-04-21T18:13:34.151Z
Stopped at: Completed 67-01-PLAN.md
Resume file: None
