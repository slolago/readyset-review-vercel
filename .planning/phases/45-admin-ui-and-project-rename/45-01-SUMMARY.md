---
phase: 45-admin-ui-and-project-rename
plan: 01
subsystem: admin-ui
tags: [admin, permissions-ui, suspend, revoke, orphan-cleanup, project-rename]
requirements: [ACCESS-04, ACCESS-05, ACCESS-06, PROJ-01]
status: human_needed
metrics:
  tasks_completed: 8
  checkpoints_pending: 1
  commits: 8
  files_created: 6
  files_modified: 5
  unit_tests_affected: 0
  integration_tests_affected: 27 # all still pass
  total_tests: 116
  duration_seconds: 1926
  completed_date: 2026-04-20
---

# Phase 45 Plan 01: Admin UI & Project Rename Summary

One-liner: Closed ACCESS-04/05/06 + PROJ-01 with 3 new admin endpoints (unified project permissions audit, standalone session revoke, orphan query) and 4 new UI surfaces (ProjectPermissionsPanel modal, UserSessionActions row buttons, OrphanUsersPanel tab, RenameProjectModal) — all consuming the Phase 44 permissions module server-side with zero regression across 116 existing tests.

## Endpoint Shapes

### `GET /api/admin/projects/[projectId]/permissions`

`requireAdmin` gate. Returns:

```ts
{
  project: { id, name, ownerId, ownerName, ownerEmail },
  collaborators: Array<{
    userId, name, email, role: 'owner'|'editor'|'reviewer',
    disabled: boolean, invited: boolean
  }>,
  reviewLinks: Array<{
    token, folderId, folderIds?, assetIds?, name,
    createdBy, createdByName,
    createdAt, expiresAt,
    allowComments, allowDownloads, allowApprovals, showAllVersions,
    hasPassword: boolean   // password VALUE never leaves the server
  }>,
  pendingInvites: Array<{ userId, name, email }>
}
```

### `POST /api/admin/users/[userId]/revoke-sessions`

`requireAdmin` gate. 400 on self. Returns:

```ts
{ success: true, hadAuthRecord: boolean }   // false for invited-only users
```

### `GET /api/admin/users/orphans?limit=50&cursor={userId}`

`requireAdmin` gate. Orphan = `role==='viewer'` AND `invited!==true` AND not in any `project.collaborators[].userId` AND not any `project.ownerId`. Returns:

```ts
{ users: User[], nextCursor: string | null }
```

### `PUT /api/projects/[projectId]` (augmented)

Added to existing endpoint: trims `name`, rejects empty with 400, returns 409 `{ error, code: 'NAME_COLLISION' }` when another project owned by the same `ownerId` has a case-insensitive name match. Authorization gate (`canRenameProject`) unchanged.

## Component Prop Interfaces

**`ProjectPermissionsPanel`**
```ts
{ projectId: string; onClose: () => void; getIdToken: () => Promise<string|null> }
```
Role `<select>` per row wires to `POST /api/projects/[projectId]/collaborators` (endpoint is idempotent — removes+pushes on same userId). Review-link Revoke wires to `DELETE /api/review-links/[token]`.

**`UserSessionActions`**
```ts
{ user: User; isSelf: boolean;
  onSuspendToggle: (userId: string, disabled: boolean) => Promise<void>;
  onRevoke: (userId: string) => Promise<void> }
```

**`OrphanUsersPanel`**
```ts
{ getIdToken: () => Promise<string|null> }
```
Bulk suspend patches each orphan with `{ disabled: true }` via existing `PATCH /api/admin/users/[userId]`. Bulk delete uses existing `DELETE /api/admin/users` (body `{ userId }`).

**`RenameProjectModal`**
```ts
{ project: Project; onClose: () => void; onRenamed: (newName: string) => void }
```
Autofocus + select-all. Enter submits; Escape cancels (via Modal). 409 renders inline red; 403 toasts.

## Files

