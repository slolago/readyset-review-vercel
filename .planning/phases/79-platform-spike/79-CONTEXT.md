# Phase 79: platform-spike - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Verify all three runtime unknowns flagged by v2.4 research BEFORE writing any stamp production code. Deliverable is a written verification report (`79-VERIFICATION-SPIKE.md`), not a feature. If any of the three verification items fail, the v2.4 architecture must be reconsidered (e.g. move the stamp job to Cloud Run instead of Vercel Lambda).

Three items to verify:

1. **Perl availability on Vercel Pro Lambda runtime.** `exiftool-vendored` bundles a perl script requiring `/usr/bin/perl` (or `perl` on `$PATH`). Vercel's Node.js Lambda runtime may or may not include perl — public confirmation is absent. A spike route that calls `et.version()` must be deployed and return successfully before Phase 80's stamp pipeline can be built against exiftool-vendored on Vercel.

2. **`updatedAt` coverage on rename + upload-complete handlers.** The `stampedAt < updatedAt` invalidation strategy assumes `updatedAt: FieldValue.serverTimestamp()` is reliably written on (a) `PUT /api/assets/[assetId]` when a name change occurs, and (b) `/api/upload/complete` when a new version is written. These code paths must be read; if `updatedAt` is absent, add it.

3. **`Data` field literal value.** The reference `scf-metadata/src/backend/exiftool.js` contains the string `'|{"Company":"Ready Set"|}'` (pipe-wrapped) — but the actual stamped output file's XMP shows `'{"Company":"Ready Set"}'` (plain JSON) per the diff performed earlier in this session. The Phase 80 implementation must use the correct literal. Verify by running `exiftool -Attrib:all` on a desktop-stamped file and documenting the exact bytes.

This phase writes NO production code. It may write a throwaway `/api/spike/exiftool-version` route that gets removed (or left for Phase 80 reuse). It may add `updatedAt` writes if missing — those remain in production.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — platform spike phase. Use these guiderails:

- Spike route can be written and deployed; if perl fails, the route will throw a clear error that surfaces in logs. Document the failure signature.
- If `updatedAt` is absent on rename or upload-complete, add `updatedAt: FieldValue.serverTimestamp()` to the update payload. Preserve any existing fields. Do not refactor adjacent code.
- For the `Data` literal check: use `ffprobe`/`exiftool` or re-read the `/tmp/after_xmp.xml` already produced earlier this session (the `Attrib:Data` line contains the literal).
- Deliverable: `.planning/phases/79-platform-spike/79-VERIFICATION-SPIKE.md` with a `status:` field (`passed` or `gaps_found`) and explicit pass/fail per verification item. If any fail, surface as blockers in STATE.md.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing `/api/assets/[assetId]/probe/route.ts` and `/api/assets/[assetId]/generate-sprite/route.ts` are the canonical patterns for "download to /tmp, run a binary, upload back" — the spike route can follow the same shape.
- `src/lib/firebase-admin.ts` + `getAdminDb()` for Firestore access if the spike writes to a jobs row.
- `next.config.mjs` already has `outputFileTracingIncludes` config for ffmpeg/ffprobe — the spike route adds exiftool entries to the same structure.

### Established Patterns
- Vercel runtime = Node.js, `export const runtime = 'nodejs'` + `export const maxDuration = 60` on any route that spawns binaries.
- Test-deploys via `git push vercel master`; verify at `https://readyset-review-vercel.vercel.app/api/spike/exiftool-version` (or whatever subdomain the vercel remote resolves to).

### Integration Points
- No production route changes in this phase except potentially adding `updatedAt` writes to `/api/assets/[assetId]` (rename) and `/api/upload/complete` (new version).

</code_context>

<specifics>
## Specific Ideas

- Before deploying the spike, run `npm install exiftool-vendored` locally and verify `node -e "require('exiftool-vendored')"` doesn't throw. Cheap local sanity check.
- The spike route can be minimal: import ExifTool, call `.version()`, `.end()` in finally, return `{version}` or `{error}`.
- For verification 3, re-read `/tmp/after_xmp.xml` which was produced earlier this session — it already contains the exact `<Attrib:Data>{&quot;Company&quot;:&quot;Ready Set&quot;}</Attrib:Data>` line. That's HTML-entity-encoded `{"Company":"Ready Set"}` (plain JSON, no pipes). Document this.

</specifics>

<deferred>
## Deferred Ideas

None — spike phase has bounded scope.

</deferred>
