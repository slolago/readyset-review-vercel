---
phase: 43
plan: 01
subsystem: version-stack
tags: [api, firestore, version-groups, stack, unstack, reorder]
status: complete
requirements: [STACK-01, STACK-02, STACK-03, STACK-04]

dependency_graph:
  requires:
    - Firestore admin SDK (firebase-admin)
    - Next.js route handlers under src/app/api/assets/
    - Existing AssetCard + VersionStackModal components (v1.4)
  provides:
    - src/lib/version-groups.ts (shared fetchGroupMembers + resolveGroupId)
    - merge-version, unstack-version, reorder-versions all hardened
    - StackOntoModal context-menu affordance
    - verify-stack-integrity regression script
  affects:
    - All stack/unstack/reorder flows in the dashboard
    - GET /api/assets/[assetId] response (unchanged shape, new fetch path)

tech_stack:
  added: []
  patterns:
    - Single-source-of-truth helper for group membership reads
    - Pre-transaction completeness checks in reorder
    - Always-refetch-after-mutation for stack modals (no optimistic-only)

key_files:
  created:
    - src/lib/version-groups.ts
    - src/components/files/StackOntoModal.tsx
    - scripts/verify-stack-integrity.ts
    - .planning/phases/43-version-stack-rewrite/43-01-SUMMARY.md
    - .planning/phases/43-version-stack-rewrite/43-VERIFICATION.md
  modified:
    - src/app/api/assets/merge-version/route.ts
    - src/app/api/assets/unstack-version/route.ts
    - src/app/api/assets/reorder-versions/route.ts
    - src/app/api/assets/[assetId]/route.ts
    - src/components/files/VersionStackModal.tsx
    - src/components/files/AssetCard.tsx
    - src/components/files/AssetGrid.tsx

decisions:
  - Legacy-root fallback lives in exactly one place (fetchGroupMembers) — every route reads group membership through the helper
  - Partial reorder rejected with 400 BEFORE opening the Firestore transaction (cheaper and clearer errors)
  - VersionStackModal keeps optimistic updates for responsiveness, but always awaits fetchVersions() after the network roundtrip to re-sync after server-side re-root
  - StackOntoModal excludes same-group candidates client-side so the server never receives an invalid merge request
  - `copy/route.ts` and PUT handler in `[assetId]/route.ts` keep their own `where('versionGroupId', '==', ...)` queries because they are read-only / folder-move operations, not stack mutations — out of Phase 43 scope

metrics:
  duration_minutes: ~20
  tasks_completed: 8 of 9 (Task 9 is a human-verify checkpoint — deferred to QA)
  files_created: 5
  files_modified: 7
  commits: 8
  completed_date: 2026-04-20
---

# Phase 43 Plan 01: version-stack-rewrite Summary

Hardened the version-stack subsystem end-to-end. Closed four silent-data-loss bugs identified in the audit, centralized the legacy-root fallback in a single helper, added a context-menu path for stacking (previously DnD-only), and made the version modal re-sync after every server mutation.

## Audit Bugs Closed

### Bug 1 — merge-version legacy-root drop — CLOSED (Task 2)
Dragging a non-root member of a legacy stack (root without `versionGroupId`) used to leave the root orphaned with a dangling pointer. Route now delegates both source and target member fetches to `fetchGroupMembers()`, which authoritatively includes the legacy root.

**Commit:** `05ac6ef7`

### Bug 2 — unstack root-detach creates ghost group — CLOSED (Task 3)
When the detached asset was the original root (`assetId === groupId`), remaining members kept `versionGroupId === assetId`, so on next read they appeared as members of the now-standalone asset. Fix: when `needsReroot`, batch-update remaining members to use `remaining[0].id` as the new `versionGroupId`.

**Commit:** `bbe9ad4f`

### Bug 3 — unstack legacy-root missed in members query — CLOSED (Task 3)
Rolled into Bug 2 fix by routing member fetch through the shared helper.

