---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Dashboard & Annotation UX Fixes
status: defining_requirements
stopped_at: Defining requirements for v2.2
last_updated: "2026-04-21T21:00:00.000Z"
last_activity: 2026-04-21
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Fast, accurate video review
**Current focus:** v2.2 Dashboard & Annotation UX Fixes — 9 UI/UX bugs

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-21 — Milestone v2.2 started

## Accumulated Context

### Key decisions (carried from v2.1)

- Denormalized `Project.collaboratorIds` (maintained atomically everywhere `collaborators` is written — 5 writers total)
- `src/lib/projects-access.ts::fetchAccessibleProjects` and `src/lib/dashboard-stats.ts::fetchDashboardStats` are the single entry points for those queries (route + SSR both consume)
- `AuthContext` uses `sessionStorage` (tab-scoped) for returning-user cache, 24h TTL
- `ProjectsContext` wraps authenticated pages so dashboard + sidebar share one fetch
- `getAuthenticatedUser` caches user doc reads module-level, 30s TTL; `invalidateUserCache(uid)` exposed and called by session endpoint after name/avatar mutations
- Server Component dashboard ships structurally; `initialStats=null` fallback until session-cookie middleware lands in v3

### Recently shipped

- v2.1 Dashboard Performance (3 phases, shipped 2026-04-21)
- v2.0 Architecture Hardening (7 phases, shipped 2026-04-20)
- v1.9 Hardening & Consistency Audit (6 phases, shipped 2026-04-20)

### Operational state

- Firestore composite indexes deployed (v1.9 + v2.0 + v2.1 batches all live)
- collaboratorIds backfilled on 18 existing projects
- deletedAt backfilled on 140 assets + 84 folders (v2.0 rollout)
- commentCount backfilled on 131 assets (v2.0 rollout)
- Sprite-v2 generated on 64/74 videos; 7 are orphaned (deleted projectId) + 3 are timeouts on Hobby plan
- Review-link passwords auto-migrate plaintext → bcrypt on first verify (transparent)

### Pending Todos

None — starting v2.2 requirements work.

### Blockers/Concerns

- None blocking v2.2 specifically. All bugs are scoped to frontend behavior (context menus, grid/list UI, inline rename, Fabric.js canvas) plus one API-backed fix for folder duplicate.

## Session Continuity

Last session: 2026-04-21
Stopped at: v2.2 milestone started — requirements being defined
Resume file: None
