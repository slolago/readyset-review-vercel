# Phase 80: stamp-pipeline-standalone - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Build `POST /api/assets/[id]/stamp-metadata` and supporting library so stamping works end-to-end in isolation. Touch NO review-link code — Phase 81 does that integration. After this phase, a direct call to the stamp route on an asset id must produce a GCS object at `stampedGcsPath` with the four `Attrib:Ads` XMP fields, the Firestore doc updated with `stampedGcsPath` + `stampedAt`, and a `metadata-stamp` job row recording the run.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

**Architecture (from ARCHITECTURE.md + PITFALLS.md synthesis):**

- `src/lib/metadata-stamp/` (new) — the exiftool wrapper, `.config` file, constants, and pure `stampAsset(localPath)` function
- `src/app/api/assets/[assetId]/stamp-metadata/route.ts` (new) — thin route handler that manages job lifecycle, GCS download/upload, invokes `stampAsset`
- Per-request `new ExifTool({ maxProcs: 1, maxTasksPerProcess: 1 })`; `await et.end()` in `finally`
- `-config <path>` passed via `et.write(path, tags, ['-config', CONFIG_PATH])` — not in constructor
- Attrib append semantics: read existing, normalize to array (single-entry XMP can come back as object not [object]), spread with `Data` re-stamped on each old entry, append new entry. Mirrors reference `scf-metadata/src/backend/exiftool.js` line-by-line.
- Streaming GCS I/O: download via `downloadToFile()` (already exists in `src/lib/gcs.ts`), upload via new `uploadStream()` helper (must add — current `uploadBuffer()` OOMs on 500MB+ videos per PITFALLS.md HIGH finding)
- Concurrent dedup: at route entry, query `jobs` collection for `{type: 'metadata-stamp', assetId, status: 'running'}` in a transaction; if found, return `{reused: true, jobId: existing}` — second-caller idempotent skip
- Job type extension: `'metadata-stamp'` added to `JobType` union in `src/types/index.ts`
- `Asset` type fields added: `stampedGcsPath?`, `stampedSignedUrl?`, `stampedSignedUrlExpiresAt?`, `stampedAt?`
- Timezone for `Created`: hardcode `America/New_York` (Ready Set's HQ). Future milestone may make this per-project. Use native `Date.toLocaleString('en-CA', {timeZone, ...})` — no dayjs dep (confirmed not in package.json)
- GCS layout: `projects/{projectId}/assets/{assetId}/stamped{extension}` — one per asset, shared across review links
- Permission: same as `/api/assets/[id]/probe` (`canProbeAsset` — any project member)

**Constants (from Phase 79 verification):**

```ts
const FB_ID = 2955517117817270;
const DATA = '|{"Company":"Ready Set"|}'; // pipe-wrapped struct syntax; exiftool strips pipes, writes plain JSON to XMP
const META_TZ = 'America/New_York';
```

**Invalidation triggers (Phase 82 will implement, but Phase 80 must write `stampedAt` so invalidation has something to compare):**

- Rename → `stampedAt < updatedAt` is true → re-stamp
- New version upload → same
- Both covered by Phase 79's `updatedAt` writes

**Testing strategy:**

- No unit tests for this pipeline in v2.4 (project doesn't have Vitest setup for API routes; existing jobs have manual verification pattern per `human_needed` in prior milestones)
- Post-implementation: deploy, hit the route with a real video asset, confirm stamped file in GCS has the 4 Attrib fields via exiftool on the downloaded stamped output
- Double-stamp test: hit route twice on same asset, confirm `Attrib.length === 2` in output XMP

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/jobs.ts` — createJob, updateJob, sweepStaleJobs — just add `'metadata-stamp'` to JobType
- `src/lib/signed-url-cache.ts::getOrCreateSignedUrl` — use for stamped URL signing once Phase 81 integrates
- `src/lib/gcs.ts` — has `downloadToFile`, `getBucket`, signed URL helpers. Need to ADD `uploadStream(localPath, gcsPath, contentType)` — current `uploadBuffer` is memory-unsafe
- `src/lib/format-date.ts::coerceToDate` — for future `stampedAt < updatedAt` comparison robustness
- `src/lib/version-groups.ts::resolveGroupId` — not needed in Phase 80 but useful in 82
- `src/app/api/assets/[assetId]/probe/route.ts` — structural template for the stamp route (auth → fetch asset → job create → download → run binary → upload → firestore update → job update)
- `src/app/api/assets/[assetId]/generate-sprite/route.ts` — same pattern, has `/tmp` tempdir handling + cleanup

### Established Patterns
- `export const runtime = 'nodejs'` + `export const maxDuration = 60` on all binary-spawning routes
- Permission: `canProbeAsset(user, project)` — any project member can trigger
- Firestore updates use admin SDK `.update()` not `.set()` to preserve other fields
- Error handling: try/catch/finally; on error update job to `status: 'failed'` with `error` field; return 500 with error message

### Integration Points
- `JobType` union in `src/types/index.ts`
- `Asset` interface in `src/types/index.ts`
- New route under `src/app/api/assets/[assetId]/stamp-metadata/`
- No changes to review-link code (Phase 81's domain)

</code_context>

<specifics>
## Specific Ideas

- Attrib normalization pattern (from PITFALLS.md):
  ```ts
  const existing = tags?.Attrib;
  const oldAttrib = Array.isArray(existing) ? existing : existing ? [existing] : [];
  // Re-stamp Data on each old entry (matches reference app)
  const refreshed = oldAttrib.map((a: any) => ({ ...a, Data: DATA }));
  const Attrib = [...refreshed, { ExtId, Created, Data: DATA, FbId: FB_ID }];
  ```
- Tempdir cleanup: use `os.tmpdir()` + `crypto.randomUUID()` subdir; `fs.rm(tempDir, { recursive: true, force: true })` in finally regardless of success/failure
- Extension preservation: `path.extname(asset.gcsPath)` or fall back to `path.extname(asset.name)` — must keep MIME-correct extension so Content-Type on the stamped GCS upload matches

</specifics>

<deferred>
## Deferred Ideas

- UI badge / button for manual re-stamp — deferred to Phase 82 or future
- Per-project `metaConfig` override — v2.5+
- Old stamped GCS cleanup on re-stamp — Phase 82's domain (this phase just overwrites, Phase 82 adds the delete-old step)

</deferred>
