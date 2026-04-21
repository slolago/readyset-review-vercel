# Phase 52: trash-and-recovery - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
Soft-delete assets and folders. Users can restore from Trash or permanently delete. No auto-purge cron.
</domain>

<decisions>
### Claude's Discretion
- Schema: add `deletedAt?: Timestamp` + `deletedBy?: string` to Asset and Folder docs.
- Query filter: all normal list queries add `.where('deletedAt', '==', null)` or in-memory filter post-fetch (avoid composite index).
- DELETE endpoint becomes soft-delete (set deletedAt = now). Add a separate `POST /api/trash/permanent-delete` and `POST /api/trash/restore`.
- Trash view: project-level page at `/projects/[projectId]/trash` listing soft-deleted assets + folders.
- Permanent delete: unlinks GCS object + removes Firestore doc + cascades to comments/annotations.
- Restore: clears deletedAt/deletedBy. Handles orphaned folderId by falling back to project root.
- Version stacks: deleting a member just soft-deletes that member (the group stays intact minus the deleted version).
</decisions>

<code_context>
- src/app/api/assets/[assetId]/route.ts — DELETE currently hard-deletes
- src/app/api/folders/[folderId]/route.ts — DELETE hard-deletes + cascades
- src/hooks/useAssets.ts — list queries filter by folderId + projectId
- src/components/files/FolderBrowser.tsx — grid + bulk delete
- src/lib/permissions.ts — need canRestoreAsset / canPermanentDelete gates
</code_context>

<specifics>
Success criteria:
1. Delete → item soft-deleted (deletedAt set), disappears from normal views
2. Trash project view lists items with Restore action
3. Restore returns item to original folder (or root if original folder deleted too)
4. Permanent delete (single or Empty Trash) frees GCS object + removes Firestore doc
5. Permanent delete uses useConfirm with "This cannot be undone"
</specifics>

<deferred>
- Auto-purge after N days (cron) — out of scope
- Trash for review-links or other entities — out of scope
</deferred>
