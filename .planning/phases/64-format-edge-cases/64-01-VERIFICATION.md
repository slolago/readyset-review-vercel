# Phase 64 Plan 01 — Verification

## Automated

| Check          | Result         |
| -------------- | -------------- |
| `tsc --noEmit` | clean (exit 0) |
| `vitest run`   | 156/156 pass   |

## Manual

### FMT-01 — mov+h264 copy path
1. Upload a `.mov` file encoded by iPhone or Premiere (H.264 video, AAC audio).
2. Wait for probe to complete (asset sidebar shows `videoCodec: h264`, `audioCodec: aac`, `containerFormat: mov,mp4,m4a,3gp,3g2,mj2`).
3. Export a clip → server log shows `[export] ffmpeg -y -ss … -c copy …` (copy path), total encode time <3s for a 10s clip.
4. Upload a `.mov` with HEVC (iPhone "High Efficiency") → log shows the re-encode path with `-c:v libx264` instead.

### FMT-02 — stale job sweep
1. Start a sprite/export job on a large video.
2. Kill the dev server (Ctrl+C) while the job is `running`.
3. Wait >2 minutes.
4. Open the asset viewer → the jobs endpoint GET triggers `sweepStaleJobs`; server log prints `[jobs GET] swept stale jobs: N`; the ghost job appears as `failed — function likely SIGKILL'd or crashed` in the UI.

### FMT-03 — HEIC/AVIF image dimensions
1. Upload a HEIC photo (iPhone default) or an AVIF image.
2. Watch server logs: `image-size` may fail (no log), `extractImageMetadata` then calls ffprobe.
3. Asset's `width` and `height` fields populate correctly in Firestore.
4. Test negative: upload a completely garbage `.bin` → all three paths fail, `extractImageMetadata` returns null, no crash.

### FMT-04 — short + long video sprite spacing
1. Upload a 1-second test clip. Hover the asset card → sprite strip generates; first ~5 tiles show distinct frames, remaining tiles repeat the last frame. No crash, no duplicate-keyframe failure.
2. Upload a 3-second clip → 15 unique frames across `[0.1, 2.9]`, last 5 tiles repeat.
3. Upload a 3-hour clip (if available) → server log shows `duration 10800s exceeds 2h cap; sampling first 2h`; sprite shows 20 evenly-spaced frames across the first 2h.
4. Upload a 60-second clip (control) → unchanged behavior, 20 frames across `[1.2, 58.8]`.

## Out-of-scope (deferred)

- Server-side cron for stale-job sweep (v3 roadmap). On-read sweep handles the common case; abandoned stuck jobs on assets no one visits would persist, but cost is negligible.
- HDR color pipeline (`color_space`, `color_transfer`) on image-metadata. ffprobe returns these fields — plumbing them to the asset doc and surfacing them in UI is a future phase.
- DRY-up of `resolveFfprobe` in the probe route (now duplicated with the one in `ffmpeg-resolve.ts`). Surgical-changes rule: left the probe route untouched.
