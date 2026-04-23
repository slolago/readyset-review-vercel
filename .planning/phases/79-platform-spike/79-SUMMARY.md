---
phase: 79
phase_name: platform-spike
status: human_needed
completed: 2026-04-23
---

# Phase 79: platform-spike — Summary

## Deliverables

- `/api/spike/exiftool-version` — spike route deployed; returns `{ok,version}` on success or 500 with error text on perl-not-found
- `next.config.mjs` — exiftool-vendored + .pl added to serverComponentsExternalPackages + outputFileTracingIncludes for the spike and future stamp routes
- `package.json` — `exiftool-vendored` production dependency (v13.57 locally, resolves latest major on Vercel via ^)
- `src/app/api/assets/[assetId]/route.ts` — `updatedAt: FieldValue.serverTimestamp()` added unconditionally to the whitelisted-update payload
- `src/app/api/upload/complete/route.ts` — `updatedAt: FieldValue.serverTimestamp()` added to the status-ready payload; `FieldValue` import added

## Verification report

`.planning/phases/79-platform-spike/79-VERIFICATION-SPIKE.md` — full 2/3 verified report. Item 1 (perl on Vercel) is deferred to human: the new deploy hasn't superseded `buildId=eiG4wr6_JCNtJyKDko-p2` even 10+ min after push. Vercel auto-deploy for this remote may be disabled or delayed. Human action: confirm via Vercel dashboard that `/api/spike/exiftool-version` returns `{ok:true, version:"..."}` after the first successful deploy. If it 500s, pivot per the fallback plan documented in the spike report.

## Downstream implications for Phase 80+

1. Use `'|{"Company":"Ready Set"|}'` as the `Data` literal passed to exiftool-vendored (pipe-wrapping is struct-field syntax, stripped on write; on-disk value is plain JSON)
2. `stampedAt < updatedAt` invalidation logic is safe to rely on — `updatedAt` now bumps on rename + upload-complete
3. Remove `/api/spike/exiftool-version` after v2.4 ships and production stamp pipeline confirms health — tracked in STATE.md cleanup

## Commits

- `10ac41f4` — feat(79): platform spike — exiftool-vendored + updatedAt coverage
- `c102d541` — docs(79): verification-spike report (2/3 verified, 1 human_needed)
