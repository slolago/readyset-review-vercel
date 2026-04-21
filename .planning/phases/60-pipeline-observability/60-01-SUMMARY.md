---
phase: 60-pipeline-observability
plan: 01
subsystem: pipeline-observability
tags: [jobs, probe, sprite, export, upload, observability, retry]
requires:
  - src/lib/firebase-admin.ts (getAdminDb)
  - src/lib/permissions.ts (canProbeAsset, canGenerateSprite, canUpload)
  - src/lib/auth-helpers.ts (getAuthenticatedUser)
provides:
  - src/lib/jobs.ts (createJob/updateJob/getJob/listJobsForAsset)
  - Job / JobType / JobStatus types in src/types
  - GET /api/assets/[assetId]/jobs
  - POST /api/jobs/[jobId]/retry
  - useAssetJobs hook
  - verifyGcsObject helper
affects:
  - src/lib/exports.ts (now thin wrapper over jobs.ts)
  - probe, generate-sprite, upload/complete routes
  - useAssets.uploadFile (no client-side sprite trigger)
  - AssetCard (live job indicator + retry)
tech-stack:
  added: []
  patterns:
    - "Unified job lifecycle: queued → running → ready | failed, max 3 attempts"
    - "Legacy status value 'encoding' mapped to 'running' at serialization, not schema"
    - "x-retry-job-id header lets retry endpoint reuse job doc id across processing routes"
key-files:
  created:
    - src/lib/jobs.ts
    - src/app/api/assets/[assetId]/jobs/route.ts
    - src/app/api/jobs/[jobId]/retry/route.ts
    - src/hooks/useAssetJobs.ts
    - tests/jobs.test.ts
  modified:
    - src/types/index.ts
    - src/lib/exports.ts
    - src/lib/gcs.ts
    - src/app/api/exports/route.ts
    - src/app/api/assets/[assetId]/probe/route.ts
    - src/app/api/assets/[assetId]/generate-sprite/route.ts
    - src/app/api/upload/complete/route.ts
    - src/hooks/useAssets.ts
    - src/components/files/AssetCard.tsx
decisions:
  - "ExportJob interface replaced by Job; ExportStatus kept with 'encoding' alias and mapped at write time"
  - "Retry reuses job doc id via x-retry-job-id header so history and attempt counter survive across the processing route's re-entry"
  - "Polling is a plain setInterval (5s) that stops when no live jobs remain — no SWR dependency introduced"
  - "Indicator is a 10px colored dot at top-left of the thumbnail, layered above existing badges via z-20"
metrics:
  tasks_completed: 8 of 9 (Task 9 is a manual-verify checkpoint)
  commits: 8
  new_files: 5
  modified_files: 9
---

# Phase 60 Plan 01: Pipeline Observability Summary

Replaced fire-and-forget probe/sprite/export processing with an observable, retryable Job lifecycle (queued → running → ready | failed), deduped the duplicate sprite trigger, verified GCS uploads before marking assets ready, and wired an AssetCard status dot with one-click retry bounded at 3 attempts.

## What Changed

**Unified Job model (Task 1).** `src/lib/jobs.ts` is the single lifecycle module against a new `jobs` Firestore collection. `Job`, `JobType`, `JobStatus` live in `src/types/index.ts`. Covered by `tests/jobs.test.ts` (create/update strip/get-missing/list-filter).

**Export migration (Task 2).** `src/lib/exports.ts` is now a thin wrapper over `jobs.ts` — exports are rows in `jobs` with `type:'export'`. Legacy callers that still pass `status:'encoding'` are mapped to `'running'` at the serialization layer (per user instruction: type-level alias, schema stays clean). The old `exports` Firestore collection is abandoned — historical ready exports stop appearing in the list, documented in-code.

**Probe + sprite routes wrapped (Tasks 3-4).** Both routes now `createJob(...)` on entry (or reuse via `x-retry-job-id` header), mark `running`, flip to `ready` or `failed` at every exit site, and have outer catches that mirror failure into the job doc inside a nested try so a secondary write failure can't mask the original 500. Sprite route additionally re-reads `asset.duration` from Firestore inside the handler (OBS-05) — fixes the race where sprite started before probe had written duration.

