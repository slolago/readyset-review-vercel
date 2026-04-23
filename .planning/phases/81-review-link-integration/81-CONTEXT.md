# Phase 81: review-link-integration - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Wire the Phase 80 stamp pipeline into review-link creation and guest delivery. Two changes:

1. `POST /api/review-links` after creating the link, enumerates the direct visible assets (loose `assetIds` + direct assets inside each top-level `folderIds[]` + legacy `folderId` contents + project-root assets for project-scoped links) and fires `POST /api/assets/[id]/stamp-metadata` for each — fire-and-forget, using the caller's Authorization header.

2. `GET /api/review-links/[token]` `decorate()` — prefers `stampedGcsPath` over `gcsPath` when the stamp is fresh (exists AND `stampedAt >= updatedAt`). Signs the stamped path as both `signedUrl` and `downloadUrl`. Falls back to the original `gcsPath` for any asset without a ready stamp — guests always see working content, never a 503 / error.

Internal `/api/assets` path stays untouched. Comments, annotations, version comparison continue operating on the original.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

**Sync/async semantics:** fully async per STAMP-09 + research synthesizer. POST returns 201 as soon as the link row is written. Stamp jobs fire-and-forget via `fetch()` without `await`. The pattern matches upload/complete's probe + sprite triggers (lines 108-118 of upload/complete/route.ts).

**Enumeration scope (POST):** direct visible assets only.
- `cleanAssetIds` → stamp each
- Each `cleanFolderIds[i]` → fetch `where projectId=X AND folderId=i AND status=ready` (not recursive — matches review-link GET's navigation model)
- Legacy `folderId` → same pattern
- Project-scoped (no folderId, no arrays) → fetch `where folderId=null` (project root)
- Cap: all folder content fetches run in parallel via `Promise.all`

Subfolder drill-down via `?folder=X` is NOT triggered at creation time. Stamps for nested assets happen lazily when the reviewer drills in — for v2.4 MVP, those subfolder assets fall back to original URL in decorate(). A future milestone can add a Cloud Function worker that processes job rows on create, enabling lazy stamping on guest drill-down without auth complexity.

**Freshness check in decorate():**
```ts
const stampedAt = coerceToDate(asset.stampedAt);
const updatedAt = coerceToDate(asset.updatedAt);
const stampFresh =
  asset.stampedGcsPath &&
  stampedAt &&
  (!updatedAt || stampedAt.getTime() >= updatedAt.getTime());
```

Stamps without `updatedAt` on the asset (pre-v2.4 data) are treated as fresh — backfill not required. The `updatedAt` writes shipped in Phase 79 mean new mutations advance the clock, so new stamps have a comparable `updatedAt`.

**decorate() URL preference:** when `stampFresh`, sign `stampedGcsPath` via `getOrCreateSignedUrl()` with the cached `stampedSignedUrl` + `stampedSignedUrlExpiresAt`. Replace `asset.signedUrl` and `asset.downloadUrl` with the stamped URL. Thumbnail and sprite stay on the original (those aren't guest-delivered stamp targets).

**Error handling:** stamp-trigger failures logged but never surface to the POST response. Review link creation must succeed even if all stamp triggers fail. Guests see original URLs — which is the correct pre-v2.4 behavior.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/signed-url-cache.ts::getOrCreateSignedUrl` — 30min TTL cache pattern; reuse for stampedSignedUrl
- `src/lib/format-date.ts::coerceToDate` — handles Timestamp vs ISO vs seconds shape — mandatory for `stampedAt < updatedAt` comparison per PITFALLS.md
- `src/app/api/review-links/[token]/route.ts::decorate` — existing pattern; add stamp-preference block above the main signed-URL signing

### Established Patterns
- Fire-and-forget server-to-server triggers: `fetch(url, { headers: { Authorization: authHeader }}).catch(logger)`
- Permission: review-link POST already gated by `canCreateReviewLink`; stamp route delegates to `canProbeAsset` — creator who can make a review link can always trigger stamps

### Integration Points
- `src/app/api/review-links/route.ts` POST — add enumeration + fire-and-forget block AFTER doc write, BEFORE 201 response
- `src/app/api/review-links/[token]/route.ts` — `decorate()` function, extend URL selection logic
- No new files, no new libs — pure wiring

</code_context>

<specifics>
## Specific Ideas

None beyond the decisions. This is wiring existing pieces together.

</specifics>

<deferred>
## Deferred Ideas

- Lazy subfolder stamping on guest drill-down — requires worker, out of scope v2.4
- Batch stamp endpoint (POST /api/review-links/[token]/stamp-all) — manual trigger for re-stamping
- UI indicator on the review-link page that stamps are still running — Phase 82 covers the spinner in the MODAL; reading state for a created link is lower priority

</deferred>
