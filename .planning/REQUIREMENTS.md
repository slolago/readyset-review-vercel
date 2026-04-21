# Requirements: readyset-review

**Defined:** 2026-04-20 (v2.0 — architecture hardening)
**Core Value:** Fast, accurate video review — frame-level precision, rich metadata, and fluid version management without leaving the browser.

## v2.0 Requirements

Synthesized from a deep pipeline-lifecycle + unhappy-path audit (2026-04-20). 5 critical + 8 medium + 4 low findings; grouped by systemic pattern, not by individual bug.

### Pipeline Observability (Phase 60)

- [ ] **OBS-01**: Processing jobs (probe, sprite, thumbnail, export) write a status doc to Firestore (`queued | running | ready | failed`, with `startedAt`, `completedAt`, `error?`) consumed by a minimal UI indicator on the asset card / viewer — no more silent `.catch(console.warn)`
- [ ] **OBS-02**: Failed jobs can be retried from the UI; retry re-uses the same job doc id so history is preserved; 3-strike auto-abandon with a visible error state
- [ ] **OBS-03**: Duplicate sprite triggers are eliminated — the client-side fire-and-forget in `useUpload` is removed; the server-side fire from `upload/complete` is the only trigger
- [ ] **OBS-04**: `upload/complete` verifies the GCS object exists AND is non-zero before marking `status: 'ready'`; cancelled / zero-byte / MIME-spoofed uploads never land as ready assets
- [ ] **OBS-05**: Sprite generation waits for probe to complete (or reads fresh `asset.duration` from Firestore at sprite time) so the frame-spacing uses the authoritative duration rather than the client-provided fallback

### Transactional Mutations (Phase 61)

- [ ] **TXN-01**: `POST /api/assets/merge-version` wraps fetchGroupMembers + batch.commit in `db.runTransaction()` so two concurrent merges cannot produce duplicate `version` values in the same stack
- [ ] **TXN-02**: `POST /api/assets/unstack-version` uses the same transaction guarantee — no partial unstacks under concurrent access
- [ ] **TXN-03**: `POST /api/upload/signed-url` auto-versioning (name-collision → next version) runs under a transaction scoped to (projectId, folderId, filename); concurrent uploads of the same filename produce a correct stack, not two V1s
- [ ] **TXN-04**: `POST /api/upload/signed-url` validates that the target `folderId` (if set) is live — if it's been soft-deleted, reject with 404 so the asset is never orphaned

### Signed URL Caching (Phase 62)