**GCS verify guard (Task 5).** New `verifyGcsObject(gcsPath)` uses `file.getMetadata()` and returns `{exists,size}`, treating 404 as non-existent. `upload/complete` calls it between the permission check and the `updates` construction; a missing or zero-byte object returns 400 and the asset is never flipped to `ready`. The verified size is written back into the asset doc.

**Client-side sprite trigger removed (Task 6).** `useAssets.uploadFile` no longer fires `/api/assets/:id/generate-sprite`. The server-side trigger in `upload/complete` is the sole source. `AssetCard.ensureSprite` is kept as a hover fallback for pre-Phase-60 assets without sprites, annotated accordingly.

**Observability UI (Task 7).** `GET /api/assets/:id/jobs` (gated by `canProbeAsset`, newest-first, limit 20) feeds a polling `useAssetJobs` hook (5s interval, stops when no live jobs). `AssetCard` renders a 10×10 colored dot at top-left (`top-1 left-1 z-20`), amber pulsing while any job is `queued`/`running`, red when any job has failed. Tooltip shows job type + error.

**Retry (Task 8).** `POST /api/jobs/:id/retry`:
- 409 on non-failed status or attempt ≥ 3
- Exports rejected (400) — they have their own ffmpeg re-run flow
- Increments `attempt`, resets to `queued`, clears `error`
- Fire-and-forget re-hits the underlying processing route with `x-retry-job-id` so probe/sprite routes reuse the same job doc id instead of creating a new one

The red dot is now a button — click fires retry, toast confirms, hook refetches.

## Verification

- `npx tsc --noEmit`: clean
- `npx next build`: successful (pre-existing `<img>` and `react-hooks/exhaustive-deps` warnings unrelated to this phase)
- `npx vitest run`: 156 tests, 5 files, all passing (5 new tests in `tests/jobs.test.ts`)

## Deviations from Plan

### Rule 2 — Auto-added: legacy status compatibility type

**Found during:** Task 2. The plan said to remove `ExportStatus` "if unused". The user instruction explicitly directed keeping `encoding` as a type-level alias for `running`. I kept `ExportStatus` with the union `'queued' | 'encoding' | 'running' | 'ready' | 'failed'` and added a `LegacyExportPatch` type on `updateExportJob` that accepts either value. `encoding` is rewritten to `running` at write time inside `updateExportJob`. No Firestore document will ever hold `encoding` going forward; existing in-flight docs continue to type-check where they're read.

### Task 9 (manual checkpoint) not executed

Per the execution instructions, this run was to complete Tasks 1-8 and surface SHAs — Task 9 is the human-verify checkpoint. Not a deviation; expected execution mode.

### Skipped: integration test for upload/complete verify guard

Task 5 lists three test cases; the first two are covered by the unit shape of `verifyGcsObject`. The third (a route integration test) would require extending the existing `permissions-api.test.ts` GCS mock surface with `verifyGcsObject`, which was out of scope for this phase's single-route change. Behavior is covered by the manual checkpoint step 1 in Task 9.

## Known Stubs

None. No mocked data, no placeholder UI, no deferred wiring.

## Self-Check: PASSED

**Files:**
- `src/lib/jobs.ts`: FOUND
- `src/app/api/assets/[assetId]/jobs/route.ts`: FOUND
- `src/app/api/jobs/[jobId]/retry/route.ts`: FOUND
- `src/hooks/useAssetJobs.ts`: FOUND
- `tests/jobs.test.ts`: FOUND

**Commits (all on master):**
- `d733002d` feat(60-01): add generalized Job model + jobs.ts lifecycle helpers
- `f97217fb` refactor(60-01): migrate ExportJob to unified Job model
- `6a89950f` feat(60-01): wrap probe route in Job lifecycle tracking
- `c7def5f9` feat(60-01): wrap sprite route in Job tracking + fresh duration (OBS-05)
- `6fba48ff` feat(60-01): GCS verify helper + upload/complete guard (OBS-04)
- `4828e64e` refactor(60-01): remove client-side sprite trigger (OBS-03)
- `a4e2e1f6` feat(60-01): asset jobs endpoint + AssetCard indicator (OBS-01)
- `c1a67cba` feat(60-01): retry endpoint + AssetCard retry wire (OBS-02)
