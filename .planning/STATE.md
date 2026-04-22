---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: — App-Wide Performance Polish
status: completed
stopped_at: Completed 78-01-PLAN.md
last_updated: "2026-04-22T14:02:50.010Z"
last_activity: 2026-04-22 — shipped 78-01 (admin pagination + firestore index/batching + next/font + preconnect + img→Image + date-fns cleanup; v2.3 complete 18/18)
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 5
  completed_plans: 5
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Fast, accurate video review
**Current focus:** v2.3 App-Wide Performance Polish — 18 REQs across 5 phases

## Current Position

Phase: 78 (data-layer-bundle-and-network) — complete
Plan: 78-01 — shipped
Status: v2.3 App-Wide Performance Polish complete (18/18 REQs across 5 phases). Operator step pending: `firebase deploy --only firestore:indexes`.
Last activity: 2026-04-22 — shipped 78-01 (admin pagination + firestore index/batching + next/font + preconnect + img→Image + date-fns cleanup)

## v2.3 Phase Structure

| Phase | Name | Requirements |
|-------|------|--------------|
| 74 | viewer-critical-path | PERF-10, PERF-11, PERF-12, PERF-13, PERF-14 |
| 75 | page-loading-and-server-components | PERF-15, PERF-16, PERF-17 |
| 76 | asset-viewer-restructure | PERF-18, PERF-19, PERF-20, PERF-21 |
| 77 | folder-browser-decomposition | PERF-22, PERF-23 |
| 78 | data-layer-bundle-and-network | PERF-24, PERF-25, PERF-26, PERF-27 |

**Coverage:** 18/18 requirements mapped.

## Audit Findings (Source Material)

Synthesized from 4 parallel explore agents:

- **Pages audit** — 10 routes checked; 3 CRITICAL (asset viewer, review page, folder browser), 2 HIGH (admin, /projects), 3 MEDIUM
- **Viewer audit** — 12 concrete bottlenecks, 3 CRITICAL on the video element itself (`preload="auto"`, no poster, sync Fabric load)
- **Data-layer audit** — 10 findings beyond v2.0/v2.1's fixes; top offenders are admin pagination + missing comments index for review links
- **Bundle audit** — Google Fonts blocking, no `modularizeImports`, no `next/dynamic` usage in the entire app, 10 components could flip to Server Components

## Accumulated Context

### Key decisions (carried from prior milestones)

- `ContextMenuProvider` + `useContextMenuController` singleton pattern (v2.2) — reuse for any new provider work
- `RenameController` context (v2.2) — narrowed in Phase 77 to wrap only the content surface, not the whole FolderBrowserInner
- Parallel mount-effect fetches via `Promise.all` (Phase 77) — fire-and-forget pattern when each callback has internal try/catch
- `deepCopyFolder` requires `deletedAt: null` on every `.set()` to honor the Phase 63 composite-index query
- `fetchAccessibleProjects` (v2.1) is the reusable access-check pattern for any admin/list route
- `src/lib/signed-url-cache.ts::getOrCreateSignedUrl` is the single entry point for signed-URL regeneration
- `<InlineRename />` primitive is the source of truth for inline editing

### Recently shipped

- v2.2 Dashboard & Annotation UX Fixes (4 phases, shipped 2026-04-21)
- v2.1 Dashboard Performance (3 phases, shipped 2026-04-21)
- v2.0 Architecture Hardening (7 phases, shipped 2026-04-20)

### Operational state

- Firestore composite indexes deployed (v1.9 + v2.0 + v2.1 batches live); PERF-25 will add one more for comments `(assetId, reviewLinkId)`
- collaboratorIds backfilled on 18 existing projects
- Review-link passwords auto-migrate plaintext → bcrypt on first verify

### Pending Todos

None — starting v2.3 autonomous execution.

### Blockers/Concerns

- PERF-25 requires a `firebase deploy --only firestore:indexes` after code lands — same operational step pattern as v2.0 and v2.1. Non-blocking for code commits.

## Session Continuity

Last session: 2026-04-22T14:02:50.004Z
Stopped at: Completed 78-01-PLAN.md
Resume file: None