- [ ] **CACHE-01**: Assets store `signedUrl` + `signedUrlExpiresAt` alongside `gcsPath`; list endpoints return the cached value when expiry is >30 min away, regenerate otherwise
- [ ] **CACHE-02**: Review-link resolution (`GET /api/review-links/[token]`) uses the same cache — a 200-asset review link no longer fires 200 GCS signing calls per guest page load
- [ ] **CACHE-03**: Thumbnail signed URLs + sprite signed URLs use the same caching strategy (same fields, longer TTL since they're less sensitive)

### Firestore Indexes & Denormalization (Phase 63)

- [ ] **IDX-01**: Composite Firestore index on `assets(projectId, folderId, deletedAt)` deployed; `GET /api/assets` queries directly on (projectId, folderId) and excludes deleted assets in the same query — no more post-fetch in-memory filter
- [ ] **IDX-02**: Comment count denormalized onto asset doc as `commentCount: number`; incremented on create, decremented on delete (via Firestore transaction); `GET /api/assets` no longer scans the `comments` collection per list request
- [ ] **IDX-03**: Composite index on `folders(projectId, parentId)`; folder tree fetches use a single indexed query per level
- [ ] **IDX-04**: Trash page + permanent-delete use a dedicated index on `(projectId, deletedAt)` and no longer walk every collection in memory

### Format Edge Cases (Phase 64)

- [x] **FMT-01**: Export route handles HEVC / AV1 / VP9 / ProRes source correctly — copy path's container check stops rejecting `.mov` with H.264, and the re-encode path works for any input codec
- [x] **FMT-02**: Export jobs have a `startedAt` timestamp and a server-side sweeper that marks jobs stuck in `encoding` past a watermark as `failed` so SIGKILL'd functions don't leave permanent ghost jobs
- [x] **FMT-03**: `src/lib/image-metadata.ts` falls back to ffprobe (already resolved server-side) when `image-size` returns null for HEIC / AVIF / HDR image inputs
- [x] **FMT-04**: Sprite frame spacing adapts to very short (<3s) and very long (>1h) videos — no frame-timestamp clustering at boundaries; limits to 20 frames always but distributes intelligently

### Security & Upload Validation (Phase 65)

- [ ] **SEC-20**: Review-link passwords are hashed with bcrypt (cost ≥10) at write; verification uses `bcrypt.compare`; existing plaintext passwords are migrated on first read (hash-then-replace)
- [ ] **SEC-21**: Guests submit the password in the POST body (not the `?password=` query string) so CDN and Vercel access logs stop capturing passwords; legacy query-param path removed after a migration window
- [ ] **SEC-22**: `POST /api/upload/complete` calls `bucket.file(gcsPath).getMetadata()` and rejects if the object is missing or size is 0 — zero-byte, cancelled, and MIME-spoofed uploads never become `ready` assets
- [ ] **SEC-23**: Server-side MIME validation on upload/complete — the Content-Type GCS reports must be on the accepted-MIME allow-list (from `src/lib/file-types.ts`); mismatch rejects with a clear error

### Dead Data & Contract Cleanup (Phase 66)

- [ ] **CLN-01**: `Asset.url` (the stored public GCS URL) is removed from the type and stops being written by `signed-url`; the bucket is private and the field was never consumed
- [ ] **CLN-02**: Sprite URL naming unified — `spriteSignedUrl` is used consistently in both the list endpoint and the on-demand generate-sprite response; AssetCard reads one field name
- [ ] **CLN-03**: `UploadCompleteRequest` type in `src/types/index.ts` is expanded to include `frameRate?`, `thumbnailGcsPath?`, any other field the server actually reads
- [ ] **CLN-04**: `useAssets.fetchAssets` uses `AbortController` — folder switches no longer race stale responses over fresh ones
- [ ] **CLN-05**: `folderIsAccessible` in review-link resolution uses the `Folder.path[]` array (already stored) for O(1) ancestry check instead of walking `parentId` with N sequential Firestore reads
- [ ] **CLN-06**: Sprite generation cleanup: `writer.destroy()` + `reader.cancel()` awaited before the finally block tries `fs.rm`; no EBUSY on /tmp cleanup under size-exceeded path
- [ ] **CLN-07**: Client-side pre-upload dimensions are tagged `probed: false` until probe completes; features that read dims (export, sprite, viewer aspect) can surface "pending probe" UX in the 10-30s window where client values might be stale

## Absorbed from audits

All 37 REQs trace to concrete audit findings — 18 specific (C-1 to L-4) + 5 systemic patterns synthesized into architectural phases.

## v3 / Future Requirements

- Server-side cron: Trash auto-purge, stale job sweeper, orphan GCS object cleanup
- Presence indicators (who is reviewing a link right now)
- Notifications (email + in-app) for new comments / approval changes
- Per-asset watermarks for client-facing review links
- AI auto-tagging + semantic search
- Bulk export (folder → zip of N trims)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time collaborative cursors | Async workflow |
| Offline mode | Real-time collaboration is core |
| Mobile app | Web-first |
| SSO beyond Google | Single entry point |
| Custom role matrices | Fixed role set |
| In-browser AE/Photoshop | Review platform, not editor |
| Zip preview | Download to inspect |
| Full event-sourced audit log | Structured logging + Firestore history sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBS-01 | Phase 60 | Pending |
| OBS-02 | Phase 60 | Pending |
| OBS-03 | Phase 60 | Pending |
| OBS-04 | Phase 60 | Pending |
| OBS-05 | Phase 60 | Pending |
| TXN-01 | Phase 61 | Pending |
| TXN-02 | Phase 61 | Pending |
| TXN-03 | Phase 61 | Pending |
| TXN-04 | Phase 61 | Pending |
| CACHE-01 | Phase 62 | Pending |
| CACHE-02 | Phase 62 | Pending |
| CACHE-03 | Phase 62 | Pending |
| IDX-01 | Phase 63 | Pending |
| IDX-02 | Phase 63 | Pending |
| IDX-03 | Phase 63 | Pending |
| IDX-04 | Phase 63 | Pending |
| FMT-01 | Phase 64 | Complete |
| FMT-02 | Phase 64 | Complete |
| FMT-03 | Phase 64 | Complete |
| FMT-04 | Phase 64 | Complete |
| SEC-20 | Phase 65 | Pending |
| SEC-21 | Phase 65 | Pending |
| SEC-22 | Phase 65 | Pending |
| SEC-23 | Phase 65 | Pending |
| CLN-01 | Phase 66 | Pending |
| CLN-02 | Phase 66 | Pending |
| CLN-03 | Phase 66 | Pending |
| CLN-04 | Phase 66 | Pending |
| CLN-05 | Phase 66 | Pending |
| CLN-06 | Phase 66 | Pending |
| CLN-07 | Phase 66 | Pending |

**Coverage:**
- v2.0 requirements: 31 total
- Mapped to phases: 31 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 — traceability populated at roadmap creation*