**Created:**
- `src/app/api/admin/projects/[projectId]/permissions/route.ts`
- `src/app/api/admin/users/[userId]/revoke-sessions/route.ts`
- `src/app/api/admin/users/orphans/route.ts`
- `src/components/admin/ProjectPermissionsPanel.tsx`
- `src/components/admin/OrphanUsersPanel.tsx`
- `src/components/admin/UserSessionActions.tsx`
- `src/components/projects/RenameProjectModal.tsx`

**Modified:**
- `src/app/api/projects/[projectId]/route.ts` (name trim + 409 collision)
- `src/app/(app)/admin/page.tsx` (orphans tab, permissions modal state, suspend/revoke handlers)
- `src/components/admin/ProjectsTable.tsx` (optional `onInspectPermissions` callback; project name becomes a button)
- `src/components/admin/UserTable.tsx` (optional `onSuspendToggle` / `onRevoke`; embeds UserSessionActions)
- `src/components/projects/ProjectCard.tsx` (Rename menu item for owner OR admin; renders modal)

## Commits

| Task | Commit     | Summary                                                             |
| ---- | ---------- | ------------------------------------------------------------------- |
| 1    | `dd2ddad3` | Unified admin project permissions endpoint                          |
| 2    | `e1797b88` | ProjectPermissionsPanel modal wired into admin projects tab        |
| 3    | `e25960c5` | Standalone POST revoke-sessions endpoint                            |
| 4    | `344d126c` | Suspend + Revoke session buttons on user rows                       |
| 5    | `59f1917a` | Orphan users query endpoint                                         |
| 6    | `5793c536` | Orphan Users tab with bulk suspend/delete                           |
| 7    | `27a45142` | Name-collision check on PUT /api/projects/:id                       |
| 8    | `4be7a8af` | RenameProjectModal wired into ProjectCard menu                      |

## Success Criteria → Coverage

1. **ACCESS-04** — ProjectPermissionsPanel shows collaborators, review links (with 4 flag icons + password lock + creator + createdAt + expiresAt), and pending invites in one modal. Role `<select>` on each collaborator row + Revoke button on each review-link row wire through existing gated endpoints. Statically verified ✓
2. **ACCESS-05** — UserSessionActions renders Suspend (toggle→PATCH `{ disabled }`) and Revoke sessions (POST revoke-sessions) buttons. Both call `getAdminAuth().revokeRefreshTokens(uid)` under the hood — suspend via existing PATCH (which also sets `auth.disabled=true`), revoke-only via the new POST (no disabled flag change). Requires human verification of the "next refresh 401s" window ✗ (Task 9)
3. **ACCESS-06** — OrphanUsersPanel with header `select-all`, per-row checkbox, and bulk Suspend / Delete actions. Query endpoint filters `role==='viewer'` viewers that are neither invited nor members of any project. Statically verified ✓
4. **PROJ-01** — Server: PUT trims name, 400s empty, 409 `NAME_COLLISION` on case-insensitive match within `project.ownerId`'s namespace. Client: RenameProjectModal renders inline red error on 409, toast on 403, `onDeleted` callback reused as refetch trigger on success. `isOwner || admin` gate on the menu item. Permissions-api test PUT matrix (27/27) still green ✓
5. **No regression** — `npx vitest run` → 116/116; `npx tsc --noEmit` clean; `npm run build` success with the 3 new endpoints registered in the route table ✓

## Grep verification

```
grep -n "requireAdmin" src/app/api/admin/projects/[projectId]/permissions/route.ts  → line 22
grep -n "requireAdmin" src/app/api/admin/users/[userId]/revoke-sessions/route.ts    → line 19
grep -n "requireAdmin" src/app/api/admin/users/orphans/route.ts                     → line 18
grep -n "NAME_COLLISION" src/app/api/projects/[projectId]/route.ts                   → line 88
grep -n "canRenameProject" src/app/api/projects/[projectId]/route.ts                 → line 47 (untouched auth gate)
```

New endpoints in `npm run build` route table:
```
/api/admin/projects/[projectId]/permissions   ƒ
/api/admin/users/[userId]/revoke-sessions     ƒ
/api/admin/users/orphans                      ƒ
```

