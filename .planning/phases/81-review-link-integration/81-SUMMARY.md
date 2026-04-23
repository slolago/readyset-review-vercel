---
phase: 81
phase_name: review-link-integration
status: human_needed
completed: 2026-04-23
---

# Phase 81: review-link-integration — Summary

## Deliverables

### Modified files
- `src/app/api/review-links/route.ts` — POST handler, after the link doc is written, enumerates directly-exposed assets and fires `POST /api/assets/[id]/stamp-metadata` per asset; fire-and-forget, fully async per STAMP-09; failures logged but never block the 201
- `src/app/api/review-links/[token]/route.ts` — `decorate()` prefers `stampedGcsPath` as guest-facing `signedUrl` and `downloadUrl` when `stampedAt >= updatedAt`; falls back to original `gcsPath` when stamp absent/stale/failed

## New private helper

`triggerStampJobs()` in `src/app/api/review-links/route.ts`:
- Inputs: db, projectId, assetIds[] (direct), folderIds[] (top-level), legacyFolderId, origin, authHeader
- Enumerates direct visible assets — loose `assetIds` + direct children of each folder + project root for project-scoped links (no recursion — matches review-link GET's navigation model)
- Fires `fetch(/api/assets/<id>/stamp-metadata)` per asset with user's Authorization header
- All errors swallowed — STAMP-08 guarantees link creation never fails due to stamp issues

## Success criteria mapping

| Criterion | Status |
|-----------|--------|
| POST returns in <3s; guest eventually downloads stamped file | ✅ fully async; stamp jobs fire-and-forget |
| Multiple review links for same asset share one stamped GCS copy | ✅ stamp route's freshness check + concurrency dedup handle this |
| Internal `/api/assets` serves original (not stamped) | ✅ decorate() change scoped to review-link GET only |
| Stamps still running → guest receives original URL (fallback) | ✅ decorate's `signedViaStamp` flag tracks; falls back cleanly |

## Key design decisions

- **Subfolder drill-down NOT triggered at POST time** — guest navigates into subfolder via `?folder=X`, decorate() for that view serves original URL if subfolder assets aren't stamped yet. Acceptable per STAMP-08; documented as deferred ("lazy subfolder stamping via worker" — future milestone)
- **`coerceToDate()` for every `stampedAt < updatedAt` comparison** — per PITFALLS.md; raw Timestamp-vs-ISO-string compare silently breaks
- **Guest response surfaces `asset.metaStamped=true`** — flag available for future UI badge (STAMP-F1, deferred) without requiring another data fetch
- **`downloadUrl` uses stamped path when `signedViaStamp===true`** — guests who click Download get the stamped file, not the original; allowDownloads gate unchanged
- **No new infra** — reuses existing signed-URL cache, existing jobs table, existing auth patterns

## Tests

All 171 existing tests green; `tests/review-links.test.ts` (7 tests) still passes — decorate changes are additive.

## Commits

- `f1751605` — feat(81): review-link integration — trigger stamps on POST, prefer stamped URL on GET

## Pending human verification

1. Create a review link with 1 asset; confirm 201 returns quickly (<3s)
2. Wait a few seconds; open the link as guest; confirm downloadUrl serves a file with the 4 Attrib XMP fields
3. Check the AssetCard job indicator turns amber during stamp job, goes away on success
4. Create a second review link for same asset; confirm no new stamp job fires (concurrency dedup or freshness short-circuit)
5. Confirm internal asset viewer shows original (not stamped) file — comments, annotations unaffected
