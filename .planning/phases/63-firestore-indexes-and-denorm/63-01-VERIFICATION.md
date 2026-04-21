# Phase 63 Plan 01 — Verification

## Automated

| Check              | Result       |
| ------------------ | ------------ |
| `tsc --noEmit`     | clean (exit 0) |
| `vitest run`       | 156/156 pass |

## Manual (post-deploy)

1. Deploy indexes: `firebase deploy --only firestore:indexes` — wait for "Building" → "Enabled" in the Firebase console (~2-10 min per index).
2. Open `/api/assets?projectId=…&folderId=…` — observe no `FAILED_PRECONDITION` console warning; response is the live-asset list for that folder.
3. Open `/api/folders?projectId=…&parentId=…` — same; observe no fallback warning.
4. Open the Trash page for any project — assets + folders load; server log shows no fallback warning.
5. Post a comment on an asset — check Firestore console: the asset doc's `commentCount` increments by 1 in the same write batch as the new comment doc.
6. Delete a comment (as author or admin, or guest-authored from review link) — `commentCount` decrements by 1.
7. Load a pre-Phase-63 asset's list entry — first request backfills `commentCount` (visible in Firestore console on reload), subsequent requests read cached value.

## Fallback path (pre-deploy)

All four indexed queries wrap the query in a `try`/`catch` that detects `FAILED_PRECONDITION` + "index" and degrades to the legacy in-memory filter with a `console.warn` pointing at `firestore.indexes.json`. Site remains functional during the index build window.

## Known limitations

- Pre-Phase-63 live assets/folders lack the `deletedAt` field on disk. The new `(…, deletedAt == null)` queries exclude them. Touching any of these docs (upload, rename, move, restore) will add `deletedAt: null` naturally over time; if a fast project-wide backfill is ever needed, a single `where('projectId','==',x)` scan with `batch.update({ deletedAt: null })` in chunks of 500 will handle it. No migration shipped this phase (anti-scope).
