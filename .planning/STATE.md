---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Dashboard & Annotation UX Fixes
status: shipped
stopped_at: All 4 phases shipped; live UI verification pending
last_updated: "2026-04-21T22:30:00.000Z"
last_activity: 2026-04-21
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Fast, accurate video review
**Current focus:** v2.2 shipped; awaiting next milestone

## Current Position

Phase: All v2.2 phases shipped (70, 71, 72, 73)
Status: Milestone complete — 4/4 phases, 6/6 plans, 9/9 REQs
Last activity: 2026-04-21 — Phase 73 executed; commits `787f7982..b62b64b3`

Progress: [██████████] 100% (4/4 phases)

## Accumulated Context

### Key decisions (v2.2)

- `ContextMenuProvider` holds one `{key, position, items} | null` state — two menus open at once is physically impossible
- `buildFileBrowserActions('asset'|'folder'|'mixed', selection, ctx)` is the single source of truth for file-browser menu items — consumed by both the right-click menu and the three-dots Dropdown at 5 surfaces
- `RenameController` context wraps `FolderBrowserInner`; all 4 rename-capable surfaces consume the controller so only one rename is active at a time
- `deepCopyFolder` writes `deletedAt: null` on every `.set()` to match the Phase 63 composite-index filter contract (`where('deletedAt', '==', null)`)
- Fabric.js objects must have BOTH `selectable = true` AND `evented = true` to expose scale/rotation handles on single selection

### Recently shipped

- v2.2 Dashboard & Annotation UX Fixes (4 phases, shipped 2026-04-21)
- v2.1 Dashboard Performance (3 phases, shipped 2026-04-21)
- v2.0 Architecture Hardening (7 phases, shipped 2026-04-20)

### Operational state

- No new operational follow-ups for v2.2 — all fixes are code-only, no schema migrations, no backfills needed
- `/api/folders/copy` side-effect fix: existing duplicated folders created before this fix may still be invisible in listings (they lack `deletedAt: null`). One-off backfill script could be added if user reports ghost folders.
- Firestore composite indexes deployed (v1.9 + v2.0 + v2.1 batches all live)
- collaboratorIds backfilled on 18 existing projects
- Sprite-v2 generated on 64/74 videos; 7 orphaned + 3 Hobby-plan timeouts

### Pending Todos

None — v2.2 shipped end-to-end. Awaiting next feature/fix input from user.

### Blockers/Concerns

- All 4 v2.2 phases flagged `human_needed` — structural code is correct, but final success criteria involve live browser events (pointer hit-testing, viewport geometry, Firestore round-trips, Fabric.js control-handle drag). Concrete test items are in each phase's VERIFICATION.md under `human_verification`.

## Session Continuity

Last session: 2026-04-21
Stopped at: v2.2 shipped — 6 milestones shipped this sprint (v1.7, v1.8, v1.9, v2.0, v2.1, v2.2)
Resume file: None
