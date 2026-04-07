---
phase: 22-asset-download-button
plan: 01
subsystem: ui
tags: [download, signed-url, gcs, lucide-react, asset-viewer]

requires:
  - phase: 13-review-polish-and-fixes
    provides: generateDownloadSignedUrl in gcs.ts + forceDownload in utils.ts (dual URL strategy)
  - phase: 12-download-and-polish
    provides: forceDownload utility and downloadUrl pattern established in bulk assets route

provides:
  - Download button in asset viewer header for ready assets
  - downloadUrl field on single-asset API response (root asset + all versions)

affects:
  - asset-viewer
  - single-asset API

tech-stack:
  added: []
  patterns:
    - "Dual signed URL (signedUrl for playback, downloadUrl with attachment disposition) now applied to single-asset route matching bulk assets route"
    - "Download button uses secondary ghost styling — Download is secondary, Share is primary CTA"

key-files:
  created: []
  modified:
    - src/app/api/assets/[assetId]/route.ts
    - src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx

key-decisions:
  - "Generate downloadUrl in parallel with signedUrl using Promise.all to avoid latency penalty"
  - "Use .catch(() => undefined) on generateDownloadSignedUrl so a GCS failure does not break the API response"
  - "Download button placed between VersionSwitcher and Share button; uses ghost/secondary styling so Share remains primary CTA"
  - "Fallback to signedUrl if downloadUrl absent — matches AssetCard pattern"

patterns-established:
  - "Pattern: all asset-serving endpoints should produce both signedUrl (inline) and downloadUrl (attachment) for ready assets"

requirements-completed: [P22-01, P22-02, P22-03, P22-04]

duration: 1min
completed: 2026-04-07
---

# Phase 22 Plan 01: Asset Download Button Summary

**Download button wired into asset viewer header via dual signed URL strategy — generateDownloadSignedUrl added to single-asset API for root asset and all versions, forceDownload triggered on click**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-07T20:30:47Z
- **Completed:** 2026-04-07T20:31:47Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Added `generateDownloadSignedUrl` to `/api/assets/[assetId]` GET handler — both root asset and every version in the versions array now receive a `downloadUrl` field when status is ready
- Download button added to asset viewer header between VersionSwitcher and Share button, guarded by `displayAsset?.status === 'ready'`
- Clicking Download calls `forceDownload(url, asset.name)` with `downloadUrl` (attachment disposition) falling back to `signedUrl` — guarantees file saves to disk rather than opening in a browser tab
- No new files, no new dependencies — pure surgical wiring of infrastructure already built in Phases 12-13

## Task Commits

1. **Task 1: Add downloadUrl to single-asset API response** - `3f41114e` (feat)
2. **Task 2: Add Download button to asset viewer header** - `75ca3381` (feat)

## Files Created/Modified

- `src/app/api/assets/[assetId]/route.ts` - Added `generateDownloadSignedUrl` import; parallel URL generation for root asset and all versions
- `src/app/(app)/projects/[projectId]/assets/[assetId]/page.tsx` - Added `Download` icon + `forceDownload` imports; Download button in header with status guard

## Decisions Made

- Generate downloadUrl in parallel with signedUrl using `Promise.all` to avoid adding latency
- Use `.catch(() => undefined)` on `generateDownloadSignedUrl` — if GCS fails, the response still works (playback unaffected)
- Download button placed before Share button with ghost/secondary styling — keeps Share as the visually primary action
- Fallback chain: `downloadUrl ?? signedUrl` — if download URL absent, signedUrl still triggers a download (may open in tab for non-attachment URLs, but acceptable edge case)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 22 is complete. All planned phases (01-22) have SUMMARY files. Milestone v1.2 is done — the asset download button is the final feature addition.

---
*Phase: 22-asset-download-button*
*Completed: 2026-04-07*