**Commit:** `bbe9ad4f`

### Bug 4 — reorder silent partial renumber — CLOSED (Task 4)
Reorder now fetches the full group via the helper before opening the transaction and asserts `orderedIds.length === members.length`, no duplicates, every id a group member. Partial input returns 400 `orderedIds must include every member of the stack`.

**Commit:** `b2ec0a6b`

### Gap 5 — No context-menu merge affordance — CLOSED (Task 7)
New `StackOntoModal` modeled on `SmartCopyModal`. AssetCard's ContextMenu now has a "Stack onto…" entry between "Upload new version" and "Manage version stack". Picker lists sibling assets in the same folder, filters out the source and any member of its own group.

**Commit:** `94401ef0`

### Gap 6 — "Current" badge after reorder — DEFERRED (as planned)
Flagged in plan, explicitly out of scope.

## How Each ROADMAP Success Criterion Is Satisfied

1. **Stack any onto any** — merge-version uses shared helper → legacy-root guaranteed included. Source and target groups can each be a stack. Context-menu "Stack onto…" alternative to DnD.
2. **Detach any version** — unstack-version re-roots remaining members when root is detached. Asset ids stable → Comment.assetId and ReviewLink.assetIds[] auto-preserved.
3. **Reorder** — reorder-versions rejects partial input with 400. Full-group reorder renumbers atomically in a Firestore transaction.
4. **No silent data loss** — every group mutation reads membership via `fetchGroupMembers`. Integration script documents the invariants. VersionStackModal always re-syncs so UI never diverges from truth.

## Shared Helper Is the Sole Group-Query Code Path

Grep after the rewrite:
```
src/app/api/assets/copy/route.ts:38      — read-only copy, not a stack mutation
src/app/api/assets/[assetId]/route.ts:91 — PUT handler (folderId move), explicitly out of scope per plan
```

Both remaining direct queries are non-stack-mutation read paths. All three stack-mutation routes (merge, unstack, reorder) and the GET handler go through the helper.

## Deviations from Plan

- **Task 3 self-check removed:** The old route had an explicit early "standalone" check for `groupId === assetId` that queried for other members. The new flow correctly rejects the standalone case via `remaining.length === 0` after `fetchGroupMembers()`. Behavior identical; code simpler. (Rule 2 — simpler code for same guarantee.)
- **Task 4 added duplicate-ids guard:** Plan mentioned it parenthetically; I added the explicit `new Set(orderedIds).size !== orderedIds.length` check alongside the length check.
- **Task 6 integration test:** No test harness exists. Plan permitted a runnable script under `scripts/` — created `scripts/verify-stack-integrity.ts` using the live dev server. No devDependencies added.
- **Task 9 (human-verify checkpoint):** Not executed — deferred to manual QA by the orchestrator/user. The autonomous path completes with a `human_needed` verification status.

## Commits

| Task | Commit    | Description                                              |
| ---- | --------- | -------------------------------------------------------- |
| 1    | 5825d745  | extract shared fetchGroupMembers helper                  |
| 2    | 05ac6ef7  | merge-version uses shared helper (closes Bug 1)          |
| 3    | bbe9ad4f  | unstack re-roots remaining members (closes Bug 2, Bug 3) |
| 4    | b2ec0a6b  | reorder-versions rejects partial input (closes Bug 4)    |
| 5    | 07e206fe  | GET asset route uses shared helper                       |
| 6    | 4dca3c37  | add verify-stack-integrity regression script             |
| 7    | 94401ef0  | Stack onto… context-menu affordance (closes Gap 5)       |
| 8    | 1a9cb9f2  | VersionStackModal re-syncs after every mutation          |

## Self-Check: PASSED

- All created files exist on disk.
- `npx tsc --noEmit` clean.
- All 8 commits present in `git log`.
- No route file outside the helper performs a stack-mutation `where('versionGroupId', ...)` query.
