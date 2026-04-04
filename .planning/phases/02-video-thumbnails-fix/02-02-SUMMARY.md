---
phase: 02-video-thumbnails-fix
plan: "02"
subsystem: api
tags: [gcs, video, thumbnail, upload, nextjs-api-route]

requires:
  - phase: 01-breadcrumb-nav
    provides: Working app baseline

provides:
  - Server-side thumbnail upload endpoint at /api/upload/thumbnail
  - uploadBuffer() utility in gcs.ts for direct server-side GCS writes
  - Removed direct browser-to-GCS thumbnail PUT (CORS-safe flow)

affects: [upload-flow, video-thumbnails, gcs]

tech-stack:
  added: []
  patterns:
    - "Server-side GCS upload: use uploadBuffer() instead of signed PUT URLs to avoid CORS issues"
    - "Thumbnail upload as multipart POST to /api/upload/thumbnail (auth-gated)"

key-files:
  created:
    - src/app/api/upload/thumbnail/route.ts
  modified:
    - src/hooks/useAssets.ts
    - src/app/api/upload/signed-url/route.ts
    - src/lib/gcs.ts

key-decisions:
  - "Upload thumbnail via server-side route instead of signed PUT URL to avoid GCS CORS configuration requirements"
  - "Thumbnail route updates Firestore directly (thumbnailUrl + thumbnailGcsPath) — no need to pass path through complete endpoint"
  - "Thumbnail upload is non-fatal: if it fails the main video upload continues normally"

patterns-established:
  - "Server-side binary upload: POST multipart to /api route, use uploadBuffer() in gcs.ts"

requirements-completed: []

duration: 8min
completed: 2026-04-04
---

# Phase 02 Plan 02: Video Thumbnails — Server-Side Upload Summary

**Replaced direct browser-to-GCS thumbnail PUT with a server-side /api/upload/thumbnail endpoint to eliminate CORS issues.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04T15:33:35Z
- **Completed:** 2026-04-04T15:41:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `/api/upload/thumbnail` route that accepts multipart POST, verifies asset ownership, uploads blob to GCS server-side, and updates Firestore thumbnailUrl
- Added `uploadBuffer()` to `src/lib/gcs.ts` for direct server-side GCS writes (no signed URL needed)
- Updated `useAssets.ts` upload flow to POST thumbnail via the new API instead of direct GCS PUT
- Cleaned up `signed-url/route.ts` — no longer generates a thumbnailSignedUrl for video uploads

## Task Commits

1. **Task 1: thumbnail API route + gcs uploadBuffer** - `5ca7644` (feat)
2. **Task 2: useAssets sends thumbnail to server route** - `e78cf22` (feat)
3. **Task 3: remove thumbnailSignedUrl from signed-url endpoint** - `e116007` (feat)

## Files Created/Modified

- `src/app/api/upload/thumbnail/route.ts` - New server-side thumbnail upload endpoint
- `src/lib/gcs.ts` - Added `uploadBuffer()` for server-side direct GCS writes
- `src/hooks/useAssets.ts` - Now POSTs thumbnail blob to `/api/upload/thumbnail`
- `src/app/api/upload/signed-url/route.ts` - Removed thumbnail signed URL generation

## Decisions Made

- Server-side upload eliminates the need to configure GCS bucket CORS for thumbnail PUTs from the browser
- Thumbnail route updates Firestore directly so the `/api/upload/complete` endpoint no longer needs `thumbnailGcsPath`
- Non-fatal design preserved: thumbnail failure does not block video upload

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added uploadBuffer() to gcs.ts**
- **Found during:** Task 1 (creating thumbnail route)
- **Issue:** The thumbnail route needed to upload a buffer server-side to GCS, but `gcs.ts` only had `generateUploadSignedUrl` (client PUT) and `generateReadSignedUrl` — no server-side write method
- **Fix:** Added `uploadBuffer(gcsPath, buffer, contentType)` using the GCS SDK's `file.save()` method
- **Files modified:** src/lib/gcs.ts
- **Committed in:** 5ca7644

## Known Stubs

None — thumbnail data flows from browser capture through server to GCS and is stored in Firestore.

## Self-Check: PASSED
