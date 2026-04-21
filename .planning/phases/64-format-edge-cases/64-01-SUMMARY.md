---
phase: 64
plan: 01
subsystem: format-edge-cases
requirements: [FMT-01, FMT-02, FMT-03, FMT-04]
completed: 2026-04-20
tasks: 4
---

# Phase 64 Plan 01: Format Edge Cases — Summary

One-liner: widened the export copy matrix to accept `mov+h264+aac`, added a lazy sweeper that reaps SIGKILL'd job ghosts, fell back to `ffprobe` for HEIC/AVIF image dimensions, and adapted sprite frame spacing to sane spans for sub-3s and multi-hour videos.

## Commits

- `7b66d9f9` fix(64-01): FMT-01 widen export copy-path container matrix
- `b365fc4a` feat(64-01): FMT-02 stale job sweeper
- `e786263e` feat(64-01): FMT-03 image-metadata ffprobe fallback for HEIC/AVIF
- `e27914b3` feat(64-01): FMT-04 adaptive sprite frame spacing

## Files

Created:
- `.planning/phases/64-format-edge-cases/64-01-PLAN.md`
- `.planning/phases/64-format-edge-cases/64-01-SUMMARY.md`
- `.planning/phases/64-format-edge-cases/64-01-VERIFICATION.md`

Modified:
- `src/app/api/exports/route.ts` — copy-path container check now accepts `mp4` OR `mov+h264+aac`; all other containers take re-encode.
- `src/lib/jobs.ts` — added `sweepStaleJobs(olderThanMs = 120000)`, batch-writes `failed` + SIGKILL error.
- `src/app/api/assets/[assetId]/jobs/route.ts` — lazy-calls `sweepStaleJobs()` before the list read; sweep errors are non-fatal (logged only).
- `src/lib/ffmpeg-resolve.ts` — exported new `resolveFfprobe()` (mirrors the private resolver in the probe route).
- `src/lib/image-metadata.ts` — new third fallback: range-fetch → bounded full-download → `ffprobe` over signed URL; handles HEIC/AVIF.
- `src/app/api/assets/[assetId]/generate-sprite/route.ts` — adaptive timestamp computation: short videos use `[0.1, duration-0.1]` with unique-frame count capped at `min(20, duration*5)` and padded repeats; long (>2h) videos cap the sampled window to 2h with a console warn; strip remains exactly 20 tiles wide.

## Requirements Satisfied

- **FMT-01**: `.mov` with H.264/AAC (iPhone, Premiere) now remuxes in the copy path instead of hitting the re-encode branch. Non-h264 sources and other containers (mkv, webm, ProRes-mov, HEVC, AV1, VP9) still re-encode via libx264/AAC as before.
- **FMT-02**: `sweepStaleJobs()` flips any `status=running` job whose `startedAt` is older than 2 minutes to `failed` with `"function likely SIGKILL'd or crashed"`. Called lazily from `GET /api/assets/[id]/jobs` so the UI self-heals without a cron.
- **FMT-03**: `extractImageMetadata()` now has three paths. When `image-size` returns null on both the 64 KB header and the bounded full download (happens for HEIC/AVIF/HDR), the function spawns `ffprobe` against the signed URL and reads `streams[].width/height` from the first video stream.
- **FMT-04**: Sprite timestamps compute an adaptive `[spanStart, spanEnd]`: `<3s` videos clamp to `[0.1, duration-0.1]` with a reduced unique-frame count (5 fps cap); `>7200s` videos cap sampling to the first 2h. Strip is always a 20-slot tile (client hover-scrub math assumes this); excess slots repeat the last timestamp for very short videos.

## Key Decisions

- Kept the sprite strip width fixed at 20 frames. Reducing it for short videos would require updating `AssetCard.handleHoverScrub` (hard-coded `20` / `19` divisions). Padding with a repeated last timestamp is a 1-line change that keeps the client contract intact — the final few tiles are identical but never displayed in isolation (hover-scrub interpolates linearly across the strip).
- Promoted `resolveFfprobe()` into `ffmpeg-resolve.ts` rather than copying the logic into `image-metadata.ts`. The probe route's private copy is left alone (surgical-changes rule) — a later pass can DRY it up if desired.
- Lazy on-read sweep instead of a cron. The sweep query is indexed on `(status, startedAt)` (Firestore auto-indexes single-field equality + range), runs once per jobs GET, and returns zero rows in the common case. A dedicated cron is deferred to v3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Sprite tile width contract**
- **Found during:** Task 4
- **Issue:** The plan's naïve adaptive count (1..20 frames) would have broken `AssetCard`, which hard-codes `backgroundSize: '2000% 100%'` and divides by `19` to position the scrub tile. A 5-frame sprite with a 20-frame tile assumption would render garbage.
- **Fix:** Kept the tile at `${SPRITE_FRAMES}x1` always; introduced `uniqueFrames` for the timestamp math and pad remaining slots by repeating the last timestamp. The output strip is always 20 tiles wide, so every downstream consumer works unchanged.
- **Files modified:** `src/app/api/assets/[assetId]/generate-sprite/route.ts`
- **Commit:** `e27914b3`

## Self-Check: PASSED
