---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: — Dashboard & Annotation UX Fixes
status: completed
stopped_at: Completed 73-01-PLAN.md
last_updated: "2026-04-21T18:30:00.000Z"
last_activity: "2026-04-21 — Phase 73 plan 01 shipped: drawing-mode single-object transforms — obj.evented=true on select tool (DRAW-01)"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 6
  completed_plans: 6
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Fast, accurate video review
**Current focus:** v2.2 Dashboard & Annotation UX Fixes — 9 UI/UX bugs across 4 phases

## Current Position

Phase: 73 (drawing-mode-transforms) — complete
Plan: 73-01-PLAN.md — shipped
Status: Phase 73 complete (DRAW-01). v2.2 milestone complete — all 9 requirements across 4 phases shipped.
Last activity: 2026-04-21 — Phase 73 plan 01 shipped: drawing-mode single-object transforms — obj.evented=true on select tool (DRAW-01)

## v2.2 Phase Structure

| Phase | Name | Requirements |
|-------|------|--------------|
| 70 | context-menu-behavior | CTX-02, CTX-03, CTX-04, CTX-05 |
| 71 | grid-view-affordances | VIEW-01, VIEW-02 |
| 72 | inline-edit-and-folder-duplicate | EDIT-01, FS-01 |
| 73 | drawing-mode-transforms | DRAW-01 |

**Coverage:** 9/9 requirements mapped, no orphans.

## Accumulated Context

### Key decisions (carried from v2.1)

- Denormalized `Project.collaboratorIds` (maintained atomically everywhere `collaborators` is written — 5 writers total)
- `src/lib/projects-access.ts::fetchAccessibleProjects` and `src/lib/dashboard-stats.ts::fetchDashboardStats` are the single entry points for those queries (route + SSR both consume)
- `AuthContext` uses `sessionStorage` (tab-scoped) for returning-user cache, 24h TTL
- `ProjectsContext` wraps authenticated pages so dashboard + sidebar share one fetch
- `getAuthenticatedUser` caches user doc reads module-level, 30s TTL; `invalidateUserCache(uid)` exposed and called by session endpoint after name/avatar mutations
- Server Component dashboard ships structurally; `initialStats=null` fallback until session-cookie middleware lands in v3

### Relevant prior art for v2.2

- `<InlineRename />` primitive exists from v1.9 Phase 57 — already used in grid + list views; EDIT-01 work will live on this component
- Folder deep-copy helper exists: `src/lib/folders.ts::deepCopyFolder` (BFS, Promise.all per level) from v1.9 Phase 55 — FS-01 folder-duplicate should reuse this
- Context menu / Dropdown a11y + keyboard nav established in v1.9 Phase 59 (`role="menu"`, arrow keys, Escape)
- Asset duplicate naming rule (no "copy of" prefix) set in v1.5 Phase 39 — FS-01 should match for parity

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

None — v2.2 milestone complete. Ready to ship or plan next milestone.

### Blockers/Concerns

- None blocking v2.2. All 4 phases touch isolated code paths (context menu component, grid view toggle + AssetCard layering, inline rename + folder duplicate API, Fabric.js canvas). No phase dependencies within v2.2 — phases can theoretically be planned/executed in any order.

## Session Continuity

Last session: 2026-04-21T18:30:00.000Z
Stopped at: Completed 73-01-PLAN.md
Resume file: None