## Deviations

**Rule 3 — Blocking issue (wire-up correction, not an auth change)**

The plan's Task 2 specified wiring the collaborator role `<select>` to `PUT /api/projects/[projectId]/collaborators`, but that route only defines POST + DELETE — there is no PUT handler. The existing POST is idempotent (removes the existing collaborator entry with the same `userId`, then appends the new `{email, role}` — see `src/app/api/projects/[projectId]/collaborators/route.ts` lines 44-46), so role change was wired to POST instead. Zero behavior change vs. the plan's intent. No new auth surface exposed — still gated by `canInviteCollaborator`.

**Rule 3 — Blocking issue (untouched file count in plan frontmatter)**

Plan frontmatter listed `src/components/admin/UserTable.tsx` and `src/components/projects/ProjectCard.tsx` as "files_modified" — both were modified as planned. Plan also listed `src/app/api/admin/users/[userId]/route.ts` but Task 4 does NOT touch it (it wires to the existing PATCH via the client). Documenting for traceability; no code change vs plan.

## Known Stubs

None.

## Deferred Items

- **Cursor pagination UI** for OrphanUsersPanel. Endpoint supports `?cursor=`; panel loads first 50 and stops. Fine at v1.7 scale; revisit if > 200 orphans accumulate.
- **Bulk reactivate** not exposed. OrphanUsersPanel bulk bar has Suspend + Delete only; individual reactivation lives on per-user row in the main Users tab.

## Manual Test Checklist (Task 9 — human-verify checkpoint)

1. **ACCESS-04**: `/admin` → All Projects tab → click a project name → ProjectPermissionsPanel opens → verify collaborators (with role `<select>` per non-owner), review links (4 flag icons match link settings, lock icon when password set), and pending invites all render in one modal. Revoke a review link → inline confirm → Yes → toast "Review link revoked" → row disappears.
2. **ACCESS-05 (suspend)**: `/admin` → Users tab → click "Suspend" on a test user → "Suspended" badge appears on the row. In an incognito window, log in as that user → session endpoint rejects.
3. **ACCESS-05 (revoke only)**: `/admin` → Users tab → click "Revoke sessions" on a currently-logged-in test user → confirm inline → toast "Sessions revoked". Their next authenticated API call from the active tab should return 401 within the Firebase ID token window (~1 min).
4. **ACCESS-06**: `/admin` → Orphan Users tab → verify list contains only never-invited viewers not on any project. Select 2 via checkboxes → Delete selected → inline confirm → Yes, delete → toast "2 users deleted" → list refetches without them.
5. **PROJ-01 (rename success)**: Dashboard → context menu on an owned project → Rename → enter a unique new name → Rename button → toast "Renamed" → card shows new name after refetch.
6. **PROJ-01 (collision)**: Same flow but enter the name of another project you own (case-insensitive match) → inline red error "A project with that name already exists" below the input → save blocked, modal stays open.
7. **PROJ-01 (admin override)**: Log in as admin (not project owner) → Rename someone else's project → confirm the collision check compares against the OWNER's namespace (test by trying a name that collides only in the owner's projects).

Mark Task 9 complete when all 7 pass. Update `45-VERIFICATION.md` to `status: passed`.

## Self-Check: PASSED

- `src/app/api/admin/projects/[projectId]/permissions/route.ts` — FOUND
- `src/app/api/admin/users/[userId]/revoke-sessions/route.ts` — FOUND
- `src/app/api/admin/users/orphans/route.ts` — FOUND
- `src/components/admin/ProjectPermissionsPanel.tsx` — FOUND
- `src/components/admin/OrphanUsersPanel.tsx` — FOUND
- `src/components/admin/UserSessionActions.tsx` — FOUND
- `src/components/projects/RenameProjectModal.tsx` — FOUND
- 8 commits `dd2ddad3..4be7a8af` — FOUND in `git log`
- `npx tsc --noEmit` — clean
- `npm run build` — success; 3 new endpoints registered
- `npx vitest run` — 116/116 pass (0 regression)
