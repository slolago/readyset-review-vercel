---
phase: 45-admin-ui-and-project-rename
plan: 01
status: human_needed
automated:
  tsc: clean
  build: success
  vitest: 116/116
  endpoints_registered: true
pending:
  - task: 9
    type: checkpoint:human-verify
    blocker: manual verification of session revoke window + admin override rename
---

# Phase 45 Plan 01 — Verification

## Automated checks (passed)

- `npx tsc --noEmit` → clean
- `npm run build` → success
- `npx vitest run` → 116 / 116
- New endpoints in build route table:
  - `/api/admin/projects/[projectId]/permissions`
  - `/api/admin/users/[userId]/revoke-sessions`
  - `/api/admin/users/orphans`

## Static verification of success criteria

- ACCESS-04 — ProjectPermissionsPanel renders collaborators, review links (with flag icons + password lock + creator + expiresAt), and pending invites in one modal. Role select + revoke button wired. ✓
- ACCESS-06 — OrphanUsersPanel with header checkbox + bulk suspend/delete; endpoint filters viewers with `invited!==true` AND not a project member. ✓
- PROJ-01 (server) — PUT returns 409 `NAME_COLLISION` on case-insensitive match within owner's namespace; empty names 400; 27/27 permissions-api tests still pass. ✓

## Human-needed checks

- ACCESS-05 (suspend + revoke timing window) — needs a live Firebase auth session to confirm the incognito-login rejection and the ~1-minute ID-token expiry cut-off.
- PROJ-01 (collision + admin override) — requires live Firestore with multiple owned projects to confirm the case-insensitive collision surface and the admin-as-non-owner rename path.

See `45-01-SUMMARY.md` → "Manual Test Checklist" for the 7-point walkthrough.

When all manual items pass, flip this file's `status` to `passed`.
