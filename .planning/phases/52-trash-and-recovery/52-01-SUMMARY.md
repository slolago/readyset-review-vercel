---
phase: 52
plan: 01
subsystem: trash-and-recovery
tags: [soft-delete, trash, restore, gcs, firestore]
requires:
  - canDeleteAsset / canDeleteFolder permission gate (pre-existing)
  - ConfirmProvider in (app) layout (pre-existing)
  - /lib/gcs deleteFile (pre-existing)
provides:
  - Soft-delete for Asset + Folder (deletedAt/deletedBy)
  - GET /api/projects/[projectId]/trash
  - POST /api/trash/restore
  - POST /api/trash/permanent-delete
  - POST /api/trash/empty
  - Trash page at /projects/[id]/trash
  - hardDeleteAsset / hardDeleteFolder helpers in src/lib/trash.ts
affects:
  - DELETE /api/assets/[id] — now soft-deletes
  - DELETE /api/folders/[id] — now soft-deletes (folder only, no cascade)
  - GET /api/assets — hides deleted + descendants-of-deleted
  - GET /api/folders — hides deleted
tech-stack:
  added: []
  patterns:
    - In-memory filter for deletedAt (no composite indexes)
    - Parent-folder-deleted check via per-project deletedFolderIds set
    - Route-adjacent hard-delete helpers live in src/lib/ (Next 14 route files restrict exports)
key-files:
  created:
    - src/lib/trash.ts
    - src/app/api/projects/[projectId]/trash/route.ts
    - src/app/api/trash/restore/route.ts
    - src/app/api/trash/permanent-delete/route.ts
    - src/app/api/trash/empty/route.ts
    - src/app/(app)/projects/[projectId]/trash/page.tsx
  modified:
    - src/types/index.ts
    - src/lib/permissions.ts
    - src/app/api/assets/[assetId]/route.ts
    - src/app/api/folders/[folderId]/route.ts
    - src/app/api/assets/route.ts
    - src/app/api/folders/route.ts
