---
phase: 52
plan: 01
status: human_needed
reason: End-to-end flows require real GCS uploads, soft-delete, restore, and permanent-delete against Firestore/GCS.
---

# Phase 52 Verification Checklist

Run these in order against a real project with at least one folder and a few uploaded assets.

## Automated (already green)

- [x] `npx tsc --noEmit` clean
- [x] `npm run lint` — new files produce no new warnings

## Manual (human_needed)

### 1. Soft-delete an asset
- Upload an asset to a folder.
- Click delete on it from the grid (confirm the existing useConfirm dialog).
- **Expect:** Asset disappears from the grid. Firestore `assets/{id}.deletedAt` is set; `deletedBy` equals your user id. GCS blob is still present in the bucket.

### 2. Soft-delete a folder with contents
- Create a folder, upload 1–2 assets inside it, go back up.
- Delete the folder from the tree.
- **Expect:** Folder disappears from the tree. Navigating the URL of the deleted folder still loads (it's soft-deleted, not gone), but the assets inside DO NOT appear in the project-root grid because the parent-deleted filter hides them. Firestore: only the folder doc has `deletedAt`; the assets inside are unchanged.

### 3. Trash list
- Visit `/projects/{id}/trash`.
- **Expect:** Both the deleted folder (from step 2) and the deleted asset (from step 1) appear with correct names and "Deleted {timestamp}" labels.

### 4. Restore a folder
- Click Restore on the folder in Trash.
- **Expect:** Toast says "Restored". Folder reappears in the tree. Navigating into it, the previously-hidden assets are visible again (their deletedAt was never set, so the filter no longer hides them now that the parent's deletedAt is cleared).

### 5. Restore asset to root (orphan recovery)
- Create folder F with an asset A inside it.
- Delete A, then delete F.
- From Trash, click "Delete forever" on F and confirm.
- Still in Trash, click Restore on A.
- **Expect:** Toast says "Restored to project root". A appears in the project root grid, not in any folder. Firestore: `assets/{A}.folderId === null`.

### 6. Permanent delete asset
- Soft-delete an asset, go to Trash, click "Delete forever", confirm the useConfirm dialog with "This cannot be undone".
- **Expect:**
  - Row disappears from Trash.
  - GCS blob is gone (check bucket: original + thumbnail + sprite if present).
  - Firestore `assets/{id}` document is gone.
  - All `comments` where `assetId == deletedId` are gone.

### 7. Permanent delete folder (cascade)
- Create folder F with sub-folder G, put an asset in G.
- Delete F.
- Go to Trash, click "Delete forever" on F, confirm.
- **Expect:** F and G both removed from Firestore. The asset inside G is hard-deleted (GCS blob + Firestore doc + comments gone) even though the asset itself was never soft-deleted.

### 8. Empty Trash
- Trash 2 folders + 2 assets.
- Click Empty Trash in the page header. Confirm.
- **Expect:** Toast "Trash emptied". Trash page shows "Trash is empty". Response JSON returns `{ foldersDeleted: 2, assetsDeleted: 2 }` (assets count may be less if some were inside trashed folders and got cascaded before the assets loop).

### 9. Permission enforcement (spot check)
- As a reviewer-role user on the project, hit `POST /api/trash/restore` — expect 403.
- As an anonymous user, hit `GET /api/projects/{id}/trash` — expect 401.
- As an editor on a different project, hit any trash endpoint with an id from this project — expect 403.

### 10. No composite index required
- Firestore console: confirm no new composite indexes were added. All filtering is in-memory per the existing codebase convention.

## Regression checks

- [ ] The normal grid/list views still render live assets correctly (no regressions from the new filter).
- [ ] Moving an asset between folders still works (`PUT /api/assets/[id]` with folderId).
- [ ] Creating new folders still works.
- [ ] Existing folder delete (which was hard-delete pre-Phase-52) is now soft-delete — no project should have lost data on deploy because DELETE now PRESERVES state.

## Known limitations (not blockers)

- No auto-purge cron (out of scope).
- Review links are not trashed (out of scope).
- Trash view does not show deletedBy username, only timestamp.
