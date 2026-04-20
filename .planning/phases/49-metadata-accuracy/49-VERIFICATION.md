---
phase: 49-metadata-accuracy
plan: 01
status: human_needed
---

# Phase 49 Plan 01 Verification

## Automated — PASSED

- [x] `npx tsc --noEmit -p .` — clean
- [x] `npm test` — 129/129 passing (tests/format-date.test.ts contributes 13)
- [x] format-date covers every MEA-04 Timestamp shape (Date, ISO string, epoch ms, Firestore client Timestamp, `{_seconds,_nanoseconds}`, `{seconds,nanoseconds}`, null/undefined, garbage)

## Success Criteria Trace

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | JPEG 2250×4000 / 718 KB displays as such | **needs human** | Requires real image upload against deployed env |
| 2 | Image panel hides Container / Pixel format / Color space (absent) / Overall bitrate / Video / Audio | **code-verified** | FileInfoPanel branches on `asset.type !== 'video'`; Image section omits those rows (tsc clean) |
| 3 | Video panel retains its current field set | **code-verified** | Video branch unchanged except for being scoped inside the new if-block |
| 4 | Upload → Date row renders readable date for every Timestamp shape | **PASSED** | 13 unit tests exercise every shape; none yields "Invalid Date" |
| 5 | Probe route short-circuits non-video, sets probed:true | **code-verified** | Early-return added after auth/permission gate |
| 6 | `npm test` + `npx tsc --noEmit` clean | **PASSED** | 129/129 green, typecheck silent |

## Why human_needed

Three criteria require a real artifact — a portrait JPEG ~700 KB, a short .mp4, and a legacy asset whose `createdAt` was admin-serialized as `{_seconds,_nanoseconds}`. Code paths are correct and type-checked, but end-to-end visual confirmation in the running app (GCS signed URL fetch path, Firestore round-trip for the legacy asset) cannot be executed from this harness.

## Suggested manual pass

1. Upload a ~700 KB JPEG with native dims 2250×4000. Open the asset. Expect Size ≈ 718 KB, Resolution 2250 × 4000, Aspect ratio 9:16, Date formatted like "Apr 20, 2026, 3:42 PM", no Container / Pixel format / Color space / Overall bitrate rows, no Probe button.
2. Upload a short .mp4. Expect the Info panel to look identical to pre-phase (Container, Codec, Resolution, Frame rate, Color space, Audio section all present). Probe button still visible.
3. Open a pre-phase asset whose `createdAt` was serialized as `{_seconds, _nanoseconds}`. Expect a real date in the Date row — never "Invalid Date".

If all three pass, update this file's `status: passed`.
