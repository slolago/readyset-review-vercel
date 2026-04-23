---
phase: 82
phase_name: invalidation-and-ux
status: human_needed
completed: 2026-04-23
---

# Phase 82: invalidation-and-ux — Summary

## Deliverables

### Modified files
- `src/app/api/assets/[assetId]/route.ts` — active stamp invalidation on rename: when `result.trimmed !== asset.name`, adds `stampedGcsPath`, `stampedAt`, `stampedSignedUrl`, `stampedSignedUrlExpiresAt` → `FieldValue.delete()` to the update payload
- `src/components/review/CreateReviewLinkModal.tsx` — submit button label swaps to "Applying metadata…" while `loading===true`; reverts to "Create Link" when idle

## Success criteria mapping

| REQ | Status | Implementation |
|-----|--------|----------------|
| STAMP-06 rename invalidation | ✅ | Active nulling of stamp fields + updatedAt bump (from Phase 79); decorate() falls back to original URL until new stamp lands |
| STAMP-07 new-version invalidation | ✅ (no code) | New version = new asset doc = no prior stamp; first review link including it triggers fresh stamp naturally |
| STAMP-08 failure fallback | ✅ (no code) | Phase 81's decorate() already falls back to original on missing/stale stamp; POST never awaits stamps |
| STAMP-12 spinner UX | ✅ | Button children ternary: `loading ? 'Applying metadata…' : 'Create Link'` |

## Key design decisions

- **Active nulling on rename is redundant but explicit** — `stampedAt < updatedAt` freshness check alone makes decorate fall back correctly. Active null also releases the stale `stampedSignedUrl` cache so the next re-stamp gets a clean cache. Net-net one-extra-field-clear with no downside.
- **No orphan GCS cleanup** — `stampedGcsPathFor` uses `path.extname(sourceGcsPath)` which is stable across rename; stamped path stays the same; overwrite-on-re-stamp handles the lifecycle
- **Spinner label copy: "Applying metadata…"** — frames the user action correctly even though the actual exiftool jobs run async server-side after POST returns; the ~500ms loading window covers the link-row write
- **No polling UI for async stamp completion in v2.4** — acceptable UX; copy-link view appears as soon as the token is returned; guests see original URL as graceful fallback if they open the link before stamps land; job indicator on AssetCard surfaces failed stamp jobs via the existing probe/sprite retry UX
- **No explicit STAMP-07 clear code** — new version uploads produce new asset docs which never had a stamp; merging into a version group doesn't share stamped state across siblings (stampedGcsPath is per-asset-doc); no code path to intercept

## Tests

All 171 tests green.

## Commits

- `8316276f` — feat(82): stamp invalidation on rename + CreateReviewLinkModal spinner

## Pending human verification

1. Create review link with 1 asset → confirm submit button shows "Applying metadata…" then transitions to copy-link view
2. Rename the asset → confirm `stampedGcsPath` and `stampedAt` cleared in Firestore (`assets/<id>` doc)
3. Create another review link for that same asset → confirm fresh stamp runs (new `metadata-stamp` job row), stamped file has the new filename as `ExtId`
4. Upload a new version of an already-stamped asset → confirm the new version's doc has no `stampedGcsPath`; first review link including it triggers a fresh stamp
5. Stop the stamp route (e.g. kill perl manually) → create a review link → confirm link is still created successfully and guests see the original file (no 503 / error)
