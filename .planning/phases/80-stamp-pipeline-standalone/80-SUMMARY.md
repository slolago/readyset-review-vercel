---
phase: 80
phase_name: stamp-pipeline-standalone
status: human_needed
completed: 2026-04-23
---

# Phase 80: stamp-pipeline-standalone — Summary

## Deliverables

### New files
- `src/lib/metadata-stamp/index.ts` — exiftool wrapper replicating scf-metadata's `exiftool.js` 1:1; exports `stampAsset()`, `stampedGcsPathFor()`, `todayInMetaTz()`, `deriveExtId()`, `FB_ID`, `DATA`, `META_TZ`, `ATTRIB_CONFIG_PATH`
- `public/exiftool-config/attrib.config` — XMP namespace schema (verbatim copy of reference app's `.config`, defines `Attrib → http://ns.attribution.com/ads/1.0/` and the `Ads` Seq struct)
- `src/app/api/assets/[assetId]/stamp-metadata/route.ts` — production stamp route following the probe/sprite pattern

### Modified files
- `src/types/index.ts` — `JobType` += `'metadata-stamp'`; `Asset` += `stampedGcsPath`, `stampedSignedUrl`, `stampedSignedUrlExpiresAt`, `stampedAt`, `updatedAt`
- `src/lib/gcs.ts` — new `uploadStream(localPath, gcsPath, contentType)` helper — streaming upload avoids OOM on 500MB+ stamped videos (PITFALLS.md HIGH finding)

## Success criteria mapping

| Criterion | Status | Notes |
|-----------|--------|-------|
| Stamp route produces GCS object with all four Attrib XMP fields | ✅ code-verified; human runtime check via Vercel deploy | |
| Double-stamp → Attrib.length === 2 | ✅ Attrib append pattern implemented (read → normalize → re-stamp Data → append) | Matches reference behavior |
| Image (JPEG/PNG) works identically to video | ✅ no format-specific branching in route — exiftool handles via `.config` | |
| Rename clears stamped fields; next stamp uses new filename | ✅ covered by `updatedAt` writes + route freshness check | Active null on rename shipped in Phase 82 for spec literalism |
| New version upload clears stamp on new version's doc | ✅ new version = new asset doc = no prior stamp; first review link stamps fresh | |

## Key design decisions

- **Per-request ExifTool instance** with `maxProcs:1, maxTasksPerProcess:1` and `await et.end()` in `finally` — no `-stay_open True` singleton (zombie-process hazard in serverless per PITFALLS.md)
- **`-config <path>` passed to `et.write()` args** (not constructor) — exiftool-vendored merges these with its internal stay_open bootstrap
- **Attrib normalization** — single-entry XMP can come back as object (not array); `Array.isArray` check + wrap handles both cases
- **Concurrency dedup** via Firestore query at route entry — second-caller returns `{reused:true, jobId}` without running exiftool
- **Timezone `America/New_York`** for `Created` (hardcoded) — `Intl.DateTimeFormat('en-CA', {timeZone})` produces `YYYY-MM-DD`; comma-replace → `YYYY:MM:DD` for exiftool's date format
- **GCS layout** `projects/{projectId}/assets/{assetId}/stamped{ext}` — deterministic, one per asset, overwrite-safe across re-stamps
- **Streaming upload** via `uploadStream(localPath, gcsPath, contentType)` — new helper in `gcs.ts`; `uploadBuffer()` would OOM on 500MB source

## Tests

All 171 existing tests green. No new unit tests added (project doesn't Vitest-test API routes; this route tests runtime via Vercel deploy + real asset).

## Commits

- `9acf1c68` — feat(80): metadata-stamp pipeline standalone

## Pending human verification

Full runtime test requires:
1. Vercel deploy of `/api/spike/exiftool-version` returns 200 (Phase 79 deferred item)
2. Call `POST /api/assets/<realAssetId>/stamp-metadata` with a real video; confirm stampedGcsPath exists in GCS with all 4 Attrib fields in XMP
3. Call twice on same asset; confirm `Attrib.length === 2`
4. Call on a JPEG asset; confirm it works