decisions:
  - Soft-delete of folder does NOT mutate its children — they're hidden by the list-endpoint filter (parent-deleted check). Preserves lossless restore.
  - Restoring an asset whose parent folder is still trashed reparents it to project root (folderId = null).
  - Permanent-delete requires the item be in trash first (no direct destroy path).
  - hardDelete helpers exported from src/lib/trash.ts (not from a route file) — Next 14 route modules only permit HTTP-method exports.
  - Toast library is react-hot-toast (not sonner, as the plan's page template suggested).
  - useConfirm returns the confirm function directly; ConfirmProvider lives in the (app) layout, so no ConfirmDialog element needs to be rendered locally.
metrics:
  tasks: 10
  commits: 10
  duration: ~35min
  completed: 2026-04-20
---

# Phase 52 Plan 01: Trash & Recovery Summary

One-liner: Soft-delete for assets and folders with a project-level Trash view, Restore + Permanent Delete per item, and Empty Trash — all destructive paths gated by the existing `useConfirm` dialog.

## What shipped

1. Schema: `deletedAt?: Timestamp` + `deletedBy?: string` on `Asset` and `Folder`.
2. Permission helpers: `canRestoreAsset`, `canPermanentDeleteAsset`, `canRestoreFolder`, `canPermanentDeleteFolder` — all delegate to `canWriteAsset` via the existing `canDeleteAsset` gate tier.
3. `DELETE /api/assets/[id]` — writes `{ deletedAt, deletedBy }` instead of destroying data. GCS blobs + comments untouched.
4. `DELETE /api/folders/[id]` — writes `{ deletedAt, deletedBy }` on the folder only. Children are not mutated; they're hidden by the list filter.
5. `GET /api/assets?projectId=...` — filters out soft-deleted assets AND assets whose `folderId` points at a soft-deleted folder (in-memory per-request deleted-folder set).
6. `GET /api/folders?projectId=...` — filters out soft-deleted folders.
7. `GET /api/projects/[projectId]/trash` — returns `{ assets, folders }` where `deletedAt` is set. No signed URLs generated (the Trash view just shows name + deletedAt).
8. `POST /api/trash/restore` — `{ type, id }` clears deletedAt/deletedBy via `FieldValue.delete()`. For assets, reparents to project root if the original folder is still trashed or gone. Returns `{ success, reparentedToRoot }`.
9. `POST /api/trash/permanent-delete` — `{ type, id }` hard-deletes. Requires `deletedAt` to be set; 400 otherwise. For folders, cascades into every descendant folder + every asset inside any descendant folder (GCS + comments + Firestore).
10. `POST /api/trash/empty` — `{ projectId }` permanent-deletes all trashed folders then all trashed assets (folders first so their cascade can sweep contained assets).
11. `/projects/[projectId]/trash` page — two sections (Folders, Assets), Restore + Delete-forever per row, Empty Trash button in the header. All destructive actions go through `useConfirm` with "This cannot be undone" messaging.

## Deviations from Plan

### Rule 3 — Blocking issue: Next 14 route file export restriction

Plan Task 8 asked `hardDeleteAsset` and `hardDeleteFolder` to be exported from `src/app/api/trash/permanent-delete/route.ts` and imported by Task 9's `empty/route.ts`. Next.js 14 App Router route modules may only export reserved names (HTTP methods, config flags); exporting arbitrary helpers works at runtime but is an officially unsupported pattern that trips Next's build-time checker on some versions.

**Fix:** Moved both helpers to `src/lib/trash.ts`. Both `permanent-delete/route.ts` and `empty/route.ts` import from there. Same logic, clean separation, no route-file abuse.

### Rule 1 — Bug: incorrect `useConfirm` shape in plan template

Plan Task 10 destructured `const { confirm, ConfirmDialog } = useConfirm()` and rendered `{ConfirmDialog}` in the page. The actual hook signature is `useConfirm(): (opts: ConfirmOptions) => Promise<boolean>` — returns the confirm function directly. `ConfirmProvider` is already mounted by the `(app)` layout, so no local dialog element is needed.

**Fix:** `const confirm = useConfirm();` to match the pattern used in `FolderBrowser.tsx`. No `ConfirmDialog` render.

### Rule 1 — Bug: wrong toast library in plan template

Plan imported `{ toast } from 'sonner'`. This project uses `react-hot-toast` everywhere (e.g. `src/app/(app)/admin/page.tsx`). Switched to `import toast from 'react-hot-toast'`.

### Rule 3 — Blocking issue: route location

Plan specified `src/app/projects/[projectId]/trash/page.tsx`, but all authenticated app pages live under the `(app)` route group (e.g. `src/app/(app)/projects/[projectId]/page.tsx`). Placed the file at `src/app/(app)/projects/[projectId]/trash/page.tsx` so it inherits the auth layout, sidebar, and `ConfirmProvider`.

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — new files produce zero warnings (pre-existing warnings in unrelated files untouched, per surgical-changes rule)
- End-to-end verification is human-needed — see `52-VERIFICATION.md`

## Self-Check: PASSED

- FOUND: src/types/index.ts (modified — deletedAt/deletedBy added to Asset + Folder)
- FOUND: src/lib/permissions.ts (modified — 4 new exports)
- FOUND: src/lib/trash.ts (new)
- FOUND: src/app/api/assets/[assetId]/route.ts (modified — soft-delete)
- FOUND: src/app/api/folders/[folderId]/route.ts (modified — soft-delete)
- FOUND: src/app/api/assets/route.ts (modified — filter)
- FOUND: src/app/api/folders/route.ts (modified — filter)
- FOUND: src/app/api/projects/[projectId]/trash/route.ts (new)
- FOUND: src/app/api/trash/restore/route.ts (new)
- FOUND: src/app/api/trash/permanent-delete/route.ts (new)
- FOUND: src/app/api/trash/empty/route.ts (new)
- FOUND: src/app/(app)/projects/[projectId]/trash/page.tsx (new)
- FOUND commits: af987a48, d3e60e3c, a4ecb986, 04b05cc5, af311468, 48652635, 283bb444, 3a9675c2, 7c5aee7a, ef4d381a
