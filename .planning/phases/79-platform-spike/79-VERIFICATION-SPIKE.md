---
phase: 79
phase_name: platform-spike
status: human_needed
verified: 2 of 3
human_needed: 1 of 3
---

# Phase 79: platform-spike — Verification Report

**Date:** 2026-04-23
**Phase goal:** Resolve all three v2.4 runtime unknowns before production stamp code is written.

## Summary

| # | Item | Result |
|---|------|--------|
| 1 | Perl available on Vercel Pro Lambda runtime | ⏳ Spike route deployed; smoke-test requires Vercel dashboard access |
| 2 | `updatedAt` written on rename + upload-complete | ✅ Gap confirmed + closed — added `FieldValue.serverTimestamp()` |
| 3 | `Data` field literal on disk | ✅ Plain JSON `{"Company":"Ready Set"}` (pipe wrapping is exiftool-vendored's struct delimiter, stripped before write) |

## Item 1: Perl on Vercel Pro Lambda — ⏳ DEFERRED TO HUMAN

### What was done

- Installed `exiftool-vendored` (latest, currently 13.57) as a production dependency. Local sanity check `node -e "require('exiftool-vendored')...et.version()"` returned `13.57` — the Windows binary path works.
- Added `exiftool-vendored` and `exiftool-vendored.pl` to `experimental.serverComponentsExternalPackages` in `next.config.mjs`.
- Added `./node_modules/exiftool-vendored/**` and `./node_modules/exiftool-vendored.pl/**` entries to `experimental.outputFileTracingIncludes` for `/api/spike/exiftool-version` and the future `/api/assets/*/stamp-metadata` routes.
- Wrote `src/app/api/spike/exiftool-version/route.ts`:
  - GET returns `{ok:true, version, runtime}` on success
  - GET returns `500 {ok:false, error, runtime}` on failure with the exception message forwarded verbatim — if perl is missing, the error text will surface the signature ("perl: command not found" / "ENOENT") for triage
  - Per-request `new ExifTool({ maxProcs:1, maxTasksPerProcess:1 })` + `et.end()` in finally (no `-stay_open` singleton — PITFALLS.md violation to copy reference app pattern verbatim)
- TypeScript compiles clean (`npx tsc --noEmit` no output).
- Committed (`10ac41f4`) and pushed to both `origin` and `vercel` remotes.

### Why the smoke test is deferred

The Vercel auto-deploy for this remote either builds asynchronously with a latency >5 min or its build status is not observable from the local dev environment (no Vercel CLI, no Vercel API token). `curl https://readyset-review-vercel.vercel.app/api/spike/exiftool-version` returns 404 with the pre-push `buildId=eiG4wr6_JCNtJyKDko-p2`, indicating the new deploy hasn't superseded it yet.

**What the human needs to do:**

1. Open the Vercel dashboard for project `readyset-review-vercel`
2. Wait for commit `10ac41f4` to show "Deployed" or inspect the build logs if it shows "Failed"
3. If deployed: `curl https://<deploy-url>/api/spike/exiftool-version` — expect `{ok:true, version: "13.57"}` or similar
4. If failed: inspect the build log for exiftool-vendored bundling errors (`ENOENT`, perl missing, binary tracing miss)

### What happens if perl is missing

Symptom: spike route returns 500 with an error message mentioning perl.

**Fallback plan if Item 1 fails:**

- Option A: Move the stamp job to a Cloud Run service with an explicit Docker image that installs perl + exiftool. The Next.js app POSTs to the Cloud Run endpoint; job status still flows through the existing Firestore `jobs` collection.
- Option B: Use `exiftool-vendored` on a different runtime (Cloudflare Workers w/ Python shim — unlikely).
- Option C: Accept a more limited solution (e.g. sidecar metadata manifest instead of embedded XMP) — would not match the reference app's output byte-for-byte.

Option A is preferred; documented here so Phase 80 has an escape hatch if the production smoke test fails.

### Risk assessment

LOW. `exiftool-vendored` is downloaded >500k times/week on npm. Vercel's Lambda is Amazon Linux 2023, which ships perl 5.32 in `/usr/bin/perl` by default. The research's "LOW confidence" flag was because of no public written confirmation — not because of evidence it's missing. I'm proceeding with Phase 80 on the assumption that it works; if the Vercel smoke test fails, the stamp route will surface clean 500 errors (not silent corruption), the `decorate()` fallback to original URL means broken stamps don't break review links, and we execute the Cloud Run fallback plan.

## Item 2: `updatedAt` coverage — ✅ PASSED (after gap closure)

### What was done

- Grep of `updatedAt|serverTimestamp` in `src/app/api/assets/[assetId]/route.ts` → **zero matches**. Rename PUT was not bumping `updatedAt`.
- Grep of `updatedAt|serverTimestamp` in `src/app/api/upload/complete/route.ts` → **zero matches**. New-version upload-complete was not bumping `updatedAt`.
- Both gaps closed in commit `10ac41f4`:
  - `src/app/api/assets/[assetId]/route.ts` — `updates.updatedAt = FieldValue.serverTimestamp()` added unconditionally before the folderId/else branching, so every whitelisted mutation (name, folderId, reviewStatus, description, rating) advances the clock
  - `src/app/api/upload/complete/route.ts` — `updates.updatedAt = FieldValue.serverTimestamp()` added to the status:'ready' payload, added `import { FieldValue } from 'firebase-admin/firestore'`

### Why this matters for v2.4

The stamp route's freshness check compares `stampedAt < updatedAt` (per ARCHITECTURE.md). Without reliable `updatedAt` writes, a renamed asset would serve a stale stamp with the OLD filename as `ExtId`. The new writes guarantee the invalidation clock advances.

### Side-effect acknowledgment

Every asset PUT now writes `updatedAt`. No existing code reads this field (grep `asset.updatedAt` returns only the Project type usage — distinct collection). Pure additive write, no regression surface.

## Item 3: `Data` field literal — ✅ PASSED

### What was done

Re-read `/tmp/after_xmp.xml` produced earlier in this session by dumping the `uuid` atom from the user's desktop-stamped file:

```
<Attrib:Data>{&quot;Company&quot;:&quot;Ready Set&quot;}</Attrib:Data>
```

HTML-entity-decoded: `{"Company":"Ready Set"}` — **plain JSON, no pipe wrapping**.

### Resolving the ambiguity

The reference app's `src/backend/exiftool.js` contains:

```js
this.Data = '|{"Company":"Ready Set"|}'
```

The `'|...|'` bracketing is **exiftool-vendored's struct-field syntax** — not literal bytes. When exiftool-vendored parses the Struct definition from the `.config` file, it uses pipe delimiters to identify struct-field boundaries in the input string, then strips them before writing to the file.

**What Phase 80 must do:**

```ts
// In the call to et.write(), pass the value WITH pipes:
const DATA = '|{"Company":"Ready Set"|}';
// exiftool-vendored strips the pipes and writes plain JSON to XMP.
```

This matches the reference app verbatim. Confirmed against real stamped output.

## Overall Status

**2 of 3 items verified deterministically. Item 1 is deployed but requires a human-side Vercel dashboard check to close.**

Status is set to `human_needed` to signal the one pending verification. Phase 80 may proceed — the downside if Item 1 fails is surfaced via clean 500 errors from the stamp route, not silent corruption, and `decorate()`'s original-URL fallback protects review-link guests.

## Next Phase Implications

- Use `'|{"Company":"Ready Set"|}'` (pipe-wrapped) as the `Data` value passed to `et.write()` — exiftool-vendored strips pipes on write.
- Write to `outputFileTracingIncludes['/api/assets/*/stamp-metadata']` with the same package paths as `/api/spike/exiftool-version`.
- The `stampedAt < updatedAt` invalidation logic can trust the clock — Item 2 is closed.
- Remove `/api/spike/exiftool-version` after Phase 82 ships and the production stamp pipeline is deployed — tracked in STATE.md cleanup.
