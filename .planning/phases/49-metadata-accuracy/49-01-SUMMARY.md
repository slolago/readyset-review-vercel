---
phase: 49-metadata-accuracy
plan: 01
subsystem: asset-pipeline / viewer
tags: [metadata, images, ffprobe, firestore-timestamp, file-info]
requires:
  - @google-cloud/storage
provides:
  - src/lib/image-metadata.ts (extractImageMetadata)
  - src/lib/format-date.ts (coerceToDate, formatDate)
affects:
  - src/app/api/assets/[assetId]/probe/route.ts
  - src/app/api/upload/complete/route.ts
  - src/hooks/useAssets.ts
  - src/components/viewer/FileInfoPanel.tsx
tech-stack:
  added: [image-size@^1.1.1]
  patterns:
    - "Branch on asset.type for metadata pipeline (video → ffprobe, image → header parse)"
    - "Tolerant date coercion across Firestore Timestamp / admin JSON / ISO / epoch"
key-files:
  created:
    - src/lib/image-metadata.ts
    - src/lib/format-date.ts
    - tests/format-date.test.ts
  modified:
    - src/app/api/assets/[assetId]/probe/route.ts
    - src/app/api/upload/complete/route.ts
    - src/hooks/useAssets.ts
    - src/components/viewer/FileInfoPanel.tsx
decisions:
  - "Used image-size (pure JS, ~50 KB) over sharp (~30 MB native) — only width/height needed"
  - "Test lives at tests/format-date.test.ts to match vitest include glob (per runtime note)"
  - "Short-lived 1-minute signed URL for server image header read — no long-term caching needed"
  - "createImageBitmap uses {imageOrientation:'from-image'} with graceful fallback for older browsers"
metrics:
  tasks: 6
  duration: ~15m
  completed: 2026-04-20
requirements: [MEA-01, MEA-02, MEA-03, MEA-04]
---

# Phase 49 Plan 01: metadata-accuracy Summary

Accurate, type-appropriate asset metadata: images skip ffprobe and use an image-size header read for dimensions, the Upload → Date row tolerates every Firestore Timestamp shape, and the Info panel no longer advertises video-only fields on image assets.

## What Shipped

- **Probe route** (`src/app/api/assets/[assetId]/probe/route.ts`): after auth + permission gates, non-video assets short-circuit to `{probed:true}` with no ffprobe invocation.
- **image-metadata helper** (`src/lib/image-metadata.ts`): `extractImageMetadata(gcsPath)` fetches first 64 KB via Range request, parses with `image-size`, falls back to a 20 MB-capped full download, returns `null` on any failure (never throws).
- **upload/complete** (`src/app/api/upload/complete/route.ts`): image branch runs `extractImageMetadata` if client didn't supply dims, sets `probed:true`; background ffprobe fetch is guarded on `asset.type === 'video'`.
- **useAssets uploader** (`src/hooks/useAssets.ts`): added `extractImageMetadata(file)` using `createImageBitmap` with `{imageOrientation:'from-image'}` and a `new Image()` naturalWidth fallback. Dims are sent to `/api/upload/complete`. `file.size` continues to flow through unchanged via the signed-url step.
- **format-date** (`src/lib/format-date.ts`): `coerceToDate` handles Date / number / ISO / `{toDate()}` / `{_seconds,_nanoseconds}` / `{seconds,nanoseconds}` / null / invalid. `formatDate` returns the MEA-04 formatted string or em-dash.
- **FileInfoPanel** (`src/components/viewer/FileInfoPanel.tsx`): switched to the shared `formatDate`; video keeps its full File/Video/Audio sections; image gets a minimal File section (Filename / Type / Size) + Image section (Resolution / Aspect ratio / optional Color space). Probe button and "fields may be inaccurate" notice are video-only.
- **tests** (`tests/format-date.test.ts`): 13 tests covering every supported date shape plus garbage-input rejection — all green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test file path changed to `tests/format-date.test.ts`**
- **Found during:** Task 5 setup
- **Issue:** Plan frontmatter listed `src/lib/__tests__/format-date.test.ts`, but `vitest.config.ts` only includes `tests/**/*.test.ts`. Tests in `src/lib/__tests__` would never run.
- **Fix:** Placed tests at `tests/format-date.test.ts` (matches the runtime note in the execution prompt, which was explicit about this path). Import path updated to `@/lib/format-date`.
- **Commit:** 5f365eb6

**2. [Rule 1 — Bug] `image-size` named-export correction**
- **Found during:** Task 2
- **Issue:** Plan sample code used `import imageSize from 'image-size'` (default import). In `image-size@^1.1.1` the default export exists but the idiomatic usage is the named `imageSize` export; both work, but strict ESM resolution can behave differently under TS bundler mode.
- **Fix:** Used `import { imageSize } from 'image-size'` (verified against actual module shape).
- **Commit:** c3754744

**3. [Rule 2 — Missing functionality] `imageOrientation:'from-image'` fallback chain**
- **Found during:** Task 4
- **Issue:** Older Safari rejects unknown option keys in the `ImageBitmapOptions` bag, which would cause the primary path to silently throw and the naturalWidth fallback to kick in — which does NOT respect EXIF orientation for portrait JPEGs.
- **Fix:** Added a middle fallback: if `createImageBitmap(file, opts)` rejects, retry `createImageBitmap(file)` before dropping to `new Image()`. Keeps orientation-aware dims when at all possible.
- **Commit:** 1caa568d

**4. [Rule 1 — Bug] Removed `as any` cast on `formatDate(asset.createdAt)`**
- **Found during:** Task 6
- **Issue:** New `formatDate` accepts `DateLike | unknown`, so the cast is now unnecessary and actively hides type information.
- **Fix:** Dropped the cast.
- **Commit:** 1412edc6

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 0f9490b5 | feat(49-01): task 1 — early-return probe route for non-video assets |
| 2 | c3754744 | feat(49-01): task 2 — add image-metadata server extractor via image-size |
| 3 | b569aea1 | feat(49-01): task 3 — upload/complete skips probe for images, extracts dims server-side |
| 4 | 1caa568d | feat(49-01): task 4 — client reads image dims from original File via createImageBitmap |
| 5 | 5f365eb6 | feat(49-01): task 5 — add format-date lib with coerceToDate + tests |
| 6 | 1412edc6 | feat(49-01): task 6 — FileInfoPanel image-only section, shared formatDate, hide Probe for images |

## Verification

- `npx tsc --noEmit -p .` — clean (no output)
- `npm test` — **129/129 passing** (3 suites: permissions, permissions-api, format-date)
- format-date unit tests cover every shape in MEA-04
- Manual verification (2250×4000 / 718 KB JPEG upload, MP4 upload, legacy `_seconds` asset) deferred to human-in-the-loop — see `49-VERIFICATION.md`.

## Known Stubs

None. `colorSpace` on `ImageMetadata` is reserved for future expansion (documented in the interface) and is intentionally not wired — the FileInfoPanel Image section only renders Color space when the field actually exists, so no dashed placeholder appears.

## Self-Check: PASSED

- FOUND: src/lib/image-metadata.ts
- FOUND: src/lib/format-date.ts
- FOUND: tests/format-date.test.ts
- FOUND commit 0f9490b5
- FOUND commit c3754744
- FOUND commit b569aea1
- FOUND commit 1caa568d
- FOUND commit 5f365eb6
- FOUND commit 1412edc6
